/**
 * P0.3.5 — Evaluation Dataset V2 Validation Tests
 *
 * Validates the expanded evaluation dataset against quality criteria.
 * - Query ID uniqueness
 * - Non-empty queries
 * - Valid types
 * - Ground Truth KU references exist
 * - Negative queries have empty ground truth
 * - No duplicate queries
 * - No obvious test language
 */

import { describe, it, expect } from 'vitest';
import evalDataset from '../../docs/p0.3/RETRIEVAL_EVALUATION_DATASET_V2.json';
import { KNOWLEDGE_UNITS } from '../../src/knowledge/knowledge-data';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvaluationQuery {
  query_id: string;
  query: string;
  type: string;
  description: string;
  expected_knowledge_ids: string[];
  accepted_knowledge_ids: string[];
}

interface EvaluationDataset {
  version: string;
  date: string;
  phase: string;
  queries: EvaluationQuery[];
  query_types: Record<string, string>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_TYPES = ['exact', 'paraphrase', 'concept', 'multi', 'negative', 'boundary'];
const TEST_LANGUAGE_PATTERNS = [
  /测试语义检索/,
  /test.*retrieval/i,
  /eval.*query/i,
  /benchmark.*test/,
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.3.5 Evaluation Dataset V2', () => {
  const dataset = evalDataset as unknown as EvaluationDataset;
  const queries = dataset.queries;
  const allKuIds = new Set(KNOWLEDGE_UNITS.map((ku) => ku.knowledge_id));

  describe('Dataset Structure', () => {
    it('should have at least 50 queries', () => {
      expect(queries.length).toBeGreaterThanOrEqual(50);
    });

    it('should have version field', () => {
      expect(dataset.version).toBeDefined();
      expect(typeof dataset.version).toBe('string');
    });

    it('should have phase field set to P0.3.5', () => {
      expect(dataset.phase).toContain('P0.3.5');
    });

    it('should have query_types definition', () => {
      expect(dataset.query_types).toBeDefined();
      expect(Object.keys(dataset.query_types).length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Query ID Validation', () => {
    it('should have unique query IDs', () => {
      const ids = queries.map((q) => q.query_id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have sequential Q001-Q090 IDs', () => {
      for (let i = 0; i < queries.length; i++) {
        const expectedId = `Q${String(i + 1).padStart(3, '0')}`;
        expect(queries[i].query_id).toBe(expectedId);
      }
    });
  });

  describe('Query Content Validation', () => {
    it('should have no empty queries', () => {
      for (const q of queries) {
        expect(q.query.length).toBeGreaterThan(0);
      }
    });

    it('should have no duplicate query text', () => {
      const queryTexts = queries.map((q) => q.query);
      const uniqueTexts = new Set(queryTexts);
      expect(uniqueTexts.size).toBe(queryTexts.length);
    });

    it('should have no obvious test language', () => {
      for (const q of queries) {
        for (const pattern of TEST_LANGUAGE_PATTERNS) {
          expect(q.query).not.toMatch(pattern);
        }
      }
    });
  });

  describe('Query Type Validation', () => {
    it('should only use valid types', () => {
      for (const q of queries) {
        expect(VALID_TYPES).toContain(q.type);
      }
    });

    it('should have at least 5 queries of each type', () => {
      const typeCounts: Record<string, number> = {};
      for (const q of queries) {
        typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
      }

      for (const type of VALID_TYPES) {
        expect(typeCounts[type] || 0).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('Ground Truth KU Reference Validation', () => {
    it('should only reference existing KU IDs', () => {
      for (const q of queries) {
        for (const kuId of q.expected_knowledge_ids) {
          expect(allKuIds.has(kuId)).toBe(true);
        }
        for (const kuId of q.accepted_knowledge_ids) {
          expect(allKuIds.has(kuId)).toBe(true);
        }
      }
    });

    it('should have no self-referencing KU IDs in accepted (duplicates)', () => {
      for (const q of queries) {
        const overlap = q.expected_knowledge_ids.filter((id) =>
          q.accepted_knowledge_ids.includes(id)
        );
        // It's acceptable but not ideal — warn if found
        expect(overlap.length).toBe(0);
      }
    });
  });

  describe('Negative Query Validation', () => {
    it('should have negative queries with empty ground truth', () => {
      const negativeQueries = queries.filter((q) => q.type === 'negative');
      expect(negativeQueries.length).toBeGreaterThan(0);

      for (const q of negativeQueries) {
        expect(q.expected_knowledge_ids.length).toBe(0);
        expect(q.accepted_knowledge_ids.length).toBe(0);
      }
    });

    it('should have queries with expected_knowledge_ids that are NOT negative', () => {
      const positiveQueries = queries.filter((q) => q.type !== 'negative' && q.type !== 'boundary');
      for (const q of positiveQueries) {
        // Multi, exact, paraphrase, concept should have at least expected or accepted
        const hasGroundTruth = q.expected_knowledge_ids.length > 0 || q.accepted_knowledge_ids.length > 0;
        expect(hasGroundTruth).toBe(true);
      }
    });
  });

  describe('Boundary Query Validation', () => {
    it('should have boundary queries with empty or minimal expected', () => {
      const boundaryQueries = queries.filter((q) => q.type === 'boundary');
      expect(boundaryQueries.length).toBeGreaterThan(0);

      for (const q of boundaryQueries) {
        // Boundary should have no strong expected matches (only accepted)
        expect(q.expected_knowledge_ids.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Query Length Distribution', () => {
    it('should have varied query lengths', () => {
      const lengths = queries.map((q) => q.query.length);
      const uniqueLengths = new Set(lengths);
      // Should have at least 5 different lengths
      expect(uniqueLengths.size).toBeGreaterThanOrEqual(5);
    });

    it('should have minimum query length >= 2', () => {
      const minLength = Math.min(...queries.map((q) => q.query.length));
      expect(minLength).toBeGreaterThanOrEqual(2);
    });

    it('should have at least 10% short queries (<=5 chars)', () => {
      const shortQueries = queries.filter((q) => q.query.length <= 5);
      expect(shortQueries.length / queries.length).toBeGreaterThanOrEqual(0.10);
    });

    it('should have at least 15% long queries (>=10 chars)', () => {
      const longQueries = queries.filter((q) => q.query.length >= 10);
      expect(longQueries.length / queries.length).toBeGreaterThanOrEqual(0.15);
    });
  });

  describe('Multi-hit Query Validation', () => {
    it('should have multi queries with at least 2 expected KUs', () => {
      const multiQueries = queries.filter((q) => q.type === 'multi');
      expect(multiQueries.length).toBeGreaterThan(0);

      for (const q of multiQueries) {
        expect(q.expected_knowledge_ids.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
