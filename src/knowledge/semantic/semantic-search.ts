/**
 * P0.3.1 — Semantic Search Orchestration
 *
 * High-level API that ties together:
 * - EmbeddingProvider
 * - SemanticIndex building
 * - SemanticRetriever
 *
 * This is the main entry point for semantic retrieval operations.
 * It manages the index lifecycle and provides a clean API.
 */

import type { CanonicalKnowledgeUnit } from '../types';
import type {
  EmbeddingProvider,
  SemanticIndex,
  SemanticRetrievalQuery,
  SemanticRetrievalResponse,
} from './types';
import { buildSemanticIndex } from './semantic-index';
import { SemanticRetriever } from './semantic-retriever';

// ─── Semantic Search Engine ────────────────────────────────────────────────

/**
 * High-level semantic search engine.
 *
 * Manages the semantic index lifecycle:
 * - Build index from Knowledge Units
 * - Rebuild when needed
 * - Execute semantic queries
 *
 * Usage:
 *   const engine = new SemanticSearchEngine(provider, knowledgeUnits);
 *   await engine.buildIndex();
 *   const results = await engine.search({ query: '女性成长' });
 */
export class SemanticSearchEngine {
  private provider: EmbeddingProvider;
  private knowledgeUnits: CanonicalKnowledgeUnit[];
  private index: SemanticIndex | null = null;
  private retriever: SemanticRetriever | null = null;
  private lastIncludeCandidates = false;

  constructor(
    provider: EmbeddingProvider,
    knowledgeUnits: CanonicalKnowledgeUnit[]
  ) {
    this.provider = provider;
    this.knowledgeUnits = knowledgeUnits;
  }

  /**
   * Build (or rebuild) the semantic index.
   * Must be called before search().
   */
  async buildIndex(options: { include_candidates?: boolean } = {}): Promise<void> {
    const includeCandidates = options.include_candidates ?? false;
    this.lastIncludeCandidates = includeCandidates;

    this.index = await buildSemanticIndex(
      this.knowledgeUnits,
      this.provider,
      { include_candidates: includeCandidates }
    );

    this.retriever = new SemanticRetriever(
      this.index,
      this.provider,
      this.knowledgeUnits
    );
  }

  /**
   * Execute a semantic search query.
   * Automatically builds index if not yet built.
   */
  async search(
    query: SemanticRetrievalQuery
  ): Promise<SemanticRetrievalResponse> {
    // Auto-build index if needed
    if (!this.retriever) {
      await this.buildIndex({
        include_candidates: query.include_candidates,
      });
    }

    // If include_candidates changed, rebuild
    if (
      query.include_candidates !== undefined &&
      query.include_candidates !== this.lastIncludeCandidates
    ) {
      await this.buildIndex({
        include_candidates: query.include_candidates,
      });
    }

    return this.retriever!.retrieve(query);
  }

  /**
   * Check if index is built.
   */
  get isReady(): boolean {
    return this.retriever !== null;
  }

  /**
   * Get current index (or null if not built).
   */
  getIndex(): SemanticIndex | null {
    return this.index;
  }

  /**
   * Get the embedding provider.
   */
  getProvider(): EmbeddingProvider {
    return this.provider;
  }
}

// ─── Factory Function ──────────────────────────────────────────────────────

/**
 * Create a semantic search engine with the given provider and knowledge units.
 */
export function createSemanticSearchEngine(
  provider: EmbeddingProvider,
  knowledgeUnits: CanonicalKnowledgeUnit[]
): SemanticSearchEngine {
  return new SemanticSearchEngine(provider, knowledgeUnits);
}