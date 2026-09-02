/**
 * P0.2.3-FIX-2 — Precision@5 Unit Tests
 *
 * Tests that verify Precision@K is computed correctly:
 *   Precision@K = relevant results in Top K / K
 *
 * Critical: When retrieved.length < K, the denominator is still K.
 */

import { describe, it, expect } from 'vitest';

// ─── Inline copy of production logic for testing ────────────────────────────

function computePrecisionAtK(
  retrieved: string[],
  relevant: string[],
  k: number
): number {
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((id) => relevant.includes(id)).length;
  return hits / k;
}

function computeRecall(retrieved: string[], relevant: string[]): number {
  if (relevant.length === 0) return 1.0;
  const hits = retrieved.filter((id) => relevant.includes(id)).length;
  return hits / relevant.length;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Precision@K Calculation', () => {
  describe('Core Precision@5 Formula', () => {
    it('Case 1: 1 retrieved, 1 relevant, k=5 → Precision@5 = 0.20', () => {
      const retrieved = ['A'];
      const relevant = ['A'];
      const k = 5;

      const result = computePrecisionAtK(retrieved, relevant, k);
      expect(result).toBe(0.20);
    });

    it('Case 2: 3 retrieved, 2 relevant, k=5 → Precision@5 = 0.40', () => {
      const retrieved = ['A', 'B', 'C'];
      const relevant = ['A', 'C'];
      const k = 5;

      const result = computePrecisionAtK(retrieved, relevant, k);
      expect(result).toBe(0.40);
    });

    it('Case 3: 0 retrieved, 1 relevant, k=5 → Precision@5 = 0', () => {
      const retrieved: string[] = [];
      const relevant = ['A'];
      const k = 5;

      const result = computePrecisionAtK(retrieved, relevant, k);
      expect(result).toBe(0);
    });

    it('Case 4: 5 retrieved, 2 relevant, k=5 → Precision@5 = 0.40', () => {
      const retrieved = ['A', 'B', 'C', 'D', 'E'];
      const relevant = ['A', 'C'];
      const k = 5;

      const result = computePrecisionAtK(retrieved, relevant, k);
      expect(result).toBe(0.40);
    });
  });

  describe('Edge Cases', () => {
    it('should return 0 when retrieved is empty and k > 0', () => {
      expect(computePrecisionAtK([], ['A', 'B'], 5)).toBe(0);
    });

    it('should return 0 when no retrieved items match relevant', () => {
      expect(computePrecisionAtK(['X', 'Y'], ['A', 'B'], 5)).toBe(0);
    });

    it('should return 1.0 when all top K positions are relevant', () => {
      expect(
        computePrecisionAtK(['A', 'B', 'C', 'D', 'E'], ['A', 'B', 'C', 'D', 'E'], 5)
      ).toBe(1.0);
    });

    it('should handle retrieved.length > k correctly (only top k considered)', () => {
      // 10 retrieved, 3 relevant in top 5
      const retrieved = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const relevant = ['A', 'C', 'E', 'G']; // A, C, E in top 5 = 3 hits
      expect(computePrecisionAtK(retrieved, relevant, 5)).toBe(0.60);
    });

    it('should handle different K values correctly', () => {
      const retrieved = ['A', 'B', 'C'];
      const relevant = ['A', 'B', 'C'];

      expect(computePrecisionAtK(retrieved, relevant, 1)).toBe(1.0);
      expect(computePrecisionAtK(retrieved, relevant, 3)).toBe(1.0);
      expect(computePrecisionAtK(retrieved, relevant, 5)).toBe(0.60);
    });
  });

  describe('Q001 Specific Scenario', () => {
    it('Q001: retrieved=[KU_010], expected=[KU_014], accepted=[KU_010,...]', () => {
      const retrieved = ['KU_010'];
      const expected = ['KU_014'];
      const accepted = ['KU_010', 'KU_011', 'KU_018', 'KU_020', 'KU_016'];
      const k = 5;

      // Strict: KU_010 not in expected → 0/5 = 0
      const strictPrecision = computePrecisionAtK(retrieved, expected, k);
      expect(strictPrecision).toBe(0);

      // Strict recall: 0/1 = 0
      const strictRecall = computeRecall(retrieved, expected);
      expect(strictRecall).toBe(0);

      // Relaxed: KU_010 in expected+accepted → 1/5 = 0.20
      const relaxedRelevant = [...expected, ...accepted];
      const relaxedPrecision = computePrecisionAtK(retrieved, relaxedRelevant, k);
      expect(relaxedPrecision).toBe(0.20);

      // Relaxed recall: 1/6 = 0.1667
      const relaxedRecall = computeRecall(retrieved, relaxedRelevant);
      expect(relaxedRecall).toBeCloseTo(0.1666666667, 5);
    });
  });
});
