/**
 * P0.3.1 — Semantic Retriever
 *
 * Implements semantic retrieval against a pre-built semantic index.
 * Reuses P0.2.3 safety filters via the safety pre-filtering in index building.
 *
 * Pipeline:
 *   1. Embed query text
 *   2. Compute similarity against all index entries
 *   3. Apply runtime filters (category, level, confidence, min_similarity)
 *   4. Rank by similarity descending
 *   5. Return top K results
 */

import type { CanonicalKnowledgeUnit } from '../types';
import type {
  EmbeddingProvider,
  SemanticIndex,
  SemanticIndexEntry,
  SemanticRetrievalQuery,
  SemanticRetrievalResult,
  SemanticRetrievalResponse,
} from './types';
import { cosineSimilarity } from './similarity';
import { entryMatchesFilters } from './semantic-index';

// ─── Scored Entry (Internal) ───────────────────────────────────────────────

interface ScoredEntry {
  entry: SemanticIndexEntry;
  similarity: number;
}

// ─── Reason Builder ────────────────────────────────────────────────────────

/**
 * Build a human-readable retrieval reason for semantic results.
 */
function buildSemanticReason(
  entry: SemanticIndexEntry,
  similarity: number
): string {
  const parts: string[] = [];

  parts.push(`语义相似度: ${(similarity * 100).toFixed(1)}%`);
  parts.push(`知识等级: ${translateLevel(entry.knowledge_level)}`);
  parts.push(`分类: ${translateCategory(entry.category)}`);

  if (entry.confidence === 'high') {
    parts.push('高可信度');
  } else if (entry.confidence === 'medium') {
    parts.push('中可信度');
  }

  return parts.join(' | ');
}

function translateLevel(level: string): string {
  const map: Record<string, string> = {
    strategic_pattern: '战略模式',
    structural_pattern: '结构模式',
    expression_principle: '表达原则',
    surface_technique: '表面技巧',
  };
  return map[level] ?? level;
}

function translateCategory(cat: string): string {
  const map: Record<string, string> = {
    hook: '开头技巧',
    structure: '结构模式',
    emotion: '情绪模式',
    perspective: '视角模式',
    language: '语言技巧',
    cognition: '认知模式',
    human_expression: '真人表达',
    ending: '结尾技巧',
  };
  return map[cat] ?? cat;
}

// ─── Semantic Retriever ────────────────────────────────────────────────────

/**
 * Semantic retriever class.
 *
 * Takes a pre-built semantic index and performs similarity-based retrieval.
 * The index is built externally (via buildSemanticIndex) with safety filters applied.
 * This class only handles query embedding, similarity computation, and ranking.
 */
export class SemanticRetriever {
  private index: SemanticIndex;
  private provider: EmbeddingProvider;
  private knowledgeMap: Map<string, CanonicalKnowledgeUnit>;

  constructor(
    index: SemanticIndex,
    provider: EmbeddingProvider,
    knowledgeUnits: CanonicalKnowledgeUnit[]
  ) {
    this.index = index;
    this.provider = provider;
    this.knowledgeMap = new Map(
      knowledgeUnits.map((ku) => [ku.knowledge_id, ku])
    );
  }

  /**
   * Execute semantic retrieval.
   *
   * Steps:
   *   1. Embed the query
   *   2. Compute similarity against all index entries
   *   3. Apply runtime filters
   *   4. Sort by similarity
   *   5. Return top K
   */
  async retrieve(
    query: SemanticRetrievalQuery
  ): Promise<SemanticRetrievalResponse> {
    const limit = query.limit ?? 5;
    const minSimilarity = query.min_similarity ?? 0.0;

    // 1. Embed the query
    const queryVector = await this.provider.embed(query.query);

    // 2. Compute similarities
    const scoredEntries: ScoredEntry[] = this.index.entries.map((entry) => ({
      entry,
      similarity: cosineSimilarity(queryVector, entry.vector),
    }));

    // 3. Apply runtime filters
    const filtered = scoredEntries.filter((scored) =>
      entryMatchesFilters(scored.entry, {
        categories: query.category,
        levels: query.knowledge_level,
        minConfidence: query.confidence,
        minSimilarity,
        similarity: scored.similarity,
      })
    );

    // 4. Sort by similarity descending (ties broken by knowledge_id alphabetically)
    const sorted = filtered.sort((a, b) => {
      if (b.similarity !== a.similarity) {
        return b.similarity - a.similarity;
      }
      return a.entry.knowledge_id.localeCompare(b.entry.knowledge_id);
    });

    // 5. Take top K
    const topK = sorted.slice(0, limit);

    // 6. Build results
    const results: SemanticRetrievalResult[] = topK
      .map((scored) => {
        const knowledge = this.knowledgeMap.get(scored.entry.knowledge_id);
        if (!knowledge) return null;
        return {
          knowledge_id: scored.entry.knowledge_id,
          similarity: scored.similarity,
          knowledge,
          retrieval_method: 'semantic' as const,
          retrieval_reason: buildSemanticReason(scored.entry, scored.similarity),
        };
      })
      .filter((r): r is SemanticRetrievalResult => r !== null);

    return {
      query: query.query,
      results,
      total: results.length,
      retrieval_method: 'semantic',
    };
  }

  /**
   * Get the underlying index (for diagnostics).
   */
  getIndex(): SemanticIndex {
    return this.index;
  }

  /**
   * Get the embedding provider (for diagnostics).
   */
  getProvider(): EmbeddingProvider {
    return this.provider;
  }
}

/**
 * Convenience function: Create a semantic retriever from a pre-built index.
 */
export function createSemanticRetriever(
  index: SemanticIndex,
  provider: EmbeddingProvider,
  knowledgeUnits: CanonicalKnowledgeUnit[]
): SemanticRetriever {
  return new SemanticRetriever(index, provider, knowledgeUnits);
}