import { SemanticIndex } from './semantic-index';
import { EmbeddingStore, EmbeddingProvider, SemanticVector } from './types';
import { KnowledgeUnit } from '../types';

export interface BuildResult {
  index: SemanticIndex;
  stats: {
    total: number;
    loaded: number;
    missing: number;
  };
}

export async function buildSemanticIndexFromStoredEmbeddings(
  store: EmbeddingStore,
  knowledgeUnits: KnowledgeUnit[],
  provider: EmbeddingProvider
): Promise<SemanticIndex | null> {
  if (knowledgeUnits.length === 0) {
    return null;
  }

  const vectors: SemanticVector[] = [];
  let loaded = 0;
  let missing = 0;

  for (const ku of knowledgeUnits) {
    const stored = await store.get(ku.id);
    if (stored && stored.vector && stored.vector.length > 0) {
      vectors.push({
        knowledgeUnitId: ku.id,
        vector: stored.vector,
        model: stored.model,
        dimensions: stored.dimensions,
        provider: stored.provider,
      });
      loaded++;
    } else {
      missing++;
    }
  }

  if (vectors.length === 0) {
    return null;
  }

  const index = new SemanticIndex(vectors, provider);
  return index;
}
