/**
 * P0.3.1 — Semantic Retriever Tests
 *
 * Tests the full semantic retrieval pipeline:
 *   Provider → Index → Similarity → Ranking → Result
 *
 * Uses MockEmbeddingProvider (deterministic, no network).
 * Validates the complete pipeline works correctly.
 */

import { describe, it, expect } from 'vitest';
import type { CanonicalKnowledgeUnit, ConfidenceLevel } from '../../types';
import { buildSemanticIndex } from '../semantic-index';
import { SemanticRetriever } from '../semantic-retriever';
import { MockEmbeddingProvider } from '../embedding-provider';
import { cosineSimilarity } from '../similarity';
import type { SemanticIndex } from '../types';

// ─── Test Fixtures ─────────────────────────────────────────────────────────

function createMockKU(overrides: Partial<CanonicalKnowledgeUnit> = {}): CanonicalKnowledgeUnit {
  const baseUnit: CanonicalKnowledgeUnit = {
    knowledge_id: 'KU_TEST_001',
    name: 'Test Knowledge Unit',
    category: 'hook',
    knowledge_level: 'structural_pattern',
    description: 'A test knowledge unit',
    confidence: 'medium' as ConfidenceLevel,
    status: 'validated' as const,
    reclassified: false,
    evidence: {
      items: [
        {
          evidence_id: 'EV_TEST_001',
          content_id: 'test_content_1',
          quote: 'Test evidence quote',
          location: 'body',
          validation: 'valid' as const,
          evidence_quality: 'high' as const,
          noise_risk: 'low' as const,
          evidence_trust: 'trusted' as const,
        },
      ],
      unique_content_count: 3,
    },
    ...overrides,
  };
  return baseUnit;
}

// ─── Test KUs ──────────────────────────────────────────────────────────────

const testUnits: CanonicalKnowledgeUnit[] = [
  createMockKU({
    knowledge_id: 'KU_A',
    name: '女性在成长过程中建立自我价值',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '帮助女性建立内在价值感停止向外索取认可',
    status: 'validated',
  }),

  createMockKU({
    knowledge_id: 'KU_B',
    name: '如何提高视频开头的吸引力',
    category: 'hook',
    knowledge_level: 'surface_technique',
    description: '视频开头技巧与钩子设计开头吸引注意力',
    status: 'validated',
  }),

  createMockKU({
    knowledge_id: 'KU_C',
    name: '通过认知反转制造内容张力',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '用认知反转制造情绪张力反直觉观点冲击',
    status: 'validated',
  }),

  createMockKU({
    knowledge_id: 'KU_D',
    name: '争议性观点开场',
    category: 'hook',
    knowledge_level: 'structural_pattern',
    description: '用争议性话题引起注意',
    status: 'candidate',
  }),

  createMockKU({
    knowledge_id: 'KU_E',
    name: '真实自然表达技巧',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '模拟真人说话方式口语化表达',
    status: 'validated',
    human_expression_verdict: 'confirmed',
  }),

  createMockKU({
    knowledge_id: 'KU_F',
    name: 'ASR错误粘连表达',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '句子不完整的错误表达',
    status: 'candidate',
    human_expression_verdict: 'suspect',
  }),
];

// ─── Helper: Build Retriever ───────────────────────────────────────────────

async function buildRetriever(
  includeCandidates = false
): Promise<{
  retriever: SemanticRetriever;
  index: SemanticIndex;
  provider: MockEmbeddingProvider;
}> {
  const provider = new MockEmbeddingProvider(64);
  const index = await buildSemanticIndex(testUnits, provider, {
    include_candidates: includeCandidates,
  });
  const retriever = new SemanticRetriever(index, provider, testUnits);
  return { retriever, index, provider };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SemanticRetriever', () => {
  describe('Basic Retrieval', () => {
    it('should retrieve results for a query', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({ query: '女性成长自我价值' });

      expect(response.query).toBe('女性成长自我价值');
      expect(response.retrieval_method).toBe('semantic');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.total).toBe(response.results.length);
    });

    it('should return results sorted by similarity descending', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({ query: '开头技巧钩子' });

      if (response.results.length >= 2) {
        for (let i = 0; i < response.results.length - 1; i++) {
          expect(response.results[i].similarity).toBeGreaterThanOrEqual(
            response.results[i + 1].similarity
          );
        }
      }
    });

    it('should respect the limit parameter', async () => {
      const { retriever } = await buildRetriever(true);
      const response = await retriever.retrieve({
        query: '测试查询',
        limit: 3,
      });

      expect(response.results.length).toBeLessThanOrEqual(3);
    });

    it('should never return suspect KU_F even with candidates', async () => {
      const { retriever } = await buildRetriever(true);
      const response = await retriever.retrieve({
        query: '表达技巧',
        include_candidates: true,
        limit: 10,
      });

      const hasSuspect = response.results.some(
        (r) => r.knowledge_id === 'KU_F'
      );
      expect(hasSuspect).toBe(false);
    });
  });

  describe('Query-Specific Behavior', () => {
    it('should return non-empty results for any query (mock produces similar vectors)', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({ query: '女人如何找到自己的价值' });

      // With mock provider, all vectors have similar cosine similarity (random distribution)
      // The pipeline should return results sorted by similarity
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.total).toBeGreaterThan(0);

      // Results should be valid
      for (const result of response.results) {
        expect(result.knowledge_id).toBeDefined();
        expect(result.similarity).toBeDefined();
        expect(Number.isNaN(result.similarity)).toBe(false);
      }
    });

    it('should include similarity scores in results', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({ query: '认知反转' });

      for (const result of response.results) {
        expect(result.similarity).toBeDefined();
        expect(typeof result.similarity).toBe('number');
        expect(result.similarity).toBeGreaterThanOrEqual(-1);
        expect(result.similarity).toBeLessThanOrEqual(1);
        expect(Number.isNaN(result.similarity)).toBe(false);
      }
    });

    it('should include full knowledge object in results', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({ query: '自我价值' });

      if (response.results.length > 0) {
        const first = response.results[0];
        expect(first.knowledge).toBeDefined();
        expect(first.knowledge.knowledge_id).toBeDefined();
        expect(first.knowledge.name).toBeDefined();
        expect(first.knowledge.description).toBeDefined();
      }
    });

    it('should include retrieval_method and retrieval_reason', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({ query: '测试' });

      if (response.results.length > 0) {
        const first = response.results[0];
        expect(first.retrieval_method).toBe('semantic');
        expect(first.retrieval_reason).toBeDefined();
        expect(first.retrieval_reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Filtering', () => {
    it('should apply category filter', async () => {
      const { retriever } = await buildRetriever(true);
      const response = await retriever.retrieve({
        query: '测试',
        category: ['cognition'],
      });

      for (const result of response.results) {
        expect(result.knowledge.category).toBe('cognition');
      }
    });

    it('should apply knowledge_level filter', async () => {
      const { retriever } = await buildRetriever(true);
      const response = await retriever.retrieve({
        query: '测试',
        knowledge_level: ['strategic_pattern'],
      });

      for (const result of response.results) {
        expect(result.knowledge.knowledge_level).toBe('strategic_pattern');
      }
    });

    it('should apply min_similarity threshold', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({
        query: '测试',
        min_similarity: 0.5,
      });

      for (const result of response.results) {
        expect(result.similarity).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe('Determinism', () => {
    it('should produce deterministic results for same query', async () => {
      const { retriever } = await buildRetriever();

      const response1 = await retriever.retrieve({ query: '女性成长' });
      const response2 = await retriever.retrieve({ query: '女性成长' });

      expect(response1.results.length).toBe(response2.results.length);

      for (let i = 0; i < response1.results.length; i++) {
        expect(response1.results[i].knowledge_id).toBe(
          response2.results[i].knowledge_id
        );
        expect(response1.results[i].similarity).toBeCloseTo(
          response2.results[i].similarity,
          10
        );
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query gracefully', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({ query: '' });

      // Empty query produces a vector (deterministic), so it may return results
      // This is acceptable behavior - the system returns the most similar
      expect(response.retrieval_method).toBe('semantic');
    });

    it('should return empty when no entries match filters', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({
        query: '测试',
        category: ['ending'], // No ending KUs in test data
      });

      expect(response.results.length).toBe(0);
      expect(response.total).toBe(0);
    });

    it('should handle min_similarity = 1.0 (exact match only)', async () => {
      const { retriever } = await buildRetriever();
      const response = await retriever.retrieve({
        query: '女性成长自我价值',
        min_similarity: 1.0,
      });

      // Only exact matches (impossible with mock) should appear
      expect(response.results.every((r) => r.similarity === 1.0)).toBe(true);
    });
  });
});

describe('Pipeline Integration', () => {
  it('should work end-to-end with provider → index → retriever', async () => {
    const provider = new MockEmbeddingProvider(32);

    // 1. Build index
    const index = await buildSemanticIndex(testUnits, provider);
    expect(index.entries.length).toBeGreaterThan(0);

    // 2. Create retriever
    const retriever = new SemanticRetriever(index, provider, testUnits);

    // 3. Query
    const response = await retriever.retrieve({
      query: '认知反转',
      limit: 3,
    });

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.length).toBeLessThanOrEqual(3);

    // 4. Verify result structure
    for (const result of response.results) {
      expect(result.knowledge_id).toBeDefined();
      expect(result.similarity).toBeGreaterThanOrEqual(-1);
      expect(result.similarity).toBeLessThanOrEqual(1);
      expect(result.retrieval_method).toBe('semantic');
      expect(result.retrieval_reason).toBeDefined();
    }
  });

  it('should include both cognition KUs in filtered results', async () => {
    const provider = new MockEmbeddingProvider(64);
    const index = await buildSemanticIndex(testUnits, provider);
    const retriever = new SemanticRetriever(index, provider, testUnits);

    // Both KU_A and KU_C are cognition category
    // Note: min_similarity=-1.0 is used because mock vectors are random (can be negative)
    // Real embeddings would have meaningful similarities and default 0.0 threshold works fine
    const response = await retriever.retrieve({
      query: '认知理解思维',
      category: ['cognition'],
      limit: 10,
      min_similarity: -1.0,
    });

    // Both cognition KUs should be in results (with mock, ordering may vary due to random similarity)
    const resultIds = response.results.map((r) => r.knowledge_id);
    expect(resultIds).toContain('KU_A');
    expect(resultIds).toContain('KU_C');

    // All results should be cognition category
    for (const result of response.results) {
      expect(result.knowledge.category).toBe('cognition');
    }
  });
});

describe('cosineSimilarity integration', () => {
  it('should produce valid similarity with mock embeddings', async () => {
    const provider = new MockEmbeddingProvider(32);

    const vec1 = await provider.embed('女性在成长过程中建立自我价值');
    const vec2 = await provider.embed('女人如何找到自己的价值');
    const vec3 = await provider.embed('视频开头技巧');

    // Same-ish queries should have some relationship (not NaN)
    const sim12 = cosineSimilarity(vec1, vec2);
    const sim13 = cosineSimilarity(vec1, vec3);

    expect(Number.isNaN(sim12)).toBe(false);
    expect(Number.isNaN(sim13)).toBe(false);
    expect(Number.isFinite(sim12)).toBe(true);
    expect(Number.isFinite(sim13)).toBe(true);

    // All similarities should be in valid range
    expect(sim12).toBeGreaterThanOrEqual(-1);
    expect(sim12).toBeLessThanOrEqual(1);
    expect(sim13).toBeGreaterThanOrEqual(-1);
    expect(sim13).toBeLessThanOrEqual(1);
  });
});