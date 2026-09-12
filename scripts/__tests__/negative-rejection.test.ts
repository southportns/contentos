/**
 * P0.3.5.1 — Negative Rejection Metric Tests
 *
 * Tests the calculation logic for Negative Rejection Rate.
 * Covers:
 *   - Partial rejection (14/16 correctly rejected → 0.875)
 *   - Full rejection (10/10 → 1.0)
 *   - Empty input (0 queries → 0, no NaN/Infinity)
 *   - Zero rejection (0/10 → 0.0)
 */

import { describe, it, expect } from 'vitest';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NegativeRejectionResult {
  negative_queries: number;
  correctly_rejected: number;
  false_positives: number;
  rejection_rate: number;
}

// ─── Pure Calculation Function (extracted from evaluate-retrieval-v2.ts) ─────

/**
 * Calculate negative rejection metric from retrieval results.
 *
 * @param negativeQueryResults - Array of retrieval result counts for negative queries
 *                              (each element is the number of results returned)
 * @returns Structured negative rejection metric
 *
 * Logic:
 *   - correctly_rejected = count of queries with 0 results
 *   - false_positives = count of queries with > 0 results
 *   - rejection_rate = correctly_rejected / total_queries (0 if total_queries === 0)
 */
function calculateNegativeRejection(negativeQueryResults: number[]): NegativeRejectionResult {
  const negative_queries = negativeQueryResults.length;
  const correctly_rejected = negativeQueryResults.filter((count) => count === 0).length;
  const false_positives = negative_queries - correctly_rejected;
  const rejection_rate = negative_queries > 0 ? correctly_rejected / negative_queries : 0;

  return {
    negative_queries,
    correctly_rejected,
    false_positives,
    rejection_rate,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.3.5.1 — Negative Rejection Calculation', () => {
  describe('Test 1: Partial rejection (14/16)', () => {
    it('should compute 87.5% rejection when 14 out of 16 return empty', () => {
      // 16 negative queries: 14 with empty results, 2 with 1 result each (false positives)
      const results = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1];
      const metric = calculateNegativeRejection(results);

      expect(metric.negative_queries).toBe(16);
      expect(metric.correctly_rejected).toBe(14);
      expect(metric.false_positives).toBe(2);
      expect(metric.rejection_rate).toBeCloseTo(0.875, 3);
    });

    it('should use empty array length check, not boolean all-or-nothing', () => {
      // Regression test: NOT using .every() which returns 0 if any query has results
      const results = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1];
      const metric = calculateNegativeRejection(results);

      // The old bug would return 0 because .every() sees the 1s
      expect(metric.rejection_rate).toBeGreaterThan(0);
      expect(metric.rejection_rate).toBeLessThan(1);
    });
  });

  describe('Test 2: Full rejection (10/10)', () => {
    it('should compute 100% rejection when all queries return empty', () => {
      const results = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const metric = calculateNegativeRejection(results);

      expect(metric.negative_queries).toBe(10);
      expect(metric.correctly_rejected).toBe(10);
      expect(metric.false_positives).toBe(0);
      expect(metric.rejection_rate).toBe(1);
    });
  });

  describe('Test 3: Zero negative queries', () => {
    it('should return 0 (not NaN or Infinity) when no negative queries exist', () => {
      const metric = calculateNegativeRejection([]);

      expect(metric.negative_queries).toBe(0);
      expect(metric.correctly_rejected).toBe(0);
      expect(metric.false_positives).toBe(0);
      expect(metric.rejection_rate).toBe(0);

      // Explicitly verify no NaN or Infinity
      expect(Number.isNaN(metric.rejection_rate)).toBe(false);
      expect(Number.isFinite(metric.rejection_rate)).toBe(true);
    });
  });

  describe('Test 4: Zero rejection (0/10)', () => {
    it('should compute 0% rejection when all queries return results', () => {
      const results = [1, 2, 3, 1, 2, 1, 3, 1, 2, 1];
      const metric = calculateNegativeRejection(results);

      expect(metric.negative_queries).toBe(10);
      expect(metric.correctly_rejected).toBe(0);
      expect(metric.false_positives).toBe(10);
      expect(metric.rejection_rate).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single query — rejected', () => {
      const metric = calculateNegativeRejection([0]);
      expect(metric.rejection_rate).toBe(1);
    });

    it('should handle single query — false positive', () => {
      const metric = calculateNegativeRejection([1]);
      expect(metric.rejection_rate).toBe(0);
    });

    it('should treat any non-zero count as false positive', () => {
      // Even high result counts are still false positives for negative queries
      const metric = calculateNegativeRejection([0, 0, 0, 5, 0]);
      expect(metric.correctly_rejected).toBe(4);
      expect(metric.false_positives).toBe(1);
      expect(metric.rejection_rate).toBeCloseTo(0.8, 3);
    });

    it('should handle large numbers of results (not capped)', () => {
      const metric = calculateNegativeRejection([0, 0, 0, 0, 100]);
      expect(metric.false_positives).toBe(1);
      expect(metric.rejection_rate).toBeCloseTo(0.8, 3);
    });
  });

  describe('Result structure validation', () => {
    it('should have all required fields', () => {
      const metric = calculateNegativeRejection([0, 1, 0]);

      expect(metric).toHaveProperty('negative_queries');
      expect(metric).toHaveProperty('correctly_rejected');
      expect(metric).toHaveProperty('false_positives');
      expect(metric).toHaveProperty('rejection_rate');
    });

    it('should satisfy invariant: correctly_rejected + false_positives = negative_queries', () => {
      const results = [0, 0, 1, 0, 2, 0, 0];
      const metric = calculateNegativeRejection(results);

      expect(metric.correctly_rejected + metric.false_positives).toBe(metric.negative_queries);
    });

    it('should satisfy invariant: rejection_rate = correctly_rejected / negative_queries', () => {
      const results = [0, 0, 0, 1, 0, 2];
      const metric = calculateNegativeRejection(results);

      const expected = metric.negative_queries > 0
        ? metric.correctly_rejected / metric.negative_queries
        : 0;
      expect(metric.rejection_rate).toBe(expected);
    });
  });
});
