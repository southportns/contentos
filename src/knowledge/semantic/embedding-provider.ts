/**
 * P0.3.1 — Embedding Providers
 *
 * EmbeddingProvider interface and mock implementation.
 * Real provider implementations are deferred to P0.3.2.
 */

import type { EmbeddingProvider } from './types';

// ─── Mock Embedding Provider ────────────────────────────────────────────────

/**
 * Deterministic mock embedding provider for testing and architecture validation.
 *
 * Features:
 * - Deterministic: same input always produces same output
 * - Fixed dimensions
 * - No network dependency
 * - No API key required
 *
 * The mock uses a simple hash-based approach to generate stable vectors.
 * This is NOT a real semantic model — it only validates the Provider → Index →
 * Similarity → Ranking → Result pipeline works correctly.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'mock';
  readonly dimensions: number;

  constructor(dimensions: number = 64) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    return this.generateVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.generateVector(text));
  }

  /**
   * Generate a deterministic vector from text using a simple hash function.
   * This is NOT semantic — it only validates the pipeline structure.
   */
  private generateVector(text: string): number[] {
    const vector: number[] = new Array(this.dimensions).fill(0);

    // Use a simple hash-based approach to generate stable values
    // We incorporate character codes to produce different vectors for different texts
    for (let i = 0; i < this.dimensions; i++) {
      let hash = 0;
      for (let j = 0; j < text.length; j++) {
        // Combine character code with position and dimension index
        hash = ((hash << 5) - hash + text.charCodeAt(j) + i * 31 + j * 17) | 0;
      }
      // Normalize to [-1, 1] range using sine for deterministic output
      vector[i] = Math.sin(hash);
    }

    // Normalize to unit vector (L2 normalization)
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] = vector[i] / magnitude;
      }
    }

    return vector;
  }
}

// ─── Provider Registry (Future Extensibility) ──────────────────────────────

/**
 * Registry for embedding providers.
 * In P0.3.2, real providers can be registered here.
 */
export class EmbeddingProviderRegistry {
  private providers: Map<string, EmbeddingProvider> = new Map();

  register(provider: EmbeddingProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): EmbeddingProvider | undefined {
    return this.providers.get(id);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): string[] {
    return [...this.providers.keys()];
  }

  clear(): void {
    this.providers.clear();
  }
}

// ─── Default Instance ──────────────────────────────────────────────────────

/**
 * Default mock provider for architecture validation and tests.
 */
export const defaultMockProvider = new MockEmbeddingProvider(64);

/**
 * Default provider registry with mock pre-registered.
 */
export const defaultRegistry = new EmbeddingProviderRegistry();
defaultRegistry.register(defaultMockProvider);