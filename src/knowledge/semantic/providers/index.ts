/**
 * P0.3.2-1 — Embedding Providers Public API
 */

export {
  AlibabaEmbeddingProvider,
  EmbeddingProviderError,
} from './aliyun-embedding-provider';

export type { EmbeddingProviderErrorDetails } from './aliyun-embedding-provider';

export {
  getEmbeddingProvider,
  createProvider,
  createProviderRegistry,
} from './provider-factory';

export type { EmbeddingProviderType } from './provider-factory';
