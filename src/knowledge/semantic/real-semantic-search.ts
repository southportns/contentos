import { SemanticIndex } from './semantic-index';
import { SemanticRetriever } from './semantic-retriever';
import { EmbeddingStore } from './types';
import { KnowledgeUnit } from '../types';
import { EmbeddingProvider } from './types';
import { buildSemanticIndexFromStoredEmbeddings } from './build-semantic-index';

export interface RealSemanticSearchOptions {
  store: EmbeddingStore;
  knowledgeUnits: KnowledgeUnit[];
  provider: EmbeddingProvider;
}

export class RealSemanticSearch {
  private index: SemanticIndex | null = null;
  private retriever: SemanticRetriever | null = null;
  private store: EmbeddingStore;
  private knowledgeUnits: KnowledgeUnit[];
  private provider: EmbeddingProvider;

  constructor(options: RealSemanticSearchOptions) {
    this.store = options.store;
    this.knowledgeUnits = options.knowledgeUnits;
    this.provider = options.provider;
  }

  async initialize(): Promise<void> {
    const persistedIndex = await buildSemanticIndexFromStoredEmbeddings(
      this.store,
      this.knowledgeUnits,
      this.provider
    );

    if (persistedIndex) {
      this.index = persistedIndex;
      this.retriever = new SemanticRetriever(
        this.index,
        this.provider,
        this.knowledgeUnits
      );
    }
  }

  isReady(): boolean {
    return this.index !== null && this.retriever !== null;
  }

  async search(query: string, options?: { minSimilarity?: number; maxResults?: number }) {
    if (!this.retriever) {
      throw new Error('RealSemanticSearch not initialized. Call initialize() first.');
    }
    return this.retriever.retrieve({
      query,
      minSimilarity: options?.minSimilarity ?? 0.5,
      maxResults: options?.maxResults ?? 10,
    });
  }
}
