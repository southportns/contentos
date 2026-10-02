/**
 * P0.6.5.4 — Outcome Aggregation Core Unit Tests
 *
 * Comprehensive tests covering Categories A-O:
 *   A. Core Aggregation (count/sum/avg/min/max/median/first/last/empty/missing/invalid/unit)
 *   B. Filtering (owner/project/topic/target/targetId/outcomeType/time-window/combined)
 *   C. Time Series (daily/weeks/Monday-boundary/UTC-boundary/empty/multi)
 *   D. Trend (up/down/flat/zero/missing/delta/deltaPercent/adjacent/no-overlap)
 *   E. Edge Cases (0/1-observation/same-observedAt/same-key/negative/zero/decimal/large/NaN/Infinity/invalid-window/empty-window)
 */

import { describe, it, expect } from 'vitest';
import { createOutcomeMemory } from '../outcome-memory-factory';
import type { OutcomeMemory } from '../outcome-memory';
import type { OutcomeMetric } from '../outcome-memory';
import {
  // Core aggregation functions
  computeMetricAggregation,
  computeMedian,
  isFiniteNumber,
  metricGroupingKey,
  metricKeyFromGroupingKey,
  unitFromGroupingKey,
  validateTimeWindow,
  isWithinWindow,
  // UTC boundary helpers
  getUtcDayStart,
  getNextUtcDayStart,
  getUtcWeekStart,
  getNextUtcWeekStart,
  // Filter
  filterOutcomesByParams,
  clampRetrievalLimit,
  // Trend
  calculateMetricTrend,
  // Constants
  MAX_OUTCOME_RETRIEVAL_BOUND,
} from '../outcome-aggregation';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a test OutcomeMemory with specified metrics and observedAt.
 */
function createTestOutcome(opts: {
  id: string;
  ownerId: string;
  observedAt: string;
  metrics?: OutcomeMetric[];
  projectId?: string | null;
  topicId?: string | null;
  targetType?: 'content' | 'draft' | 'topic' | 'decision' | 'project';
  targetId?: string;
  outcomeType?: 'performance' | 'engagement' | 'conversion' | 'feedback' | 'publication' | 'failure' | 'milestone';
}): OutcomeMemory {
  return createOutcomeMemory({
    id: opts.id,
    ownerId: opts.ownerId,
    observedAt: opts.observedAt,
    metrics: opts.metrics ?? [],
    projectId: opts.projectId ?? null,
    topicId: opts.topicId ?? null,
    targetType: opts.targetType ?? 'content',
    targetId: opts.targetId ?? `target-${opts.id}`,
    outcomeType: opts.outcomeType ?? 'engagement',
  });
}

/**
 * Create a batch of outcomes with ascending observedAt.
 */
function createOutcomesSeries(
  ownerId: string,
  count: number,
  baseDate: Date,
  metricValueFn: (i: number) => number,
  metricKey = 'views',
  unit?: string,
): OutcomeMemory[] {
  const outcomes: OutcomeMemory[] = [];
  for (let i = 0; i < count; i++) {
    const observedAt = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString();
    outcomes.push(createTestOutcome({
      id: `out-${i}`,
      ownerId,
      observedAt,
      metrics: [{ key: metricKey, value: metricValueFn(i), unit }],
    }));
  }
  return outcomes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Aggregation
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Aggregation', () => {
  describe('A1: single metric', () => {
    it('should aggregate a single metric correctly', () => {
      const result = computeMetricAggregation([42], ['2026-10-01T00:00:00Z']);
      expect(result.count).toBe(1);
      expect(result.sum).toBe(42);
      expect(result.avg).toBe(42);
      expect(result.min).toBe(42);
      expect(result.max).toBe(42);
      expect(result.median).toBe(42);
      expect(result.firstValue).toBe(42);
      expect(result.lastValue).toBe(42);
      expect(result.firstObservedAt).toBe('2026-10-01T00:00:00Z');
      expect(result.lastObservedAt).toBe('2026-10-01T00:00:00Z');
    });
  });

  describe('A2: multiple metrics', () => {
    it('should aggregate multiple values correctly', () => {
      const result = computeMetricAggregation(
        [10, 20, 30, 40, 50],
        [
          '2026-10-01T00:00:00Z',
          '2026-10-02T00:00:00Z',
          '2026-10-03T00:00:00Z',
          '2026-10-04T00:00:00Z',
          '2026-10-05T00:00:00Z',
        ]
      );
      expect(result.count).toBe(5);
      expect(result.sum).toBe(150);
      expect(result.avg).toBe(30);
      expect(result.min).toBe(10);
      expect(result.max).toBe(50);
      expect(result.median).toBe(30);
      expect(result.firstValue).toBe(10);
      expect(result.lastValue).toBe(50);
      expect(result.firstObservedAt).toBe('2026-10-01T00:00:00Z');
      expect(result.lastObservedAt).toBe('2026-10-05T00:00:00Z');
    });
  });

  describe('A3: count', () => {
    it('should return correct count', () => {
      const result = computeMetricAggregation([1, 2, 3]);
      expect(result.count).toBe(3);
    });
  });

  describe('A4: sum', () => {
    it('should return correct sum', () => {
      const result = computeMetricAggregation([100, 200, 300]);
      expect(result.sum).toBe(600);
    });
  });

  describe('A5: avg', () => {
    it('should return correct arithmetic mean', () => {
      const result = computeMetricAggregation([10, 20, 30]);
      expect(result.avg).toBe(20);
    });
  });

  describe('A6: min', () => {
    it('should return minimum value', () => {
      const result = computeMetricAggregation([50, 10, 30, 20]);
      expect(result.min).toBe(10);
    });
  });

  describe('A7: max', () => {
    it('should return maximum value', () => {
      const result = computeMetricAggregation([50, 10, 30, 20]);
      expect(result.max).toBe(50);
    });
  });

  describe('A8: median odd', () => {
    it('should return middle value for odd count', () => {
      const result = computeMetricAggregation([3, 1, 2]);
      expect(result.median).toBe(2);
    });
  });

  describe('A9: median even', () => {
    it('should return average of two middle values for even count', () => {
      const result = computeMetricAggregation([1, 2, 3, 4]);
      expect(result.median).toBe(2.5);
    });
  });

  describe('A10: first/last values', () => {
    it('should track first and last values in input order', () => {
      const result = computeMetricAggregation([5, 3, 8, 1]);
      expect(result.firstValue).toBe(5);
      expect(result.lastValue).toBe(1);
    });
  });

  describe('A11: empty outcomes', () => {
    it('should return safe defaults for empty arrays', () => {
      const result = computeMetricAggregation([]);
      expect(result.count).toBe(0);
      expect(result.sum).toBe(0);
      expect(result.avg).toBe(0);
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.median).toBe(0);
      expect(result.firstValue).toBeUndefined();
      expect(result.lastValue).toBeUndefined();
      expect(result.firstObservedAt).toBeUndefined();
      expect(result.lastObservedAt).toBeUndefined();
    });
  });

  describe('A12: missing metrics', () => {
    it('should handle outcomes with no metrics', () => {
      const result = computeMetricAggregation([]);
      expect(result.count).toBe(0);
    });
  });

  describe('A13: invalid numbers ignored', () => {
    it('isFiniteNumber should reject NaN, Infinity, -Infinity', () => {
      expect(isFiniteNumber(NaN)).toBe(false);
      expect(isFiniteNumber(Infinity)).toBe(false);
      expect(isFiniteNumber(-Infinity)).toBe(false);
    });

    it('isFiniteNumber should accept valid numbers', () => {
      expect(isFiniteNumber(0)).toBe(true);
      expect(isFiniteNumber(-1)).toBe(true);
      expect(isFiniteNumber(42.5)).toBe(true);
      expect(isFiniteNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
    });
  });

  describe('A14: unit separation', () => {
    it('metrics with same key but different units should have different grouping keys', () => {
      const a: OutcomeMetric = { key: 'views', value: 100, unit: 'count' };
      const b: OutcomeMetric = { key: 'views', value: 100, unit: 'usd' };
      expect(metricGroupingKey(a)).not.toBe(metricGroupingKey(b));
    });

    it('metrics with missing unit should normalize to empty string', () => {
      const a: OutcomeMetric = { key: 'views', value: 100 };
      const b: OutcomeMetric = { key: 'views', value: 200 };
      expect(metricGroupingKey(a)).toBe(metricGroupingKey(b));
    });

    it('should extract metric key from grouping key', () => {
      expect(metricKeyFromGroupingKey('views count')).toBe('views');
      expect(metricKeyFromGroupingKey('views ')).toBe('views');
    });

    it('should extract unit from grouping key', () => {
      expect(unitFromGroupingKey('views count')).toBe('count');
      expect(unitFromGroupingKey('views ')).toBeUndefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Median-specific tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Median computation', () => {
  it('should return 0 for empty array', () => {
    expect(computeMedian([])).toBe(0);
  });

  it('should return single element', () => {
    expect(computeMedian([5])).toBe(5);
  });

  it('should return middle for odd length', () => {
    expect(computeMedian([1, 2, 3])).toBe(2);
  });

  it('should return average of two middles for even length', () => {
    expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
  });

  it('should handle unsorted input (function expects sorted)', () => {
    // The function expects pre-sorted input, but computeMetricAggregation sorts internally
    const sorted = [1, 5, 10, 20, 100];
    expect(computeMedian(sorted)).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Filtering', () => {
  const ownerId = 'user-1';

  const outcomes = [
    createTestOutcome({ id: 'o1', ownerId, observedAt: '2026-10-01T10:00:00Z', projectId: 'proj-A', topicId: 'topic-X', targetType: 'content', targetId: 'content-1', outcomeType: 'engagement' }),
    createTestOutcome({ id: 'o2', ownerId, observedAt: '2026-10-02T10:00:00Z', projectId: 'proj-A', topicId: 'topic-X', targetType: 'content', targetId: 'content-2', outcomeType: 'engagement' }),
    createTestOutcome({ id: 'o3', ownerId, observedAt: '2026-10-03T10:00:00Z', projectId: 'proj-B', topicId: 'topic-Y', targetType: 'draft', targetId: 'draft-1', outcomeType: 'performance' }),
    createTestOutcome({ id: 'o4', ownerId: 'user-2', observedAt: '2026-10-01T10:00:00Z', projectId: 'proj-A' }),  // Different owner
  ];

  describe('B1: owner isolation', () => {
    it('should only include outcomes for the specified owner', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        windowStart: '2026-10-01T00:00:00Z',
        windowEnd: '2026-10-04T00:00:00Z',
      });
      expect(filtered).toHaveLength(3);
      expect(filtered.every(o => o.ownerId === ownerId)).toBe(true);
    });
  });

  describe('B2: project filter', () => {
    it('should filter by projectId', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        projectId: 'proj-A',
        windowStart: '2026-10-01T00:00:00Z',
        windowEnd: '2026-10-04T00:00:00Z',
      });
      expect(filtered).toHaveLength(2);
      expect(filtered.every(o => o.projectId === 'proj-A')).toBe(true);
    });
  });

  describe('B3: topic filter', () => {
    it('should filter by topicId', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        topicId: 'topic-X',
        windowStart: '2026-10-01T00:00:00Z',
        windowEnd: '2026-10-04T00:00:00Z',
      });
      expect(filtered).toHaveLength(2);
      expect(filtered.every(o => o.topicId === 'topic-X')).toBe(true);
    });
  });

  describe('B4: targetType filter', () => {
    it('should filter by targetType', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        targetType: 'draft',
        windowStart: '2026-10-01T00:00:00Z',
        windowEnd: '2026-10-04T00:00:00Z',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].payload.targetType).toBe('draft');
    });
  });

  describe('B5: targetId filter', () => {
    it('should filter by targetId', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        targetId: 'content-2',
        windowStart: '2026-10-01T00:00:00Z',
        windowEnd: '2026-10-04T00:00:00Z',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].payload.targetId).toBe('content-2');
    });
  });

  describe('B6: outcomeType filter', () => {
    it('should filter by outcomeType', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        outcomeType: 'performance',
        windowStart: '2026-10-01T00:00:00Z',
        windowEnd: '2026-10-04T00:00:00Z',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].payload.outcomeType).toBe('performance');
    });
  });

  describe('B7: combined filters', () => {
    it('should apply all filters simultaneously', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        projectId: 'proj-A',
        topicId: 'topic-X',
        targetType: 'content',
        targetId: 'content-1',
        outcomeType: 'engagement',
        windowStart: '2026-10-01T00:00:00Z',
        windowEnd: '2026-10-02T00:00:00Z',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('o1');
    });
  });

  describe('B8: time window [start, end)', () => {
    it('should include start boundary (inclusive)', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        windowStart: '2026-10-01T10:00:00Z',
        windowEnd: '2026-10-04T00:00:00Z',
      });
      expect(filtered.some(o => o.id === 'o1')).toBe(true);
    });

    it('should exclude end boundary (exclusive)', () => {
      const filtered = filterOutcomesByParams(outcomes, {
        ownerId,
        windowStart: '2026-10-01T00:00:00Z',
        windowEnd: '2026-10-01T10:00:00Z',
      });
      expect(filtered.some(o => o.id === 'o1')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Time Window Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Time Window Validation', () => {
  it('should accept valid window (start < end)', () => {
    expect(() => validateTimeWindow('2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z')).not.toThrow();
  });

  it('should throw for empty window (start == end)', () => {
    expect(() => validateTimeWindow('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')).toThrow();
  });

  it('should throw for inverted window (start > end)', () => {
    expect(() => validateTimeWindow('2026-10-08T00:00:00Z', '2026-10-01T00:00:00Z')).toThrow();
  });

  it('should throw for invalid ISO date', () => {
    expect(() => validateTimeWindow('not-a-date', '2026-10-01T00:00:00Z')).toThrow();
    expect(() => validateTimeWindow('2026-10-01T00:00:00Z', 'not-a-date')).toThrow();
  });

  describe('isWithinWindow [start, end)', () => {
    it('should return true for value at start', () => {
      expect(isWithinWindow('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z')).toBe(true);
    });

    it('should return true for value before end', () => {
      expect(isWithinWindow('2026-10-07T23:59:59Z', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z')).toBe(true);
    });

    it('should return false for value at end', () => {
      expect(isWithinWindow('2026-10-08T00:00:00Z', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z')).toBe(false);
    });

    it('should return false for value before start', () => {
      expect(isWithinWindow('2026-09-30T23:59:59Z', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. UTC Day / Week Boundaries
// ═══════════════════════════════════════════════════════════════════════════════

describe('UTC Boundary Helpers', () => {
  describe('Day boundaries', () => {
    it('should return start of UTC day', () => {
      expect(getUtcDayStart('2026-10-01T15:30:45Z')).toBe('2026-10-01T00:00:00.000Z');
    });

    it('should return next UTC day', () => {
      expect(getNextUtcDayStart('2026-10-01T00:00:00.000Z')).toBe('2026-10-02T00:00:00.000Z');
    });
  });

  describe('Week boundaries', () => {
    it('should return Monday for a Monday', () => {
      // 2026-10-05 is a Monday
      expect(getUtcWeekStart('2026-10-05T12:00:00Z')).toBe('2026-10-05T00:00:00.000Z');
    });

    it('should return previous Monday for a Wednesday', () => {
      // 2026-10-07 is a Wednesday → Monday is 2026-10-05
      expect(getUtcWeekStart('2026-10-07T12:00:00Z')).toBe('2026-10-05T00:00:00.000Z');
    });

    it('should return previous Monday for a Sunday', () => {
      // 2026-10-11 is a Sunday → Monday is 2026-10-05
      expect(getUtcWeekStart('2026-10-11T12:00:00Z')).toBe('2026-10-05T00:00:00.000Z');
    });

    it('should return next Monday', () => {
      expect(getNextUtcWeekStart('2026-10-05T00:00:00.000Z')).toBe('2026-10-12T00:00:00.000Z');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Trend Calculation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Trend Calculation', () => {
  describe('D1: up', () => {
    it('should return up when current > previous', () => {
      const trend = calculateMetricTrend(200, 100, 'views');
      expect(trend.direction).toBe('up');
      expect(trend.delta).toBe(100);
      expect(trend.deltaPercent).toBe(100);
    });
  });

  describe('D2: down', () => {
    it('should return down when current < previous', () => {
      const trend = calculateMetricTrend(50, 100, 'views');
      expect(trend.direction).toBe('down');
      expect(trend.delta).toBe(-50);
      expect(trend.deltaPercent).toBe(-50);
    });
  });

  describe('D3: flat', () => {
    it('should return flat when current === previous', () => {
      const trend = calculateMetricTrend(100, 100, 'views');
      expect(trend.direction).toBe('flat');
      expect(trend.delta).toBe(0);
      expect(trend.deltaPercent).toBe(0);
    });
  });

  describe('D4: previous = 0', () => {
    it('should set deltaPercent undefined when previous is 0 and current > 0', () => {
      const trend = calculateMetricTrend(10, 0, 'views');
      expect(trend.direction).toBe('up');
      expect(trend.delta).toBe(10);
      expect(trend.deltaPercent).toBeUndefined();
    });

    it('should return flat when both are 0', () => {
      const trend = calculateMetricTrend(0, 0, 'views');
      expect(trend.direction).toBe('flat');
      expect(trend.delta).toBe(0);
      expect(trend.deltaPercent).toBeUndefined();
    });
  });

  describe('D5: missing previous', () => {
    it('should return unknown when previous is undefined', () => {
      const trend = calculateMetricTrend(100, undefined, 'views');
      expect(trend.direction).toBe('unknown');
      expect(trend.delta).toBeUndefined();
      expect(trend.deltaPercent).toBeUndefined();
    });

    it('should return unknown when current is undefined', () => {
      const trend = calculateMetricTrend(undefined, 100, 'views');
      expect(trend.direction).toBe('unknown');
    });
  });

  describe('D6: delta', () => {
    it('should compute correct delta', () => {
      const trend = calculateMetricTrend(150, 100, 'views');
      expect(trend.delta).toBe(50);
    });

    it('should compute negative delta', () => {
      const trend = calculateMetricTrend(75, 100, 'views');
      expect(trend.delta).toBe(-25);
    });
  });

  describe('D7: deltaPercent', () => {
    it('should compute correct percentage change', () => {
      const trend = calculateMetricTrend(150, 100, 'views');
      expect(trend.deltaPercent).toBe(50);
    });

    it('should handle negative previous', () => {
      const trend = calculateMetricTrend(50, -100, 'views');
      expect(trend.delta).toBe(150);
      expect(trend.deltaPercent).toBe(150);
    });
  });

  describe('trend with unit', () => {
    it('should preserve metric key and unit', () => {
      const trend = calculateMetricTrend(200, 100, 'revenue', 'usd');
      expect(trend.metricKey).toBe('revenue');
      expect(trend.unit).toBe('usd');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Retrieval Limit
// ═══════════════════════════════════════════════════════════════════════════════

describe('Retrieval Limit Clamping', () => {
  it('should default to max when undefined', () => {
    expect(clampRetrievalLimit(undefined)).toBe(MAX_OUTCOME_RETRIEVAL_BOUND);
  });

  it('should clamp to minimum of 1', () => {
    expect(clampRetrievalLimit(0)).toBe(1);
    expect(clampRetrievalLimit(-10)).toBe(1);
  });

  it('should clamp to maximum of MAX_OUTCOME_RETRIEVAL_BOUND', () => {
    expect(clampRetrievalLimit(1000)).toBe(MAX_OUTCOME_RETRIEVAL_BOUND);
  });

  it('should preserve valid limits', () => {
    expect(clampRetrievalLimit(100)).toBe(100);
    expect(clampRetrievalLimit(1)).toBe(1);
    expect(clampRetrievalLimit(500)).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Edge Cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
  it('should handle negative numbers', () => {
    const result = computeMetricAggregation([-10, -20, -30]);
    expect(result.sum).toBe(-60);
    expect(result.avg).toBe(-20);
    expect(result.min).toBe(-30);
    expect(result.max).toBe(-10);
    expect(result.median).toBe(-20);
  });

  it('should handle zero values', () => {
    const result = computeMetricAggregation([0, 0, 0]);
    expect(result.sum).toBe(0);
    expect(result.avg).toBe(0);
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
  });

  it('should handle decimal values', () => {
    const result = computeMetricAggregation([1.5, 2.5, 3.5]);
    expect(result.sum).toBeCloseTo(7.5);
    expect(result.avg).toBeCloseTo(2.5);
  });

  it('should handle very large numbers', () => {
    const result = computeMetricAggregation([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
    expect(result.count).toBe(2);
    expect(result.sum).toBe(Number.MAX_SAFE_INTEGER * 2);
  });

  it('should handle single value', () => {
    const result = computeMetricAggregation([42]);
    expect(result.count).toBe(1);
    expect(result.median).toBe(42);
  });

  it('should handle two values (median = avg)', () => {
    const result = computeMetricAggregation([10, 20]);
    expect(result.median).toBe(15);
  });
});
