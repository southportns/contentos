/**
 * P0.6.5.4 — Outcome Aggregation Core
 *
 * Deterministic, pure-function aggregation over Outcome Memory observations.
 *
 * Architecture Position:
 *
 *   OutcomeMemory[]  (immutable facts)
 *       ↓
 *   outcome-aggregation.ts  (pure aggregation functions)
 *       ↓
 *   OutcomeAggregation / OutcomeAggregationSeries / OutcomeMetricTrend
 *
 * Design Principles:
 *   1. Outcome = immutable fact; Aggregation = derived / recomputable
 *   2. All aggregation is ON-DEMAND — no persistence of derived results
 *   3. Pure functions — same input always produces same output
 *   4. No Date.now() inside aggregation logic (determinism)
 *   5. No LLM, no AI judgment, no network, no global state
 *   6. No new Prisma models — aggregation NEVER writes back to DB
 *   7. NaN / Infinity / -Infinity are excluded from all calculations
 *   8. Metric grouping: metricKey + unit (missing unit → empty string)
 *   9. Time window: [start, end) — half-open interval on observedAt
 *  10. Completeness is HONEST — bounded when retrieval limit may truncate
 *
 * Non-goals:
 *   - No aggregation persistence (P0.6.6+ will decide)
 *   - No LLM insight or natural language conclusions
 *   - No auto-learning or decision-making
 *   - No modification of Outcome payload schema
 *   - No modification of Alert lifecycle
 */

import type { OutcomeMemory } from './outcome-memory';
import type {
  OutcomeType,
  OutcomeTargetType,
  OutcomeMetric,
} from './outcome-memory';

// ═══════════════════════════════════════════════════════════════════════════════
// Aggregation Function Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supported aggregation functions for outcome metrics.
 *
 * - count:  Number of observations
 * - sum:    Sum of all values
 * - avg:    Arithmetic mean (sum / count)
 * - min:    Minimum value
 * - max:    Maximum value
 * - median: Median value (middle of sorted; avg of two middles for even count)
 */
export type OutcomeAggregationFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'median';

/**
 * All supported aggregation function identifiers.
 */
export const OUTCOME_AGGREGATION_FUNCTIONS: readonly OutcomeAggregationFunction[] = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'median',
] as const;

/**
 * Default set of aggregation functions applied when caller doesn't specify.
 */
export const DEFAULT_AGGREGATION_FUNCTIONS: readonly OutcomeAggregationFunction[] = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'median',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Metric Aggregation Result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aggregated statistics for a single metric (grouped by metricKey + unit).
 *
 * All statistics are computed in a single pass for consistency.
 * Even if the caller only needs avg, they can obtain all other stats
 * from the same result object.
 */
export interface OutcomeMetricAggregation {
  /** Metric key (e.g., 'views', 'likes', 'ctr') */
  metricKey: string;

  /** Optional unit (e.g., 'count', 'percent', 'seconds') */
  unit?: string;

  /** Number of finite values that contributed to this aggregation */
  count: number;

  /** Sum of all finite values (0 when count=0) */
  sum: number;

  /** Arithmetic mean (0 when count=0) */
  avg: number;

  /** Minimum finite value (0 when count=0) */
  min: number;

  /** Maximum finite value (0 when count=0) */
  max: number;

  /** Median of finite values (0 when count=0) */
  median: number;

  /** First value in observedAt order (undefined when count=0) */
  firstValue?: number;

  /** Last value in observedAt order (undefined when count=0) */
  lastValue?: number;

  /** observedAt of the first observation (undefined when count=0) */
  firstObservedAt?: string;

  /** observedAt of the last observation (undefined when count=0) */
  lastObservedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Aggregation Params
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters controlling an outcome aggregation operation.
 *
 * The aggregation applies parameter-level filtering ON TOP of whatever
 * data the caller provides. Never assume inputs are pre-filtered.
 */
export interface OutcomeAggregationParams {
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

  /**
   * Time window start (inclusive) — ISO 8601.
   * Outcomes with observedAt >= windowStart are included.
   */
  windowStart: string;

  /**
   * Time window end (exclusive) — ISO 8601.
   * Outcomes with observedAt < windowEnd are included.
   */
  windowEnd: string;

  /**
   * Aggregation functions to compute (default: all six).
   * Currently all functions are always computed; this field is reserved
   * for future selective computation optimization.
   */
  aggregationFunctions?: OutcomeAggregationFunction[];

  /**
   * Maximum number of outcome records the retrieval layer may return.
   * Used for completeness determination.
   * Clamped to MAX_OUTCOME_RETRIEVAL_BOUND (500).
   */
  retrievalLimit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Aggregation Result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete aggregation result for a window of outcome observations.
 *
 * This represents derived (non-persisted) statistics computed on-the-fly
 * from immutable Outcome facts.
 */
export interface OutcomeAggregation {
  /** Owner (user) ID */
  ownerId: string;

  /** Project filter applied (if any) */
  projectId?: string;

  /** Topic filter applied (if any) */
  topicId?: string;

  /** Target type filter applied (if any) */
  targetType?: OutcomeTargetType;

  /** Target ID filter applied (if any) */
  targetId?: string;

  /** Outcome type filter applied (if any) */
  outcomeType?: OutcomeType;

  /** Time window start (inclusive) */
  windowStart: string;

  /** Time window end (exclusive) */
  windowEnd: string;

  /** Number of outcome observations that fell within the window and matched filters */
  outcomeCount: number;

  /** Per-metric aggregations grouped by (metricKey + unit) */
  metricAggregations: OutcomeMetricAggregation[];

  /** Earliest observedAt among matched outcomes (undefined when outcomeCount=0) */
  firstObservedAt?: string;

  /** Latest observedAt among matched outcomes (undefined when outcomeCount=0) */
  lastObservedAt?: string;

  /**
   * The retrieval limit that was in effect.
   * Transparency: lets callers understand completeness constraints.
   */
  retrievalLimit: number;

  /**
   * Completeness indicator:
   * - 'complete': all observations in the window are confirmed present
   * - 'bounded': retrieval limit may have truncated results
   */
  completeness: 'complete' | 'bounded';

  /**
   * ISO 8601 timestamp of when this aggregation was generated.
   * Set by the service layer, NOT used in any aggregation computation.
   */
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Time Series Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Granularity for time-series bucketing.
 * - 'day':  UTC day boundary (00:00:00 → next 00:00:00)
 * - 'week': UTC week boundary (Monday 00:00 → next Monday 00:00)
 */
export type OutcomeAggregationGranularity =
  | 'day'
  | 'week';

/**
 * A single time bucket in an aggregation time series.
 */
export interface OutcomeAggregationBucket {
  /** Bucket start (inclusive) — ISO 8601 */
  bucketStart: string;

  /** Bucket end (exclusive) — ISO 8601 */
  bucketEnd: string;

  /** Number of outcome observations in this bucket */
  outcomeCount: number;

  /** Per-metric aggregations within this bucket */
  metricAggregations: OutcomeMetricAggregation[];
}

/**
 * Time-series aggregation result: a sequence of time buckets.
 */
export interface OutcomeAggregationSeries {
  /** Owner (user) ID */
  ownerId: string;

  /** Overall window start (inclusive) */
  windowStart: string;

  /** Overall window end (exclusive) */
  windowEnd: string;

  /** Bucket granularity */
  granularity: OutcomeAggregationGranularity;

  /** Ordered time buckets */
  buckets: OutcomeAggregationBucket[];

  /**
   * Completeness indicator:
   * - 'complete': all observations confirmed present
   * - 'bounded': retrieval limit may have truncated
   */
  completeness: 'complete' | 'bounded';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Trend Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Direction of metric trend between two adjacent windows.
 * - 'up':     current > previous
 * - 'down':   current < previous
 * - 'flat':   current === previous
 * - 'unknown': cannot determine (missing data)
 */
export type OutcomeTrendDirection =
  | 'up'
  | 'down'
  | 'flat'
  | 'unknown';

/**
 * Trend analysis for a single metric across two adjacent windows.
 *
 * Compares the current window's avg against the previous window's avg.
 * Previous window is immediately before current, with equal length.
 */
export interface OutcomeMetricTrend {
  /** Metric key */
  metricKey: string;

  /** Optional unit */
  unit?: string;

  /** Current window avg (undefined if no data) */
  currentValue?: number;

  /** Previous window avg (undefined if no data) */
  previousValue?: number;

  /** Absolute delta (current - previous) */
  delta?: number;

  /**
   * Percentage change (current - previous) / |previous| * 100.
   * Undefined when previous === 0 (division by zero).
   */
  deltaPercent?: number;

  /** Direction of the trend */
  direction: OutcomeTrendDirection;
}

/**
 * Parameters for trend comparison between two adjacent windows.
 */
export interface OutcomeTrendParams {
  /** Owner (user) ID — mandatory */
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

  /** Current window start (inclusive) — ISO 8601 */
  windowStart: string;

  /** Current window end (exclusive) — ISO 8601 */
  windowEnd: string;

  /**
   * Retrieval limit for each window (max 500).
   * Previous window has the same limit.
   */
  retrievalLimit?: number;
}

/**
 * Result of comparing two adjacent time windows.
 */
export interface OutcomeTrendResult {
  /** Owner (user) ID */
  ownerId: string;

  /** Current window aggregation */
  currentWindow: OutcomeAggregation;

  /** Previous window aggregation */
  previousWindow: OutcomeAggregation;

  /** Per-metric trend analysis */
  trends: OutcomeMetricTrend[];

  /** Completeness indicator */
  completeness: 'complete' | 'bounded';

  /** ISO 8601 timestamp of when this result was generated */
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Safety Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum allowed retrieval limit for aggregation.
 * Mirrors the safety bound from Outcome Retrieval layer.
 */
export const MAX_OUTCOME_RETRIEVAL_BOUND = 500;

// ═══════════════════════════════════════════════════════════════════════════════
// Pure Aggregation Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Grouping key for metrics: metricKey + normalized unit.
 * Missing unit is normalized to empty string to prevent cross-unit mixing.
 *
 * @param metric - The outcome metric
 * @return Internal grouping key
 */
export function metricGroupingKey(metric: OutcomeMetric): string {
  const unit = metric.unit ?? '';
  return `${metric.key} ${unit}`;
}

/**
 * Extract unit from a grouping key.
 *
 * @param groupingKey - Key produced by metricGroupingKey()
 * @return The unit (or undefined if empty)
 */
export function unitFromGroupingKey(groupingKey: string): string | undefined {
  const idx = groupingKey.indexOf(' ');
  if (idx === -1) return undefined;
  const unit = groupingKey.slice(idx + 1);
  return unit.length > 0 ? unit : undefined;
}

/**
 * Extract metric key from a grouping key.
 *
 * @param groupingKey - Key produced by metricGroupingKey()
 * @return The metric key
 */
export function metricKeyFromGroupingKey(groupingKey: string): string {
  const idx = groupingKey.indexOf(' ');
  if (idx === -1) return groupingKey;
  return groupingKey.slice(0, idx);
}

/**
 * Check if a number is finite and valid for statistical computation.
 * Excludes NaN, Infinity, -Infinity.
 *
 * @param value - Number to check
 * @return True if the value is a finite number
 */
export function isFiniteNumber(value: number): boolean {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Compute the median of a sorted array of numbers.
 *
 * - Odd length: middle element
 * - Even length: average of two middle elements
 * - Empty array: 0
 *
 * @param sortedValues - Pre-sorted array of finite numbers (ascending)
 * @return The median value
 */
export function computeMedian(sortedValues: readonly number[]): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  if (n === 1) return sortedValues[0];

  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sortedValues[mid];
  }
  // Even: average of two middle values
  return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
}

/**
 * Compute all aggregate statistics for an array of numeric values.
 *
 * Returns safe defaults (all zeros / undefined) for empty arrays.
 * Never produces NaN or Infinity.
 *
 * @param values - Array of numbers (pre-filtered for finiteness)
 * @param observedAtTimes - Parallel array of observedAt ISO strings for first/last tracking
 * @return Complete aggregation statistics
 */
export function computeMetricAggregation(
  values: readonly number[],
  observedAtTimes?: readonly string[],
): Omit<OutcomeMetricAggregation, 'metricKey' | 'unit'> {
  const count = values.length;

  if (count === 0) {
    return {
      count: 0,
      sum: 0,
      avg: 0,
      min: 0,
      max: 0,
      median: 0,
      firstValue: undefined,
      lastValue: undefined,
      firstObservedAt: undefined,
      lastObservedAt: undefined,
    };
  }

  let sum = 0;
  let min = values[0];
  let max = values[0];

  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const avg = sum / count;

  // Sort a copy for median computation
  const sorted = [...values].sort((a, b) => a - b);
  const median = computeMedian(sorted);

  return {
    count,
    sum,
    avg,
    min,
    max,
    median,
    firstValue: values[0],
    lastValue: values[count - 1],
    firstObservedAt: observedAtTimes && observedAtTimes.length > 0
      ? observedAtTimes[0]
      : undefined,
    lastObservedAt: observedAtTimes && observedAtTimes.length > 0
      ? observedAtTimes[observedAtTimes.length - 1]
      : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Time Window Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate a time window.
 *
 * Throws Error for:
 * - windowStart >= windowEnd (empty or inverted window)
 * - Invalid ISO 8601 date strings
 *
 * @param windowStart - Window start (inclusive)
 * @param windowEnd - Window end (exclusive)
 * @throws Error if window is invalid
 */
export function validateTimeWindow(windowStart: string, windowEnd: string): void {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);

  if (isNaN(start.getTime())) {
    throw new Error(`Invalid windowStart: "${windowStart}" is not a valid ISO 8601 date`);
  }
  if (isNaN(end.getTime())) {
    throw new Error(`Invalid windowEnd: "${windowEnd}" is not a valid ISO 8601 date`);
  }
  if (start.getTime() >= end.getTime()) {
    throw new Error(
      `Invalid time window: windowStart (${windowStart}) must be strictly less than windowEnd (${windowEnd})`
    );
  }
}

/**
 * Check if an observedAt timestamp falls within a half-open window [start, end).
 *
 * @param observedAt - ISO 8601 timestamp from outcome payload
 * @param windowStart - Window start (inclusive)
 * @param windowEnd - Window end (exclusive)
 * @return True if observedAt is within [windowStart, windowEnd)
 */
export function isWithinWindow(
  observedAt: string,
  windowStart: string,
  windowEnd: string,
): boolean {
  const t = new Date(observedAt).getTime();
  const start = new Date(windowStart).getTime();
  const end = new Date(windowEnd).getTime();
  return t >= start && t < end;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTC Day / Week Boundaries
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the UTC day boundary (00:00:00.000Z) for a given timestamp.
 *
 * @param isoTimestamp - Any ISO 8601 timestamp
 * @return ISO string of the start of that UTC day
 */
export function getUtcDayStart(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
  return new Date(dayStart).toISOString();
}

/**
 * Get the next UTC day boundary after the given day start.
 *
 * @param dayStart - Start of a UTC day (from getUtcDayStart)
 * @return ISO string of the start of the next UTC day
 */
export function getNextUtcDayStart(dayStart: string): string {
  const d = new Date(dayStart);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return new Date(next).toISOString();
}

/**
 * Get the UTC Monday boundary (Monday 00:00:00.000Z) for a given timestamp.
 *
 * If the timestamp is already on a Monday, returns that Monday's start.
 *
 * @param isoTimestamp - Any ISO 8601 timestamp
 * @return ISO string of the start of that UTC week (Monday)
 */
export function getUtcWeekStart(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  // Days since Monday: if Sunday(0), go back 6 days; else go back (dayOfWeek - 1) days
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0
  );
  return new Date(monday).toISOString();
}

/**
 * Get the next UTC Monday boundary after the given week start.
 *
 * @param weekStart - Start of a UTC week (from getUtcWeekStart)
 * @return ISO string of the start of the next UTC week (Monday)
 */
export function getNextUtcWeekStart(weekStart: string): string {
  const d = new Date(weekStart);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7, 0, 0, 0, 0);
  return new Date(next).toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Trend Calculation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate the trend between two metric values.
 *
 * Uses avg for comparison.
 * - previous === 0 → deltaPercent = undefined, direction based on current
 * - previous undefined or current undefined → direction = 'unknown'
 *
 * @param current - Current window avg
 * @param previous - Previous window avg
 * @return Trend analysis result
 */
export function calculateMetricTrend(
  current: number | undefined,
  previous: number | undefined,
  metricKey: string,
  unit?: string,
): OutcomeMetricTrend {
  // Missing data → unknown
  if (current === undefined || previous === undefined) {
    return {
      metricKey,
      unit,
      currentValue: current,
      previousValue: previous,
      delta: undefined,
      deltaPercent: undefined,
      direction: 'unknown',
    };
  }

  const delta = current - previous;

  // Determine direction
  let direction: OutcomeTrendDirection;
  if (delta > 0) {
    direction = 'up';
  } else if (delta < 0) {
    direction = 'down';
  } else {
    direction = 'flat';
  }

  // deltaPercent: only when previous !== 0
  let deltaPercent: number | undefined;
  if (previous !== 0) {
    deltaPercent = (delta / Math.abs(previous)) * 100;
  }

  return {
    metricKey,
    unit,
    currentValue: current,
    previousValue: previous,
    delta,
    deltaPercent,
    direction,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Filtering Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Filter outcomes by parameter-level criteria.
 *
 * Applies ALL specified filters. Never assumes caller has pre-filtered.
 * Time window uses payload.observedAt.
 *
 * @param outcomes - Input outcome memories
 * @param params - Filter parameters
 * @return Filtered outcomes that match all criteria
 */
export function filterOutcomesByParams(
  outcomes: readonly OutcomeMemory[],
  params: Pick<
    OutcomeAggregationParams,
    | 'ownerId'
    | 'projectId'
    | 'topicId'
    | 'targetType'
    | 'targetId'
    | 'outcomeType'
    | 'windowStart'
    | 'windowEnd'
  >,
): OutcomeMemory[] {
  return outcomes.filter((outcome) => {
    // Owner isolation — mandatory
    if (outcome.ownerId !== params.ownerId) return false;

    // Project filter
    if (params.projectId !== undefined && outcome.projectId !== params.projectId) {
      return false;
    }

    // Topic filter
    if (params.topicId !== undefined && outcome.topicId !== params.topicId) {
      return false;
    }

    const payload = outcome.payload;

    // Target type filter
    if (params.targetType !== undefined && payload.targetType !== params.targetType) {
      return false;
    }

    // Target ID filter
    if (params.targetId !== undefined && payload.targetId !== params.targetId) {
      return false;
    }

    // Outcome type filter
    if (params.outcomeType !== undefined && payload.outcomeType !== params.outcomeType) {
      return false;
    }

    // Time window: [start, end) on observedAt
    if (!isWithinWindow(payload.observedAt, params.windowStart, params.windowEnd)) {
      return false;
    }

    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Clamp Retrieval Limit
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clamp a retrieval limit to the safe maximum.
 *
 * @param limit - Requested limit
 * @return Clamped limit (1 to MAX_OUTCOME_RETRIEVAL_BOUND)
 */
export function clampRetrievalLimit(limit: number | undefined): number {
  if (limit === undefined) return MAX_OUTCOME_RETRIEVAL_BOUND;
  if (limit < 1) return 1;
  if (limit > MAX_OUTCOME_RETRIEVAL_BOUND) return MAX_OUTCOME_RETRIEVAL_BOUND;
  return limit;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  OutcomeMetric,
  OutcomeType,
  OutcomeTargetType,
} from './outcome-memory';
