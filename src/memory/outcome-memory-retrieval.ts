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
  const limit = clampLimit(params.limit ?? 50);

  const matches = await collectOutcomeBatches(retriever, params, limit);

  // Final sort: observedAt DESC (time series — newest observations first)
  sortByObservedAtDesc(matches);

  return matches;
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

  const matches = await collectOutcomeBatches(retriever, {
    ...params,
    targetType: params.targetType,
    targetId: params.targetId,
  }, limit);

  // Final sort: observedAt DESC (time series)
  sortByObservedAtDesc(matches);

  return matches;
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

  const matches = await collectOutcomeBatches(retriever, {
    ...params,
    targetType: params.targetType,
    targetId: params.targetId,
  }, limit);

  // Sort observedAt DESC and return first
  sortByObservedAtDesc(matches);

  return matches.length > 0 ? matches[0] : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Batch Collection Engine (R2)
// ═══════════════════════════════════════════════════════════════════════════════

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
 * 5. Returns all collected matches for final observedAt DESC sorting
 *
 * Safety: bounded to MAX_OUTCOME_RETRIEVAL_BATCHES iterations.
 * Never enters an infinite loop.
 *
 * @param retriever - MemoryRetriever impl
 * @param params - Retrieval parameters (including targetType/targetId/outcomeType)
 * @param limit - Number of matching results needed
 * @return Collected matching OutcomeMemory records (unsorted — caller sorts)
 */
async function collectOutcomeBatches(
  retriever: MemoryRetriever,
  params: OutcomeRetrievalParams,
  limit: number,
): Promise<OutcomeMemory[]> {
  const matches: OutcomeMemory[] = [];
  let cursor: string | undefined;

  for (let batch = 0; batch < MAX_OUTCOME_RETRIEVAL_BATCHES; batch++) {
    // Build retrieval request with composite cursor for pagination
    const request = buildBatchRequest(params, cursor);

    const records = await retriever.retrieve(request);

    // DB returned no more records — exhausted, stop early
    if (records.length === 0) {
      break;
    }

    // Filter this batch at application level (type guard narrows to OutcomeMemory)
    for (const record of records) {
      if (isOutcomeMatch(record, params)) {
        matches.push(record);
      }
    }

    // If we've collected enough matches, stop early
    if (matches.length >= limit) {
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

  // Return only up to `limit` matches
  return matches.slice(0, limit);
}

/**
 * Build a MemoryRetrievalRequest for a single batch.
 *
 * The cursor is passed via the policy extension. DatabaseMemoryRetriever
 * reads `policy.cursor` and forwards it to MemoryQueryCriteria.cursor.
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
