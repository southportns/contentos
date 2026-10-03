/**
 * P0.6.5.5 — Decision Feedback Entry Point
 *
 * Primary entry point for building DecisionFeedback on-demand.
 *
 * Architecture Position:
 *
 *   buildDecisionFeedback()
 *       ↓
 *   resolveDecisionFeedbackWindow()
 *       ↓
 *   getDecisionById()  (reuses decision-memory-retrieval)
 *       ↓
 *   retrieveDecisionOutcomes()  (with explicit window)
 *       ↓
 *   DecisionFeedbackService.buildFeedback(options)
 *       ↓
 *   DecisionFeedback
 *
 * Design Principles:
 *   1. On-demand computation — no persistence
 *   2. Owner isolation preserved throughout
 *   3. Decision must exist AND belong to the owner
 *   4. All Decision statuses allowed (proposed/active/superseded/reversed)
 *   5. requestNow generated ONCE at entry, passed through entire pipeline
 */

import type { MemoryRetriever } from './memory-retriever';
import { MemoryNotFoundError } from './persistence/memory-persistence-types';
import type { DecisionFeedback } from './decision-feedback';
import type { DecisionFeedbackBuildOptions } from './decision-feedback';
import type { DecisionFeedbackParams } from './decision-feedback';
import { retrieveDecisionOutcomes } from './decision-feedback';
import { resolveDecisionFeedbackWindow } from './decision-feedback';
import type { DecisionFeedbackService } from './decision-feedback-service';
import { DecisionFeedbackServiceImpl } from './decision-feedback-service';
import { getDecisionById } from './decision-memory-retrieval';

// ═══════════════════════════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build DecisionFeedback for a specific Decision.
 *
 * This is the recommended entry point for all Decision Feedback operations.
 *
 * Processing:
 * 1. Generate requestNow (single timestamp for the entire request lifecycle)
 * 2. Resolve the time window from params + decision.createdAt + requestNow
 * 3. Retrieve the Decision by ID (owner-scoped) — reuses getDecisionById()
 * 4. If Decision not found → throws MemoryNotFoundError
 * 5. Retrieve Outcomes attributed to the Decision (with time window filter)
 * 6. Build feedback via DecisionFeedbackService
 *
 * Time Window:
 * - If params.windowStart/windowEnd provided: uses explicit window
 * - Otherwise: uses [decision.createdAt, requestNow]
 * - Window validation: windowStart MUST be < windowEnd (throws on violation)
 *
 * Owner Isolation:
 * - Decision must belong to params.ownerId
 * - If not found (or belongs to different owner): MemoryNotFoundError
 *   (does NOT leak "exists but belongs to another user")
 *
 * @param retriever - MemoryRetriever implementation
 * @param params - Feedback parameters
 * @param service - Optional DecisionFeedbackService (for DI/testing)
 * @return The derived DecisionFeedback
 * @throws MemoryNotFoundError if Decision doesn't exist for the owner
 * @throws Error if window validation fails (windowStart >= windowEnd)
 */
export async function buildDecisionFeedback(
  retriever: MemoryRetriever,
  params: DecisionFeedbackParams,
  service: DecisionFeedbackService = new DecisionFeedbackServiceImpl(),
): Promise<DecisionFeedback> {
  // Step 1: Generate requestNow ONCE — used for windowEnd default and generatedAt
  const requestNow = new Date().toISOString();

  // Step 2: Retrieve the Decision by ID (owner-scoped, reuses existing retrieval)
  // Do NOT pass projectId/topicId here — we want to find ANY decision matching
  // the ID (regardless of scope), then use the decision's own scope.
  const decision = await getDecisionById(retriever, {
    ownerId: params.ownerId,
    decisionId: params.decisionId,
  });

  if (!decision) {
    throw new MemoryNotFoundError(
      `Decision not found: ${params.decisionId} for owner ${params.ownerId}`
    );
  }

  // Step 3: Resolve the time window using decision.createdAt + params + requestNow
  // The decision's own projectId/topicId becomes authoritative scope
  const { windowStart, windowEnd } = resolveDecisionFeedbackWindow(
    decision.createdAt,
    {
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      now: requestNow,
    }
  );

  // Step 4: Retrieve Outcomes attributed to the Decision (with window filter)
  const outcomeResult = await retrieveDecisionOutcomes(retriever, {
    ownerId: params.ownerId,
    decisionId: params.decisionId,
    projectId: decision.projectId ?? undefined,
    topicId: decision.topicId ?? undefined,
    limit: params.retrievalLimit ?? 500,
    windowStart,
    windowEnd,
  });

  // Step 5: Build feedback via service
  const buildOptions: DecisionFeedbackBuildOptions = {
    windowStart,
    windowEnd,
    requestNow,
  };

  const feedback = service.buildFeedback(
    decision,
    outcomeResult.outcomes,
    outcomeResult.metadata,
    buildOptions,
  );

  return feedback;
}
