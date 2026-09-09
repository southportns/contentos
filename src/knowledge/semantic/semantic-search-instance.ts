/**
 * P0.3.2-3 — Semantic Search Singleton Instance
 */

import { KNOWLEDGE_UNITS } from '../knowledge-data';
import { getEmbeddingProvider } from './providers';
import { RealSemanticSearch } from './real-semantic-search';

let instance: RealSemanticSearch | null = null;
let initializing: Promise<void> | null = null;

export async function getSemanticSearchInstance(): Promise<RealSemanticSearch> {
  if (instance && instance.isReady) {
    return instance;
  }

  if (initializing) {
    await initializing;
    if (instance && instance.isReady) {
      return instance;
    }
  }

  initializing = (async () => {
    const provider = getEmbeddingProvider();
    instance = new RealSemanticSearch({
      provider,
      knowledgeUnits: KNOWLEDGE_UNITS,
    });
    await instance.initialize();
  })();

  try {
    await initializing;
  } finally {
    initializing = null;
  }

  if (!instance || !instance.isReady) {
    throw new Error('Failed to initialize RealSemanticSearch');
  }

  return instance;
}

export function resetSemanticSearchInstance(): void {
  instance = null;
  initializing = null;
}
