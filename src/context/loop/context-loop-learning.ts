/**
 * P0.6.7 — Context Loop Learning Module
 *
 * Generates Learning Candidates from Decision + Outcome + Feedback evidence.
 *
 * Architecture Position:
 *
 *   DecisionFeedback + DecisionMemory + now
 *       ↓
 *   buildLearningCandidates()
 *       ↓
 *   LearningCandidate[]
 *
 * Design Principles:
 *   1. Candidates are derived ONLY from objective evidence
 *   2. No LLM, no fuzzy inference, no causal claims
 *   3. Candidate confidence <= source confidence (never amplifies)
 *   4. No outcomes = no candidates (no false learning)
 *   5. Each Candidate preserves its evidence chain
 *   6. Bounded feedback → reduced candidate confidence
 *   7. Candidates do NOT modify Knowledge
 *
 * Non-goals:
 *   - Not producing Knowledge mutations
 *   - Not making causal claims ("A caused B")
 *   - Not LLM-based summarization
 */

import type { DecisionMemory } from '@/memory/decision-memory';
import type { DecisionFeedback } from '@/memory/decision-feedback';
import type { OutcomeMetricTrend } from '@/memory/outcome-aggregation';
import type {
  LearningCandidate,
  LearningCandidateType,
  LearningCandidateEvidence,
} from './context-loop-types';
import { makeLearningCandidateId } from './context-loop-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Thresholds for determining candidate types from evidence.
 * These are conservative — favoring "unknown" over false positive.
 */
const HIGH_METRIC_THRESHOLD = 1000;  // Values above this suggest strong signal
const POSITIVE_TREND_RATIO = 0.6;    // 60%+ of metrics trending up = successful
const NEGATIVE_TREND_RATIO = 0.6;    // 60%+ trending down = failure
const MIN_CONFIDENCE_FLOOR = 0.1;   // Minimum confidence for any candidate

// ═══════════════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build Learning Candidates from a Decision and its Feedback.
 *
 * Rules:
 * - No outcomes → empty array (no false learning)
 * - Bounded feedback → confidence reduced proportionally
 * - Only generates candidates from explicit, attributable evidence
 * - Candidate confidence <= min(decision.confidence, feedback.confidence)
 *
 * @param decision - The DecisionMemory that was made
 * @param feedback - The DecisionFeedback with outcome evidence
 * @param now - ISO 8601 timestamp for candidate creation time
 * @return Array of LearningCandidates (may be empty)
 */
export function buildLearningCandidates(
  decision: DecisionMemory,
  feedback: DecisionFeedback,
  now: string,
): LearningCandidate[] {
  // Rule: No outcomes → no candidates (prevents false learning)
  if (feedback.outcomeCount === 0) {
    return [];
  }

  const candidates: LearningCandidate[] = [];

  // Base confidence: bounded by both decision confidence and feedback confidence
  const baseConfidence = computeCandidateConfidence(decision, feedback);

  // 1. Always generate a decision_pattern candidate
  //    (what was decided and what happened)
  candidates.push(buildDecisionPatternCandidate(decision, feedback, baseConfidence, now));

  // 2. If outcomes contain positive signals, generate successful_pattern
  const trendDirections = analyzeTrends(feedback.trends);
  if (trendDirections.positiveDominant) {
    candidates.push(buildSuccessfulPatternCandidate(decision, feedback, baseConfidence, now));
  }

  // 3. If outcomes contain negative signals, generate failure_pattern
  if (trendDirections.negativeDominant) {
    candidates.push(buildFailurePatternCandidate(decision, feedback, baseConfidence, now));
  }

  // 4. If aggregation shows strong metric values, generate strategy_signal
  if (hasStrongMetricSignals(feedback)) {
    candidates.push(buildStrategySignalCandidate(decision, feedback, baseConfidence, now));
  }

  // 5. If decision shows preference patterns, generate preference_signal
  if (hasPreferenceSignal(decision, feedback)) {
    candidates.push(buildPreferenceSignalCandidate(decision, feedback, baseConfidence, now));
  }

  return candidates;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Candidate Confidence Computation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute the confidence for a LearningCandidate.
 *
 * Rule: derived confidence <= source confidence
 *
 * The candidate's confidence is the minimum of:
 * - Decision confidence (how reliable the decision record is)
 * - A fixed factor reflecting the feedback type
 *
 * For bounded feedback, we further reduce confidence.
 */
function computeCandidateConfidence(
  decision: DecisionMemory,
  feedback: DecisionFeedback,
): number {
  const decisionConfidence = decision.confidence ?? 0.5;

  // Feedback-based scaling factor:
  // - evidence_available + complete: 1.0
  // - bounded: 0.7
  let feedbackFactor: number;
  if (feedback.status === 'evidence_available' && feedback.completeness === 'complete') {
    feedbackFactor = 1.0;
  } else if (feedback.completeness === 'bounded') {
    feedbackFactor = 0.7;
  } else {
    // no_evidence (shouldn't reach here since we check outcomeCount > 0)
    feedbackFactor = 0.5;
  }

  // Candidate confidence = decisionConfidence * feedbackFactor
  // This ensures: candidate.confidence <= decision.confidence
  const rawConfidence = decisionConfidence * feedbackFactor;

  // Clamp to valid range
  return Math.max(MIN_CONFIDENCE_FLOOR, Math.min(1.0, rawConfidence));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Trend Analysis
// ═══════════════════════════════════════════════════════════════════════════════

interface TrendAnalysis {
  positiveDominant: boolean;
  negativeDominant: boolean;
  totalTrends: number;
}

/**
 * Analyze metric trends to determine dominant direction.
 */
function analyzeTrends(trends: OutcomeMetricTrend[]): TrendAnalysis {
  const total = trends.length;
  if (total === 0) {
    return { positiveDominant: false, negativeDominant: false, totalTrends: 0 };
  }

  let upCount = 0;
  let downCount = 0;

  for (const trend of trends) {
    if (trend.direction === 'up') upCount++;
    else if (trend.direction === 'down') downCount++;
  }

  return {
    positiveDominant: upCount / total >= POSITIVE_TREND_RATIO,
    negativeDominant: downCount / total >= NEGATIVE_TREND_RATIO,
    totalTrends: total,
  };
}

/**
 * Check if feedback contains strong metric signals.
 */
function hasStrongMetricSignals(feedback: DecisionFeedback): boolean {
  if (feedback.metricAggregations.length === 0) return false;

  for (const agg of feedback.metricAggregations) {
    if (agg.count >= 1 && (agg.max >= HIGH_METRIC_THRESHOLD || agg.sum >= HIGH_METRIC_THRESHOLD)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the decision shows preference pattern signal.
 */
function hasPreferenceSignal(
  decision: DecisionMemory,
  feedback: DecisionFeedback,
): boolean {
  // Preference signal: decision has specific choice AND outcomes exist
  return feedback.outcomeCount >= 1 && decision.payload.decision.length > 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Candidate Builders (each builds one specific type)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a decision_pattern candidate.
 * Describes: what was decided and what was observed after.
 */
function buildDecisionPatternCandidate(
  decision: DecisionMemory,
  feedback: DecisionFeedback,
  confidence: number,
  now: string,
): LearningCandidate {
  const evidence: LearningCandidateEvidence[] = [
    {
      type: 'decision',
      referenceId: decision.id,
      summary: `Decision: ${truncate(decision.payload.decision, 80)}`,
    },
  ];

  // Add aggregation evidence
  for (const agg of feedback.metricAggregations.slice(0, 3)) {
    evidence.push({
      type: 'aggregation',
      referenceId: agg.metricKey,
      summary: `${agg.metricKey}: avg=${agg.avg.toFixed(2)}, count=${agg.count}`,
    });
  }

  // Add feedback status evidence
  evidence.push({
    type: 'feedback',
    summary: `Feedback: ${feedback.outcomeCount} outcomes, status=${feedback.status}`,
  });

  return {
    id: makeLearningCandidateId(decision.id, 'decision_pattern'),
    type: 'decision_pattern',
    ownerId: decision.ownerId ?? '',
    projectId: decision.projectId ?? undefined,
    topicId: decision.topicId ?? undefined,
    sourceDecisionId: decision.id,
    sourceOutcomeIds: feedback.outcomeIds,
    sourceFeedbackId: feedback.id,
    summary: `Decision "${truncate(decision.payload.decision, 40)}" → ${feedback.outcomeCount} outcomes observed`,
    evidence,
    confidence,
    importance: 0.7,
    status: 'candidate',
    createdAt: now,
  };
}

/**
 * Build a successful_pattern candidate.
 * Triggered when majority of metric trends are positive.
 */
function buildSuccessfulPatternCandidate(
  decision: DecisionMemory,
  feedback: DecisionFeedback,
  confidence: number,
  now: string,
): LearningCandidate {
  const evidence: LearningCandidateEvidence[] = [
    {
      type: 'decision',
      referenceId: decision.id,
      summary: `Decision: ${truncate(decision.payload.decision, 80)}`,
    },
  ];

  // Add positive trend evidence
  for (const trend of feedback.trends.filter((t) => t.direction === 'up').slice(0, 3)) {
    evidence.push({
      type: 'trend',
      referenceId: trend.metricKey,
      summary: `${trend.metricKey}: direction=up, delta=${trend.delta?.toFixed(2) ?? 'N/A'}`,
    });
  }

  // Add outcome evidence
  for (const outcomeId of feedback.outcomeIds.slice(0, 2)) {
    evidence.push({
      type: 'outcome',
      referenceId: outcomeId,
      summary: `Outcome ${outcomeId} attributed to decision`,
    });
  }

  return {
    id: makeLearningCandidateId(decision.id, 'successful_pattern'),
    type: 'successful_pattern',
    ownerId: decision.ownerId ?? '',
    projectId: decision.projectId ?? undefined,
    topicId: decision.topicId ?? undefined,
    sourceDecisionId: decision.id,
    sourceOutcomeIds: feedback.outcomeIds,
    sourceFeedbackId: feedback.id,
    summary: `Positive outcome pattern observed: ${feedback.outcomeCount} outcomes with majority positive trends`,
    evidence,
    confidence,
    importance: 0.8,
    status: 'candidate',
    createdAt: now,
  };
}

/**
 * Build a failure_pattern candidate.
 * Triggered when majority of metric trends are negative.
 */
function buildFailurePatternCandidate(
  decision: DecisionMemory,
  feedback: DecisionFeedback,
  confidence: number,
  now: string,
): LearningCandidate {
  const evidence: LearningCandidateEvidence[] = [
    {
      type: 'decision',
      referenceId: decision.id,
      summary: `Decision: ${truncate(decision.payload.decision, 80)}`,
    },
  ];

  // Add negative trend evidence
  for (const trend of feedback.trends.filter((t) => t.direction === 'down').slice(0, 3)) {
    evidence.push({
      type: 'trend',
      referenceId: trend.metricKey,
      summary: `${trend.metricKey}: direction=down, delta=${trend.delta?.toFixed(2) ?? 'N/A'}`,
    });
  }

  return {
    id: makeLearningCandidateId(decision.id, 'failure_pattern'),
    type: 'failure_pattern',
    ownerId: decision.ownerId ?? '',
    projectId: decision.projectId ?? undefined,
    topicId: decision.topicId ?? undefined,
    sourceDecisionId: decision.id,
    sourceOutcomeIds: feedback.outcomeIds,
    sourceFeedbackId: feedback.id,
    summary: `Concerning pattern observed: ${feedback.outcomeCount} outcomes with majority negative trends`,
    evidence,
    confidence,
    importance: 0.75,
    status: 'candidate',
    createdAt: now,
  };
}

/**
 * Build a strategy_signal candidate.
 * Triggered when metric aggregations show strong absolute values.
 */
function buildStrategySignalCandidate(
  decision: DecisionMemory,
  feedback: DecisionFeedback,
  confidence: number,
  now: string,
): LearningCandidate {
  const evidence: LearningCandidateEvidence[] = [
    {
      type: 'decision',
      referenceId: decision.id,
      summary: `Decision: ${truncate(decision.payload.decision, 80)}`,
    },
  ];

  for (const agg of feedback.metricAggregations.filter(
    (a) => a.max >= HIGH_METRIC_THRESHOLD || a.sum >= HIGH_METRIC_THRESHOLD
  ).slice(0, 3)) {
    evidence.push({
      type: 'aggregation',
      referenceId: agg.metricKey,
      summary: `${agg.metricKey}: max=${agg.max}, sum=${agg.sum.toFixed(2)}, avg=${agg.avg.toFixed(2)}`,
    });
  }

  return {
    id: makeLearningCandidateId(decision.id, 'strategy_signal'),
    type: 'strategy_signal',
    ownerId: decision.ownerId ?? '',
    projectId: decision.projectId ?? undefined,
    topicId: decision.topicId ?? undefined,
    sourceDecisionId: decision.id,
    sourceOutcomeIds: feedback.outcomeIds,
    sourceFeedbackId: feedback.id,
    summary: `Strong metric signals: ${feedback.metricAggregations.length} metrics aggregated from ${feedback.outcomeCount} outcomes`,
    evidence,
    confidence,
    importance: 0.8,
    status: 'candidate',
    createdAt: now,
  };
}

/**
 * Build a preference_signal candidate.
 * Captures user preference patterns from decision choices.
 */
function buildPreferenceSignalCandidate(
  decision: DecisionMemory,
  feedback: DecisionFeedback,
  confidence: number,
  now: string,
): LearningCandidate {
  const evidence: LearningCandidateEvidence[] = [
    {
      type: 'decision',
      referenceId: decision.id,
      summary: `Selected: ${truncate(decision.payload.decision, 60)}`,
    },
    {
      type: 'feedback',
      summary: `Outcome count: ${feedback.outcomeCount}`,
    },
  ];

  return {
    id: makeLearningCandidateId(decision.id, 'preference_signal'),
    type: 'preference_signal',
    ownerId: decision.ownerId ?? '',
    projectId: decision.projectId ?? undefined,
    topicId: decision.topicId ?? undefined,
    sourceDecisionId: decision.id,
    sourceOutcomeIds: feedback.outcomeIds,
    sourceFeedbackId: feedback.id,
    summary: `Preference signal: ${truncate(decision.payload.decision, 40)} resulted in ${feedback.outcomeCount} outcomes`,
    evidence,
    confidence,
    importance: 0.6,
    status: 'candidate',
    createdAt: now,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Truncate a string to a maximum length with ellipsis.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
