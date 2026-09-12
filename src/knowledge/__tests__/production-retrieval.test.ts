/**
 * P0.3.4 — Production Retrieval Integration Tests
 *
 * Verifies that the calibrated parameters (TopK=5, Threshold=0.30)
 * are correctly applied in the production Semantic Retrieval flow.
 *
 * Uses a controlled mock index with known similarity values
 * to precisely test threshold and TopK behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticRetriever } from '../semantic/semantic-retriever';
import { DEFAULT_SIMILARITY_THRESHOLD, DEFAULT_TOP_K } from '../semantic/types';
import type {
  SemanticIndex,
  SemanticIndexEntry,
  EmbeddingProvider,
} from '../semantic/types';
import type { CanonicalKnowledgeUnit } from '../types';

// ─── Helper: Create a mock embedding provider ──────────────────────────────

/**
 * Mock provider that returns a fixed vector for any query.
 * This allows us to control the cosine similarity precisely.
 */
class FixedVectorProvider implements EmbeddingProvider {
  readonly id = 'fixed-vector-provider';
  readonly dimensions = 2;
  private fixedVector: number[];

  constructor(vector: number[]) {
    this.fixedVector = vector;
  }

  async embed(_text: string): Promise<number[]> {
    return [...this.fixedVector];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => [...this.fixedVector]);
  }
}

// ─── Helper: Create a mock KU ──────────────────────────────────────────────

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

// ─── Helper: Create a mock semantic index ──────────────────────────────────

function createMockIndex(
  entries: { id: string; vector: number[] }[]
): SemanticIndex {
  const indexEntries: SemanticIndexEntry[] = entries.map((e) => ({
    knowledge_id: e.id,
    vector: e.vector,
    text: `Text for ${e.id}`,
    name: `Test ${e.id}`,
    category: 'hook' as const,
    knowledge_level: 'surface_technique' as const,
    confidence: 'high' as const,
    status: 'validated',
  }));

  return {
    entries: indexEntries,
    dimensions: 2,
    provider_id: 'fixed-vector-provider',
  };
}

function getKUsFromIndex(index: SemanticIndex): CanonicalKnowledgeUnit[] {
  return index.entries.map((e) => createMockKU(e.knowledge_id));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.3.4 Production Retrieval Defaults', () => {
  it('should have DEFAULT_TOP_K = 5', () => {
    expect(DEFAULT_TOP_K).toBe(5);
  });

  it('should have DEFAULT_SIMILARITY_THRESHOLD = 0.30', () => {
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.30);
  });
});

describe('P0.3.4 TopK Default Behavior', () => {
  it('should return at most 5 results by default', async () => {
    // Query vector [1, 0] - similarity = x-component
    const provider = new FixedVectorProvider([1, 0]);

    // Create 10 entries with similarity 0.9, 0.8, 0.7, ... 0.0
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `KU_${String(i + 1).padStart(3, '0')}`,
      vector: [0.9 - i * 0.1, Math.sqrt(1 - Math.pow(0.9 - i * 0.1, 2))],
    }));

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: 'test query',
      // No limit or min_similarity - should use defaults
    });

    // Default TopK = 5, Threshold = 0.30
    // Entries with similarity >= 0.30: 0.9, 0.8, 0.7, 0.6, 0.5 (5 entries)
    expect(response.results.length).toBe(5);
  });
});

describe('P0.3.4 Threshold Default Behavior', () => {
  it('should filter results with similarity < 0.30', async () => {
    const provider = new FixedVectorProvider([1, 0]);

    // Create entries with similarities: 0.60, 0.55, 0.42, 0.31, 0.30, 0.29, 0.20
    const similarities = [0.60, 0.55, 0.42, 0.31, 0.30, 0.29, 0.20];
    const entries = similarities.map((sim, i) => ({
      id: `KU_${String(i + 1).padStart(3, '0')}`,
      vector: [sim, Math.sqrt(1 - sim * sim)],
    }));

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: 'test query',
      limit: 10, // Set high limit to not interfere
      // No min_similarity - should use default 0.30
    });

    // Expected: 0.60, 0.55, 0.42, 0.31, 0.30 (>= 0.30)
    // Filtered: 0.29, 0.20 (< 0.30)
    expect(response.results.length).toBe(5);

    const similarities_in_result = response.results.map((r) => r.similarity);
    expect(similarities_in_result).toContain(0.60);
    expect(similarities_in_result).toContain(0.55);
    expect(similarities_in_result).toContain(0.42);
    expect(similarities_in_result).toContain(0.31);
    expect(similarities_in_result).toContain(0.30);
    expect(similarities_in_result).not.toContain(0.29);
    expect(similarities_in_result).not.toContain(0.20);
  });

  it('should include similarity exactly equal to 0.30', async () => {
    const provider = new FixedVectorProvider([1, 0]);

    const entries = [
      { id: 'KU_001', vector: [0.30, Math.sqrt(1 - 0.09)] },
    ];

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: 'test query',
      limit: 10,
    });

    // similarity = 0.30 should be included (>= 0.30)
    expect(response.results.length).toBe(1);
    expect(response.results[0].similarity).toBeCloseTo(0.30, 2);
  });

  it('should exclude similarity just below 0.30', async () => {
    const provider = new FixedVectorProvider([1, 0]);

    const entries = [
      { id: 'KU_001', vector: [0.29, Math.sqrt(1 - 0.0841)] },
    ];

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: 'test query',
      limit: 10,
    });

    // similarity = 0.29 should NOT be included (< 0.30)
    expect(response.results.length).toBe(0);
  });
});

describe('P0.3.4 Threshold Before TopK Ordering', () => {
  it('should apply threshold BEFORE TopK', async () => {
    const provider = new FixedVectorProvider([1, 0]);

    // Create entries with similarities: 0.90, 0.85, 0.80, 0.20, 0.19, 0.70, 0.65
    // After threshold (>= 0.30): 0.90, 0.85, 0.80, 0.70, 0.65
    // After TopK (5): 0.90, 0.85, 0.80, 0.70, 0.65
    const similarities = [0.90, 0.85, 0.80, 0.70, 0.65, 0.20, 0.19];
    const entries = similarities.map((sim, i) => ({
      id: `KU_${String(i + 1).padStart(3, '0')}`,
      vector: [sim, Math.sqrt(1 - sim * sim)],
    }));

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: 'test query',
      // Use defaults: TopK=5, Threshold=0.30
    });

    expect(response.results.length).toBe(5);
    const resultSims = response.results.map((r) => r.similarity);
    expect(resultSims[0]).toBeCloseTo(0.90, 2);
    expect(resultSims[1]).toBeCloseTo(0.85, 2);
    expect(resultSims[2]).toBeCloseTo(0.80, 2);
    expect(resultSims[3]).toBeCloseTo(0.70, 2);
    expect(resultSims[4]).toBeCloseTo(0.65, 2);
  });
});

describe('P0.3.4 Irrelevant Query Returns Empty', () => {
  it('should return empty results for completely irrelevant query', async () => {
    const provider = new FixedVectorProvider([1, 0]);

    // All entries have similarity < 0.30
    const similarities = [0.20, 0.19, 0.15];
    const entries = similarities.map((sim, i) => ({
      id: `KU_${String(i + 1).padStart(3, '0')}`,
      vector: [sim, Math.sqrt(1 - sim * sim)],
    }));

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: '量子物理芯片技术',
      // Use defaults: TopK=5, Threshold=0.30
    });

    // All below threshold - should return empty
    expect(response.results.length).toBe(0);
    expect(response.total).toBe(0);
  });
});

describe('P0.3.4 Custom Parameter Override', () => {
  it('should respect custom limit parameter', async () => {
    const provider = new FixedVectorProvider([1, 0]);

    const similarities = [0.90, 0.85, 0.80, 0.75, 0.70, 0.65];
    const entries = similarities.map((sim, i) => ({
      id: `KU_${String(i + 1).padStart(3, '0')}`,
      vector: [sim, Math.sqrt(1 - sim * sim)],
    }));

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: 'test query',
      limit: 3, // Override default 5
    });

    expect(response.results.length).toBe(3);
  });

  it('should respect custom min_similarity parameter', async () => {
    const provider = new FixedVectorProvider([1, 0]);

    // Entries with similarities: 0.60, 0.50, 0.40, 0.35
    const similarities = [0.60, 0.50, 0.40, 0.35];
    const entries = similarities.map((sim, i) => ({
      id: `KU_${String(i + 1).padStart(3, '0')}`,
      vector: [sim, Math.sqrt(1 - sim * sim)],
    }));

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: 'test query',
      limit: 10,
      min_similarity: 0.40, // Override default 0.30
    });

    // Only >= 0.40: 0.60, 0.50, 0.40
    expect(response.results.length).toBe(3);
    const resultSims = response.results.map((r) => r.similarity);
    expect(resultSims[0]).toBeCloseTo(0.60, 2);
    expect(resultSims[1]).toBeCloseTo(0.50, 2);
    expect(resultSims[2]).toBeCloseTo(0.40, 2);
    // 0.35 should not be included
    expect(resultSims.some((s) => Math.abs(s - 0.35) < 0.01)).toBe(false);
  });
});

describe('P0.3.4 Results Sorted by Similarity Descending', () => {
  it('should return results sorted by similarity descending', async () => {
    const provider = new FixedVectorProvider([1, 0]);

    const similarities = [0.50, 0.90, 0.30, 0.70, 0.60];
    const entries = similarities.map((sim, i) => ({
      id: `KU_${String(i + 1).padStart(3, '0')}`,
      vector: [sim, Math.sqrt(1 - sim * sim)],
    }));

    const index = createMockIndex(entries);
    const kus = getKUsFromIndex(index);
    const retriever = new SemanticRetriever(index, provider, kus);

    const response = await retriever.retrieve({
      query: 'test query',
      limit: 10,
    });

    // Sorted descending: 0.90, 0.70, 0.60, 0.50, 0.30
    expect(response.results[0].similarity).toBeCloseTo(0.90, 2);
    expect(response.results[1].similarity).toBeCloseTo(0.70, 2);
    expect(response.results[2].similarity).toBeCloseTo(0.60, 2);
    expect(response.results[3].similarity).toBeCloseTo(0.50, 2);
    expect(response.results[4].similarity).toBeCloseTo(0.30, 2);
  });
});