/**
 * P0.3.2-3 — Real Semantic Search Orchestration
 *
 * Ties together:
 * - Embedding Persistence (FileEmbeddingStore)
 * - Semantic Index (buildSemanticIndexFromStoredEmbeddings)
 * - Semantic Retriever (query → embed → similarity → topK)
 *
 * Core rule:
 *   Knowledge vectors → ALWAYS from persistence (never re-embedded)
 *   Query vector      → embed() call (1 API call per search)
 *
 * This is the production entry point for semantic retrieval.
 */

import type { CanonicalKnowledgeUnit } from '../types';
import type {
  EmbeddingProvider,
  SemanticIndex,
  SemanticRetrievalQuery,
  SemanticRetrievalResponse,
} from './types';
import { SemanticRetriever } from './semantic-retriever';
import { FileEmbeddingStore } from './persistence/embedding-store';
import type { EmbeddingStore } from './persistence/types';
import { buildSemanticIndexFromStoredEmbeddings, syncKnowledgeEmbeddings } from './persistence/embedding-sync';

export interface RealSemanticSearchConfig {
  provider: EmbeddingProvider;
  knowledgeUnits: CanonicalKnowledgeUnit[];
  store?: EmbeddingStore;
}

export class RealSemanticSearch {
  private provider: EmbeddingProvider;
  private knowledgeUnits: CanonicalKnowledgeUnit[];
  private store: EmbeddingStore;
  private retriever: SemanticRetriever | null = null;
  private index: SemanticIndex | null = null;

  constructor(config: RealSemanticSearchConfig) {
    this.provider = config.provider;
    this.knowledgeUnits = config.knowledgeUnits;
    this.store = config.store ?? new FileEmbeddingStore();
  }

  async initialize(options: {
    force_sync?: boolean;
    include_candidates?: boolean;
  } = {}): Promise<{
    source: 'persistence' | 'cloud-sync' | 'empty';
    entriesLoaded: number;
    apiCalls: number;
  }> {
    if (!options.force_sync) {
      const persistedIndex = await buildSemanticIndexFromStoredEmbeddings(
        this.store,
        this.knowledgeUnits,
        this.provider
      );

      if (persistedIndex && persistedIndex.entries.length > 0) {
        this.index = persistedIndex;
        this.retriever = new SemanticRetriever(
          persistedIndex,
          this.provider,
          this.knowledgeUnits
        );
        return {
          source: 'persistence',
          entriesLoaded: persistedIndex.entries.length,
          apiCalls: 0,
        };
      }
    }

    const syncResult = await syncKnowledgeEmbeddings(
      this.knowledgeUnits,
      this.provider,
      {
        include_candidates: options.include_candidates ?? false,
      }
    );

    const syncedIndex = await buildSemanticIndexFromStoredEmbeddings(
      this.store,
      this.knowledgeUnits,
      this.provider
    );

    if (syncedIndex && syncedIndex.entries.length > 0) {
      this.index = syncedIndex;
      this.retriever = new SemanticRetriever(
        syncedIndex,
        this.provider,
        this.knowledgeUnits
      );
      return {
        source: 'cloud-sync',
        entriesLoaded: syncedIndex.entries.length,
        apiCalls: syncResult.api_calls,
      };
    }

    return {
      source: 'empty',
      entriesLoaded: 0,
      apiCalls: 0,
    };
  }

  async search(
    query: SemanticRetrievalQuery
  ): Promise<SemanticRetrievalResponse> {
    if (!this.retriever) {
      throw new Error(
        'RealSemanticSearch not initialized. Call initialize() first.'
      );
    }

    return this.retriever.retrieve(query);
  }

  get isReady(): boolean {
    return this.retriever !== null;
  }

  getIndex(): SemanticIndex | null {
    return this.index;
  }

  getProvider(): EmbeddingProvider {
    return this.provider;
  }

  getStats(): {
    isReady: boolean;
    entriesCount: number;
    dimensions: number;
    providerId: string;
  } {
    return {
      isReady: this.isReady,
      entriesCount: this.index?.entries.length ?? 0,
      dimensions: this.index?.dimensions ?? 0,
      providerId: this.index?.provider_id ?? this.provider.id,
    };
  }
}

export function createRealSemanticSearch(
  provider: EmbeddingProvider,
  knowledgeUnits: CanonicalKnowledgeUnit[]
): RealSemanticSearch {
  return new RealSemanticSearch({
    provider,
    knowledgeUnits,
  });
}
