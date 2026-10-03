/**
 * P0.6.5.5-R1 — Decision Feedback Context Bridge
 *
 * Converts DecisionFeedback results into ContextObject for
 * consumption by Context Assembly.
 *
 * Architecture Position:
 *
 *   DecisionFeedback
 *       ↓ (decisionFeedbackToContext)
 *   ContextObject<DecisionFeedbackContextPayload>
 *       (kind='decision', type='decision_feedback')
 *
 * IMPORTANT DESIGN NOTE:
 * DecisionFeedback is a derived evidence view, NOT a raw Decision.
 * The ContextObject MUST clearly indicate it carries feedback data
 * via type='decision_feedback'.
 *
 * If the current Context type system cannot safely carry feedback results,
 * this bridge returns null (graceful degradation).
 */

import type { ContextObject } from '@/context/context-object';
import type { DecisionFeedback } from './decision-feedback';
import { feedbackConfidence } from './decision-feedback';
import { createDecisionContext } from '@/context/context-factory';

// ═══════════════════════════════════════════════════════════════════════════════
// Context Payload
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Context payload for Decision Feedback.
 *
 * This is the FEEDBACK on a Decision, not the Decision itself.
 * It carries objective evidence of what actually happened after
 * the Decision was made: outcome count, metric aggregations, trends.
 *
 * Evidence Completeness:
 *   - complete: all attributed outcomes were retrieved
 *   - bounded: retrieval hit a safety bound (may be partial)
 *
 * IMPORTANCE:
 *   This payload does NOT judge Decision success/failure.
 *   It only carries objective observations for downstream consumption.
 */
export interface DecisionFeedbackContextPayload {
  /** The Decision ID this feedback is for */
  decisionId: string;

  /** Current lifecycle status of the Decision */
  decisionStatus: 'proposed' | 'active' | 'superseded' | 'reversed';

  /** What outcome was expected (carried from Decision, NOT interpreted) */
  expectedOutcome?: string;

  /** Number of attributed outcome observations */
  outcomeCount: number;

  /** IDs of attributed outcomes */
  outcomeIds: string[];

  /** Types of attributed outcomes */
  outcomeTypes: string[];

  /** Earliest observedAt among attributed outcomes */
  firstObservedAt?: string;

  /** Latest observedAt among attributed outcomes */
  lastObservedAt?: string;

  /** The time window used for aggregation/trend */
  windowStart: string;
  windowEnd: string;

  /** Per-metric aggregated statistics */
  metricAggregations: Array<{
    metricKey: string;
    unit?: string;
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    median: number;
    firstValue?: number;
    lastValue?: number;
    firstObservedAt?: string;
    lastObservedAt?: string;
  }>;

  /** Per-metric trend analysis */
  trends: Array<{
    metricKey: string;
    unit?: string;
    currentValue?: number;
    previousValue?: number;
    delta?: number;
    deltaPercent?: number;
    direction: 'up' | 'down' | 'flat' | 'unknown';
  }>;

  /** Evidence status: no_evidence | evidence_available | bounded */
  status: 'no_evidence' | 'evidence_available' | 'bounded';

  /** Completeness of evidence retrieval */
  completeness: 'complete' | 'bounded';

  /** When this feedback was generated (ISO 8601) */
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Bridge Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert a DecisionFeedback to a ContextObject for context assembly.
 *
 * The resulting ContextObject has:
 * - kind: 'decision' (consistent with decision-kind contexts)
 * - type: 'decision_feedback' (CLEARLY marks this as feedback, not raw decision)
 * - confidence: based on evidence completeness (NOT decision correctness)
 *
 * This bridge does NOT disguise feedback as a raw Decision Memory.
 * The consuming layer can inspect `type === 'decision_feedback'` to
 * distinguish from raw decision contexts.
 *
 * Confidence mapping:
 *   evidence_available + complete  → 0.9
 *   no_evidence + complete         → 0.7
 *   bounded                        → 0.6
 *   no_evidence + bounded          → 0.4
 *
 * @param feedback - The DecisionFeedback to convert
 * @return A ContextObject wrapping the feedback
 */
export function decisionFeedbackToContext(
  feedback: DecisionFeedback,
): ContextObject<DecisionFeedbackContextPayload> {
  const confidence = feedbackConfidence(feedback.status, feedback.completeness);

  // Build provenance — spreading projectId/topicId safely from attribution
  const provenance: Record<string, string | undefined | null> = {
    source: `decision_feedback:${feedback.decisionId}`,
    sourceType: 'decision_feedback',
    ownerId: feedback.ownerId,
  };

  const payload: DecisionFeedbackContextPayload = {
    decisionId: feedback.decisionId,
    decisionStatus: feedback.decisionStatus,
    expectedOutcome: feedback.expectedOutcome,
    outcomeCount: feedback.outcomeCount,
    outcomeIds: feedback.outcomeIds,
    outcomeTypes: feedback.outcomeTypes,
    firstObservedAt: feedback.firstObservedAt,
    lastObservedAt: feedback.lastObservedAt,
    windowStart: feedback.windowStart,
    windowEnd: feedback.windowEnd,
    metricAggregations: feedback.metricAggregations.map((ma) => ({
      metricKey: ma.metricKey,
      unit: ma.unit,
      count: ma.count,
      sum: ma.sum,
      avg: ma.avg,
      min: ma.min,
      max: ma.max,
      median: ma.median,
      firstValue: ma.firstValue,
      lastValue: ma.lastValue,
      firstObservedAt: ma.firstObservedAt,
      lastObservedAt: ma.lastObservedAt,
    })),
    trends: feedback.trends.map((t) => ({
      metricKey: t.metricKey,
      unit: t.unit,
      currentValue: t.currentValue,
      previousValue: t.previousValue,
      delta: t.delta,
      deltaPercent: t.deltaPercent,
      direction: t.direction,
    })),
    status: feedback.status,
    completeness: feedback.completeness,
    generatedAt: feedback.generatedAt,
  };

  // Use createDecisionContext from context-factory — it produces kind='decision'
  // The type on the returned context is 'decision' by default but we override
  // it by constructing a custom ContextObject.
  const context = createDecisionContext(
    // We use a minimal DecisionContextPayload as the base (factory requires it)
    // then override type to 'decision_feedback' and merge our feedback payload.
    {
      decisionType: 'feedback',
      actor: null,
      selected: null,
      rejected: null,
      reason: null,
      alternatives: null,
    },
    {
      id: `ctx_dfb_${feedback.decisionId}`,
      provenance: {
        source: provenance.source!,
        sourceType: provenance.sourceType!,
        ownerId: provenance.ownerId!,
        confidence,
      },
      lifecycleStage: 'retrieved',
      confidence,
      createdAt: feedback.generatedAt,
      updatedAt: feedback.generatedAt,
    },
  );

  // Override: set the actual payload as DecisionFeedbackContextPayload
  // and change type to 'decision_feedback'
  return {
    ...context,
    type: 'decision_feedback',
    payload: payload as unknown as typeof context.payload,
  };
}
