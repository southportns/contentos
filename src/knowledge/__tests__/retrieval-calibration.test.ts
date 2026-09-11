/**
 * P0.3.3 — Retrieval Calibration Unit Tests
 *
 * Tests the metrics computation and comparison logic for
 * Keyword vs Semantic retrieval calibration.
 *
 * Uses Mock Embedding Provider — NO real API calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { knowledgeStore } from '../knowledge-store';
import { KNOWLEDGE_UNITS } from '../knowledge-data';
import { RealSemanticSearch } from '../semantic/real-semantic-search';
import { EmbeddingProvider } from '../semantic/types';
import evalDataset from '../../../docs/p0.2.3/RETRIEVAL_EVALUATION_DATASET.json';

// ─── Mock Embedding Provider ────────────────────────────────────────────────

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'mock-provider';
  readonly dimensions = 1024;
  embedCallCount = 0;

  async embed(text: string): Promise<number[]> {
    this.embedCallCount++;
    // Return a deterministic pseudo-random vector based on text
    const vector: number[] = [];
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed += text.charCodeAt(i);
    }
    for (let i = 0; i < this.dimensions; i++) {
      // Simple deterministic hash
      const val = Math.sin(seed + i) * 0.5 + 0.5;
      vector.push(Math.round(val * 1000) / 1000);
    }
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvaluationQuery {
  query_id: string;
  query: string;
  description: string;
  expected_knowledge_ids: string[];
  accepted_knowledge_ids: string[];
}

// QueryComparison interface - used for type reference
// interface QueryComparison { ... }

// ─── Metrics Helpers ────────────────────────────────────────────────────────

const _K = 5; // Used in some tests

function computePrecisionAtK(retrieved: string[], relevant: string[], k: number): number {
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((id) => relevant.includes(id)).length;
  return hits / k;  // Denominator is always k
}

function computeRecall(retrieved: string[], relevant: string[]): number {
  if (relevant.length === 0) return 1.0;
  const hits = retrieved.filter((id) => relevant.includes(id)).length;
  return hits / relevant.length;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.3.3 Retrieval Calibration Metrics', () => {
  const dataset = evalDataset as unknown as {
    queries: EvaluationQuery[];
  };
  const queries = dataset.queries;

  describe('Precision@5 Formula', () => {
    it('should use fixed denominator of 5 even with fewer results', () => {
      const retrieved = ['KU_001', 'KU_002']; // Only 2 results
      const relevant = ['KU_001', 'KU_002', 'KU_003'];

      const precision = computePrecisionAtK(retrieved, relevant, 5);
      // 2 hits / 5 = 0.4, NOT 2/2 = 1.0
      expect(precision).toBeCloseTo(0.4, 5);
    });

    it('should use fixed denominator of 5 with empty results', () => {
      const retrieved: string[] = [];
      const relevant = ['KU_001', 'KU_002'];

      const precision = computePrecisionAtK(retrieved, relevant, 5);
      // 0 hits / 5 = 0.0
      expect(precision).toBe(0);
    });

    it('should calculate correctly when all 5 are hits', () => {
      const retrieved = ['KU_001', 'KU_002', 'KU_003', 'KU_004', 'KU_005'];
      const relevant = ['KU_001', 'KU_002', 'KU_003', 'KU_004', 'KU_005', 'KU_006'];

      const precision = computePrecisionAtK(retrieved, relevant, 5);
      // 5 hits / 5 = 1.0
      expect(precision).toBe(1.0);
    });

    it('should calculate correctly with partial hits', () => {
      const retrieved = ['KU_001', 'KU_002', 'KU_003', 'KU_004', 'KU_005'];
      const relevant = ['KU_001', 'KU_003', 'KU_005'];

      const precision = computePrecisionAtK(retrieved, relevant, 5);
      // 3 hits / 5 = 0.6
      expect(precision).toBeCloseTo(0.6, 5);
    });
  });

  describe('Recall@5 Formula', () => {
    it('should calculate correctly with partial coverage', () => {
      const retrieved = ['KU_001', 'KU_002', 'KU_003'];
      const relevant = ['KU_001', 'KU_002', 'KU_003', 'KU_004', 'KU_005'];

      const recall = computeRecall(retrieved, relevant);
      // 3 hits / 5 relevant = 0.6
      expect(recall).toBeCloseTo(0.6, 5);
    });

    it('should return 1.0 when no relevant items exist', () => {
      const retrieved = ['KU_001', 'KU_002'];
      const relevant: string[] = [];

      const recall = computeRecall(retrieved, relevant);
      expect(recall).toBe(1.0);
    });

    it('should return 0 when no relevant items found', () => {
      const retrieved = ['KU_001', 'KU_002'];
      const relevant = ['KU_003', 'KU_004'];

      const recall = computeRecall(retrieved, relevant);
      expect(recall).toBe(0);
    });
  });

  describe('Strict vs Relaxed Metrics', () => {
    it('should only count expected items as strict hits', () => {
      const retrieved = ['KU_010', 'KU_011', 'KU_018'];
      const expected = ['KU_014'];
      const accepted = ['KU_010', 'KU_011', 'KU_018', 'KU_020', 'KU_016'];

      const strictHits = retrieved.filter((id) => expected.includes(id));
      const relaxedHits = retrieved.filter((id) => [...expected, ...accepted].includes(id));

      expect(strictHits.length).toBe(0); // No expected items
      expect(relaxedHits.length).toBe(3); // All 3 are accepted
    });

    it('should count both expected and accepted as relaxed hits', () => {
      const retrieved = ['KU_014', 'KU_010', 'KU_011'];
      const expected = ['KU_014'];
      const accepted = ['KU_010', 'KU_011'];

      const relaxedRelevant = [...expected, ...accepted];
      const relaxedHits = retrieved.filter((id) => relaxedRelevant.includes(id));

      expect(relaxedHits.length).toBe(3);
    });
  });

  describe('HitRate Calculation', () => {
    it('should be 1 when at least one strict hit exists', () => {
      const hasHit = true;
      const hitRate = hasHit ? 1.0 : 0.0;
      expect(hitRate).toBe(1.0);
    });

    it('should be 0 when no strict hits', () => {
      const hasHit = false;
      const hitRate = hasHit ? 1.0 : 0.0;
      expect(hitRate).toBe(0.0);
    });
  });

  describe('Irrelevant Query Detection', () => {
    it('should identify Q010 as irrelevant query', () => {
      const q010 = queries.find((q) => q.query_id === 'Q010');
      expect(q010).toBeDefined();
      expect(q010!.expected_knowledge_ids.length).toBe(0);
      expect(q010!.accepted_knowledge_ids.length).toBe(0);
    });

    it('should identify relevant queries correctly', () => {
      const relevantQueries = queries.filter(
        (q) => !(q.expected_knowledge_ids.length === 0 && q.accepted_knowledge_ids.length === 0)
      );
      expect(relevantQueries.length).toBe(9); // Q001-Q009
    });
  });

  describe('Winner Determination Logic', () => {
    it('should mark semantic as winner when semantic strict hits but keyword does not', () => {
      const keywordStrictHit = false;
      const semanticStrictHit = true;
      const keywordRelaxedHit = false;
      const semanticRelaxedHit = true;

      let winner: 'keyword' | 'semantic' | 'tie' | 'both_fail' = 'both_fail';

      if (semanticStrictHit && !keywordStrictHit) {
        winner = 'semantic';
      } else if (keywordStrictHit && !semanticStrictHit) {
        winner = 'keyword';
      } else if (semanticStrictHit && keywordStrictHit) {
        winner = 'tie';
      } else if (semanticRelaxedHit && !keywordRelaxedHit) {
        winner = 'semantic';
      } else if (keywordRelaxedHit && !semanticRelaxedHit) {
        winner = 'keyword';
      } else if (semanticRelaxedHit && keywordRelaxedHit) {
        winner = 'tie';
      }

      expect(winner).toBe('semantic');
    });

    it('should mark keyword as winner when keyword strict hits but semantic does not', () => {
      const keywordStrictHit = true;
      const semanticStrictHit = false;
      const keywordRelaxedHit = true;
      const semanticRelaxedHit = false;

      let winner: 'keyword' | 'semantic' | 'tie' | 'both_fail' = 'both_fail';

      if (semanticStrictHit && !keywordStrictHit) {
        winner = 'semantic';
      } else if (keywordStrictHit && !semanticStrictHit) {
        winner = 'keyword';
      } else if (semanticStrictHit && keywordStrictHit) {
        winner = 'tie';
      } else if (semanticRelaxedHit && !keywordRelaxedHit) {
        winner = 'semantic';
      } else if (keywordRelaxedHit && !semanticRelaxedHit) {
        winner = 'keyword';
      } else if (semanticRelaxedHit && keywordRelaxedHit) {
        winner = 'tie';
      }

      expect(winner).toBe('keyword');
    });

    it('should mark tie when both have strict hits', () => {
      const keywordStrictHit = true;
      const semanticStrictHit = true;

      let winner: 'keyword' | 'semantic' | 'tie' | 'both_fail' = 'both_fail';

      if (semanticStrictHit && !keywordStrictHit) {
        winner = 'semantic';
      } else if (keywordStrictHit && !semanticStrictHit) {
        winner = 'keyword';
      } else if (semanticStrictHit && keywordStrictHit) {
        winner = 'tie';
      }

      expect(winner).toBe('tie');
    });

    it('should mark both_fail when neither has any hits', () => {
      const keywordStrictHit = false;
      const semanticStrictHit = false;
      const keywordRelaxedHit = false;
      const semanticRelaxedHit = false;

      let winner: 'keyword' | 'semantic' | 'tie' | 'both_fail' = 'both_fail';

      if (semanticStrictHit && !keywordStrictHit) {
        winner = 'semantic';
      } else if (keywordStrictHit && !semanticStrictHit) {
        winner = 'keyword';
      } else if (semanticStrictHit && keywordStrictHit) {
        winner = 'tie';
      } else if (semanticRelaxedHit && !keywordRelaxedHit) {
        winner = 'semantic';
      } else if (keywordRelaxedHit && !semanticRelaxedHit) {
        winner = 'keyword';
      } else if (semanticRelaxedHit && keywordRelaxedHit) {
        winner = 'tie';
      }

      expect(winner).toBe('both_fail');
    });
  });

  describe('Threshold Calibration Logic', () => {
    it('should filter results by min_similarity', () => {
      const results = [
        { id: 'KU_001', similarity: 0.65 },
        { id: 'KU_002', similarity: 0.55 },
        { id: 'KU_003', similarity: 0.45 },
        { id: 'KU_004', similarity: 0.35 },
        { id: 'KU_005', similarity: 0.25 },
      ];

      const threshold05 = results.filter((r) => r.similarity >= 0.5);
      const threshold06 = results.filter((r) => r.similarity >= 0.6);
      const threshold07 = results.filter((r) => r.similarity >= 0.7);

      expect(threshold05.length).toBe(2); // 0.65, 0.55
      expect(threshold06.length).toBe(1); // 0.65
      expect(threshold07.length).toBe(0); // none
    });

    it('should calculate empty result rate correctly', () => {
      const queriesWithResults = [
        { results: ['KU_001', 'KU_002'] },
        { results: [] },
        { results: ['KU_003'] },
        { results: [] },
        { results: [] },
      ];

      const emptyCount = queriesWithResults.filter((q) => q.results.length === 0).length;
      const emptyRate = emptyCount / queriesWithResults.length;

      expect(emptyRate).toBeCloseTo(0.6, 5);
    });
  });

  describe('Top-K Calibration Logic', () => {
    it('should slice results correctly for different K values', () => {
      const results = ['KU_001', 'KU_002', 'KU_003', 'KU_004', 'KU_005', 'KU_006', 'KU_007', 'KU_008', 'KU_009', 'KU_010'];

      expect(results.slice(0, 3).length).toBe(3);
      expect(results.slice(0, 5).length).toBe(5);
      expect(results.slice(0, 8).length).toBe(8);
      expect(results.slice(0, 10).length).toBe(10);
    });

    it('should calculate precision at different K values', () => {
      const retrieved = ['KU_001', 'KU_002', 'KU_003', 'KU_004', 'KU_005', 'KU_006', 'KU_007', 'KU_008'];
      const relevant = ['KU_001', 'KU_003', 'KU_005'];

      const pAt3 = computePrecisionAtK(retrieved, relevant, 3); // 2/3
      const pAt5 = computePrecisionAtK(retrieved, relevant, 5); // 3/5
      const pAt8 = computePrecisionAtK(retrieved, relevant, 8); // 3/8

      expect(pAt3).toBeCloseTo(2 / 3, 5);
      expect(pAt5).toBeCloseTo(3 / 5, 5);
      expect(pAt8).toBeCloseTo(3 / 8, 5);
    });
  });

  describe('Query Length Analysis', () => {
    it('should categorize queries by length correctly', () => {
    const testQueries = [
      { query: '爱自己', expected: '3字' },
      { query: '被爱', expected: '2字' },
      { query: '女性成长', expected: '4字' },
      { query: '职场边界', expected: '4字' },
      { query: '开头技巧', expected: '4字' },
      { query: '认知反转', expected: '4字' },
      { query: '结尾行动', expected: '4字' },
      { query: '自我价值', expected: '4字' },
      { query: '真实自然表达', expected: '5字+' },
      { query: '量子物理芯片技术', expected: '5字+' },
    ];

      for (const tq of testQueries) {
        const len = tq.query.length;
        let group: string;
        if (len === 2) group = '2字';
        else if (len === 3) group = '3字';
        else if (len === 4) group = '4字';
        else group = '5字+';

        expect(group).toBe(tq.expected);
      }
    });
  });
});

describe('P0.3.3 Keyword Retrieval Baseline', () => {
  it('should return results for known keyword matches', () => {
    const response = knowledgeStore.search({
      topic: '认知反转',
      limit: 5,
    });

    const retrieved = response.results.map((r) => r.knowledge_id);
    expect(retrieved.length).toBeGreaterThan(0);
    expect(retrieved).toContain('KU_014');
  });

  it('should return empty for completely unrelated queries', () => {
    const response = knowledgeStore.search({
      topic: '量子物理芯片技术',
      limit: 5,
    });

    expect(response.results.length).toBe(0);
  });

  it('should handle short Chinese queries', () => {
    const response = knowledgeStore.search({
      topic: '爱自己',
      limit: 5,
    });

    // Keyword retrieval may return results for short queries
    const retrieved = response.results.map((r) => r.knowledge_id);
    // We just verify it doesn't crash
    expect(retrieved).toBeDefined();
  });
});

describe('P0.3.3 Semantic Retrieval with Mock Provider', () => {
  let search: RealSemanticSearch;
  let mockProvider: MockEmbeddingProvider;

  beforeEach(async () => {
    mockProvider = new MockEmbeddingProvider();
    search = new RealSemanticSearch({
      provider: mockProvider,
      knowledgeUnits: KNOWLEDGE_UNITS,
    });
  });

  it('should initialize with mock provider', async () => {
    // Mock provider can use either persistence or cloud-sync depending on state
    const initResult = await search.initialize();
    // Should be one of the valid sources
    expect(['persistence', 'cloud-sync', 'empty']).toContain(initResult.source);
  });

  it('should call embed() exactly once per search', async () => {
    await search.initialize();

    const embedCallsBefore = mockProvider.embedCallCount;
    await search.search({ query: '测试查询', limit: 5 });
    const embedCallsAfter = mockProvider.embedCallCount;

    expect(embedCallsAfter - embedCallsBefore).toBe(1);
  });

  it('should return results sorted by similarity', async () => {
    await search.initialize();

    const response = await search.search({
      query: '测试查询',
      limit: 5,
    });

    // Verify results are sorted by similarity descending
    for (let i = 1; i < response.results.length; i++) {
      expect(response.results[i - 1].similarity).toBeGreaterThanOrEqual(
        response.results[i].similarity
      );
    }
  });

  it('should respect min_similarity filter', async () => {
    await search.initialize();

    const response = await search.search({
      query: '测试查询',
      limit: 5,
      min_similarity: 0.9, // Very high threshold
    });

    // With high threshold, should return fewer or no results
    for (const result of response.results) {
      expect(result.similarity).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('should respect limit parameter', async () => {
    await search.initialize();

    const response = await search.search({
      query: '测试查询',
      limit: 3,
    });

    expect(response.results.length).toBeLessThanOrEqual(3);
  });
});

describe('P0.3.3 Evaluation Dataset Integrity', () => {
  it('should have exactly 10 queries', () => {
    const dataset = evalDataset as unknown as { queries: EvaluationQuery[] };
    expect(dataset.queries.length).toBe(10);
  });

  it('should have Q001-Q010 in order', () => {
    const dataset = evalDataset as unknown as { queries: EvaluationQuery[] };
    for (let i = 0; i < 10; i++) {
      expect(dataset.queries[i].query_id).toBe(`Q${String(i + 1).padStart(3, '0')}`);
    }
  });

  it('should have Q010 as irrelevant query', () => {
    const dataset = evalDataset as unknown as { queries: EvaluationQuery[] };
    const q010 = dataset.queries.find((q) => q.query_id === 'Q010');
    expect(q010).toBeDefined();
    expect(q010!.expected_knowledge_ids.length).toBe(0);
    expect(q010!.accepted_knowledge_ids.length).toBe(0);
  });

  it('should have expected_knowledge_ids or accepted_knowledge_ids for relevant queries', () => {
    const dataset = evalDataset as unknown as { queries: EvaluationQuery[] };
    const relevantQueries = dataset.queries.filter(
      (q) => q.query_id !== 'Q010'
    );

    for (const q of relevantQueries) {
      // Relevant queries should have either expected or accepted items
      const hasItems = q.expected_knowledge_ids.length > 0 || q.accepted_knowledge_ids.length > 0;
      expect(hasItems).toBe(true);
    }
  });

  it('should have unique query_ids', () => {
    const dataset = evalDataset as unknown as { queries: EvaluationQuery[] };
    const ids = dataset.queries.map((q) => q.query_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
