/*
 * P0.6.3.3 — Decision Memory Retrieval
 *
 * Provides domain-specific retrieval helpers for Decision Memory.
 * Thin layer over DatabaseMemoryRetriever — no duplicate logic.
 *
 * Architecture Position:
 *
 *   retrieveDecisionMemories() / getActiveDecisions() / getDecisionHistory()
 *       ↓
 *   DatabaseMemoryRetriever (existing)
 *       ↓
 *   MemoryStore.findMany() with type='decision' filter
 *       ↓
 *   Database
 *
 * Design Principles:
 *   1. Reuses existing DatabaseMemoryRetriever — no second retriever
 *   2. Uses MemoryQueryCriteria.types for type filtering
 *   3. Defaults: only active decisions (excludes superseded/reversed)
 *   4. Owner ID is mandatory (same as base retriever)
 */

import type { MemoryRetriever } from './memory-retriever';
import type { MemoryRetrievalRequest } from './memory-retriever';
import type { DecisionMemory } from './decision-memory';
import type { DecisionStatus } from './memory-types';
import { DECISION_MEMORY_TYPE } from './memory-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Retrieval Parameters
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters for Decision Memory retrieval.
 */
export interface DecisionRetrievalParams {
  /** Owner (user) ID — mandatory for isolation */
  ownerId: string;

  /** Project ID filter (optional) */
  projectId?: string;

  /** Topic ID filter (optional) */
  topicId?: string;

  /** Maximum number of results (default: 20) */
  limit?: number;

  /** Include superseded decisions in results */
  includeSuperseded?: boolean;

  /** Include reversed decisions in results */
  includeReversed?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public Retrieval Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieve Decision Memories for an owner, optionally filtered by project/topic.
 *
 * Default behavior:
 * - Returns decisions with status: 'active' (mapped to DB status 'active')
 * - For 'proposed' decisions, also included (they map to DB status 'active')
 * - Excludes 'superseded' and 'reversed' by default
 */
export async function retrieveDecisionMemories(
  retriever: MemoryRetriever,
  params: DecisionRetrievalParams,
): Promise<DecisionMemory[]> {
  const limit = params.limit ?? 20;

  const statuses = buildStatusFilter(params);

  const request: MemoryRetrievalRequest = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    policy: {
      maxResults: limit,
      includeSuperseded: params.includeSuperseded,
      includeExpired: false,
      includeArchived: params.includeReversed ?? false,
    },
  };

  const records = await retriever.retrieve(request);

  // Post-filter: only type='decision' AND payload.decisionStatus matches
  return records.filter((record): record is DecisionMemory => {
    if (record.type !== DECISION_MEMORY_TYPE) return false;

    const payload = record.payload as { decisionStatus?: DecisionStatus };
    const decisionStatus = payload?.decisionStatus;

    if (!decisionStatus) return false;

    return statuses.includes(decisionStatus);
  });
}

/**
 * Get only the currently active decisions for an owner/project/topic.
 *
 * Returns decisions where decisionStatus === 'active'.
 * Excludes proposed, superseded, and reversed.
 */
export async function getActiveDecisions(
  retriever: MemoryRetriever,
  params: Omit<DecisionRetrievalParams, 'includeSuperseded' | 'includeReversed'>,
): Promise<DecisionMemory[]> {
  const limit = params.limit ?? 20;

  const request: MemoryRetrievalRequest = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    policy: {
      maxResults: limit,
      includeSuperseded: false,
      includeExpired: false,
      includeArchived: false,
    },
  };

  const records = await retriever.retrieve(request);

  // Filter for active decision status only
  return records.filter((record): record is DecisionMemory => {
    if (record.type !== DECISION_MEMORY_TYPE) return false;

    const payload = record.payload as { decisionStatus?: DecisionStatus };
    return payload?.decisionStatus === 'active';
  });
}

/**
 * Get the full decision history for an owner/project/topic.
 *
 * Returns ALL decisions regardless of status (proposed, active, superseded, reversed).
 * Sorted by creation date (most recent first).
 */
export async function getDecisionHistory(
  retriever: MemoryRetriever,
  params: DecisionRetrievalParams,
): Promise<DecisionMemory[]> {
  const limit = params.limit ?? 100;

  const request: MemoryRetrievalRequest = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    policy: {
      maxResults: limit,
      includeSuperseded: true,
      includeExpired: true,
      includeArchived: true,
    },
  };

  const records = await retriever.retrieve(request);

  const decisions = records.filter((record): record is DecisionMemory => {
    if (record.type !== DECISION_MEMORY_TYPE) return false;

    const payload = record.payload as { decisionStatus?: DecisionStatus };
    return payload?.decisionStatus != null;
  });

  return decisions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the list of DecisionStatus values to include based on params.
 */
function buildStatusFilter(params: DecisionRetrievalParams): DecisionStatus[] {
  const statuses: DecisionStatus[] = ['active'];

  statuses.push('proposed');

  if (params.includeSuperseded) {
    statuses.push('superseded');
  }

  if (params.includeReversed) {
    statuses.push('reversed');
  }

  return statuses;
}
