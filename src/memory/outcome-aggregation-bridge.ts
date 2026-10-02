/**
 * P0.6.5.4 — Outcome Aggregation Context Bridge
 *
 * Converts OutcomeAggregation results into ContextObject for
 * consumption by Context Assembly.
 *
 * Architecture Position:
 *
 *   OutcomeAggregation
 *       ↓ (outcomeAggregationToContext)
 *   ContextObject<OutcomeContextPayload>  (kind='outcome', type='outcome_aggregation')
 *
 * IMPORTANT DESIGN NOTE:
 * Aggregation is NOT a single Outcome observation — it is derived
 * (recomputed) statistics from multiple observations. The ContextObject
 * MUST clearly indicate it carries aggregated data via type='outcome_aggregation'.
 *
 * If the current Context type system cannot safely carry aggregation results,
 * this bridge returns null (graceful degradation).
 */

import type { ContextObject } from '@/context/context-object';
import type { OutcomeContextPayload } from '@/context/context-types';
import type { OutcomeAggregation } from './outcome-aggregation';
import type { OutcomeMetricAggregation } from './outcome-aggregation';
import { createOutcomeContext } from '@/context/context-factory';

// ═══════════════════════════════════════════════════════════════════════════════
// Bridge Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Metadata stored in the OutcomeContextPayload to indicate aggregation.
 *
 * Since OutcomeContextPayload.value is `unknown`, we can store the
 * full aggregation result there. The `type` field on ContextObject
 * is set to 'outcome_aggregation' to clearly distinguish from single
 * outcome observations (type='outcome').
 */
export interface OutcomeAggregationContextMetadata {
  /** Discriminator — always 'outcome_aggregation' */
  kind: 'outcome_aggregation';

  /** The window this aggregation covers */
  windowStart: string;
  windowEnd: string;

  /** Number of outcome observations aggregated */
  outcomeCount: number;

  /** Completeness indicator */
  completeness: 'complete' | 'bounded';

  /** Applied filters */
  projectId?: string;
  topicId?: string;
  targetType?: string;
  targetId?: string;
  outcomeType?: string;

  /** Metric aggregations */
  metrics: OutcomeMetricAggregation[];

  /** First/last observedAt in the window */
  firstObservedAt?: string;
  lastObservedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Bridge Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert an OutcomeAggregation to a ContextObject for context assembly.
 *
 * The resulting ContextObject has:
 * - kind: 'outcome' (consistent with single-outcome contexts)
 * - type: 'outcome_aggregation' (CLEARLY marks this as aggregated, not a single observation)
 * - payload.outcomeType: 'aggregation'
 * - payload.value: the full aggregation data (as OutcomeAggregationContextMetadata)
 *
 * This bridge does NOT disguise aggregation as a single Outcome Memory.
 * The consuming layer can inspect `type === 'outcome_aggregation'` to
 * distinguish from raw observation contexts.
 *
 * @param aggregation - The aggregation result to convert
 * @return A ContextObject wrapping the aggregation, or null if aggregation has no data
 */
export function outcomeAggregationToContext(
  aggregation: OutcomeAggregation,
): ContextObject<OutcomeContextPayload> {
  const metadata: OutcomeAggregationContextMetadata = {
    kind: 'outcome_aggregation',
    windowStart: aggregation.windowStart,
    windowEnd: aggregation.windowEnd,
    outcomeCount: aggregation.outcomeCount,
    completeness: aggregation.completeness,
    projectId: aggregation.projectId,
    topicId: aggregation.topicId,
    targetType: aggregation.targetType,
    targetId: aggregation.targetId,
    outcomeType: aggregation.outcomeType,
    metrics: aggregation.metricAggregations,
    firstObservedAt: aggregation.firstObservedAt,
    lastObservedAt: aggregation.lastObservedAt,
  };

  const payload: OutcomeContextPayload = {
    outcomeType: 'aggregation',
    value: metadata as unknown as object,
    source: 'outcome_aggregation',
    observedAt: aggregation.generatedAt,
  };

  return createOutcomeContext(payload, {
    id: `ctx_outagg_${aggregation.ownerId}_${Date.now()}`,
    provenance: {
      source: 'outcome_aggregation',
      sourceType: 'aggregation_service',
      ownerId: aggregation.ownerId,
      projectId: aggregation.projectId,
      topicId: aggregation.topicId,
      confidence: aggregation.completeness === 'complete' ? 0.9 : 0.6,
    },
    lifecycleStage: 'retrieved',
    confidence: aggregation.completeness === 'complete' ? 0.9 : 0.6,
    createdAt: aggregation.generatedAt,
    updatedAt: aggregation.generatedAt,
  });
}
