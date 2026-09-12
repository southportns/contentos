/**
 * P0.3.2-3 — Real Semantic Search Unit Tests
 *
 * Tests the RealSemanticSearch orchestration with MockEmbeddingProvider.
 * Critical validation: Knowledge vectors come from persistence,
 * query vector is embedded exactly once per search.
 *
 * These tests use MockEmbeddingProvider (no real API calls).
 */

import { describe, it, expect } from 'vitest';
import type { CanonicalKnowledgeUnit, ConfidenceLevel } from '../../types';
import { MockEmbeddingProvider } from '../embedding-provider';
import { RealSemanticSearch } from '../real-semantic-search';
import { MemoryEmbeddingStore } from '../persistence/embedding-store';

// ─── Call-Counting Mock Provider ─────────────────────────────────────────

/**
 * Extended mock provider that tracks embed() call count.
 * This is the critical test infrastructure for P0.3.2-3:
 * we must verify embed() is called exactly ONCE per search.
 */
class CountingMockProvider extends MockEmbeddingProvider {
  embedCallCount = 0;
  embedBatchCallCount = 0;

  async embed(text: string): Promise<number[]> {
    this.embedCallCount++;
    return super.embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.embedBatchCallCount++;
    return super.embedBatch(texts);
  }

  reset(): void {
    this.embedCallCount = 0;
    this.embedBatchCallCount = 0;
  }
}

// ─── Test Fixtures ────────────────────────────────────────────────────────

function createMockKU(overrides: Partial<CanonicalKnowledgeUnit> = {}): CanonicalKnowledgeUnit {
  return {
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
}

const testUnits: CanonicalKnowledgeUnit[] = [
  createMockKU({
    knowledge_id: 'KU_001',
    name: '认知反转制造内容张力',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '用认知反转制造情绪张力反直觉观点冲击',
  }),
  createMockKU({
    knowledge_id: 'KU_002',
    name: '争议性观点开场钩子',
    category: 'hook',
    knowledge_level: 'surface_technique',
    description: '用争议性话题引起注意吸引观众',
  }),
  createMockKU({
    knowledge_id: 'KU_003',
    name: '自我价值建立',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '帮助女性建立内在价值感停止向外索取认可',
  }),
  createMockKU({
    knowledge_id: 'KU_004',
    name: '真实自然表达',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '模拟真人说话方式口语化表达',
    human_expression_verdict: 'confirmed',
  }),
  createMockKU({
    knowledge_id: 'KU_005',
    name: 'suspect expression',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: 'broken suspicious expression',
    status: 'candidate',
    human_expression_verdict: 'suspect',
  }),
];

// ─── Helper: Create RealSemanticSearch with counting provider ────────────

async function createRealSearchWithCountingProvider(includeCandidates = false): Promise<{
  search: RealSemanticSearch;
  provider: CountingMockProvider;
  store: MemoryEmbeddingStore;
}> {
  const provider = new CountingMockProvider(64);
  const store = new MemoryEmbeddingStore();

  // Pre-populate store with embeddings (simulating persisted embeddings)
  const { syncKnowledgeEmbeddings } = await import('../persistence/embedding-sync');
  await syncKnowledgeEmbeddings(testUnits, provider, {
    include_candidates: includeCandidates,
    store,
  });

  // Reset counts after initialization (sync uses embedBatch)
  provider.reset();

  const search = new RealSemanticSearch({
    provider,
    knowledgeUnits: testUnits,
    store,
  });

  return { search, provider, store };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('RealSemanticSearch', () => {
  describe('Initialization', () => {
    it('should load from persistence (no API calls)', async () => {
      const { search, provider } = await createRealSearchWithCountingProvider();

      const result = await search.initialize();

      expect(result.source).toBe('persistence');
      expect(result.entriesLoaded).toBeGreaterThan(0);
      expect(result.apiCalls).toBe(0);
      expect(search.isReady).toBe(true);

      // No embed/batch calls during initialization from persistence
      expect(provider.embedCallCount).toBe(0);
      expect(provider.embedBatchCallCount).toBe(0);
    });

    it('should return correct stats after initialization', async () => {
      const { search } = await createRealSearchWithCountingProvider();
      await search.initialize();

      const stats = search.getStats();
      expect(stats.isReady).toBe(true);
      expect(stats.entriesCount).toBeGreaterThan(0);
      expect(stats.dimensions).toBe(64);
      expect(stats.providerId).toBe('mock');
    });
  });

  describe('Critical: Query Embedding Call Count', () => {
    it('should call embed() exactly ONCE per search', async () => {
      const { search, provider } = await createRealSearchWithCountingProvider();
      await search.initialize();

      // Reset after init sync
      provider.reset();

      // Execute search
      // Note: min_similarity=-1.0 because mock vectors are random (cosine ~0.0)
      const response = await search.search({ query: '女性成长自我价值', min_similarity: -1.0 });

      // CRITICAL: embed() called exactly once (for the query)
      expect(provider.embedCallCount).toBe(1);
      // embedBatch() NOT called during search (vectors from persistence)
      expect(provider.embedBatchCallCount).toBe(0);

      // Results should be returned
      expect(response.retrieval_method).toBe('semantic');
      expect(response.total).toBeGreaterThan(0);
    });

    it('should call embed() once even with multiple searches', async () => {
      const { search, provider } = await createRealSearchWithCountingProvider();
      await search.initialize();
      provider.reset();

      // First search
      await search.search({ query: '自我价值' });
      expect(provider.embedCallCount).toBe(1);

      // Second search
      await search.search({ query: '认知反转' });
      expect(provider.embedCallCount).toBe(2);

      // Third search
      await search.search({ query: '表达技巧' });
      expect(provider.embedCallCount).toBe(3);
    });

    it('should NOT re-embed knowledge vectors during search', async () => {
      const { search, provider } = await createRealSearchWithCountingProvider();
      await search.initialize();
      provider.reset();

      // Search multiple times
      await search.search({ query: '测试查询1' });
      await search.search({ query: '测试查询2' });
      await search.search({ query: '测试查询3' });

      // embed() called 3 times (once per query)
      expect(provider.embedCallCount).toBe(3);
      // embedBatch() NEVER called during search
      expect(provider.embedBatchCallCount).toBe(0);
    });
  });

  describe('Search Results', () => {
    it('should return results sorted by similarity descending', async () => {
      const { search } = await createRealSearchWithCountingProvider();
      await search.initialize();

      const response = await search.search({
        query: '认知反转',
        limit: 5,
      });

      if (response.results.length >= 2) {
        for (let i = 0; i < response.results.length - 1; i++) {
          expect(response.results[i].similarity).toBeGreaterThanOrEqual(
            response.results[i + 1].similarity
          );
        }
      }
    });

    it('should respect limit parameter', async () => {
      const { search } = await createRealSearchWithCountingProvider();
      await search.initialize();

      const response = await search.search({
        query: '测试',
        limit: 3,
      });

      expect(response.results.length).toBeLessThanOrEqual(3);
    });

    it('should include similarity scores in results', async () => {
      const { search } = await createRealSearchWithCountingProvider();
      await search.initialize();

      const response = await search.search({ query: '自我价值' });

      for (const result of response.results) {
        expect(result.similarity).toBeDefined();
        expect(typeof result.similarity).toBe('number');
        expect(Number.isNaN(result.similarity)).toBe(false);
      }
    });

    it('should include full knowledge object in results', async () => {
      const { search } = await createRealSearchWithCountingProvider();
      await search.initialize();

      const response = await search.search({ query: '测试' });

      if (response.results.length > 0) {
        const first = response.results[0];
        expect(first.knowledge).toBeDefined();
        expect(first.knowledge.knowledge_id).toBeDefined();
        expect(first.knowledge.name).toBeDefined();
      }
    });
  });

  describe('Safety Filters (P0.2.3 Reuse)', () => {
    it('should NEVER return suspect KU_005 even with candidates', async () => {
      const { search } = await createRealSearchWithCountingProvider(true);
      await search.initialize();

      const response = await search.search({
        query: '表达技巧',
        include_candidates: true,
        limit: 10,
      });

      const hasSuspect = response.results.some(
        (r) => r.knowledge_id === 'KU_005'
      );
      expect(hasSuspect).toBe(false);
    });

    it('should exclude candidates by default', async () => {
      const { search } = await createRealSearchWithCountingProvider(false);
      await search.initialize();

      // With default (no candidates), only validated KUs should appear
      const response = await search.search({
        query: '测试',
        limit: 10,
      });

      for (const result of response.results) {
        expect(result.knowledge.status).toBe('validated');
      }
    });
  });

  describe('Filtering', () => {
    it('should apply category filter', async () => {
      const { search } = await createRealSearchWithCountingProvider(true);
      await search.initialize();

      const response = await search.search({
        query: '测试',
        category: ['cognition'],
        limit: 10,
        min_similarity: -1.0, // Allow negative similarities (mock vectors)
      });

      for (const result of response.results) {
        expect(result.knowledge.category).toBe('cognition');
      }
    });

    it('should apply min_similarity threshold', async () => {
      const { search } = await createRealSearchWithCountingProvider();
      await search.initialize();

      const response = await search.search({
        query: '测试',
        min_similarity: 0.0,
      });

      for (const result of response.results) {
        expect(result.similarity).toBeGreaterThanOrEqual(0.0);
      }
    });
  });

  describe('Determinism', () => {
    it('should produce deterministic results for same query', async () => {
      const { search } = await createRealSearchWithCountingProvider();
      await search.initialize();

      const response1 = await search.search({ query: '认知反转' });
      const response2 = await search.search({ query: '认知反转' });

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

  describe('Error Handling', () => {
    it('should throw if search called before initialize', async () => {
      const provider = new CountingMockProvider(64);
      const search = new RealSemanticSearch({
        provider,
        knowledgeUnits: testUnits,
      });

      await expect(
        search.search({ query: '测试' })
      ).rejects.toThrow('not initialized');
    });
  });
});

describe('SemanticRetriever with persisted index', () => {
  it('should embed query only once when searching with persisted vectors', async () => {
    const provider = new CountingMockProvider(64);
    const store = new MemoryEmbeddingStore();

    // Create embeddings via sync
    const { syncKnowledgeEmbeddings, buildSemanticIndexFromStoredEmbeddings } = await import('../persistence/embedding-sync');
    await syncKnowledgeEmbeddings(testUnits, provider, { store });
    provider.reset(); // Reset after sync

    // Build index from store (no API calls)
    const index = await buildSemanticIndexFromStoredEmbeddings(store, testUnits, provider);
    expect(index).not.toBeNull();
    expect(provider.embedCallCount).toBe(0);
    expect(provider.embedBatchCallCount).toBe(0);

    // Create retriever
    const { SemanticRetriever } = await import('../semantic-retriever');
    const retriever = new SemanticRetriever(index!, provider, testUnits);

    // Search
    // Note: min_similarity=-1.0 because mock vectors are random (cosine ~0.0)
    const response = await retriever.retrieve({ query: '女性成长', min_similarity: -1.0 });

    // embed() called exactly once
    expect(provider.embedCallCount).toBe(1);
    expect(provider.embedBatchCallCount).toBe(0);
    expect(response.total).toBeGreaterThan(0);
  });
});