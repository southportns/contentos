/**
 * P0.3.1 — Similarity Tests
 *
 * Tests for cosine similarity and related vector operations.
 * Coverage:
 * - Same vector → 1
 * - Orthogonal vector → 0
 * - Opposite vector → -1
 * - Zero vector → safe result (0)
 * - Empty vector → safe result (0)
 * - Dimension mismatch → throw error
 */
import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  normalizedCosineSimilarity,
  findMostSimilar,
  rankBySimilarity,
} from '../similarity';

describe('cosineSimilarity', () => {
  // ─── Core Cases ──────────────────────────────────────────────────────

  it('should return 1.0 for identical vectors', () => {
    const a = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 10);
  });

  it('should return 1.0 for same-direction different-magnitude vectors', () => {
    const a = [1, 0, 0];
    const b = [10, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
  });

  it('should return -1.0 for opposite-direction vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10);
  });

  it('should return 0.0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
  });

  it('should return correct value for 45-degree angle', () => {
    const a = [1, 0];
    const b = [1, 1];
    // cos(45°) = sqrt(2)/2 ≈ 0.7071
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.7071, 4);
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────

  it('should return 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('should return 0 for one empty vector', () => {
    expect(cosineSimilarity([1, 2, 3], [])).toBe(0);
    expect(cosineSimilarity([], [1, 2, 3])).toBe(0);
  });

  it('should return 0 for all-zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('should return 0 when one vector is all zeros', () => {
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('should throw error for different dimension vectors', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/i);
    expect(() => cosineSimilarity([1, 2, 3, 4], [1, 2])).toThrow(/dimension mismatch/i);
  });

  it('should handle null/undefined input gracefully', () => {
    expect(cosineSimilarity(null as unknown as number[], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], null as unknown as number[])).toBe(0);
  });

  // ─── Property Tests ─────────────────────────────────────────────────

  it('should be symmetric: sim(a,b) = sim(b,a)', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it('should return value in [-1, 1] range for any input', () => {
    const testCases = [
      { a: [1, 0, 0], b: [0, 1, 0] },
      { a: [1, 2, 3], b: [-3, -2, -1] },
      { a: [0.5, 0.5], b: [-0.5, 0.5] },
    ];
    for (const { a, b } of testCases) {
      const sim = cosineSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    }
  });

  it('should never produce NaN', () => {
    const result = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(Number.isNaN(result)).toBe(false);
  });

  it('should never produce Infinity', () => {
    const result = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('normalizedCosineSimilarity', () => {
  it('should map [-1, 1] to [0, 1]', () => {
    expect(normalizedCosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0, 10);
    expect(normalizedCosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(0.0, 10);
    expect(normalizedCosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.5, 10);
  });
});

describe('findMostSimilar', () => {
  it('should find the most similar candidate', () => {
    const query = [1, 0, 0];
    const candidates = [
      { id: 'A', vector: [0, 1, 0] }, // orthogonal → 0
      { id: 'B', vector: [1, 0, 0] }, // identical → 1
      { id: 'C', vector: [-1, 0, 0] }, // opposite → -1
    ];
    const result = findMostSimilar(query, candidates);
    expect(result.id).toBe('B');
    expect(result.similarity).toBeCloseTo(1.0, 10);
  });

  it('should throw for empty candidates', () => {
    expect(() => findMostSimilar([1, 2], [])).toThrow(/empty/i);
  });
});

describe('rankBySimilarity', () => {
  it('should rank candidates by similarity descending', () => {
    const query = [1, 0, 0];
    const candidates = [
      { id: 'C', vector: [-1, 0, 0] },
      { id: 'A', vector: [0, 1, 0] },
      { id: 'B', vector: [1, 0, 0] },
    ];
    const result = rankBySimilarity(query, candidates);
    expect(result[0].id).toBe('B');
    expect(result[1].id).toBe('A');
    expect(result[2].id).toBe('C');
  });

  it('should handle single candidate', () => {
    const result = rankBySimilarity([1, 0], [{ id: 'only', vector: [1, 0] }]);
    expect(result.length).toBe(1);
    expect(result[0].similarity).toBeCloseTo(1.0, 10);
  });
});