//
// Semantic Retrieval Types & Defaults
// Knowledge retrieval with embedding-based semantic search
//

// ─── Core Types ──────────────────────────────────────────────────────────────

/**
 * Semantic index entry - a knowledge unit with its embedding vector
 */
export interface SemanticIndexEntry {
  knowledge_id: string;
  vector: number[];
  text: string; // The text that was embedded (for reconstruction)
  name: string;
  category: string;
  knowledge_level: string;
  confidence: string;
  status: 'validated' | 'candidate';
}

/**
 * In-memory semantic index
 */
export interface SemanticIndex {
  entries: SemanticIndexEntry[];
  dimensions: number;
  provider_id: string;
}

/**
 * Semantic retrieval query
 */
export interface SemanticRetrievalQuery {
  query: string;
  limit?: number;
  min_similarity?: number;
  include_candidates?: boolean;
  category?: string;
  knowledge_level?: string;
  confidence?: string;
}

/**
 * Semantic retrieval result item
 */
export interface SemanticRetrievalResultItem {
  knowledge_id: string;
  name: string;
  category: string;
  knowledge_level: string;
  confidence: string;
  similarity: number;
  text: string;
  status: 'validated' | 'candidate';
}

/**
 * Semantic retrieval response
 */
export interface SemanticRetrievalResponse {
  results: SemanticRetrievalResultItem[];
  total: number;
  query: string;
  method: 'semantic';
}

/**
 * Embedding provider interface
 */
export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Embedding store interface for persistence
 */
export interface EmbeddingStore {
  get(knowledge_id: string): Promise<number[] | null>;
  set(knowledge_id: string, vector: number[]): Promise<void>;
  has(knowledge_id: string): Promise<boolean>;
  delete(knowledge_id: string): Promise<void>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

/**
 * Semantic retriever interface
 */
export interface SemanticRetrieverInterface {
  retrieve(query: SemanticRetrievalQuery): Promise<SemanticRetrievalResponse>;
}

/**
 * Index builder that constructs a semantic index from knowledge units
 */
export interface SemanticIndexBuilder {
  buildIndex(kus: CanonicalKnowledgeUnit[]): Promise<SemanticIndex>;
}

/**
 * Semantic search orchestrator that loads from persistence
 */
export interface SemanticSearch {
  search(query: SemanticRetrievalQuery): Promise<SemanticRetrievalResponse>;
  isReady(): boolean;
  getIndexInfo(): { entries: number; dimensions: number; provider_id: string } | null;
}

// ─── Embedding Provider Types ────────────────────────────────────────────────

/**
 * Provider configuration for embedding
 */
export interface EmbeddingProviderConfig {
  provider: 'aliyun' | 'openai' | 'local';
  model: string;
  apiKey?: string;
  baseURL?: string;
  dimensions?: number;
}

/**
 * Provider router for embedding failover
 */
export interface EmbeddingProviderRouter {
  getProvider(): EmbeddingProvider;
  getConfig(): EmbeddingProviderConfig;
}

// ─── Default Values ──────────────────────────────────────────────────────────

/**
 * P0.3.6 Calibration Result:
 *   Production similarity threshold = 0.35
 *   (validated on 24 KUs / 90 evaluation queries)
 *
 * T=0.35 is the critical inflection point where negative rejection
 * jumps from 87.5% to 100% while maintaining same HitRate and Recall.
 *
 * Calibration Score: 0.611 (vs 0.594 at T=0.30)
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.35;

/**
 * P0.3.6 Calibration Result:
 *   Production TopK = 5
 *   (optimal balance of recall and context cost)
 */
export const DEFAULT_TOP_K = 5;

export const DEFAULT_SEMANTIC_QUERY: Required<Omit<SemanticRetrievalQuery, 'query' | 'category' | 'knowledge_level' | 'confidence'>> = {
  limit: DEFAULT_TOP_K,
  min_similarity: DEFAULT_SIMILARITY_THRESHOLD,
  include_candidates: false,
};