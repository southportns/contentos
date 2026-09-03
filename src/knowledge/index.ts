/**
 * P0.2.3 — Knowledge Store Public API
 *
 * Main entry point for the Knowledge Store module.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type {
  KnowledgeCategory,
  KnowledgeLevel,
  KUStatus,
  ConfidenceLevel,
  HumanExpressionVerdict,
  Validation,
  EvidenceQuality,
  NoiseRisk,
  EvidenceTrust,
  Evidence,
  RetrievalEligibleEvidence,
  EvidenceGroup,
  CanonicalKnowledgeUnit,
  KnowledgeQuery,
  KnowledgeRetrievalResult,
  KnowledgeRetrievalResponse,
  KnowledgeIndexEntry,
  KnowledgeDatasetSource,
  RankingWeights,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

export {
  DEFAULT_QUERY,
  DEFAULT_RANKING_WEIGHTS,
  CONFIDENCE_SCORES,
  CATEGORY_SYNONYMS,
  LEVEL_SYNONYMS,
} from './types';

// ─── Core Classes ───────────────────────────────────────────────────────────

export { KnowledgeStore, knowledgeStore } from './knowledge-store';

// ─── Filter Functions ───────────────────────────────────────────────────────

export {
  filterByStatus,
  filterByLevel,
  filterByCategory,
  filterByConfidence,
  filterHumanExpression,
  computeEvidenceRetrievalEligible,
  countTrustedEvidence,
  applyFilterPipeline,
} from './knowledge-filters';

// ─── Index Functions ────────────────────────────────────────────────────────

export {
  computeEvidenceStrength,
  buildIndexEntry,
  buildIndex,
  extractKeywords,
  matchesCategory,
  matchesLevel,
  matchesStatus,
  matchesConfidence,
  isHumanExpressionSafe,
} from './knowledge-index';

// ─── Ranking Functions ──────────────────────────────────────────────────────

export { rankEntries } from './knowledge-ranker';

// ─── Retrieval Functions ────────────────────────────────────────────────────

export { retrieve, searchEntries } from './knowledge-retriever';

// ─── Data ───────────────────────────────────────────────────────────────────

export { KNOWLEDGE_UNITS, DATASET_META } from './knowledge-data';

// ─── Semantic Retrieval (P0.3.1) ──────────────────────────────────────────

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
  // P0.3.2-1 — Cloud Embedding Providers
  EmbeddingProviderErrorDetails,
  EmbeddingProviderType,
} from './semantic';

export {
  DEFAULT_SEMANTIC_QUERY,
  MockEmbeddingProvider,
  EmbeddingProviderRegistry,
  defaultMockProvider,
  defaultRegistry,
  cosineSimilarity,
  normalizedCosineSimilarity,
  findMostSimilar,
  rankBySimilarity,
  buildSemanticIndex,
  entryMatchesFilters,
  computeIndexStats,
  SemanticRetriever,
  createSemanticRetriever,
  SemanticSearchEngine,
  createSemanticSearchEngine,
  // P0.3.2-1 — Cloud Embedding Providers
  AlibabaEmbeddingProvider,
  EmbeddingProviderError,
  getEmbeddingProvider,
  createProvider,
  createProviderRegistry,
} from './semantic';
