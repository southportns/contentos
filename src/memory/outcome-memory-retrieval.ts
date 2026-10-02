/**
 * P0.6.5.1-R2 — Outcome Memory Retrieval (Target Completeness)
 *
 * Provides domain-specific retrieval helpers for Outcome Memory.
 * Thin layer over MemoryRetriever (InMemoryRetriever / DatabaseMemoryRetriever).
 *
 * Architecture Position:
 *
 *   retrieveOutcomeMemories() / getOutcomeHistory() / getLatestOutcome()
 *       ↓
 *   MemoryRetriever (existing — InMemoryRetriever or DatabaseMemoryRetriever)
 *       ↓
 *   MemoryStore.findMany() with type='outcome' filter at DB level
 *       ↓
 *   Database
 *
 * Design Principles:
 *   1. Reuses existing MemoryRetriever — no second retriever
 *   2. Uses existing MemoryRetrievalRequest / MemoryPolicy
 *   3. Owner ID is mandatory (same as base retriever)
 *   4. History sorted by observedAt DESC (time series — newest first)
 *   5. Latest outcome = most recent observedAt for a given target
 *   6. DB-level type filtering: type='outcome' pushed to SQL WHERE (R1)
 *   7. Memory field filters (targetType/targetId/outcomeType) stay at app level
 *      because they live in payload JSON — future P0.6.5.x will add projection
 *   8. Batch-based target-complete retrieval (R2) — ensures that when the
 *      caller requests N matching outcomes, they get N matching outcomes,
 *      not just whatever happens to be in the first N DB records
 *   9. Retrieval metadata exposes scan statistics and completeness signals (R3)
 *
 * R1 Changes:
 *   - policy.types = ['outcome'] is passed through the retriever
 *   - Removes the "limit * 2" workaround — DB now returns exactly outcomes
 *   - History remains bounded (default 100, configurable up to safe limit)
 *   - Latest uses higher bounded window; correctness boundary documented
 *
 * R2 Changes:
 *   - Batch-based retrieval with composite-cursor keyset pagination
 *   - Safety bound: MAX_OUTCOME_RETRIEVAL_BATCHES prevents infinite loops
 *   - Target-level completeness: loops until `limit` matching outcomes are
 *     collected or the DB records are exhausted or safety bound is reached
 *   - Final sort: observedAt DESC applied AFTER full batch collection
 *   - Correctness guaranteed within bounded window:
 *     total scanned = MAX_OUTCOME_RETRIEVAL_BATCHES × batchSize (default 10×50=500)
 *
 * R3 Changes (P0.6.5.4 Hardening):
 *   - collectOutcomeBatches returns OutcomeBatchCollectionResult with metadata
 *   - New retrieveOutcomeMemoriesWithMetadata() exposes scanning statistics
 *   - Original retrieveOutcomeMemories() preserved as thin wrapper
 *   - Metadata accurately distinguishes: DB exhaustion vs limit truncation vs max-batch bound
 *   - scannedRecords tracks ALL underlying.retriever.retrieve() returns (not just matches)
 */

import type { MemoryRetriever } from './memory-retriever';
import type { MemoryRetrievalRequest } from './memory-retriever';
import type { MemoryRecord } from './memory-record';
import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeType, OutcomeTargetType } from './outcome-memory';
import { OUTCOME_MEMORY_TYPE } from './outcome-memory';
import { encodeCompositeCursor } from './persistence/prisma-memory-store';

// ═══════════════════════════════════════════════════════════════════════════════
// Retrieval Parameters & Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Maximum allowed limit for history retrieval — prevents unbounded DB reads */
export const MAX_OUTCOME_HISTORY_LIMIT = 500;

/**
 * Maximum number of batches to fetch when doing target-complete retrieval.
 *
 * Safety guarantee: retrieval is always bounded.
 * Total records scanned ≤ MAX_OUTCOME_RETRIEVAL_BATCHES × batchSize.
 * With defaults: 10 × 50 = 500 records max.
 */
export const MAX_OUTCOME_RETRIEVAL_BATCHES = 10;

/**
 * Default per-batch fetch size.
 * The DB returns this many outcome records per batch; the app filters them,
 * accumulates matches, and fetches the next batch if needed.
 */
export const DEFAULT_OUTCOME_BATCH_SIZE = 50;

/**
 * Parameters for Outcome Memory Retrieval.
 */
export interface OutcomeRetrievalParams {
  /** Owner (user) ID — mandatory for isolation */
  ownerId: string;

  /** Project ID filter (optional) */
  projectId?: string;

  /** Topic ID filter (optional) */
  topicId?: string;

  /** Filter by outcome target type (optional) */
  targetType?: OutcomeTargetType;

  /** Filter by specific target ID (optional) */
  targetId?: string;

  /** Filter by outcome type (optional) */
  outcomeType?: OutcomeType;

  /** Maximum number of results (default: 50, max: 500) */
  limit?: number;

  /** Include archived outcomes (default: false) */
  includeArchived?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Retrieval Metadata (R3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Metadata about the retrieval operation, exposing scan statistics and
 * completeness signals.
 *
 * This metadata allows aggregation and trend analysis to correctly
 * distinguish between "no more data exists" and "retrieval was stopped
 * because a safety bound was reached".
 *
 * Key distinction:
 * - `scannedRecords` = total records returned by the underlying retriever
 *   (ALL records that passed DB-level filters like owner/type)
 * - `outcomes.length` = records that also passed application-level filters
 *   (targetType/targetId/outcomeType)
 *
 * Example: 500 scanned, only 20 matched a specific targetId.
 * The aggregation layer MUST know 500 were scanned to avoid reporting
 * "complete" when only 20 of 500 matched.
 */
export interface OutcomeRetrievalMetadata {
  /**
   * Total number of records the underlying retriever.retrieve() returned
   * across ALL batches — before application-level filtering.
   *
   * This is the true measure of "how much data was examined".
   * NOT the number of matching outcomes.
   */
  scannedRecords: number;

  /** Number of batches fetched (1 to MAX_OUTCOME_RETRIEVAL_BATCHES) */
  batchesFetched: number;

  /**
   * true = retrieval reached a configured bound (caller limit or max batches)
   * before the data source was exhausted.
   *
   * When true, the result may not contain ALL matching records.
   */
  truncated: boolean;

  /**
   * true = retrieval reached data source exhaustion before any bound.
   *
   * When true, all matching records within the scanned window are present.
   */
  exhausted: boolean;
}

/**
 * Result of an outcome retrieval operation, including both the matching
 * outcomes and metadata about the retrieval process.
 */
export interface OutcomeRetrievalResult {
  /** Matching outcomes (passed all filters) */
  outcomes: OutcomeMemory[];

  /** Metadata about the retrieval operation */
  metadata: OutcomeRetrievalMetadata;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public Retrieval Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieve Outcome Memories for an owner, optionally filtered by project/topic/type.
 *
 * Default behavior:
 * - Returns outcomes with status: 'active'
 * - Filters by targetType/targetId/outcomeType when provided
 * - Sorted by observedAt DESC (newest first) — time series order
 *
 * R1: type='outcome' filtering happens at database level via policy.types.
 *
 * R2: Batch-based target-complete retrieval. When you request limit=N
 * outcomes matching a specific target/type, you get N matching outcomes
 * (not fewer because other outcomes filled the first batch). Internally
 * uses composite-cursor keyset pagination to loop through batches until
 * enough matches are found OR the DB is exhausted OR safety bound hit.
 *
 * Correctness boundary:
 *   - Total scanned ≤ MAX_OUTCOME_RETRIEVAL_BATCHES × DEFAULT_OUTCOME_BATCH_SIZE (default 500)
 *   - Within this window: all matching outcomes are returned (up to `limit`)
 *   - Beyond this window: results are correct within scanned records only
 *
 * @param retriever - MemoryRetriever impl (InMemoryRetriever or DatabaseMemoryRetriever)
 * @param params - Retrieval parameters
 * @return Array of OutcomeMemory matching criteria, sorted by observedAt DESC
 */
export async function retrieveOutcomeMemories(
  retriever: MemoryRetriever,
  params: OutcomeRetrievalParams,
): Promise<OutcomeMemory[]> {
  const result = await retrieveOutcomeMemoriesWithMetadata(retriever, params);
  return result.outcomes;
}

/**
 * Retrieve Outcome Memories with metadata about the retrieval process.
 *
 * This is the recommended entry point for aggregation and trend analysis,
 * where correctness of completeness reporting matters.
 *
 * The original retrieveOutcomeMemories() is a thin wrapper that calls this
 * function and discards the metadata.
 *
 * @param retriever - MemoryRetriever impl
 * @param params - Retrieval parameters
 * @return OutcomeRetrievalResult including outcomes and metadata
 */
export async function retrieveOutcomeMemoriesWithMetadata(
  retriever: MemoryRetriever,
  params: OutcomeRetrievalParams,
): Promise<OutcomeRetrievalResult> {
  const limit = clampLimit(params.limit ?? 50);

  const collectionResult = await collectOutcomeBatches(retriever, params, limit);

  // Final sort: observedAt DESC (time series — newest observations first)
  sortByObservedAtDesc(collectionResult.outcomes);

  return {
    outcomes: collectionResult.outcomes,
    metadata: collectionResult.metadata,
  };
}

/**
 * Get the outcome history for a specific target.
 *
 * Returns outcome observations for a given target, sorted by
 * observedAt DESC (newest first). This forms the time series for
 * that particular target entity.
 *
 * R2 — Target-Complete History:
 * Uses batch-based collection to ensure that when requesting limit=N
 * observations for a target, you get N matching observations — even
 * when the DB contains many more outcomes for OTHER targets.
 *
 * Example:
 *   DB has 500 outcomes: 450 for Content A, 50 for Content B
 *   Calling getOutcomeHistory(targetB, limit=50) returns all 50 B records
 *   (not just the few that happened to be in the first batch).
 *
 * Correctness boundary:
 *   - Total scanned ≤ MAX_OUTCOME_RETRIEVAL_BATCHES × DEFAULT_OUTCOME_BATCH_SIZE (default 500)
 *   - Within this window: all matching outcomes returned (up to `limit`)
 *   - Beyond this window: bounded correctness
 *
 * @param retriever - MemoryRetriever impl
 * @param params - Must include targetId and targetType
 * @return Array of OutcomeMemory sorted by observedAt DESC (bounded by limit)
 */
export async function getOutcomeHistory(
  retriever: MemoryRetriever,
  params: Omit<OutcomeRetrievalParams, 'targetId' | 'targetType'> & {
    targetId: string;
    targetType: OutcomeTargetType;
  },
): Promise<OutcomeMemory[]> {
  const limit = clampLimit(params.limit ?? 100);

  const collectionResult = await collectOutcomeBatches(retriever, {
    ...params,
    targetType: params.targetType,
    targetId: params.targetId,
  }, limit);

  // Final sort: observedAt DESC (time series)
  sortByObservedAtDesc(collectionResult.outcomes);

  return collectionResult.outcomes;
}

/**
 * Get the latest (most recent) outcome observation for a specific target.
 *
 * Useful for: Context Assembly, Decision Support, quick status check.
 * Returns null if no outcome exists for the target.
 *
 * R2 — Correctness Guarantee:
 * Uses batch-based collection to find the TRULY latest observation for
 * the target — not just the latest among the first batch of records.
 *
 * Correctness boundary:
 *   - Total scanned ≤ MAX_OUTCOME_RETRIEVAL_BATCHES × DEFAULT_OUTCOME_BATCH_SIZE (default 500)
 *   - Within this window: returns the truly latest observation
 *   - Beyond this window: result may not be the absolute latest
 *
 *   Future P0.6.5.x: dedicated temporal indexing / projection for
 *   unbounded latest correctness.
 *
 * @param retriever - MemoryRetriever impl
 * @param params - Must include targetId and targetType
 * @return The most recent OutcomeMemory, or null if none exists
 */
export async function getLatestOutcome(
  retriever: MemoryRetriever,
  params: Omit<OutcomeRetrievalParams, 'targetId' | 'targetType' | 'limit'> & {
    targetId: string;
    targetType: OutcomeTargetType;
    /** Override bounded window size (default: 100, max: 500) */
    limit?: number;
  },
): Promise<OutcomeMemory | null> {
  // Bounded window for latest — scan enough to find the true latest
  const limit = clampLimit(params.limit ?? 100);

  const collectionResult = await collectOutcomeBatches(retriever, {
    ...params,
    targetType: params.targetType,
    targetId: params.targetId,
  }, limit);

  // Sort observedAt DESC and return first
  sortByObservedAtDesc(collectionResult.outcomes);

  return collectionResult.outcomes.length > 0 ? collectionResult.outcomes[0] : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Batch Collection Engine (R2 + R3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of collecting outcome batches, including both matching outcomes
 * and metadata about the collection process.
 */
export interface OutcomeBatchCollectionResult {
  /** Matching outcomes (passed all filters) */
  outcomes: OutcomeMemory[];

  /** Metadata about the batch collection */
  metadata: OutcomeRetrievalMetadata;
}

/**
 * Collect matching outcome records using batch-based retrieval with
 * composite-cursor keyset-pagination.
 *
 * The DB does NOT sort by observedAt (it can't — observedAt lives in
 * JSON payload). So this function:
 * 1. Fetches batches using the DB's native sort order
 *    (importance DESC → confidence DESC → updatedAt DESC → id ASC)
 * 2. Filters each batch at the application level
 * 3. Accumulates matching records until `limit` is reached
 * 4. Stops early if DB returns empty (exhausted) or safety bound hit
 * 5. Returns all collected matches + metadata about scanning process
 *
 * Safety: bounded to MAX_OUTCOME_RETRIEVAL_BATCHES iterations.
 * Never enters an infinite loop.
 *
 * Completeness Detection (R3):
 *
 * Case A — DB exhausted:
 *   records.length === 0 → exhausted = true, truncated = false
 *
 * Case B — Final batch smaller than batchSize:
 *   records.length < batchSize → exhausted = true, truncated = false
 *   (DB couldn't fill a batch, so no more data exists)
 *
 * Case C — Caller limit reached:
 *   matches.length >= limit → truncated = true, exhausted = false
 *   (can't prove there aren't more matching outcomes)
 *
 * Case D — MAX_OUTCOME_RETRIEVAL_BATCHES reached, last batch full:
 *   batch === MAX && records.length === batchSize → truncated = true, exhausted = false
 *   (safety bound reached; can't prove DB exhaustion)
 *
 * Case E — MAX_OUTCOME_RETRIEVAL_BATCHES reached, last batch partial:
 *   batch === MAX && records.length < batchSize → exhausted = true, truncated = false
 *   (partial batch proves DB didn't have more data to fill it)
 *
 * @param retriever - MemoryRetriever impl
 * @param params - Retrieval parameters (including targetType/targetId/outcomeType)
 * @param limit - Number of matching results needed
 * @return OutcomeBatchCollectionResult with outcomes and metadata
 */
async function collectOutcomeBatches(
  retriever: MemoryRetriever,
  params: OutcomeRetrievalParams,
  limit: number,
): Promise<OutcomeBatchCollectionResult> {
  const matches: OutcomeMemory[] = [];
  let cursor: string | undefined;
  let scannedRecords = 0;
  let batchesFetched = 0;

  let exhausted = false;
  let truncated = false;

  for (let batch = 0; batch < MAX_OUTCOME_RETRIEVAL_BATCHES; batch++) {
    // Build retrieval request with composite cursor for pagination
    const request = buildBatchRequest(params, cursor);

    const records = await retriever.retrieve(request);
    batchesFetched++;

    // Case A: DB returned no more records — exhausted, stop early
    if (records.length === 0) {
      exhausted = true;
      truncated = false;
      break;
    }

    // Track total scanned records (ALL records, not just matches)
    scannedRecords += records.length;

    // Filter this batch at application level (type guard narrows to OutcomeMemory)
    for (const record of records) {
      if (isOutcomeMatch(record, params)) {
        matches.push(record);
      }
    }

    // Case C: Caller limit reached — truncated (can't prove no more matches exist)
    if (matches.length >= limit) {
      truncated = true;
      exhausted = false;
      break;
    }

    // Case B: Final batch smaller than batchSize — DB exhausted
    if (records.length < DEFAULT_OUTCOME_BATCH_SIZE) {
      exhausted = true;
      truncated = false;
      break;
    }

    // Check if we've reached max batches (but haven't exhausted or hit limit)
    if (batch === MAX_OUTCOME_RETRIEVAL_BATCHES - 1) {
      // Last iteration: we got a full batch (records.length === batchSize)
      // and haven't hit limit. This means safety bound stopped us.
      // Case D: truncated = true (safety bound), exhausted = false
      // Because we can't prove there aren't more matching outcomes
      truncated = true;
      exhausted = false;
      break;
    }

    // Encode cursor from the LAST record in this batch for next iteration.
    // We use the last record's sort keys regardless of whether it matched,
    // because that determines our position in the DB's sort order.
    const lastRecord = records[records.length - 1];
    cursor = encodeCompositeCursor(
      lastRecord.importance,
      lastRecord.confidence,
      new Date(lastRecord.updatedAt),
      lastRecord.id,
    );
  }

  // Return only up to `limit` matches + metadata
  return {
    outcomes: matches.slice(0, limit),
    metadata: {
      scannedRecords,
      batchesFetched,
      truncated,
      exhausted,
    },
  };
}

/**
 * Build a MemoryRetrievalRequest for a single batch.
 *
 * The cursor is passed via the policy extension. DatabaseMemoryRetriever
 * reads `policy.cursor` and forwards it to MemoryQueryCriteria.cursor`.
 */
function buildBatchRequest(
  params: OutcomeRetrievalParams,
  cursor: string | undefined,
): MemoryRetrievalRequest {
  return {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    policy: {
      maxResults: DEFAULT_OUTCOME_BATCH_SIZE,
      types: [OUTCOME_MEMORY_TYPE],
      includeSuperseded: false,
      includeExpired: false,
      includeArchived: params.includeArchived ?? false,
      // R2: composite cursor for keyset pagination
      // This is read by DatabaseMemoryRetriever.buildCriteria()
      cursor,
    },
  };
}

/**
 * Type guard: check if a MemoryRecord matches the outcome-level filters.
 *
 * Records reaching this point already have type='outcome' (guaranteed by
 * the DB-level types filter). This function additionally checks payload-level
 * filters (targetType, targetId, outcomeType) and narrows the type to
 * OutcomeMemory when true.
 */
function isOutcomeMatch(
  record: MemoryRecord,
  params: OutcomeRetrievalParams,
): record is OutcomeMemory {
  if (!record.payload || typeof record.payload !== 'object') return false;

  const payload = record.payload as {
    targetType?: string;
    targetId?: string;
    outcomeType?: string;
  };

  // Filter by targetType if specified
  if (params.targetType && payload.targetType !== params.targetType) {
    return false;
  }

  // Filter by targetId if specified
  if (params.targetId && payload.targetId !== params.targetId) {
    return false;
  }

  // Filter by outcomeType if specified
  if (params.outcomeType && payload.outcomeType !== params.outcomeType) {
    return false;
  }

  return true;
}

/**
 * Sort outcomes by observedAt DESC (newest first) — in place.
 */
function sortByObservedAtDesc(outcomes: OutcomeMemory[]): void {
  outcomes.sort((a, b) => {
    const aTime = new Date((a.payload as { observedAt: string }).observedAt).getTime();
    const bTime = new Date((b.payload as { observedAt: string }).observedAt).getTime();
    return bTime - aTime;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clamp a limit value to the safe maximum.
 */
function clampLimit(limit: number): number {
  if (limit < 1) return 1;
  if (limit > MAX_OUTCOME_HISTORY_LIMIT) return MAX_OUTCOME_HISTORY_LIMIT;
  return limit;
}
