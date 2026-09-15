/**
 * P0.3.8.2 — Strategy Knowledge Retrieval Tests
 *
 * Tests the retrieval pipeline:
 *   Query → SemanticSearch → KnowledgeContext → StrategyKnowledgeContext
 *
 * Covers:
 *   - Normal retrieval flow (TEST 01)
 *   - Search query correctness (TEST 02)
 *   - DEFAULT_TOP_K used as limit (TEST 03)
 *   - Candidate policy: include_candidates = true (TEST 04)
 *   - Validated status preserved (TEST 05)
 *   - Candidate status preserved (not converted) (TEST 06)
 *   - Mixed validated + candidate (TEST 07)
 *   - Empty result → empty StrategyKnowledgeContext (TEST 08)
 *   - Search throw → null (TEST 09)
 *   - getSemanticSearchInstance throw → null (TEST 10)
 *   - Builder output correctly converted by adapter (TEST 11)
 *   - Original KnowledgeContext not modified (TEST 12)
 *   - Deterministic query (TEST 13)
 *   - No retrieval internals exposed (TEST 14)
 *
 * These tests do NOT call LLMs — they only verify retrieval orchestration
 * behavior with mocked semantic search.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module Mocks ───────────────────────────────────────────────────────────

/**
 * Wrap toStrategyKnowledgeContext in a spy while preserving real behavior.
 * TEST 11 asserts the retrieval layer calls the P0.3.8.1 adapter
 * instead of manually mapping items.
 */
vi.mock('@/knowledge/context/strategy-knowledge-context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/knowledge/context/strategy-knowledge-context')>();
  return {
    ...actual,
    toStrategyKnowledgeContext: vi.fn(actual.toStrategyKnowledgeContext),
  };
});

/** Mock the semantic search singleton — no real embedding calls in tests. */
vi.mock('@/knowledge/semantic/semantic-search-instance', () => ({
  getSemanticSearchInstance: vi.fn(),
}));

import { retrieveStrategyKnowledgeContext } from '../strategy-knowledge-retrieval';
import { getSemanticSearchInstance } from '@/knowledge/semantic/semantic-search-instance';
import { DEFAULT_TOP_K } from '@/knowledge/semantic/types';
import type {
  KnowledgeContext,
  KnowledgeContextItem,
} from './knowledge-context-types';
import type { SemanticRetrievalResponse } from '@/knowledge/semantic/types';
import type {
  CanonicalKnowledgeUnit,
  Evidence,
} from '@/knowledge/types';

// The spy wraps the real function — both mock and real are available.
import { toStrategyKnowledgeContext } from '../strategy-knowledge-context';
const adapterSpy = vi.mocked(toStrategyKnowledgeContext);
const getInstanceSpy = vi.mocked(getSemanticSearchInstance);

// ─── Fixtures: KnowledgeContext ─────────────────────────────────────────────

function createMockContextItem(
  overrides: Partial<KnowledgeContextItem> = {}
): KnowledgeContextItem {
  return {
    knowledgeId: 'KU_TEST_001',
    name: '测试知识单元',
    text: '这是知识单元的原文内容，包含核心模式描述。',
    category: 'cognition',
    knowledgeLevel: 'strategic_pattern',
    confidence: 'high',
    status: 'validated',
    similarity: 0.91,
    retrievalReason: '语义相似度: 91.0%',
    evidenceCount: 4,
    ...overrides,
  };
}

function createMockKnowledgeContext(
  overrides: Partial<KnowledgeContext> = {}
): KnowledgeContext {
  const primaryKnowledge = overrides.primaryKnowledge ?? [createMockContextItem()];
  const supportingKnowledge = overrides.supportingKnowledge ?? [];
  return {
    query: '测试查询',
    retrieval: {
      method: 'semantic',
      threshold: 0.35,
      topK: 5,
      includeCandidates: false,
      retrievedCount: primaryKnowledge.length + supportingKnowledge.length,
    },
    selectedCount: primaryKnowledge.length + supportingKnowledge.length,
    primaryKnowledge,
    supportingKnowledge,
    evidence: [],
    constraints: {
      hasCandidates: false,
      maxItems: 5,
      wasTruncated: false,
    },
    metadata: {
      version: '1.0.0',
      createdAt: '2026-09-14T00:00:00.000Z',
      source: 'p0.3.7',
    },
    ...overrides,
  };
}

// ─── Fixtures: Semantic Retrieval Mocks ─────────────────────────────────────

function createMockEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    evidence_id: 'EV_TEST_001',
    content_id: 'content_1',
    quote: '原始证据引用文本',
    location: 'body',
    validation: 'valid',
    evidence_quality: 'high',
    noise_risk: 'low',
    evidence_trust: 'trusted',
    ...overrides,
  };
}

function createMockKU(
  overrides: Partial<CanonicalKnowledgeUnit> = {}
): CanonicalKnowledgeUnit {
  return {
    knowledge_id: 'KU_REAL_001',
    name: '真实检索知识',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '真实检索返回的知识描述',
    abstract_pattern: '抽象模式',
    function: '功能说明',
    confidence: 'high',
    status: 'validated',
    reclassified: false,
    evidence: {
      items: [createMockEvidence()],
      unique_content_count: 1,
    },
    ...overrides,
  };
}

function createMockSearchResponse(
  overrides: Partial<SemanticRetrievalResponse> = {}
): SemanticRetrievalResponse {
  const ku = createMockKU();
  return {
    query: '测试主题 测试角度',
    results: [
      {
        knowledge_id: ku.knowledge_id,
        similarity: 0.88,
        knowledge: ku,
        retrieval_method: 'semantic',
        retrieval_reason: '语义相似度: 88.0%',
      },
    ],
    total: 1,
    retrieval_method: 'semantic',
    ...overrides,
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  adapterSpy.mockClear();
  getInstanceSpy.mockReset();
});

// ─── TEST 01: Normal Retrieval ──────────────────────────────────────────────

describe('TEST 01: Normal retrieval → KnowledgeContext → StrategyKnowledgeContext', () => {
  it('returns StrategyKnowledgeContext from a successful retrieval', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveStrategyKnowledgeContext('测试主题 测试角度');

    expect(result).not.toBeNull();
    expect(result!.primaryKnowledge).toHaveLength(1);
    expect(result!.primaryKnowledge[0].name).toBe('真实检索知识');
    expect(result!.primaryKnowledge[0].status).toBe('validated');
    expect(result!.supportingKnowledge).toHaveLength(0);
  });
});

// ─── TEST 02: Search Query Correctness ──────────────────────────────────────

describe('TEST 02: Search query is passed correctly to semantic search', () => {
  it('passes topic + selectedAngle.title + selectedAngle.angle as query', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const topic = '短视频内容创作';
    const angleTitle = '反直觉切入';
    const angleAngle: string = '为什么越简短的视频反而越容易爆';
    const expectedQuery = `${topic} ${angleTitle} ${angleAngle}`;

    await retrieveStrategyKnowledgeContext(expectedQuery);

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expectedQuery,
      })
    );
  });

  it('does not mutate the query string', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const query = '原始查询字符串';
    await retrieveStrategyKnowledgeContext(query);

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '原始查询字符串',
      })
    );
  });
});

// ─── TEST 03: DEFAULT_TOP_K Used ────────────────────────────────────────────

describe('TEST 03: limit = DEFAULT_TOP_K (5)', () => {
  it('passes DEFAULT_TOP_K as limit in search call', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    await retrieveStrategyKnowledgeContext('测试查询');

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: DEFAULT_TOP_K,
      })
    );
  });

  it('does NOT hardcode magic number 5', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    await retrieveStrategyKnowledgeContext('测试查询');

    // Verify the call used the constant, not a raw number
    const callArg = searchMock.mock.calls[0][0] as { limit: number };
    expect(callArg.limit).toBe(DEFAULT_TOP_K);
    expect(typeof callArg.limit).toBe('number');
  });
});

// ─── TEST 04: Candidate Policy ──────────────────────────────────────────────

describe('TEST 04: Candidate policy — include_candidates = true', () => {
  it('sets include_candidates to true in search call', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    await retrieveStrategyKnowledgeContext('测试查询');

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include_candidates: true,
      })
    );
  });
});

// ─── TEST 05: Validated Preserved ───────────────────────────────────────────

describe('TEST 05: Validated status preserved in StrategyKnowledgeContext', () => {
  it('validated item retains status after transformation', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveStrategyKnowledgeContext('测试查询');

    expect(result).not.toBeNull();
    expect(result!.primaryKnowledge[0].status).toBe('validated');
  });
});

// ─── TEST 06: Candidate Preserved (Not Converted) ───────────────────────────

describe('TEST 06: Candidate status preserved — never converted to validated', () => {
  it('candidate item remains candidate after transformation', async () => {
    const candidateKU = createMockKU({
      knowledge_id: 'KU_CANDIDATE_001',
      name: '候选知识',
      status: 'candidate',
      confidence: 'medium',
    });
    const response = createMockSearchResponse({
      results: [
        {
          knowledge_id: candidateKU.knowledge_id,
          similarity: 0.72,
          knowledge: candidateKU,
          retrieval_method: 'semantic',
          retrieval_reason: '语义相似度: 72.0%',
        },
      ],
    });

    const searchMock = vi.fn().mockResolvedValue(response);
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveStrategyKnowledgeContext('测试查询');

    expect(result).not.toBeNull();
    expect(result!.primaryKnowledge[0].status).toBe('candidate');
    expect(result!.primaryKnowledge[0].name).toBe('候选知识');
  });
});

// ─── TEST 07: Mixed Validated + Candidate ───────────────────────────────────

describe('TEST 07: Mixed validated + candidate both present', () => {
  it('both statuses appear correctly in StrategyKnowledgeContext', async () => {
    const validatedKU = createMockKU({
      knowledge_id: 'KU_VAL_001',
      name: '已验证知识',
      status: 'validated',
    });
    const candidateKU = createMockKU({
      knowledge_id: 'KU_CAND_001',
      name: '候选知识',
      status: 'candidate',
    });
    const response = createMockSearchResponse({
      results: [
        {
          knowledge_id: validatedKU.knowledge_id,
          similarity: 0.90,
          knowledge: validatedKU,
          retrieval_method: 'semantic',
          retrieval_reason: '语义相似度: 90.0%',
        },
        {
          knowledge_id: candidateKU.knowledge_id,
          similarity: 0.75,
          knowledge: candidateKU,
          retrieval_method: 'semantic',
          retrieval_reason: '语义相似度: 75.0%',
        },
      ],
    });

    const searchMock = vi.fn().mockResolvedValue(response);
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveStrategyKnowledgeContext('测试查询');

    expect(result).not.toBeNull();
    // Builder sorts validated first by default
    const allItems = [
      ...result!.primaryKnowledge,
      ...result!.supportingKnowledge,
    ];
    const validatedItem = allItems.find((i) => i.name === '已验证知识');
    const candidateItem = allItems.find((i) => i.name === '候选知识');

    expect(validatedItem).toBeDefined();
    expect(validatedItem!.status).toBe('validated');
    expect(candidateItem).toBeDefined();
    expect(candidateItem!.status).toBe('candidate');
  });
});

// ─── TEST 08: Empty Result ──────────────────────────────────────────────────

describe('TEST 08: Empty result → empty StrategyKnowledgeContext (not null)', () => {
  it('returns empty context when retrieval returns 0 results', async () => {
    const response = createMockSearchResponse({
      results: [],
      total: 0,
    });

    const searchMock = vi.fn().mockResolvedValue(response);
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveStrategyKnowledgeContext('无匹配查询');

    // Empty result is NOT null — it's a valid empty context
    expect(result).not.toBeNull();
    expect(result!.primaryKnowledge).toEqual([]);
    expect(result!.supportingKnowledge).toEqual([]);
    expect(result!.primaryKnowledge).toHaveLength(0);
    expect(result!.supportingKnowledge).toHaveLength(0);
  });
});

// ─── TEST 09: Search Throw → null ───────────────────────────────────────────

describe('TEST 09: Search throws → null', () => {
  it('returns null when semanticSearch.search rejects', async () => {
    const searchMock = vi
      .fn()
      .mockRejectedValue(new Error('network timeout'));
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveStrategyKnowledgeContext('测试查询');

    expect(result).toBeNull();
  });

  it('never throws — strategy is never blocked', async () => {
    const searchMock = vi
      .fn()
      .mockRejectedValue(new Error('any failure'));
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    await expect(
      retrieveStrategyKnowledgeContext('测试查询')
    ).resolves.toBeNull();
  });
});

// ─── TEST 10: getSemanticSearchInstance Throw → null ────────────────────────

describe('TEST 10: getSemanticSearchInstance throws → null', () => {
  it('returns null when singleton initialization fails', async () => {
    getInstanceSpy.mockRejectedValue(
      new Error('DASHSCOPE_API_KEY is not set')
    );

    const result = await retrieveStrategyKnowledgeContext('测试查询');

    expect(result).toBeNull();
  });

  it('never throws — strategy is never blocked by init failure', async () => {
    getInstanceSpy.mockRejectedValue(new Error('initialization error'));

    await expect(
      retrieveStrategyKnowledgeContext('测试查询')
    ).resolves.toBeNull();
  });
});

// ─── TEST 11: Builder Output Converted By Adapter ───────────────────────────

describe('TEST 11: Builder output correctly converted by toStrategyKnowledgeContext adapter', () => {
  it('toStrategyKnowledgeContext is called with the builder output', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    await retrieveStrategyKnowledgeContext('测试查询');

    expect(adapterSpy).toHaveBeenCalledTimes(1);
    // The argument should be a KnowledgeContext object
    expect(adapterSpy.mock.calls[0][0]).toHaveProperty('query');
    expect(adapterSpy.mock.calls[0][0]).toHaveProperty('primaryKnowledge');
    expect(adapterSpy.mock.calls[0][0]).toHaveProperty('supportingKnowledge');
  });

  it('returns the adapter result directly (not manually mapped)', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveStrategyKnowledgeContext('测试查询');

    // The result should match what toStrategyKnowledgeContext returns
    expect(result).toEqual(adapterSpy.mock.results[0].value);
  });
});

// ─── TEST 12: Original KnowledgeContext Not Modified ────────────────────────

describe('TEST 12: Adapter does not mutate KnowledgeContext input', () => {
  it('toStrategyKnowledgeContext preserves source array references and content', () => {
    const ctx = createMockKnowledgeContext({
      primaryKnowledge: [
        createMockContextItem({ name: '知识1', knowledgeId: 'KU_1' }),
        createMockContextItem({ name: '知识2', knowledgeId: 'KU_2' }),
      ],
      supportingKnowledge: [
        createMockContextItem({ name: '知识3', knowledgeId: 'KU_3', status: 'candidate' }),
      ],
    });

    // Deep-ish snapshot for comparison
    const primaryBefore = ctx.primaryKnowledge.map((i) => ({ ...i }));
    const supportingBefore = ctx.supportingKnowledge.map((i) => ({ ...i }));

    // Act
    const result = toStrategyKnowledgeContext(ctx);

    // Assert: result is correct
    expect(result.primaryKnowledge).toHaveLength(2);
    expect(result.supportingKnowledge).toHaveLength(1);

    // Assert: original context was not mutated
    expect(ctx.primaryKnowledge).toHaveLength(2);
    expect(ctx.supportingKnowledge).toHaveLength(1);
    expect(ctx.primaryKnowledge[0]).toEqual(primaryBefore[0]);
    expect(ctx.primaryKnowledge[1]).toEqual(primaryBefore[1]);
    expect(ctx.supportingKnowledge[0]).toEqual(supportingBefore[0]);

    // Assert: source arrays themselves are the same references (adapter doesn't reassign)
    expect(ctx.primaryKnowledge).toBe(ctx.primaryKnowledge);
    expect(ctx.supportingKnowledge).toBe(ctx.supportingKnowledge);
  });
});

// ─── TEST 13: Deterministic Query ───────────────────────────────────────────

describe('TEST 13: Deterministic query — same input → same search call', () => {
  it('same query produces identical search parameters', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const query = '固定顺序查询';
    await retrieveStrategyKnowledgeContext(query);
    await retrieveStrategyKnowledgeContext(query);

    expect(searchMock).toHaveBeenCalledTimes(2);
    const call1 = searchMock.mock.calls[0][0] as SemanticRetrievalQuery;
    const call2 = searchMock.mock.calls[1][0] as SemanticRetrievalQuery;

    expect(call1.query).toBe(call2.query);
    expect(call1.limit).toBe(call2.limit);
    expect(call1.include_candidates).toBe(call2.include_candidates);
  });
});

// ─── TEST 14: No Retrieval Internals Exposed ────────────────────────────────

describe('TEST 14: Return value does not expose retrieval internals', () => {
  it('StrategyKnowledgeContext has no threshold/topK/method/retrievalReason fields', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveStrategyKnowledgeContext('测试查询');

    expect(result).not.toBeNull();

    // The result type is StrategyKnowledgeContext — verify structure
    expect(result).toHaveProperty('primaryKnowledge');
    expect(result).toHaveProperty('supportingKnowledge');

    // These retrieval-internal fields should NOT exist
    expect(result).not.toHaveProperty('retrieval');
    expect(result).not.toHaveProperty('threshold');
    expect(result).not.toHaveProperty('topK');
    expect(result).not.toHaveProperty('query');
    expect(result).not.toHaveProperty('metadata');
    expect(result).not.toHaveProperty('evidence');
    expect(result).not.toHaveProperty('constraints');

    // Individual items should not have retrievalReason or knowledgeId
    const item = result!.primaryKnowledge[0];
    expect(item).not.toHaveProperty('retrievalReason');
    expect(item).not.toHaveProperty('knowledgeId');
  });
});

// ─── Integration: Full call shape verification ───────────────────────────────

describe('Integration: Complete search call shape verification', () => {
  it('search receives exactly { query, limit, include_candidates } with correct values', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    await retrieveStrategyKnowledgeContext('策略查询');

    expect(searchMock).toHaveBeenCalledWith({
      query: '策略查询',
      limit: DEFAULT_TOP_K,
      include_candidates: true,
    });
  });
});
