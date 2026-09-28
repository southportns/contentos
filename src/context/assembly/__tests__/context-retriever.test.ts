import { describe, it, expect } from 'vitest';
import { KnowledgeRetriever, knowledgeContextToObject } from '../context-retriever';
import { createKnowledgeContext } from '../../context-factory';
import type { KnowledgeContext } from '@/knowledge/context/knowledge-context-types';
import type { RetrievalRequest } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function makeKnowledgeContext(): KnowledgeContext {
  return {
    query: 'test query',
    retrieval: {
      method: 'semantic',
      threshold: 0.35,
      topK: 5,
      includeCandidates: true,
      retrievedCount: 1,
    },
    selectedCount: 1,
    primaryKnowledge: [
      {
        knowledgeId: 'ku_1',
        name: 'Test Knowledge',
        text: 'Knowledge text',
        category: 'hook' as never,
        knowledgeLevel: 'surface_technique' as never,
        confidence: 'high' as never,
        status: 'validated' as never,
        similarity: 0.9,
        retrievalReason: 'Test',
        evidenceCount: 2,
      },
    ],
    supportingKnowledge: [],
    evidence: [],
    constraints: {
      hasCandidates: false,
      maxItems: 5,
      wasTruncated: false,
    },
    metadata: {
      version: '1.0',
      createdAt: new Date().toISOString(),
      source: 'test',
    },
  };
}

function makeRetrievalRequest(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    kind: 'knowledge',
    query: 'test',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContextRetriever', () => {
  describe('KnowledgeRetriever', () => {
    it('should have kind = knowledge', () => {
      const retriever = new KnowledgeRetriever();
      expect(retriever.kind).toBe('knowledge');
    });

    it('should return fallback by default', async () => {
      const retriever = new KnowledgeRetriever({
        fallback: [
          createKnowledgeContext(makeKnowledgeContext()),
        ],
      });

      const result = await retriever.retrieve(makeRetrievalRequest());
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('knowledge');
    });

    it('should return empty array when no retriever or fallback', async () => {
      const retriever = new KnowledgeRetriever();
      const result = await retriever.retrieve(makeRetrievalRequest());
      expect(result).toHaveLength(0);
    });

    it('should use custom retriever when provided', async () => {
      const customCtx = createKnowledgeContext(makeKnowledgeContext());
      const retriever = new KnowledgeRetriever({
        retriever: async (query: string) => {
          expect(query).toBe('test');
          return [customCtx];
        },
      });

      const result = await retriever.retrieve(makeRetrievalRequest({ query: 'test' }));
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('knowledge');
    });

    it('should gracefully handle retriever errors', async () => {
      const retriever = new KnowledgeRetriever({
        retriever: async () => {
          throw new Error('Retrieval failed');
        },
        fallback: [
          createKnowledgeContext(makeKnowledgeContext()),
        ],
      });

      const result = await retriever.retrieve(makeRetrievalRequest());
      // Should return fallback, not throw
      expect(result).toHaveLength(1);
    });

    it('should always return ContextObjects (adapted)', async () => {
      const kc = makeKnowledgeContext();
      const retriever = new KnowledgeRetriever({
        retriever: async () => [createKnowledgeContext(kc)],
      });

      const result = await retriever.retrieve(makeRetrievalRequest());
      expect(result[0].kind).toBe('knowledge');
      expect(result[0].type).toBe('knowledge_unit');
      expect(result[0].payload).toBeDefined();
    });
  });

  describe('knowledgeContextToObject', () => {
    it('should convert KnowledgeContext to ContextObject', () => {
      const kc = makeKnowledgeContext();
      const ctx = knowledgeContextToObject(kc, 'test_source');

      expect(ctx.kind).toBe('knowledge');
      expect(ctx.payload).toEqual(kc);
      expect(ctx.provenance.source).toBe('test_source');
    });

    it('should use default source when not provided', () => {
      const kc = makeKnowledgeContext();
      const ctx = knowledgeContextToObject(kc);

      expect(ctx.provenance.source).toBe('knowledge_retrieval');
    });

    it('should set sourceType to knowledge', () => {
      const kc = makeKnowledgeContext();
      const ctx = knowledgeContextToObject(kc);

      expect(ctx.provenance.sourceType).toBe('knowledge');
    });
  });
});
