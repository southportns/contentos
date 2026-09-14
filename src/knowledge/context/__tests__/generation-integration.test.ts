/**
 * P0.3.7.5 — Generation Layer Integration Tests
 *
 * Tests the integration pipeline:
 *   KnowledgeContext → serializeKnowledgeContext() → Generation Prompt
 *   API Route Orchestration → retrieveKnowledgeContextForGeneration()
 *
 * Covers:
 *   - Knowledge Context injected into generation prompt (TEST 01)
 *   - Serializer is actually invoked by prompt assembly (TEST 02)
 *   - Validated / Candidate / Mixed status propagation (TEST 03/04/05)
 *   - Empty knowledge context (TEST 06)
 *   - wasTruncated true / false pass-through (TEST 07/08)
 *   - Existing prompt preservation (TEST 09)
 *   - Primary before Supporting ordering (TEST 10)
 *   - No retrieval logic duplication in generation layer (TEST 11)
 *   - Determinism (TEST 12)
 *   - Orchestration graceful degradation (TEST 13)
 *   - Orchestration success path (TEST 14)
 *
 * These tests do NOT call LLMs — they only verify prompt construction
 * and orchestration behavior with mocked retrieval.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Module Mocks ───────────────────────────────────────────────────────────

/**
 * Wrap serializeKnowledgeContext in a spy while preserving real behavior.
 * TEST 02 asserts the Generation Layer calls the P0.3.7.4 serializer
 * instead of re-implementing knowledge formatting.
 */
vi.mock('@/knowledge/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/knowledge/context')>();
  return {
    ...actual,
    serializeKnowledgeContext: vi.fn(actual.serializeKnowledgeContext),
  };
});

/** Mock the semantic search singleton — no real embedding calls in tests. */
vi.mock('@/knowledge/semantic/semantic-search-instance', () => ({
  getSemanticSearchInstance: vi.fn(),
}));

import { WRITING_PROMPT } from '@/skills/writing/prompts';
import {
  serializeKnowledgeContext,
  retrieveKnowledgeContextForGeneration,
} from '@/knowledge/context';
import type {
  KnowledgeContext,
  KnowledgeContextItem,
} from '@/knowledge/context';
import { getSemanticSearchInstance } from '@/knowledge/semantic/semantic-search-instance';
import { DEFAULT_TOP_K } from '@/knowledge/semantic/types';
import type {
  CanonicalKnowledgeUnit,
  Evidence,
} from '@/knowledge/types';
import type { SemanticRetrievalResponse } from '@/knowledge/semantic/types';

const serializeSpy = vi.mocked(serializeKnowledgeContext);
const getInstanceSpy = vi.mocked(getSemanticSearchInstance);

// ─── Fixtures: KnowledgeContext ─────────────────────────────────────────────

function createMockItem(
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

function createMockContext(
  overrides: Partial<KnowledgeContext> = {}
): KnowledgeContext {
  const primaryKnowledge = overrides.primaryKnowledge ?? [createMockItem()];
  const supportingKnowledge = overrides.supportingKnowledge ?? [];
  return {
    query: '测试查询',
    retrieval: {
      method: 'semantic',
      threshold: 0.35,
      topK: 5,
      includeCandidates: false,
      retrievedCount: 1,
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

// ─── Fixtures: Writing Prompt Inputs ────────────────────────────────────────

const mockStrategy = {
  title: '测试标题',
  hook: '测试钩子',
  structure: [
    {
      section: '开头',
      purpose: '引入',
      keyArguments: ['论点1'],
      estimatedWords: 200,
    },
  ],
  keyArguments: ['论点1'],
  emotionalArc: { start: 'calm', middle: 'reflective', end: 'restrained' },
  callToAction: '关注我',
  tone: '口语',
  estimatedWordCount: 1000,
};

const mockSelectedAngle = {
  title: '测试角度',
  angle: '测试论点',
  targetEmotion: '共鸣',
  keyPoints: ['要点1'],
};

function buildPrompt(knowledgeContext?: KnowledgeContext): string {
  return WRITING_PROMPT(
    '测试主题',
    mockStrategy,
    mockSelectedAngle,
    'douyin',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    knowledgeContext
  );
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

function createMockSearchResponse(): SemanticRetrievalResponse {
  const ku = createMockKU();
  return {
    query: '测试主题 测试角度 测试论点',
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
  };
}

beforeEach(() => {
  serializeSpy.mockClear();
  getInstanceSpy.mockReset();
});

// ─── TEST 01: Knowledge Context Injected ────────────────────────────────────

describe('TEST 01: Knowledge Context is injected into generation prompt', () => {
  it('prompt contains the Knowledge Context block and knowledge content', () => {
    const context = createMockContext();
    const prompt = buildPrompt(context);

    expect(prompt).toContain('## Knowledge Context');
    expect(prompt).toContain('这是知识单元的原文内容，包含核心模式描述。');
    expect(prompt).toContain('### Primary Knowledge 1: 测试知识单元');
  });
});

// ─── TEST 02: Serializer Actually Called ────────────────────────────────────

describe('TEST 02: Generation uses serializeKnowledgeContext (no re-implementation)', () => {
  it('WRITING_PROMPT invokes serializeKnowledgeContext exactly once', () => {
    const context = createMockContext();
    buildPrompt(context);

    expect(serializeSpy).toHaveBeenCalledTimes(1);
    expect(serializeSpy).toHaveBeenCalledWith(context);
  });

  it('serializer is NOT called when no knowledgeContext is provided', () => {
    buildPrompt(undefined);
    expect(serializeSpy).not.toHaveBeenCalled();
  });
});

// ─── TEST 03: Validated Knowledge ───────────────────────────────────────────

describe('TEST 03: Validated knowledge reaches the prompt', () => {
  it('Status: validated appears in the final prompt', () => {
    const prompt = buildPrompt(createMockContext());
    expect(prompt).toContain('Status: validated');
  });
});

// ─── TEST 04: Candidate Knowledge ───────────────────────────────────────────

describe('TEST 04: Candidate knowledge reaches the prompt unconverted', () => {
  it('Status: candidate appears and is not converted to validated', () => {
    const context = createMockContext({
      primaryKnowledge: [
        createMockItem({ status: 'candidate', confidence: 'medium' }),
      ],
      constraints: { hasCandidates: true, maxItems: 5, wasTruncated: false },
    });
    const prompt = buildPrompt(context);

    expect(prompt).toContain('Status: candidate');
    expect(prompt).not.toContain('Status: validated');
  });
});

// ─── TEST 05: Mixed Knowledge ───────────────────────────────────────────────

describe('TEST 05: Mixed validated + candidate both present', () => {
  it('both statuses appear in the final prompt', () => {
    const context = createMockContext({
      primaryKnowledge: [
        createMockItem({ knowledgeId: 'KU_V', name: '已验证', status: 'validated' }),
      ],
      supportingKnowledge: [
        createMockItem({ knowledgeId: 'KU_C', name: '候选', status: 'candidate' }),
      ],
      constraints: { hasCandidates: true, maxItems: 5, wasTruncated: false },
    });
    const prompt = buildPrompt(context);

    expect(prompt).toContain('Status: validated');
    expect(prompt).toContain('Status: candidate');
  });
});

// ─── TEST 06: Empty Knowledge ───────────────────────────────────────────────

describe('TEST 06: Empty knowledge context — generation still works', () => {
  it('prompt assembles normally with stable empty-context placeholder', () => {
    const context = createMockContext({
      primaryKnowledge: [],
      supportingKnowledge: [],
      selectedCount: 0,
    });

    let prompt = '';
    expect(() => {
      prompt = buildPrompt(context);
    }).not.toThrow();

    expect(prompt).toContain('## Knowledge Context');
    expect(prompt).toContain('No relevant knowledge was retrieved.');
    // Existing prompt content still intact
    expect(prompt).toContain('主题：测试主题');
    expect(prompt).toContain('请基于以上策略，写出完整的内容初稿。');
  });
});

// ─── TEST 07: wasTruncated = true ───────────────────────────────────────────

describe('TEST 07: wasTruncated=true propagates to prompt', () => {
  it('prompt contains Was Truncated: true and the stable note', () => {
    const context = createMockContext({
      constraints: { hasCandidates: false, maxItems: 3, wasTruncated: true },
    });
    const prompt = buildPrompt(context);

    expect(prompt).toContain('Was Truncated: true');
    expect(prompt).toContain(
      'Note: Retrieval results were truncated according to maxItems.'
    );
  });
});

// ─── TEST 08: wasTruncated = false ──────────────────────────────────────────

describe('TEST 08: wasTruncated=false propagates to prompt', () => {
  it('prompt contains Was Truncated: false and no truncation note', () => {
    const prompt = buildPrompt(createMockContext());

    expect(prompt).toContain('Was Truncated: false');
    expect(prompt).not.toContain('truncated according to maxItems');
  });
});

// ─── TEST 09: Existing Prompt Preservation ──────────────────────────────────

describe('TEST 09: Existing prompt content fully preserved', () => {
  it('without knowledgeContext, prompt has no knowledge block and all original sections', () => {
    const prompt = buildPrompt(undefined);

    // No knowledge block
    expect(prompt).not.toContain('## Knowledge Context');

    // All pre-existing sections preserved
    expect(prompt).toContain('主题：测试主题');
    expect(prompt).toContain('选定角度：测试角度 — 测试论点');
    expect(prompt).toContain('目标情绪：共鸣');
    expect(prompt).toContain('内容策略：');
    expect(prompt).toContain('- 标题：测试标题');
    expect(prompt).toContain('- 钩子：测试钩子');
    expect(prompt).toContain('结构大纲：');
    expect(prompt).toContain('### 开头');
    expect(prompt).toContain('目标平台：douyin');
    expect(prompt).toContain('预计总字数：1000');
    expect(prompt).toContain('请基于以上策略，写出完整的内容初稿。');
  });

  it('integration only inserts the knowledge block — head and tail unchanged', () => {
    const baseline = buildPrompt(undefined);
    const integrated = buildPrompt(createMockContext());

    // Insertion point is right before the platform line.
    const insertionMarker = '目标平台：douyin';
    const baselineHead = baseline.slice(0, baseline.indexOf(insertionMarker));
    const baselineTail = baseline.slice(baseline.indexOf(insertionMarker));

    // Everything before the insertion point is byte-identical
    expect(integrated.startsWith(baselineHead)).toBe(true);
    // Everything from the platform line onward is preserved after the block
    expect(integrated).toContain(baselineTail);
    // The only addition is the knowledge context block
    expect(integrated.length).toBeGreaterThan(baseline.length);
  });
});

// ─── TEST 10: Ordering ──────────────────────────────────────────────────────

describe('TEST 10: Primary knowledge before supporting knowledge', () => {
  it('primary section precedes supporting section, serializer order preserved', () => {
    const context = createMockContext({
      primaryKnowledge: [createMockItem({ name: '主知识' })],
      supportingKnowledge: [
        createMockItem({ name: '辅助知识', status: 'candidate' }),
      ],
      constraints: { hasCandidates: true, maxItems: 5, wasTruncated: false },
    });
    const prompt = buildPrompt(context);

    expect(prompt).toContain('### Primary Knowledge 1: 主知识');
    expect(prompt).toContain('### Supporting Knowledge 1: 辅助知识');
    expect(prompt.indexOf('主知识')).toBeLessThan(prompt.indexOf('辅助知识'));
  });
});

// ─── TEST 11: No Retrieval Logic Duplication ────────────────────────────────

describe('TEST 11: Generation layer contains no retrieval logic', () => {
  const generationFiles = [
    'skills/writing/prompts.ts',
    'skills/writing/index.ts',
    'skills/writing/schema.ts',
  ];

  const forbiddenTokens = [
    'threshold',
    'topK',
    'DEFAULT_TOP_K',
    'DEFAULT_SIMILARITY_THRESHOLD',
    'wasTruncated',
    'getSemanticSearchInstance',
    'cosineSimilarity',
    'embed(',
  ];

  for (const file of generationFiles) {
    it(`${file} does not reference retrieval internals`, () => {
      const source = readFileSync(
        resolve(process.cwd(), file),
        'utf-8'
      );
      for (const token of forbiddenTokens) {
        expect(source).not.toContain(token);
      }
    });
  }
});

// ─── TEST 12: Determinism ───────────────────────────────────────────────────

describe('TEST 12: Determinism — same input produces identical prompt', () => {
  it('identical generation input + KnowledgeContext → identical prompt', () => {
    const context = createMockContext({
      primaryKnowledge: [
        createMockItem({ knowledgeId: 'KU_1', name: '一' }),
        createMockItem({ knowledgeId: 'KU_2', name: '二', status: 'candidate' }),
      ],
      constraints: { hasCandidates: true, maxItems: 5, wasTruncated: true },
    });

    const prompt1 = buildPrompt(context);
    const prompt2 = buildPrompt(context);

    expect(prompt1).toBe(prompt2);
  });
});

// ─── TEST 13: Orchestration Graceful Degradation ────────────────────────────

describe('TEST 13: Orchestration — retrieval failure degrades to null', () => {
  it('returns null when semantic search initialization fails', async () => {
    getInstanceSpy.mockRejectedValue(new Error('DASHSCOPE_API_KEY is not set'));

    const result = await retrieveKnowledgeContextForGeneration('测试主题');

    expect(result).toBeNull();
  });

  it('returns null when search itself throws', async () => {
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: vi.fn().mockRejectedValue(new Error('network timeout')),
    } as never);

    const result = await retrieveKnowledgeContextForGeneration('测试主题');

    expect(result).toBeNull();
  });

  it('never throws — generation is never blocked', async () => {
    getInstanceSpy.mockRejectedValue(new Error('any failure'));

    await expect(
      retrieveKnowledgeContextForGeneration('测试主题')
    ).resolves.toBeNull();
  });
});

// ─── TEST 14: Orchestration Success Path ────────────────────────────────────

describe('TEST 14: Orchestration — retrieval success builds KnowledgeContext', () => {
  it('returns a built KnowledgeContext from retrieval response', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveKnowledgeContextForGeneration(
      '测试主题 测试角度 测试论点'
    );

    expect(result).not.toBeNull();
    expect(result!.primaryKnowledge).toHaveLength(1);
    expect(result!.primaryKnowledge[0].knowledgeId).toBe('KU_REAL_001');
    expect(result!.primaryKnowledge[0].status).toBe('validated');
    expect(result!.selectedCount).toBe(1);

    // Retrieval is invoked with production defaults + candidate inclusion.
    // No threshold/topK logic lives in the generation layer.
    expect(searchMock).toHaveBeenCalledWith({
      query: '测试主题 测试角度 测试论点',
      limit: DEFAULT_TOP_K,
      include_candidates: true,
    });
  });

  it('returned context is directly serializable by the P0.3.7.4 serializer', async () => {
    const searchMock = vi.fn().mockResolvedValue(createMockSearchResponse());
    getInstanceSpy.mockResolvedValue({
      isReady: true,
      search: searchMock,
    } as never);

    const result = await retrieveKnowledgeContextForGeneration('测试主题');
    const prompt = buildPrompt(result!);

    expect(prompt).toContain('## Knowledge Context');
    expect(prompt).toContain('真实检索知识');
    expect(prompt).toContain('Status: validated');
  });
});
