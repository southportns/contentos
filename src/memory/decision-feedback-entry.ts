/**
 * P0.6.5.5 — Decision Feedback Entry Point
 *
 * Primary entry point for building DecisionFeedback on-demand.
 *
 * Architecture Position:
 *
 *   buildDecisionFeedback()
 *       ↓
 *   retrieve Decision (DatabaseMemoryRetriever)
 *       ↓
 *   retrieveDecisionOutcomes()
 *       ↓
 *   DecisionFeedbackService.buildFeedback()
 *       ↓
 *   DecisionFeedback
 *
 * Design Principles:
 *   1. On-demand computation — no persistence
 *   2. Owner isolation preserved throughout
 *   3. Decision must exist AND belong to the owner
 *   4. All Decision statuses allowed (proposed/active/superseded/reversed)
 */

import type { MemoryRetriever } from './memory-retriever';
import type { DecisionMemory } from './decision-memory';
import { MemoryNotFoundError } from './persistence/memory-persistence-types';
import type { DecisionFeedback } from './decision-feedback';
import type { DecisionFeedbackParams } from './decision-feedback';
import { retrieveDecisionOutcomes } from './decision-feedback';
import type { DecisionFeedbackService } from './decision-feedback-service';
import { DecisionFeedbackServiceImpl } from './decision-feedback-service';

// ═══════════════════════════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build DecisionFeedback for a specific Decision.
 *
 * This is the recommended entry point for all Decision Feedback operations.
 *
 * Processing:
 * 1. Retrieve the Decision by ID (owner-scoped)
 * 2. If Decision not found → throws MemoryNotFoundError
 * 3. Retrieve Outcomes attributed to the Decision
 * 4. Build feedback via DecisionFeedbackService
 *
 * Time Window:
 * - If params.windowStart/windowEnd provided: uses explicit window
 * - Otherwise: uses [decision.createdAt, now]
 *
 * Owner Isolation:
 * - Decision must belong to params.ownerId
 * - If not found (or belongs to different owner): MemoryNotFoundError
 *   (does NOT leak "exists but belongs to another user")
 *
 * @param retriever - MemoryRetriever implementation
 * @param params - Feedback parameters
 * @return The derived DecisionFeedback
 * @throws MemoryNotFoundError if Decision doesn't exist for the owner
 */
export async function buildDecisionFeedback(
  retriever: MemoryRetriever,
  params: DecisionFeedbackParams,
  service: DecisionFeedbackService = new DecisionFeedbackServiceImpl(),
): Promise<DecisionFeedback> {
  // Step 1: Retrieve the Decision by ID (owner-scoped)
  const decision = await retrieveDecisionById(retriever, params.ownerId, params.decisionId);

  if (!decision) {
    throw new MemoryNotFoundError(
      `Decision not found: ${params.decisionId} for owner ${params.ownerId}`
    );
  }

  // Step 2: Retrieve Outcomes attributed to the Decision
  const outcomeResult = await retrieveDecisionOutcomes(retriever, {
    ownerId: params.ownerId,
    decisionId: params.decisionId,
    projectId: decision.projectId ?? undefined,
    topicId: decision.topicId ?? undefined,
    limit: params.retrievalLimit ?? 500,
  });

  // Step 3: Build feedback via service
  const feedback = service.buildFeedback(
    decision,
    outcomeResult.outcomes,
    outcomeResult.metadata,
  );

  return feedback;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal: Decision Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieve a Decision Memory by ID, scoped to owner.
 *
 * Uses existing DatabaseMemoryRetriever via MemoryRetriever interface.
 * Returns null if not found or doesn't belong to the owner.
 *
 * @param retriever - MemoryRetriever implementation
 * @param ownerId - Owner ID for isolation
 * @param decisionId - The Decision ID to retrieve
 * @return DecisionMemory or null
 */
async function retrieveDecisionById(
  retriever: MemoryRetriever,
  ownerId: string,
  decisionId: string,
): Promise<DecisionMemory | null> {
  // Use the retriever to get decisions for the owner, then find by ID
  const request = {
    ownerId,
    policy: {
      maxResults: 500,
      includeSuperseded: true,
      includeExpired: false,
      includeArchived: true, // Include reversed decisions too
    },
  };

  const records = await retriever.retrieve(request);

  // Find the decision by ID with type guard
  const decision = records.find((record): record is DecisionMemory => {
    if (record.type !== 'decision') return false;
    if (record.ownerId !== ownerId) return false;
    return record.id === decisionId;
  });

  return decision ?? null;
}
