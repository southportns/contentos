/**
 * P0.3.2-1 — Alibaba Cloud Embedding Provider
 *
 * Implements EmbeddingProvider using DashScope text-embedding-v4.
 * Server-side only — requires DASHSCOPE_API_KEY environment variable.
 *
 * Model: text-embedding-v4
 * Dimensions: 1024
 * Max batch size: 10 (DashScope API limit)
 */

import type { EmbeddingProvider } from '../types';

// ─── Error Types ───────────────────────────────────────────────────────────

/**
 * Error details for embedding provider failures.
 */
export interface EmbeddingProviderErrorDetails {
  provider: string;
  status?: number;
  retryable: boolean;
}

/**
 * Custom error class for embedding provider failures.
 * Never returns empty arrays — always throws with meaningful context.
 */
export class EmbeddingProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(details: EmbeddingProviderErrorDetails & { message: string }) {
    super(details.message);
    this.name = 'EmbeddingProviderError';
    this.provider = details.provider;
    this.status = details.status;
    this.retryable = details.retryable;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmbeddingProviderError);
    }
  }
}

// ─── Configuration ─────────────────────────────────────────────────────────

/** Default API endpoint for DashScope embedding */
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com';

/** Default model name */
const DEFAULT_MODEL = 'text-embedding-v4';

/** Expected embedding dimensions */
const EXPECTED_DIMENSIONS = 1024;

/** Request timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum texts per batch request (DashScope API limit) */
const MAX_BATCH_SIZE = 10;

// ─── Alibaba Embedding Provider ─────────────────────────────────────────────

/**
 * Alibaba Cloud DashScope Embedding Provider.
 *
 * Uses text-embedding-v4 model to generate 1024-dimensional vectors.
 * All API calls are server-side only — never expose API keys to the client.
 *
 * Features:
 * - Batch embedding with automatic chunking
 * - Response validation (dimensions, NaN, Infinity)
 * - Distinguishable error handling (HTTP 400/401/403/429/5xx)
 * - Configurable timeout
 *
 * Environment variables:
 * - DASHSCOPE_API_KEY: Required. DashScope API key
 * - EMBEDDING_MODEL: Optional. Model name (default: text-embedding-v4)
 * - EMBEDDING_DIMENSIONS: Optional. Expected dimensions (default: 1024)
 * - EMBEDDING_BASE_URL: Optional. API base URL (default: DashScope)
 * - EMBEDDING_TIMEOUT_MS: Optional. Timeout in ms (default: 30000)
 */
export class AlibabaEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'aliyun-text-embedding-v4';
  readonly dimensions: number;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
    baseUrl?: string;
    timeoutMs?: number;
  } = {}) {
    const apiKey = options.apiKey ?? process.env.DASHSCOPE_API_KEY ?? '';
    if (!apiKey) {
      throw new EmbeddingProviderError({
        provider: 'aliyun-text-embedding-v4',
        message:
          'DASHSCOPE_API_KEY is required. Set the environment variable or pass apiKey in options.',
        retryable: false,
      });
    }

    this.apiKey = apiKey;
    this.model = options.model ?? process.env.EMBEDDING_MODEL ?? DEFAULT_MODEL;
    this.dimensions =
      options.dimensions ??
      (process.env.EMBEDDING_DIMENSIONS
        ? parseInt(process.env.EMBEDDING_DIMENSIONS, 10)
        : EXPECTED_DIMENSIONS);
    this.baseUrl =
      options.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs =
      options.timeoutMs ??
      (process.env.EMBEDDING_TIMEOUT_MS
        ? parseInt(process.env.EMBEDDING_TIMEOUT_MS, 10)
        : DEFAULT_TIMEOUT_MS);
  }

  /**
   * Embed a single text into a vector.
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new EmbeddingProviderError({
        provider: this.id,
        message: 'Cannot embed empty text.',
        retryable: false,
      });
    }

    const vectors = await this.embedBatch([text]);
    return vectors[0];
  }

  /**
   * Embed multiple texts into vectors.
   * Uses batch API with automatic chunking for large inputs.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Validate all inputs are non-empty
    for (let i = 0; i < texts.length; i++) {
      if (!texts[i] || texts[i].trim().length === 0) {
        throw new EmbeddingProviderError({
          provider: this.id,
          message: `Cannot embed empty text at index ${i}.`,
          retryable: false,
        });
      }
    }

    // Process in chunks if needed
    if (texts.length <= MAX_BATCH_SIZE) {
      return this.embedChunk(texts);
    }

    // Chunk and process
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const chunk = texts.slice(i, i + MAX_BATCH_SIZE);
      const chunkResults = await this.embedChunk(chunk);
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Call DashScope embedding API for a single chunk.
   */
  private async embedChunk(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/api/v1/services/embeddings/text-embedding/text-embedding`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: {
            texts,
          },
        }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new EmbeddingProviderError({
            provider: this.id,
            message: `Request timeout after ${this.timeoutMs}ms`,
            retryable: true,
          });
        }
        throw new EmbeddingProviderError({
          provider: this.id,
          message: `Network error: ${error.message}`,
          retryable: true,
        });
      }
      throw new EmbeddingProviderError({
        provider: this.id,
        message: 'Unknown network error',
        retryable: true,
      });
    }

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      await this.handleHttpError(response);
    }

    // Parse response
    let data: unknown;
    try {
      data = await response.json();
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Unknown JSON parse error';
      throw new EmbeddingProviderError({
        provider: this.id,
        status: response.status,
        message: `Invalid JSON response: ${msg}`,
        retryable: false,
      });
    }

    // Extract embeddings from response
    return this.extractEmbeddings(data, texts.length);
  }

  /**
   * Handle HTTP error responses with specific error types.
   */
  private async handleHttpError(response: Response): Promise<never> {
    const status = response.status;
    let responseBody = '';
    try {
      responseBody = await response.text();
    } catch {
      // Ignore read errors
    }

    let message: string;
    let retryable: boolean;

    switch (status) {
      case 400:
        message = `Bad request: ${responseBody}`;
        retryable = false;
        break;
      case 401:
        message = 'Authentication failed. Check DASHSCOPE_API_KEY.';
        retryable = false;
        break;
      case 403:
        message = 'Forbidden. API key may lack permission for this model.';
        retryable = false;
        break;
      case 429:
        message = 'Rate limit exceeded. Please retry after cooldown.';
        retryable = true;
        break;
      case 500:
        message = `Server error (500): ${responseBody}`;
        retryable = true;
        break;
      case 502:
        message = 'Bad gateway. DashScope service temporarily unavailable.';
        retryable = true;
        break;
      case 503:
        message = 'Service unavailable. DashScope may be under maintenance.';
        retryable = true;
        break;
      default:
        message = `HTTP ${status}: ${responseBody}`;
        retryable = status >= 500;
    }

    throw new EmbeddingProviderError({
      provider: this.id,
      status,
      message,
      retryable,
    });
  }

  /**
   * Extract and validate embeddings from API response.
   *
   * Expected response format:
   * {
   *   "output": {
   *     "embeddings": [
   *       { "text_index": 0, "embedding": [0.1, 0.2, ...] },
   *       ...
   *     ]
   *   },
   *   "usage": { "total_tokens": 123 },
   *   "request_id": "..."
   * }
   */
  private extractEmbeddings(data: unknown, expectedCount: number): number[][] {
    if (!data || typeof data !== 'object') {
      throw new EmbeddingProviderError({
        provider: this.id,
        message: 'Response is not a valid object.',
        retryable: false,
      });
    }

    const obj = data as Record<string, unknown>;

    const output = obj.output;
    if (!output || typeof output !== 'object') {
      throw new EmbeddingProviderError({
        provider: this.id,
        message: 'Missing "output" field in response.',
        retryable: false,
      });
    }

    const embeddings = (output as Record<string, unknown>).embeddings;
    if (!Array.isArray(embeddings)) {
      throw new EmbeddingProviderError({
        provider: this.id,
        message: 'Missing "embeddings" array in response output.',
        retryable: false,
      });
    }

    if (embeddings.length !== expectedCount) {
      throw new EmbeddingProviderError({
        provider: this.id,
        message: `Expected ${expectedCount} embeddings, got ${embeddings.length}.`,
        retryable: false,
      });
    }

    // Sort by text_index to ensure correct order
    const sorted = [...embeddings].sort((a, b) => {
      const aIndex = typeof a === 'object' && a !== null ? (a as Record<string, unknown>).text_index : 0;
      const bIndex = typeof b === 'object' && b !== null ? (b as Record<string, unknown>).text_index : 0;
      return (aIndex as number) - (bIndex as number);
    });

    return sorted.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new EmbeddingProviderError({
          provider: this.id,
          message: `Embedding at index ${index} is not an object.`,
          retryable: false,
        });
      }

      const vector = (item as Record<string, unknown>).embedding;
      if (!Array.isArray(vector)) {
        throw new EmbeddingProviderError({
          provider: this.id,
          message: `Embedding at index ${index} is missing "embedding" array.`,
          retryable: false,
        });
      }

      return this.validateVector(vector, index);
    });
  }

  /**
   * Validate a single embedding vector.
   */
  private validateVector(vector: unknown[], index: number): number[] {
    // Check dimensions
    if (vector.length !== this.dimensions) {
      throw new EmbeddingProviderError({
        provider: this.id,
        message: `Vector at index ${index} has ${vector.length} dimensions, expected ${this.dimensions}.`,
        retryable: false,
      });
    }

    // Validate each value is a finite number
    for (let i = 0; i < vector.length; i++) {
      const v = vector[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new EmbeddingProviderError({
          provider: this.id,
          message: `Invalid value at index ${index}[${i}]: ${v} (must be finite number).`,
          retryable: false,
        });
      }
    }

    return vector as number[];
  }
}
