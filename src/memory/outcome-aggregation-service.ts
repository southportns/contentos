/**
 * P0.6.5.4 — Outcome Aggregation Service
 *
 * Stateless, deterministic aggregation service for Outcome Memory.
 *
 * Architecture Position:
 *
 *   OutcomeAggregationService
 *       ↓ (parameter-level filtering + metric grouping + statistics)
 *   OutcomeAggregation / OutcomeAggregationSeries / OutcomeTrendResult
 *
 * Design Principles:
 *   1. No database dependency — takes OutcomeMemory[] as input
 *   2. No network, no LLM, no global state
 *   3. Deterministic — same input always produces same output
 *   4. No Date.now() inside aggregation logic (determinism guarantee)
 *   5. Parameter-level filtering — never trusts caller's data
 *   6. Time window: [start, end) half-open interval
 *   7. Completeness is HONEST about retrieval bounds
 *
 * Non-goals:
 *   - No persistence of aggregation results
 *   - No LLM insight or auto-learning
 *   - No direct database access
 */

import type { OutcomeMemory } from './outcome-memory';
import type {
  OutcomeMetricAggregation,
  OutcomeAggregation,
  OutcomeAggregationParams,
  OutcomeAggregationSeries,
  OutcomeAggregationGranularity,
  OutcomeAggregationBucket,
  OutcomeTrendParams,
  OutcomeTrendResult,
  OutcomeMetricTrend,
} from './outcome-aggregation';
import {
  filterOutcomesByParams,
  clampRetrievalLimit,
  validateTimeWindow,
  computeMetricAggregation,
  metricGroupingKey,
  metricKeyFromGroupingKey,
  unitFromGroupingKey,
  isFiniteNumber,
  isWithinWindow,
  getUtcDayStart,
  getNextUtcDayStart,
  getUtcWeekStart,
  getNextUtcWeekStart,
  calculateMetricTrend,
  MAX_OUTCOME_RETRIEVAL_BOUND,
} from './outcome-aggregation';

// ═══════════════════════════════════════════════════════════════════════════════
// Service Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service interface for outcome aggregation operations.
 *
 * Stateless — implementations hold no internal state.
 * All methods are pure computations over their inputs.
 */
export interface OutcomeAggregationService {
  /**
   * Aggregate a set of outcome memories into statistics.
   *
   * Performs parameter-level filtering on the input data,
   * groups metrics by (key + unit), computes statistics.
   *
   * @param outcomes - Input outcome memories (may be broader than params)
   * @param params - Aggregation parameters (filters + window + options)
   * @return Aggregation result
   * @throws Error if windowStart >= windowEnd
   */
  aggregate(
    outcomes: OutcomeMemory[],
    params: OutcomeAggregationParams,
  ): OutcomeAggregation;

  /**
   * Aggregate outcomes into time-series buckets.
   *
   * @param outcomes - Input outcome memories
   * @param params - Aggregation parameters (filters + window)
   * @param granularity - Day or week bucketing
   * @return Time-series aggregation result
   */
  aggregateTimeSeries(
    outcomes: OutcomeMemory[],
    params: Omit<OutcomeAggregationParams, 'aggregationFunctions'>,
    granularity: OutcomeAggregationGranularity,
  ): OutcomeAggregationSeries;

  /**
   * Compare two adjacent windows and compute trends.
   *
   * Previous window has equal length to current window,
   * and is immediately before current (no overlap).
   *
   * @param outcomes - Input outcome memories (should cover both windows)
   * @param params - Trend parameters
   * @return Trend comparison result
   */
  compareWindows(
    outcomes: OutcomeMemory[],
    params: OutcomeTrendParams,
  ): OutcomeTrendResult;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Service Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default implementation of OutcomeAggregationService.
 *
 * Stateless and deterministic — safe to use as a singleton.
 */
export class OutcomeAggregationServiceImpl implements OutcomeAggregationService {

  /**
   * @inheritdoc
   */
  aggregate(
    outcomes: OutcomeMemory[],
    params: OutcomeAggregationParams,
  ): OutcomeAggregation {
    // Validate time window
    validateTimeWindow(params.windowStart, params.windowEnd);

    const retrievalLimit = clampRetrievalLimit(params.retrievalLimit);

    // Parameter-level filtering
    const filtered = filterOutcomesByParams(outcomes, params);

    // Sort by observedAt ASC for first/last tracking
    const sorted = [...filtered].sort((a, b) => {
      const aTime = new Date(a.payload.observedAt).getTime();
      const bTime = new Date(b.payload.observedAt).getTime();
      return aTime - bTime;
    });

    // Group metrics by (key + unit)
    const metricGroups = new Map<string, {
      values: number[];
      observedAtTimes: string[];
    }>();

    let firstObservedAt: string | undefined;
    let lastObservedAt: string | undefined;

    for (const outcome of sorted) {
      const payload = outcome.payload;

      // Track overall first/last observedAt
      if (firstObservedAt === undefined) {
        firstObservedAt = payload.observedAt;
      }
      lastObservedAt = payload.observedAt;

      // Extract metrics
      if (!payload.metrics || payload.metrics.length === 0) continue;

      for (const metric of payload.metrics) {
        // Skip non-finite values
        if (!isFiniteNumber(metric.value)) continue;

        const groupKey = metricGroupingKey(metric);
        let group = metricGroups.get(groupKey);
        if (!group) {
          group = { values: [], observedAtTimes: [] };
          metricGroups.set(groupKey, group);
        }
        group.values.push(metric.value);
        group.observedAtTimes.push(payload.observedAt);
      }
    }

    // Compute aggregations for each metric group
    const metricAggregations: OutcomeMetricAggregation[] = [];
    for (const [groupKey, group] of metricGroups) {
      const stats = computeMetricAggregation(group.values, group.observedAtTimes);
      metricAggregations.push({
        metricKey: metricKeyFromGroupingKey(groupKey),
        unit: unitFromGroupingKey(groupKey),
        ...stats,
      });
    }

    // Sort metric aggregations by metricKey for determinism
    metricAggregations.sort((a, b) => {
      if (a.metricKey !== b.metricKey) return a.metricKey < b.metricKey ? -1 : 1;
      const aUnit = a.unit ?? '';
      const bUnit = b.unit ?? '';
      return aUnit < bUnit ? -1 : aUnit > bUnit ? 1 : 0;
    });

    // Determine completeness
    const completeness = determineCompleteness(sorted.length, retrievalLimit, firstObservedAt, params.windowStart);

    return {
      ownerId: params.ownerId,
      projectId: params.projectId,
      topicId: params.topicId,
      targetType: params.targetType,
      targetId: params.targetId,
      outcomeType: params.outcomeType,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      outcomeCount: sorted.length,
      metricAggregations,
      firstObservedAt,
      lastObservedAt,
      retrievalLimit,
      completeness,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * @inheritdoc
   */
  aggregateTimeSeries(
    outcomes: OutcomeMemory[],
    params: Omit<OutcomeAggregationParams, 'aggregationFunctions'>,
    granularity: OutcomeAggregationGranularity,
  ): OutcomeAggregationSeries {
    // Validate time window
    validateTimeWindow(params.windowStart, params.windowEnd);

    const retrievalLimit = clampRetrievalLimit(params.retrievalLimit);

    // Parameter-level filtering (without time window — we'll bucket within)
    const filtered = filterOutcomesByParams(outcomes, {
      ...params,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
    });

    // Generate buckets
    const buckets = this.generateBuckets(
      filtered,
      params.windowStart,
      params.windowEnd,
      granularity,
    );

    // Determine completeness based on filtered count and retrieval limit
    const completeness: 'complete' | 'bounded' =
      filtered.length >= retrievalLimit ? 'bounded' : 'complete';

    return {
      ownerId: params.ownerId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      granularity,
      buckets,
      completeness,
    };
  }

  /**
   * @inheritdoc
   */
  compareWindows(
    outcomes: OutcomeMemory[],
    params: OutcomeTrendParams,
  ): OutcomeTrendResult {
    // Validate current window
    validateTimeWindow(params.windowStart, params.windowEnd);

    // Calculate previous window: equal length, immediately before current
    const currentStart = new Date(params.windowStart).getTime();
    const currentEnd = new Date(params.windowEnd).getTime();
    const windowLength = currentEnd - currentStart;
    const previousStart = new Date(currentStart - windowLength).toISOString();
    const previousEnd = params.windowStart; // Previous window ends where current begins

    // Aggregate current window
    const currentWindow = this.aggregate(outcomes, {
      ownerId: params.ownerId,
      projectId: params.projectId,
      topicId: params.topicId,
      targetType: params.targetType,
      targetId: params.targetId,
      outcomeType: params.outcomeType,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      retrievalLimit: params.retrievalLimit,
    });

    // Aggregate previous window
    const previousWindow = this.aggregate(outcomes, {
      ownerId: params.ownerId,
      projectId: params.projectId,
      topicId: params.topicId,
      targetType: params.targetType,
      targetId: params.targetId,
      outcomeType: params.outcomeType,
      windowStart: previousStart,
      windowEnd: previousEnd,
      retrievalLimit: params.retrievalLimit,
    });

    // Compute trends for all metrics that appear in either window
    const trends = this.computeTrends(currentWindow, previousWindow);

    // Completeness: bounded if either window is bounded
    const completeness: 'complete' | 'bounded' =
      currentWindow.completeness === 'bounded' || previousWindow.completeness === 'bounded'
        ? 'bounded'
        : 'complete';

    return {
      ownerId: params.ownerId,
      currentWindow,
      previousWindow,
      trends,
      completeness,
      generatedAt: new Date().toISOString(),
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private: Bucket Generation
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Generate time buckets for a time-series aggregation.
   */
  private generateBuckets(
    outcomes: OutcomeMemory[],
    windowStart: string,
    windowEnd: string,
    granularity: OutcomeAggregationGranularity,
  ): OutcomeAggregationBucket[] {
    const buckets: OutcomeAggregationBucket[] = [];

    if (outcomes.length === 0) return buckets;

    // Generate bucket boundaries
    let bucketStart: string;
    let getNextBoundary: (start: string) => string;

    if (granularity === 'day') {
      bucketStart = getUtcDayStart(windowStart);
      getNextBoundary = getNextUtcDayStart;
    } else {
      bucketStart = getUtcWeekStart(windowStart);
      getNextBoundary = getNextUtcWeekStart;
    }

    const windowEndTime = new Date(windowEnd).getTime();

    while (new Date(bucketStart).getTime() < windowEndTime) {
      const bucketEnd = getNextBoundary(bucketStart);

      // Filter outcomes in this bucket
      const bucketOutcomes = outcomes.filter((o) =>
        isWithinWindow(o.payload.observedAt, bucketStart, bucketEnd)
      );

      // Compute metric aggregations for this bucket
      const metricAggregations = this.aggregateBucketMetrics(bucketOutcomes);

      buckets.push({
        bucketStart,
        bucketEnd,
        outcomeCount: bucketOutcomes.length,
        metricAggregations,
      });

      bucketStart = bucketEnd;
    }

    return buckets;
  }

  /**
   * Compute metric aggregations for a single time bucket.
   */
  private aggregateBucketMetrics(
    outcomes: OutcomeMemory[],
  ): OutcomeMetricAggregation[] {
    const metricGroups = new Map<string, {
      values: number[];
      observedAtTimes: string[];
    }>();

    for (const outcome of outcomes) {
      if (!outcome.payload.metrics || outcome.payload.metrics.length === 0) continue;

      for (const metric of outcome.payload.metrics) {
        if (!isFiniteNumber(metric.value)) continue;

        const groupKey = metricGroupingKey(metric);
        let group = metricGroups.get(groupKey);
        if (!group) {
          group = { values: [], observedAtTimes: [] };
          metricGroups.set(groupKey, group);
        }
        group.values.push(metric.value);
        group.observedAtTimes.push(outcome.payload.observedAt);
      }
    }

    const aggregations: OutcomeMetricAggregation[] = [];
    for (const [groupKey, group] of metricGroups) {
      const stats = computeMetricAggregation(group.values, group.observedAtTimes);
      aggregations.push({
        metricKey: metricKeyFromGroupingKey(groupKey),
        unit: unitFromGroupingKey(groupKey),
        ...stats,
      });
    }

    // Sort for determinism
    aggregations.sort((a, b) => {
      if (a.metricKey !== b.metricKey) return a.metricKey < b.metricKey ? -1 : 1;
      const aUnit = a.unit ?? '';
      const bUnit = b.unit ?? '';
      return aUnit < bUnit ? -1 : aUnit > bUnit ? 1 : 0;
    });

    return aggregations;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private: Trend Computation
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Compare two aggregation results and compute per-metric trends.
   */
  private computeTrends(
    current: OutcomeAggregation,
    previous: OutcomeAggregation,
  ): OutcomeMetricTrend[] {
    // Build lookup maps for metric aggregations
    const currentMetrics = new Map<string, OutcomeMetricAggregation>();
    for (const ma of current.metricAggregations) {
      currentMetrics.set(metricGroupingKey(ma), ma);
    }

    const previousMetrics = new Map<string, OutcomeMetricAggregation>();
    for (const ma of previous.metricAggregations) {
      previousMetrics.set(metricGroupingKey(ma), ma);
    }

    // Collect all unique metric keys
    const allKeys = new Set<string>([
      ...currentMetrics.keys(),
      ...previousMetrics.keys(),
    ]);

    const trends: OutcomeMetricTrend[] = [];
    for (const key of allKeys) {
      const currentMa = currentMetrics.get(key);
      const previousMa = previousMetrics.get(key);

      const trend = calculateMetricTrend(
        currentMa?.avg,
        previousMa?.avg,
        metricKeyFromGroupingKey(key),
        unitFromGroupingKey(key),
      );
      trends.push(trend);
    }

    // Sort for determinism
    trends.sort((a, b) => {
      if (a.metricKey !== b.metricKey) return a.metricKey < b.metricKey ? -1 : 1;
      const aUnit = a.unit ?? '';
      const bUnit = b.unit ?? '';
      return aUnit < bUnit ? -1 : aUnit > bUnit ? 1 : 0;
    });

    return trends;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Service Instance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default singleton instance of OutcomeAggregationService.
 */
export const defaultOutcomeAggregationService: OutcomeAggregationService =
  new OutcomeAggregationServiceImpl();

// ═══════════════════════════════════════════════════════════════════════════════
// Completeness Determination
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Determine whether an aggregation is complete or bounded.
 *
 * Rules:
 * - If the number of results equals the retrieval limit → bounded
 *   (cannot prove we got all records; the limit may have truncated)
 * - If the number of results is less than the limit → complete
 *   (the DB returned fewer records than the limit, so all are present)
 *
 * @param resultCount - Number of matching results
 * @param retrievalLimit - Applied retrieval limit
 * @param firstObservedAt - Earliest observedAt in results
 * @param windowStart - Window start
 * @return 'complete' or 'bounded'
 */
function determineCompleteness(
  resultCount: number,
  retrievalLimit: number,
  firstObservedAt: string | undefined,
  windowStart: string,
): 'complete' | 'bounded' {
  // If we got exactly the limit, we can't be sure there aren't more
  if (resultCount >= retrievalLimit) {
    return 'bounded';
  }

  // If we got fewer than the limit, all matching records were returned
  // (the DB exhausted before reaching the limit)
  return 'complete';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aggregate outcomes by day within a window.
 *
 * @param outcomes - Input outcome memories
 * @param params - Aggregation parameters
 * @return Time series with daily buckets
 */
export function aggregateByDay(
  outcomes: OutcomeMemory[],
  params: Omit<OutcomeAggregationParams, 'aggregationFunctions'>,
): OutcomeAggregationSeries {
  return defaultOutcomeAggregationService.aggregateTimeSeries(
    outcomes,
    params,
    'day',
  );
}

/**
 * Aggregate outcomes by week within a window.
 *
 * @param outcomes - Input outcome memories
 * @param params - Aggregation parameters
 * @return Time series with weekly buckets (Monday-based)
 */
export function aggregateByWeek(
  outcomes: OutcomeMemory[],
  params: Omit<OutcomeAggregationParams, 'aggregationFunctions'>,
): OutcomeAggregationSeries {
  return defaultOutcomeAggregationService.aggregateTimeSeries(
    outcomes,
    params,
    'week',
  );
}

/**
 * Compare two adjacent windows and compute trends.
 *
 * @param outcomes - Input outcome memories
 * @param params - Trend parameters
 * @return Trend comparison result
 */
export function compareOutcomeWindows(
  outcomes: OutcomeMemory[],
  params: OutcomeTrendParams,
): OutcomeTrendResult {
  return defaultOutcomeAggregationService.compareWindows(outcomes, params);
}
