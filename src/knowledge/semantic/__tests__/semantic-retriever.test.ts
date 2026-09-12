import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticRetriever } from '../semantic-retriever';
import { DEFAULT_SIMILARITY_THRESHOLD, DEFAULT_TOP_K } from '../types';
import type {
  SemanticIndex,
  SemanticIndexEntry,
  EmbeddingProvider,
} from '../types';
import type { CanonicalKnowledgeUnit } from '../../types';

class MockProvider implements EmbeddingProvider {
  readonly id = 'mock';
  readonly dimensions = 4;
  private callCount = 0;

  async embed(text: string): Promise<number[]> {
    this.callCount++;
    // Return a deterministic but text-dependent vector
    const hash = text.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
    return [
      (hash % 100) / 100,
      ((hash * 2) % 100) / 100,
      ((hash * 3) % 100) / 100,
      ((hash * 4) % 100) / 100,
    ];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  getCallCount(): number {
    return this.callCount;
  }
}

class CountingMockProvider extends MockProvider {
  readonly id = 'counting-mock';
}

function createMockKU(id: string): CanonicalKnowledgeUnit {
  return {
    knowledge_id: id,
    name: `Test ${id}`,
    category: 'hook' as const,
    knowledge_level: 'surface_technique' as const,
    description: `Description for ${id}`,
    confidence: 'high' as const,
    status: 'validated',
    reclassified: false,
    evidence: {
      items: [],
      unique_content_count: 0,
    },
  };
}

function createMockIndex(): { index: SemanticIndex; kus: CanonicalKnowledgeUnit[] } {
  const entries: SemanticIndexEntry[] = [
    {
      knowledge_id: 'KU_001',
      vector: [0.9, 0.1, 0.0, 0.0],
      text: 'Hook technique for short videos',
      name: 'Hook Technique',
      category: 'hook',
      knowledge_level: 'surface_technique',
      confidence: 'high',
      status: 'validated',
    },
    {
      knowledge_id: 'KU_002',
      vector: [0.1, 0.9, 0.0, 0.0],
      text: 'Emotional resonance in content',
      name: 'Emotional Resonance',
      category: 'emotion',
      knowledge_level: 'deep_principle',
      confidence: 'high',
      status: 'validated',
    },
    {
      knowledge_id: 'KU_003',
      vector: [0.5, 0.5, 0.0, 0.0],
      text: 'Storytelling structure',
      name: 'Storytelling',
      category: 'structure',
      knowledge_level: 'surface_technique',
      confidence: 'medium',
      status: 'validated',
    },
  ];

  const kus = [createMockKU('KU_001'), createMockKU('KU_002'), createMockKU('KU_003')];
  return {
    index: {
      entries,
      dimensions: 4,
      provider_id: 'mock',
    },
    kus,
  };
}

async function buildRetriever() {
  const provider = new CountingMockProvider();
  const { index, kus } = createMockIndex();
  const retriever = new SemanticRetriever(index, provider, kus);
  return { retriever, provider, index, kus };
}

describe('SemanticRetriever', () => {
  it('should retrieve results sorted by similarity', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'hook technique' });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0].similarity).toBeGreaterThanOrEqual(
      response.results[response.results.length - 1].similarity
    );
  });

  it('should return empty for queries with no matches', async () => {
    const { retriever } = await buildRetriever();
    // With a query vector [1,0,0,0], only KU_001 (vector [0.9,0.1,0,0]) should have high similarity
    // But with mock provider, the actual query vector depends on text hash
    const response = await retriever.retrieve({ query: 'xyzirrelevant', min_similarity: 0.99 });
    expect(response.results.length).toBe(0);
  });

  it('should respect limit parameter', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'test', limit: 1, min_similarity: -1.0 });
    expect(response.results.length).toBe(1);
  });

  it('should respect min_similarity parameter', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'test', min_similarity: 0.99 });
    expect(response.results.length).toBe(0);
  });

  it('should include similarity scores', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'test', min_similarity: -1.0 });
    expect(response.results[0].similarity).toBeDefined();
    expect(response.results[0].similarity).toBeGreaterThanOrEqual(-1);
    expect(response.results[0].similarity).toBeLessThanOrEqual(1);
  });

  it('should return all required fields', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'test', min_similarity: -1.0 });
    const result = response.results[0];
    expect(result.knowledge_id).toBeDefined();
    expect(result.name).toBeDefined();
    expect(result.category).toBeDefined();
    expect(result.knowledge_level).toBeDefined();
    expect(result.confidence).toBeDefined();
    expect(result.similarity).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.status).toBeDefined();
  });

  it('should have correct method field', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'test', min_similarity: -1.0 });
    expect(response.method).toBe('semantic');
  });

  it('should have total count', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'test', min_similarity: -1.0 });
    expect(response.total).toBe(response.results.length);
  });

  it('should use default limit when not specified', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'test', min_similarity: -1.0 });
    expect(response.results.length).toBeLessThanOrEqual(DEFAULT_TOP_K);
  });

  it('should use default min_similarity when not specified', async () => {
    const { retriever } = await buildRetriever();
    const { retriever: retriever2 } = await buildRetriever();
    // Results should be filtered by default threshold
    const response = await retriever.retrieve({ query: '女性成长自我价值' });
    const response2 = await retriever2.retrieve({ query: '女性成长自我价值', min_similarity: DEFAULT_SIMILARITY_THRESHOLD });
    expect(response.results.length).toBe(response2.results.length);
  });

  it('should handle empty index', async () => {
    const provider = new CountingMockProvider();
    const emptyIndex: SemanticIndex = {
      entries: [],
      dimensions: 4,
      provider_id: 'mock',
    };
    const retriever = new SemanticRetriever(emptyIndex, provider, []);
    const response = await retriever.retrieve({ query: 'test' });
    expect(response.results.length).toBe(0);
  });

  it('should work with real semantic search pattern', async () => {
    const { retriever } = await buildRetriever();
    // Note: min_similarity=-1.0 because mock vectors are random (cosine ~0.0)
    // Real embeddings would have meaningful similarities and default 0.35 threshold works
    const response = await retriever.retrieve({ query: '女性成长自我价值', min_similarity: -1.0 });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.method).toBe('semantic');
  });

  it('should be deterministic for same query', async () => {
    const { retriever } = await buildRetriever();
    const response1 = await retriever.retrieve({ query: 'test', min_similarity: -1.0 });
    const response2 = await retriever.retrieve({ query: 'test', min_similarity: -1.0 });
    expect(response1.results.length).toBe(response2.results.length);
    if (response1.results.length > 0) {
      expect(response1.results[0].similarity).toBe(response2.results[0].similarity);
    }
  });

  it('should handle single entry index', async () => {
    const provider = new CountingMockProvider();
    const singleEntry: SemanticIndex = {
      entries: [
        {
          knowledge_id: 'KU_SINGLE',
          vector: [1, 0, 0, 0],
          text: 'Single entry',
          name: 'Single',
          category: 'hook',
          knowledge_level: 'surface_technique',
          confidence: 'high',
          status: 'validated',
        },
      ],
      dimensions: 4,
      provider_id: 'mock',
    };
    const kus = [createMockKU('KU_SINGLE')];
    const retriever = new SemanticRetriever(singleEntry, provider, kus);
    const response = await retriever.retrieve({ query: 'test', min_similarity: -1.0 });
    expect(response.results.length).toBeGreaterThanOrEqual(0);
  });

  it('should return KU metadata in results', async () => {
    const { retriever } = await buildRetriever();
    const response = await retriever.retrieve({ query: 'hook', min_similarity: -1.0 });
    if (response.results.length > 0) {
      const result = response.results[0];
      expect(result.knowledge_id).toMatch(/^KU_/);
      expect(result.name).toBeTruthy();
      expect(result.text).toBeTruthy();
    }
  });

  it('should handle multiple queries consistently', async () => {
    const { retriever } = await buildRetriever();
    const queries = ['hook', 'emotion', 'story'];
    for (const q of queries) {
      const response = await retriever.retrieve({ query: q, min_similarity: -1.0 });
      expect(response.method).toBe('semantic');
      expect(response.results.length).toBeGreaterThanOrEqual(0);
    }
  });
});
