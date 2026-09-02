/**
 * P0.3.1 — Semantic Retrieval Types
 *
 * Defines the core interfaces for the Semantic Retrieval Foundation.
 * This module establishes the architecture for embedding-based retrieval
 * without concrete provider implementations.
 */

import type {
  KnowledgeCategory,
  KnowledgeLevel,
  ConfidenceLevel,
  HumanExpressionVerdict,
  CanonicalKnowledgeUnit,
} from '../types';

// ─── Retrieval Method Enum ──────────────────────────────────────────────────

/**
 * Supported retrieval methods.
 * Default is 'keyword' to maintain P0.2.3 backward compatibility.
 */
export type RetrievalMethod = 'keyword' | 'semantic' | 'hybrid';

// ─── Embedding Provider Interface ───────────────────────────────────────────

/**
 * Unified interface for all embedding providers.
 * Provider implementations are decoupled from business logic.
 */
export interface EmbeddingProvider {
  /** Unique identifier for this provider (e.g., 'mock', 'openai', 'bge') */
  readonly id: string;

  /** Dimension of output vectors */
  readonly dimensions: number;

  /** Embed a single text into a vector */
  embed(text: string): Promise<number[]>;

  /** Embed multiple texts into vectors (batch operation) */
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ─── Semantic Index Entry ──────────────────────────────────────────────────

/**
 * A single entry in the semantic index.
 * Represents one Knowledge Unit with its embedding vector.
 */
export interface SemanticIndexEntry {
  knowledge_id: string;
  vector: number[];
  text: string;
  name: string;
  category: KnowledgeCategory;
  knowledge_level: KnowledgeLevel;
  confidence: ConfidenceLevel;
  status: 'validated' | 'candidate';
  human_expression_verdict?: HumanExpressionVerdict;
}

// ─── Semantic Index ────────────────────────────────────────────────────────

/**
 * Complete semantic index with metadata.
 * Serializable and rebuildable.
 */
export interface SemanticIndex {
  entries: SemanticIndexEntry[];
  dimensions: number;
  provider_id: string;
}

// ─── Semantic Retrieval Query ──────────────────────────────────────────────

/**
 * Query parameters for semantic retrieval.
 * Reuses existing filter dimensions from P0.2.3.
 */
export interface SemanticRetrievalQuery {
  query: string;
  limit?: number;
  min_similarity?: number;
  category?: KnowledgeCategory[];
  knowledge_level?: KnowledgeLevel[];
  confidence?: ConfidenceLevel;
  include_candidates?: boolean;
}

// ─── Semantic Retrieval Result ─────────────────────────────────────────────

/**
 * Single semantic retrieval result with similarity score.
 */
export interface SemanticRetrievalResult {
  knowledge_id: string;
  similarity: number;
  knowledge: CanonicalKnowledgeUnit;
  retrieval_method: 'semantic';
  retrieval_reason: string;
}

// ─── Semantic Retrieval Response ───────────────────────────────────────────

/**
 * Response wrapper for semantic retrieval results.
 */
export interface SemanticRetrievalResponse {
  query: string;
  results: SemanticRetrievalResult[];
  total: number;
  retrieval_method: 'semantic';
}

// ─── Unified Retriever Interface ───────────────────────────────────────────

/**
 * Unified interface for all retrievers (keyword, semantic, hybrid).
 * KeywordRetriever already exists in P0.2.3.
 * This interface enables future pluggable retrieval backends.
 */
export interface KnowledgeRetriever {
  retrieve(
    query: SemanticRetrievalQuery | import('../types').KnowledgeQuery
  ): Promise<import('../types').KnowledgeRetrievalResponse | SemanticRetrievalResponse>;
}

// ─── Semantic Index Builder Options ────────────────────────────────────────

/**
 * Options for building a semantic index.
 */
export interface SemanticIndexBuilderOptions {
  include_candidates?: boolean;
}

// ─── Default Values ────────────────────────────────────────────────────────

export const DEFAULT_SEMANTIC_QUERY: Required<Omit<SemanticRetrievalQuery, 'query' | 'category' | 'knowledge_level' | 'confidence'>> = {
  limit: 5,
  min_similarity: 0.0,
  include_candidates: false,
};