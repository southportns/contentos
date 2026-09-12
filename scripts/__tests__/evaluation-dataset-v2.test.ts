/**
 * P0.3.5 — Evaluation Dataset V2 Validation Tests
 */
import { describe, it, expect } from 'vitest';
import evalDataset from '../../docs/p0.3/RETRIEVAL_EVALUATION_DATASET_V2.json';
import { KNOWLEDGE_UNITS } from '../../src/knowledge/knowledge-data';

describe('P0.3.5 Evaluation Dataset V2', () => {
  const dataset = evalDataset as any;
  const queries = dataset.queries;

  it('should have at least 50 queries', () => {
    expect(queries.length).toBeGreaterThanOrEqual(50);
  });

  it('should have unique query IDs', () => {
    const ids = queries.map((q: any) => q.query_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have no empty queries', () => {
    for (const q of queries) {
      expect(q.query.length).toBeGreaterThan(0);
    }
  });

  it('should only reference existing KU IDs', () => {
    const allKuIds = new Set(KNOWLEDGE_UNITS.map((ku) => ku.knowledge_id));
    for (const q of queries) {
      for (const kuId of q.expected_knowledge_ids) {
        expect(allKuIds.has(kuId)).toBe(true);
      }
    }
  });

  it('should have negative queries with empty ground truth', () => {
    const negativeQueries = queries.filter((q: any) => q.type === 'negative');
    for (const q of negativeQueries) {
      expect(q.expected_knowledge_ids.length).toBe(0);
      expect(q.accepted_knowledge_ids.length).toBe(0);
    }
  });
});
