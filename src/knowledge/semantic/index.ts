/**
 * P0.3.1 — Semantic Retrieval Public API
 *
 * Main entry point for the Semantic Retrieval module.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type {
  RetrievalMethod,
  EmbeddingProvider,
  SemanticIndexEntry,
  SemanticIndex,
  SemanticRetrievalQuery,
  SemanticRetrievalResult,
  SemanticRetrievalResponse,
  KnowledgeRetriever,
  SemanticIndexBuilderOptions,
} from './types';

export { DEFAULT_SEMANTIC_QUERY } from './types';

// ─── Embedding Providers ───────────────────────────────────────────────────

export {
  MockEmbeddingProvider,
  EmbeddingProviderRegistry,
  defaultMockProvider,
  defaultRegistry,
} from './embedding-provider';

// ─── Similarity ────────────────────────────────────────────────────────────

export {
  cosineSimilarity,
  normalizedCosineSimilarity,
  findMostSimilar,
  rankBySimilarity,
} from './similarity';

// ─── Semantic Index ────────────────────────────────────────────────────────

export {
  buildSemanticIndex,
  entryMatchesFilters,
  computeIndexStats,
} from './semantic-index';

// ─── Semantic Retriever ────────────────────────────────────────────────────

export {
  SemanticRetriever,
  createSemanticRetriever,
} from './semantic-retriever';

// ─── Semantic Search Engine ────────────────────────────────────────────────

export {
  SemanticSearchEngine,
  createSemanticSearchEngine,
} from './semantic-search';