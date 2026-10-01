/**
 * P0.6.5.1 — Outcome Memory Retrieval
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
 *   MemoryStore.findMany() with type='outcome' filter
 *       ↓
 *   Database
 *
 * Design Principles:
 *   1. Reuses existing MemoryRetriever — no second retriever
 *   2. Uses existing MemoryRetrievalRequest / MemoryPolicy
 *   3. Owner ID is mandatory (same as base retriever)
 *   4. History sorted by observedAt DESC (time series — newest first)
 *   5. Latest outcome = most recent observedAt for a given target
 */

import type { MemoryRetriever } from './memory-retriever';
import type { MemoryRetrievalRequest } from './memory-retriever';
import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeType, OutcomeTargetType } from './outcome-memory';
import { OUTCOME_MEMORY_TYPE } from './outcome-memory';

// ═══════════════════════════════════════════════════════════════════════════════
// Retrieval Parameters
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters for Outcome Memory retrieval.
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

  /** Maximum number of results (default: 50) */
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
 * @param retriever - MemoryRetriever impl (InMemoryRetriever or DatabaseMemoryRetriever)
 * @param params - Retrieval parameters
 * @return Array of OutcomeMemory matching criteria, sorted by observedAt DESC
 */
export async function retrieveOutcomeMemories(
  retriever: MemoryRetriever,
  params: OutcomeRetrievalParams,
): Promise<OutcomeMemory[]> {
  const limit = params.limit ?? 50;

  const request: MemoryRetrievalRequest = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    policy: {
      maxResults: limit * 2, // Fetch extra for post-filtering by payload fields
      includeSuperseded: false,
      includeExpired: false,
      includeArchived: params.includeArchived ?? false,
    },
  };

  const records = await retriever.retrieve(request);

  // Post-filter: only type='outcome' AND payload fields match
  const outcomes = records.filter((record): record is OutcomeMemory => {
    if (record.type !== OUTCOME_MEMORY_TYPE) return false;

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

  // Apply limit
  return outcomes.slice(0, limit);
}

/**
 * Get the full outcome history for a specific target.
 *
 * Returns ALL outcome observations for a given target, sorted by
 * observedAt DESC (newest first). This forms the time series for
 * that particular target entity.
 *
 * @param retriever - MemoryRetriever impl
 * @param params - Must include targetId and targetType
 * @return Array of OutcomeMemory sorted by observedAt DESC
 */
export async function getOutcomeHistory(
  retriever: MemoryRetriever,
  params: Omit<OutcomeRetrievalParams, 'targetId' | 'targetType'> & {
    targetId: string;
    targetType: OutcomeTargetType;
  },
): Promise<OutcomeMemory[]> {
  const limit = params.limit ?? 100;

  const request: MemoryRetrievalRequest = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    policy: {
      maxResults: limit,
      includeSuperseded: false,
      includeExpired: false,
      includeArchived: params.includeArchived ?? false,
    },
  };

  const records = await retriever.retrieve(request);

  // Filter: type='outcome' AND exact target match
  const outcomes = records.filter((record): record is OutcomeMemory => {
    if (record.type !== OUTCOME_MEMORY_TYPE) return false;

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
 * @param retriever - MemoryRetriever impl
 * @param params - Must include targetId and targetType
 * @return The most recent OutcomeMemory, or null if none exists
 */
export async function getLatestOutcome(
  retriever: MemoryRetriever,
  params: Omit<OutcomeRetrievalParams, 'targetId' | 'targetType' | 'limit'> & {
    targetId: string;
    targetType: OutcomeTargetType;
  },
): Promise<OutcomeMemory | null> {
  // Fetch all matching outcomes (no retriever-level limit) because the
  // retriever sorts by importance/confidence/updatedAt, not observedAt.
  // We sort by observedAt DESC in getOutcomeHistory and take the first.
  const history = await getOutcomeHistory(retriever, {
    ...params,
    limit: 100, // Fetch enough for sorting; adjust if you expect >100 observations
  });

  return history.length > 0 ? history[0] : null;
}
