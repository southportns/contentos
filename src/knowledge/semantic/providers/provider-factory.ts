/**
 * P0.3.2-1 — Embedding Provider Factory
 *
 * Creates and configures embedding providers based on environment.
 * Default: MockEmbeddingProvider (for development and tests)
 * Production: AlibabaEmbeddingProvider (when EMBEDDING_PROVIDER=aliyun)
 *
 * This ensures:
 * - Tests never make real API calls
 * - Development works without API keys
 * - Production uses real cloud embeddings
 */

import type { EmbeddingProvider } from '../types';
import { MockEmbeddingProvider, EmbeddingProviderRegistry } from '../embedding-provider';
import { AlibabaEmbeddingProvider } from './aliyun-embedding-provider';

// ─── Provider Type ─────────────────────────────────────────────────────────

export type EmbeddingProviderType = 'mock' | 'aliyun';

// ─── Factory Function ──────────────────────────────────────────────────────

/**
 * Get the configured embedding provider based on environment.
 *
 * Environment variable:
 * - EMBEDDING_PROVIDER: 'mock' (default) | 'aliyun'
 *
 * @returns Configured EmbeddingProvider instance
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const providerType = (process.env.EMBEDDING_PROVIDER ?? 'mock') as EmbeddingProviderType;

  switch (providerType) {
    case 'aliyun':
      return new AlibabaEmbeddingProvider();
    case 'mock':
    default:
      return new MockEmbeddingProvider(64);
  }
}

/**
 * Create a specific provider by type.
 * Useful for testing and explicit provider selection.
 */
export function createProvider(type: EmbeddingProviderType): EmbeddingProvider {
  switch (type) {
    case 'aliyun':
      return new AlibabaEmbeddingProvider();
    case 'mock':
      return new MockEmbeddingProvider(64);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Get a provider registry with all available providers registered.
 * Mock is always available; aliyun is registered if API key is present.
 */
export function createProviderRegistry(): EmbeddingProviderRegistry {
  const registry = new EmbeddingProviderRegistry();

  // Always register mock
  registry.register(new MockEmbeddingProvider(64));

  // Register aliyun if API key is available
  if (process.env.DASHSCOPE_API_KEY) {
    try {
      registry.register(new AlibabaEmbeddingProvider());
    } catch {
      // Ignore — aliyun provider not available
    }
  }

  return registry;
}
