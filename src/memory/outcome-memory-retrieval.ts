/**
 * P0.6.5.1-R1 — Outcome Memory Retrieval (Hardening)
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
 *
 * R1 Changes:
 *   - policy.types = ['outcome'] is passed through the retriever
 *   - Removes the "limit * 2" workaround — DB now returns exactly outcomes
 *   - History remains bounded (default 100, configurable up to safe limit)
 *   - Latest uses higher bounded window; correctness boundary documented
 */

import type { MemoryRetriever } from './memory-retriever';
import type { MemoryRetrievalRequest } from './memory-retriever';
import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeType, OutcomeTargetType } from './outcome-memory';
import { OUTCOME_MEMORY_TYPE } from './outcome-memory';

// ═══════════════════════════════════════════════════════════════════════════════
// Retrieval Parameters
// ═══════════════════════════════════════════════════════════════════════════════

/** Maximum allowed limit for history retrieval — prevents unbounded DB reads */
export const MAX_OUTCOME_HISTORY_LIMIT = 500;

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
 * No more "limit * 2" workaround — DB returns exactly the records we need.
 *
 * @param retriever - MemoryRetriever impl (InMemoryRetriever or DatabaseMemoryRetriever)
 * @param params - Retrieval parameters
 * @return Array of OutcomeMemory matching criteria, sorted by observedAt DESC
 */
export async function retrieveOutcomeMemories(
  retriever: MemoryRetriever,
  params: OutcomeRetrievalParams,
): Promise<OutcomeMemory[]> {
  // Clamp limit to safe maximum
  const limit = clampLimit(params.limit ?? 50);

  // R1: Pass types=['outcome'] through policy so DB-level filtering applies
  const request: MemoryRetrievalRequest = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    policy: {
      maxResults: limit, // R1: No more limit * 2 — DB filters by type
      types: [OUTCOME_MEMORY_TYPE], // DB-level type filtering
      includeSuperseded: false,
      includeExpired: false,
      includeArchived: params.includeArchived ?? false,
    },
  };

  const records = await retriever.retrieve(request);

  // Post-filter: payload fields match (type already guaranteed by DB filter)
  const outcomes = records.filter((record): record is OutcomeMemory => {
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
  });

  // Sort by observedAt DESC (time series — newest observations first)
  outcomes.sort(
    (a, b) => {
      const aTime = new Date((a.payload as { observedAt: string }).observedAt).getTime();
      const bTime = new Date((b.payload as { observedAt: string }).observedAt).getTime();
      return bTime - aTime;
    }
  );

  return outcomes;
}

/**
 * Get the outcome history for a specific target.
 *
 * Returns outcome observations for a given target, sorted by
 * observedAt DESC (newest first). This forms the time series for
 * that particular target entity.
 *
 * IMPORTANT — Bounded History:
 * This function returns AT MOST `limit` records (default 100, max 500).
 * It does NOT return "all" records. If you pass limit=150 and there are
 * 150+ outcomes for this target, you will get 150 (sorted DESC).
 *
 * Correctness boundary:
 *   - limit <= 500 → full bounded history returned
 *   - limit > 500 → clamped to 500
 *
 * For unbounded or very large time series, consider pagination (future P0.6.5.x).
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
  // Clamp limit to safe maximum (bounded history)
  const limit = clampLimit(params.limit ?? 100);

  const request: MemoryRetrievalRequest = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    policy: {
      maxResults: limit,
      types: [OUTCOME_MEMORY_TYPE], // R1: DB-level type filtering
      includeSuperseded: false,
      includeExpired: false,
      includeArchived: params.includeArchived ?? false,
    },
  };

  const records = await retriever.retrieve(request);

  // Filter: type='outcome' (guaranteed by DB) AND exact target match
  const outcomes = records.filter((record): record is OutcomeMemory => {
    const payload = record.payload as {
      targetType?: string;
      targetId?: string;
      observedAt?: string;
    };

    return payload.targetType === params.targetType &&
      payload.targetId === params.targetId;
  });

  // Sort by observedAt DESC (time series)
  outcomes.sort(
    (a, b) => {
      const aTime = new Date((a.payload as { observedAt: string }).observedAt).getTime();
      const bTime = new Date((b.payload as { observedAt: string }).observedAt).getTime();
      return bTime - aTime;
    }
  );

  return outcomes;
}

/**
 * Get the latest (most recent) outcome observation for a specific target.
 *
 * Useful for: Context Assembly, Decision Support, quick status check.
 * Returns null if no outcome exists for the target.
 *
 * Correctness Boundary:
 *   This function uses getOutcomeHistory with a bounded window (limit).
 *   Default limit is 100 — if a target has >100 observations, the "latest"
 *   is only guaranteed to be within the most recent `limit` observations
 *   (as determined by the retriever's ordering, which is NOT observedAt).
 *
 *   For guaranteed correctness:
 *     - Pass explicit limit >= expected number of observations
 *     - Maximum allowed limit: 500 (MAX_OUTCOME_HISTORY_LIMIT)
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
  // Bounded window for latest — document the correctness boundary
  const limit = clampLimit(params.limit ?? 100);

  const history = await getOutcomeHistory(retriever, {
    ...params,
    limit,
  });

  return history.length > 0 ? history[0] : null;
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
