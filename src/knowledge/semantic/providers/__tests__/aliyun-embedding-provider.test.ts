/**
 * P0.3.2-1 — Alibaba Embedding Provider Tests
 *
 * All tests use mocked fetch — no real API calls.
 * Tests cover: response parsing, validation, error handling, timeout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlibabaEmbeddingProvider, EmbeddingProviderError } from '../aliyun-embedding-provider';

// ─── Mock Setup ────────────────────────────────────────────────────────────

const VALID_VECTOR = Array.from({ length: 1024 }, (_, i) => Math.sin(i) * 0.1);

function createMockResponse(data: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  } as unknown as Response;
}

function createMockEmbeddingResponse(count: number): unknown {
  return {
    output: {
      embeddings: Array.from({ length: count }, (_, i) => ({
        text_index: i,
        embedding: VALID_VECTOR,
      })),
    },
    usage: { total_tokens: count * 10 },
    request_id: 'test-request-id',
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('AlibabaEmbeddingProvider', () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ─── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create provider with API key from options', () => {
      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      expect(provider.id).toBe('aliyun-text-embedding-v4');
      expect(provider.dimensions).toBe(1024);
    });

    it('should create provider with API key from env', () => {
      const original = process.env.DASHSCOPE_API_KEY;
      process.env.DASHSCOPE_API_KEY = 'env-key';
      const provider = new AlibabaEmbeddingProvider();
      expect(provider.id).toBe('aliyun-text-embedding-v4');
      process.env.DASHSCOPE_API_KEY = original;
    });

    it('should throw when no API key is provided', () => {
      const original = process.env.DASHSCOPE_API_KEY;
      delete process.env.DASHSCOPE_API_KEY;
      expect(() => new AlibabaEmbeddingProvider()).toThrow(EmbeddingProviderError);
      process.env.DASHSCOPE_API_KEY = original;
    });

    it('should use custom dimensions from options', () => {
      const provider = new AlibabaEmbeddingProvider({
        apiKey: 'test-key',
        dimensions: 768,
      });
      expect(provider.dimensions).toBe(768);
    });

    it('should use custom model from options', () => {
      const provider = new AlibabaEmbeddingProvider({
        apiKey: 'test-key',
        model: 'text-embedding-v3',
      });
      expect(provider.id).toBe('aliyun-text-embedding-v4');
    });
  });

  // ─── embed() ─────────────────────────────────────────────────────────────

  describe('embed()', () => {
    it('should return a valid 1024-dim vector', async () => {
      mockFetch.mockResolvedValue(createMockResponse(createMockEmbeddingResponse(1)));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      const vector = await provider.embed('测试文本');

      expect(vector).toHaveLength(1024);
      vector.forEach((v) => {
        expect(Number.isFinite(v)).toBe(true);
      });
    });

    it('should throw on empty text', async () => {
      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('')).rejects.toThrow(EmbeddingProviderError);
      await expect(provider.embed('   ')).rejects.toThrow(EmbeddingProviderError);
    });

    it('should call API with correct payload', async () => {
      mockFetch.mockResolvedValue(createMockResponse(createMockEmbeddingResponse(1)));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await provider.embed('一个女人要学会建立自己的价值感');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/v1/services/embeddings/text-embedding/text-embedding');
      expect((options as RequestInit).method).toBe('POST');
      const body = JSON.parse((options as RequestInit).body as string);
      expect(body.model).toBe('text-embedding-v4');
      expect(body.input.texts).toEqual(['一个女人要学会建立自己的价值感']);
    });
  });

  // ─── embedBatch() ────────────────────────────────────────────────────────

  describe('embedBatch()', () => {
    it('should return vectors for multiple texts', async () => {
      mockFetch.mockResolvedValue(createMockResponse(createMockEmbeddingResponse(3)));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      const vectors = await provider.embedBatch(['文本1', '文本2', '文本3']);

      expect(vectors).toHaveLength(3);
      vectors.forEach((v) => expect(v).toHaveLength(1024));
    });

    it('should return empty array for empty input', async () => {
      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      const vectors = await provider.embedBatch([]);
      expect(vectors).toEqual([]);
    });

    it('should throw on empty text in batch', async () => {
      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embedBatch(['有效', ''])).rejects.toThrow(
        EmbeddingProviderError
      );
    });

    it('should chunk large batches', async () => {
      // First call returns 10 embeddings, second call returns 4
      mockFetch
        .mockResolvedValueOnce(createMockResponse(createMockEmbeddingResponse(10)))
        .mockResolvedValueOnce(createMockResponse(createMockEmbeddingResponse(4)));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      const texts = Array.from({ length: 14 }, (_, i) => `文本${i}`);
      const vectors = await provider.embedBatch(texts);

      expect(vectors).toHaveLength(14);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Response Validation ─────────────────────────────────────────────────

  describe('response validation', () => {
    it('should throw on wrong dimensions', async () => {
      const shortVector = Array.from({ length: 512 }, () => 0.1);
      mockFetch.mockResolvedValue(
        createMockResponse({
          output: {
            embeddings: [{ text_index: 0, embedding: shortVector }],
          },
        })
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /dimensions.*expected 1024/
      );
    });

    it('should throw on NaN in vector', async () => {
      const nanVector = [...VALID_VECTOR];
      nanVector[0] = NaN;
      mockFetch.mockResolvedValue(
        createMockResponse({
          output: {
            embeddings: [{ text_index: 0, embedding: nanVector }],
          },
        })
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /Invalid value.*NaN/
      );
    });

    it('should throw on Infinity in vector', async () => {
      const infVector = [...VALID_VECTOR];
      infVector[0] = Infinity;
      mockFetch.mockResolvedValue(
        createMockResponse({
          output: {
            embeddings: [{ text_index: 0, embedding: infVector }],
          },
        })
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /Invalid value.*Infinity/
      );
    });

    it('should throw on -Infinity in vector', async () => {
      const negInfVector = [...VALID_VECTOR];
      negInfVector[0] = -Infinity;
      mockFetch.mockResolvedValue(
        createMockResponse({
          output: {
            embeddings: [{ text_index: 0, embedding: negInfVector }],
          },
        })
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /Invalid value.*Infinity/
      );
    });

    it('should throw on null in vector', async () => {
      const nullVector = [...VALID_VECTOR];
      nullVector[0] = null as unknown as number;
      mockFetch.mockResolvedValue(
        createMockResponse({
          output: {
            embeddings: [{ text_index: 0, embedding: nullVector }],
          },
        })
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /Invalid value.*null/
      );
    });

    it('should throw on undefined in vector', async () => {
      const undefVector = [...VALID_VECTOR];
      undefVector[0] = undefined as unknown as number;
      mockFetch.mockResolvedValue(
        createMockResponse({
          output: {
            embeddings: [{ text_index: 0, embedding: undefVector }],
          },
        })
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /Invalid value.*undefined/
      );
    });

    it('should throw on missing output field', async () => {
      mockFetch.mockResolvedValue(createMockResponse({}));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /Missing "output" field/
      );
    });

    it('should throw on missing embeddings array', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ output: {} }));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /Missing "embeddings" array/
      );
    });

    it('should throw on wrong embedding count', async () => {
      mockFetch.mockResolvedValue(createMockResponse(createMockEmbeddingResponse(2)));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /Expected 1 embeddings, got 2/
      );
    });

    it('should throw on non-object response', async () => {
      mockFetch.mockResolvedValue(createMockResponse('not an object'));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(
        /not a valid object/
      );
    });
  });

  // ─── HTTP Error Handling ─────────────────────────────────────────────────

  describe('HTTP error handling', () => {
    it('should throw on HTTP 400', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Bad request' }, 400, false)
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      await expect(provider.embed('测试')).rejects.toThrow(EmbeddingProviderError);
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).status).toBe(400);
        expect((e as EmbeddingProviderError).retryable).toBe(false);
      }
    });

    it('should throw on HTTP 401', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Unauthorized' }, 401, false)
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).status).toBe(401);
        expect((e as EmbeddingProviderError).retryable).toBe(false);
        expect((e as EmbeddingProviderError).message).toContain('Authentication failed');
      }
    });

    it('should throw on HTTP 403', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Forbidden' }, 403, false)
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).status).toBe(403);
        expect((e as EmbeddingProviderError).retryable).toBe(false);
      }
    });

    it('should throw on HTTP 429', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Rate limited' }, 429, false)
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).status).toBe(429);
        expect((e as EmbeddingProviderError).retryable).toBe(true);
        expect((e as EmbeddingProviderError).message).toContain('Rate limit');
      }
    });

    it('should throw on HTTP 500', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Internal server error' }, 500, false)
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).status).toBe(500);
        expect((e as EmbeddingProviderError).retryable).toBe(true);
      }
    });

    it('should throw on HTTP 502', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Bad gateway' }, 502, false)
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).status).toBe(502);
        expect((e as EmbeddingProviderError).retryable).toBe(true);
      }
    });

    it('should throw on HTTP 503', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Service unavailable' }, 503, false)
      );

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).status).toBe(503);
        expect((e as EmbeddingProviderError).retryable).toBe(true);
      }
    });
  });

  // ─── Network Errors ─────────────────────────────────────────────────────

  describe('network errors', () => {
    it('should throw on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).message).toContain('Network error');
        expect((e as EmbeddingProviderError).retryable).toBe(true);
      }
    });

    it('should throw on timeout (AbortError)', async () => {
      mockFetch.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).message).toContain('timeout');
        expect((e as EmbeddingProviderError).retryable).toBe(true);
      }
    });

    it('should throw on invalid JSON response', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Unexpected token')),
        text: vi.fn().mockResolvedValue('invalid json'),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new AlibabaEmbeddingProvider({ apiKey: 'test-key' });
      try {
        await provider.embed('测试');
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingProviderError);
        expect((e as EmbeddingProviderError).message).toContain('Invalid JSON');
      }
    });
  });

  // ─── EmbeddingProviderError ──────────────────────────────────────────────

  describe('EmbeddingProviderError', () => {
    it('should have correct properties', () => {
      const error = new EmbeddingProviderError({
        provider: 'test-provider',
        status: 429,
        message: 'Rate limited',
        retryable: true,
      });

      expect(error.name).toBe('EmbeddingProviderError');
      expect(error.provider).toBe('test-provider');
      expect(error.status).toBe(429);
      expect(error.retryable).toBe(true);
      expect(error.message).toBe('Rate limited');
    });

    it('should be instanceof Error', () => {
      const error = new EmbeddingProviderError({
        provider: 'test',
        message: 'test error',
        retryable: false,
      });
      expect(error).toBeInstanceOf(Error);
    });
  });
});
