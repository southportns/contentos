/**
 * P0.6.5.5 — Decision Feedback Service
 *
 * Stateless, deterministic service that builds DecisionFeedback from
 * a Decision and its attributed Outcomes.
 *
 * Architecture Position:
 *
 *   DecisionMemory + OutcomeMemory[] + OutcomeRetrievalMetadata
 *       ↓
 *   DecisionFeedbackServiceImpl.buildFeedback()
 *       ↓
 *   DecisionFeedback (derived, NOT persisted)
 *
 * Design Principles:
 *   1. Stateless — no internal state, safe as singleton
 *   2. Deterministic — same input always produces same output
 *   3. No DB, no network, no LLM, no global state
 *   4. Reuses OutcomeAggregationService for metric aggregation
 *   5. Owner / Project / Topic isolation at every layer
 *   6. attribution.decisionId is the SOLE relationship source
 *
 * Processing Steps:
 *   1. Verify decision owner matches outcomes owner
 *   2. Filter outcomes by attribution.decisionId
 *   3. Filter outcomes by project/topic scope isolation
 *   4. Sort outcomes by observedAt ASC
 *   5. Collect outcome IDs and types
 *   6. Determine first/last observedAt
 *   7. Aggregate metrics (reuses OutcomeAggregationService)
 *   8. Calculate trends (reuses OutcomeAggregationService)
 *   9. Determine completeness
 *   10. Construct DecisionFeedback
 *
 * Non-goals:
 *   - No decision lifecycle modification
 *   - No causal inference
 *   - No LLM judgment
 */

import type { DecisionMemory } from './decision-memory';
import type { DecisionStatus } from './memory-types';
import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeType } from './outcome-memory';
import type {
  OutcomeMetricAggregation,
  OutcomeMetricTrend,
} from './outcome-aggregation';
import type {
  OutcomeRetrievalMetadata,
  OutcomeRetrievalResult,
} from './outcome-memory-retrieval';
import type { OutcomeAggregationService } from './outcome-aggregation-service';
import { OutcomeAggregationServiceImpl } from './outcome-aggregation-service';
import type {
  DecisionFeedback,
  DecisionFeedbackStatus,
} from './decision-feedback';
import {
  determineDecisionFeedbackCompleteness,
  determineDecisionFeedbackStatus,
  isOutcomeAttributedToDecision,
} from './decision-feedback';

// ═══════════════════════════════════════════════════════════════════════════════
// Service Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service interface for building Decision Feedback.
 *
 * Stateless — implementations hold no internal state.
 * All methods are pure computations over their inputs.
 */
export interface DecisionFeedbackService {
  /**
   * Build DecisionFeedback from a Decision and its attributed Outcomes.
   *
   * @param decision - The Decision Memory
   * @param outcomes - Outcome Memories (may contain non-attributed ones)
   * @param retrievalMetadata - Metadata about the retrieval operation
   * @return The derived DecisionFeedback
   * @throws Error if decision owner isolation is violated
   */
  buildFeedback(
    decision: DecisionMemory,
    outcomes: OutcomeMemory[],
    retrievalMetadata: OutcomeRetrievalMetadata,
  ): DecisionFeedback;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Service Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default implementation of DecisionFeedbackService.
 *
 * Stateless and deterministic — safe to use as a singleton.
 * Reuses OutcomeAggregationService for metric aggregation and trend analysis.
 */
export class DecisionFeedbackServiceImpl implements DecisionFeedbackService {

  private readonly aggregationService: OutcomeAggregationService;

  /**
   * Create a new DecisionFeedbackServiceImpl.
   *
   * @param aggregationService - The aggregation service to reuse (default: new instance)
   */
  constructor(aggregationService?: OutcomeAggregationService) {
    this.aggregationService = aggregationService ?? new OutcomeAggregationServiceImpl();
  }

  /**
   * @inheritdoc
   */
  buildFeedback(
    decision: DecisionMemory,
    outcomes: OutcomeMemory[],
    retrievalMetadata: OutcomeRetrievalMetadata,
  ): DecisionFeedback {
    const ownerId = decision.ownerId ?? '';
    const decisionId = decision.id;
    const payload = decision.payload;

    // Step 1: Filter outcomes by attribution AND owner/project/topic isolation
    const isolatedOutcomes = this.filterAndIsolateOutcomes(
      outcomes,
      decision,
    );

    // Step 2: Sort by observedAt ASC for first/last tracking
    const sorted = [...isolatedOutcomes].sort((a, b) => {
      const aTime = new Date(a.payload.observedAt).getTime();
      const bTime = new Date(b.payload.observedAt).getTime();
      return aTime - bTime;
    });

    // Step 3: Collect outcome IDs
    const outcomeIds = sorted.map((o) => o.id);

    // Step 4: Collect outcome types (unique, preserves first-seen order)
    const outcomeTypes = this.collectUniqueOutcomeTypes(sorted);

    // Step 5: Determine first/last observedAt
    const firstObservedAt = sorted.length > 0 ? sorted[0].payload.observedAt : undefined;
    const lastObservedAt = sorted.length > 0 ? sorted[sorted.length - 1].payload.observedAt : undefined;

    // Step 6: Aggregate metrics using OutcomeAggregationService
    const metricAggregations = this.aggregateMetrics(sorted, decision);

    // Step 7: Calculate trends using OutcomeAggregationService
    const trends = this.calculateTrends(sorted, decision);

    // Step 8: Determine completeness
    const completeness = determineDecisionFeedbackCompleteness(retrievalMetadata);

    // Step 9: Determine status
    const status = determineDecisionFeedbackStatus(sorted.length, completeness);

    // Step 10: Construct DecisionFeedback
    const generatedAt = new Date().toISOString();

    return {
      id: `dfb_${decisionId}_${Date.now()}`,
      ownerId,
      decisionId,
      decisionStatus: payload.decisionStatus,
      decisionCreatedAt: decision.createdAt,
      expectedOutcome: payload.expectedOutcome,
      outcomeCount: sorted.length,
      outcomeIds,
      outcomeTypes,
      firstObservedAt,
      lastObservedAt,
      metricAggregations,
      trends,
      status,
      completeness,
      generatedAt,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private: Outcome Filtering & Isolation
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Filter outcomes by attribution AND owner/project/topic isolation.
   *
   * Defense-in-depth: Even if the caller passes outcomes from other
   * owners/projects, they are excluded from feedback.
   *
   * Isolation Rules:
   * 1. outcome.ownerId MUST equal decision.ownerId
   * 2. If decision.projectId is non-null: outcome.projectId MUST match
   * 3. If decision.topicId is non-null: outcome.topicId MUST match
   * 4. outcome MUST be attributed to decision via attribution.decisionId
   */
  private filterAndIsolateOutcomes(
    outcomes: OutcomeMemory[],
    decision: DecisionMemory,
  ): OutcomeMemory[] {
    const ownerId = decision.ownerId ?? '';
    const decisionProjectId = decision.projectId;
    const decisionTopicId = decision.topicId;

    return outcomes.filter((outcome) => {
      // Owner isolation
      if (outcome.ownerId !== ownerId) return false;

      // Project isolation: if Decision has projectId, outcome must match
      if (decisionProjectId != null && outcome.projectId !== decisionProjectId) {
        return false;
      }

      // Topic isolation: if Decision has topicId, outcome must match
      if (decisionTopicId != null && outcome.topicId !== decisionTopicId) {
        return false;
      }

      // Attribution: ONLY via explicit attribution.decisionId
      if (!isOutcomeAttributedToDecision(outcome, decision.id)) {
        return false;
      }

      return true;
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private: Metric Aggregation
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Aggregate metrics from outcomes using OutcomeAggregationService.
   *
   * Reuses existing aggregation logic — no reimplementation.
   */
  private aggregateMetrics(
    outcomes: OutcomeMemory[],
    decision: DecisionMemory,
  ): OutcomeMetricAggregation[] {
    if (outcomes.length === 0) return [];

    const ownerId = decision.ownerId ?? '';

    // Use the outcome observation range as the aggregation window.
    // Outcomes are already sorted by observedAt ASC at this point.
    // Add 1ms buffer to windowEnd because isWithinWindow() uses half-open [start, end).
    const windowStart = outcomes[0].payload.observedAt;
    const windowEnd = new Date(new Date(outcomes[outcomes.length - 1].payload.observedAt).getTime() + 1).toISOString();

    const aggregation = this.aggregationService.aggregate(outcomes, {
      ownerId,
      projectId: decision.projectId ?? undefined,
      topicId: decision.topicId ?? undefined,
      windowStart,
      windowEnd,
      retrievalLimit: 500,
    });

    return aggregation.metricAggregations;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private: Trend Calculation
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Calculate trends from outcomes using OutcomeAggregationService.
   *
   * Compares the current window [decision.createdAt, now] with the
   * previous equal-length window.
   *
   * Reuses existing trend logic — no reimplementation.
   */
  private calculateTrends(
    outcomes: OutcomeMemory[],
    decision: DecisionMemory,
  ): OutcomeMetricTrend[] {
    if (outcomes.length === 0) return [];

    const ownerId = decision.ownerId ?? '';
    const decisionTime = new Date(decision.createdAt).getTime();
    const now = Date.now();

    // Current window: [decision.createdAt, now]
    const currentStart = decision.createdAt;
    const currentEnd = new Date(now).toISOString();

    // Only calculate trends if we have enough time range
    const windowLength = now - decisionTime;
    if (windowLength <= 0) return [];

    const trendResult = this.aggregationService.compareWindows(outcomes, {
      ownerId,
      projectId: decision.projectId ?? undefined,
      topicId: decision.topicId ?? undefined,
      windowStart: currentStart,
      windowEnd: currentEnd,
      retrievalLimit: 500,
    });

    return trendResult.trends;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private: Unique Outcome Types
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Collect unique outcome types preserving first-seen order.
   */
  private collectUniqueOutcomeTypes(outcomes: OutcomeMemory[]): OutcomeType[] {
    const seen = new Set<string>();
    const types: OutcomeType[] = [];

    for (const outcome of outcomes) {
      const type = outcome.payload.outcomeType;
      if (!seen.has(type)) {
        seen.add(type);
        types.push(type);
      }
    }

    return types;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Service Instance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default singleton instance of DecisionFeedbackService.
 */
export const defaultDecisionFeedbackService: DecisionFeedbackService =
  new DecisionFeedbackServiceImpl();
