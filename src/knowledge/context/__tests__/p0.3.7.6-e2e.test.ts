import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Module Mocks ───────────────────────────────────────────────────────────

/**
 * Wrap serializeKnowledgeContext in a spy while preserving real behavior.
 * Verifies the FULL pipeline still uses the serializer at the route level.
 */
vi.mock('@/knowledge/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/knowledge/context')>();
  return {
    ...actual,
    serializeKnowledgeContext: vi.fn(actual.serializeKnowledgeContext),
    retrieveKnowledgeContextForGeneration: vi.fn(actual.retrieveKnowledgeContextForGeneration),
  };
});

/** Mock the semantic search singleton — no real embedding calls in tests. */
vi.mock('@/knowledge/semantic/semantic-search-instance', () => ({
  getSemanticSearchInstance: vi.fn(),
}));

// Mock the AI library to prevent real LLM calls
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: '# 测试标题\n\n## 开头\n这是测试内容。\n\n## 主体\n更多内容。\n\n## 结尾\n结尾部分。',
  }),
}));

// Mock the model provider
vi.mock('@/lib/ai/models', () => ({
  getModel: vi.fn().mockReturnValue({ modelId: 'mock-model', provider: 'mock' }),
}));

// Mock the content service
vi.mock('@/lib/services/content-service', () => ({
  contentService: {
    saveDraft: vi.fn().mockResolvedValue({ id: 'mock-draft-id' }),
    updateTopicStatus: vi.fn().mockResolvedValue(undefined),
  },
}));

import { WRITING_PROMPT } from '@/skills/writing/prompts';
import {
  serializeKnowledgeContext,
  retrieveKnowledgeContextForGeneration,
  type KnowledgeContext,
  type KnowledgeContextItem,
} from '@/knowledge/context';
import { getSemanticSearchInstance } from '@/knowledge/semantic/semantic-search-instance';
import { DEFAULT_TOP_K } from '@/knowledge/semantic/types';
import type { CanonicalKnowledgeUnit, Evidence } from '@/knowledge/types';
import type { SemanticRetrievalResponse } from '@/knowledge/semantic/types';
import type { RhythmLevel, ExpressionLevel } from '@/lib/expression/types';

const serializeSpy = vi.mocked(serializeKnowledgeContext);
const retrieveSpy = vi.mocked(retrieveKnowledgeContextForGeneration);
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

function createMockSearchResponse(query?: string): SemanticRetrievalResponse {
  const ku = createMockKU();
  return {
    query: query ?? '测试主题 测试角度 测试论点',
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

// ─── E2E Test Topic (固定、可重复) ──────────────────────────────────────────

const E2E_TOPIC = '为什么我们越长大，越容易在关系里委屈自己';
const E2E_ANGLE = {
  title: '情感成长',
  angle: '委屈自己的根源是童年形成的讨好型人格',
  targetEmotion: '共鸣与反思',
  keyPoints: ['讨好型人格的童年根源', '边界感的缺失', '如何建立健康边界'],
};
const E2E_STRATEGY = {
  title: '越长大越委屈自己？根源在这里',
  hook: '你是不是那个总是委屈自己的人？',
  structure: [
    { section: '开头', purpose: '引发共鸣', keyArguments: ['委屈自己的普遍性'], estimatedWords: 150 },
    { section: '分析', purpose: '揭示根源', keyArguments: ['童年讨好模式', '边界感缺失'], estimatedWords: 300 },
    { section: '方案', purpose: '给出方法', keyArguments: ['建立边界', '自我关怀'], estimatedWords: 250 },
    { section: '结尾', purpose: '行动号召', keyArguments: ['开始改变'], estimatedWords: 100 },
  ],
  keyArguments: ['童年讨好模式', '边界感缺失', '建立边界', '自我关怀'],
  emotionalArc: { start: '共鸣', middle: '反思', end: '希望' },
  callToAction: '关注我，一起成长',
  tone: '温暖而真诚',
  estimatedWordCount: 800,
};

beforeEach(() => {
  serializeSpy.mockClear();
  retrieveSpy.mockClear();
  getInstanceSpy.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});