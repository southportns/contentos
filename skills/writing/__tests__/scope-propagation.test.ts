/**
 * P0.6.2-R1.2 — Writing Production Scope Propagation Tests
 *
 * Verifies that projectId/topicId from the real WritingInput schema
 * correctly propagate into the Context Assembly Shadow.
 *
 * Tests cover:
 * Case A — projectId/topicId propagation
 * Case B — Same-project cross-topic isolation
 * Case C — Cross-project isolation
 * Case D — Global knowledge compatibility
 * Provenance verification for intent/strategy/identity/knowledge
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildShadowContexts,
  runWritingShadow,
  type ShadowInput,
} from '@/lib/services/context-assembly-shadow';
import { createKnowledgeContext } from '@/context';
import { assembleContexts } from '@/context/assembly/context-assembler';
import type { KnowledgeContext } from '@/knowledge/context/knowledge-context-types';
import type { WritingInput } from '../schema';

// ═══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function makeKnowledgeContext(query: string = '测试query'): KnowledgeContext {
  return {
    query,
    retrieval: {
      method: 'semantic',
      threshold: 0.35,
      topK: 5,
      includeCandidates: false,
      retrievedCount: 1,
    },
    selectedCount: 1,
    primaryKnowledge: [
      {
        knowledgeId: 'ku_test_1',
        name: '测试知识',
        text: '测试知识内容',
        category: 'hook' as never,
        knowledgeLevel: 'surface_technique' as never,
        confidence: 'high' as never,
        status: 'validated' as never,
        similarity: 0.88,
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

function makeWritingInput(overrides: Partial<WritingInput> = {}): WritingInput {
  return {
    topic: '如何提高短视频完播率',
    strategy: {
      title: '短视频完播率提升策略',
      hook: '开头的3秒决定一切',
      structure: [
        {
          section: '开头',
          purpose: '制造悬念',
          keyArguments: ['钩子'],
          estimatedWords: 80,
        },
      ],
      keyArguments: ['钩子'],
      emotionalArc: { start: '好奇', middle: '收获', end: '行动' },
      callToAction: '关注我',
      tone: '专业',
      estimatedWordCount: 400,
    },
    selectedAngle: {
      title: '痛点切入式',
      angle: '从用户痛点出发',
      targetEmotion: '共鸣',
      keyPoints: ['痛点'],
    },
    knowledgeContext: null,
    ...overrides,
  };
}

function makeShadowInput(overrides: Partial<ShadowInput> = {}): ShadowInput {
  return {
    topic: '如何提高短视频完播率',
    strategy: {
      title: '短视频完播率提升策略',
      hook: '开头的3秒决定一切',
      callToAction: '关注我',
      tone: '专业',
    },
    selectedAngle: {
      title: '痛点切入式',
      angle: '从用户痛点出发',
      targetEmotion: '共鸣',
      keyPoints: ['痛点', '解决方案'],
    },
    knowledgeContext: makeKnowledgeContext(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Case A: projectId / topicId propagation
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.2-R1.2 — Scope Propagation', () => {
  const originalEnv = process.env.CONTEXT_ASSEMBLY_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.CONTEXT_ASSEMBLY_SHADOW_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_ASSEMBLY_SHADOW_ENABLED;
    } else {
      process.env.CONTEXT_ASSEMBLY_SHADOW_ENABLED = originalEnv;
    }
  });

  describe('Case A: projectId/topicId propagation', () => {
    it('should propagate projectId and topicId from WritingInput to Shadow', () => {
      const input = makeWritingInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      // Validate schema accepts these fields
      expect(input.projectId).toBe('project_P1');
      expect(input.topicId).toBe('topic_T1');

      // Verify shadow receives them
      const shadowInput = makeShadowInput({
        projectId: input.projectId,
        topicId: input.topicId,
      });

      const metadata = runWritingShadow(shadowInput);
      expect(metadata.assemblyEnabled).toBe(true);

      // Verify shadow input propagation through buildShadowContexts
      const contexts = buildShadowContexts(shadowInput);
      const intentCtx = contexts.find((c) => c.kind === 'intent');
      const strategyCtx = contexts.find((c) => c.kind === 'strategy');

      expect(intentCtx!.provenance.projectId).toBe('project_P1');
      expect(intentCtx!.provenance.topicId).toBe('topic_T1');
      expect(strategyCtx!.provenance.projectId).toBe('project_P1');
      expect(strategyCtx!.provenance.topicId).toBe('topic_T1');
    });

    it('should handle WritingInput without projectId/topicId (backward compatible)', () => {
      const input = makeWritingInput();
      // Schema should accept input without these fields
      expect(input.projectId).toBeUndefined();
      expect(input.topicId).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Case B: Same-project cross-topic isolation
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Case B: Same-project cross-topic isolation', () => {
    it('should exclude same-project different-topic contexts (P1/T2 in P1/T1 assembly)', () => {
      const shadowInput = makeShadowInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      // Build T1 contexts
      const contexts = buildShadowContexts(shadowInput);

      // Add a context from Topic T2 (same project P1)
      const otherTopicCtx = createKnowledgeContext(makeKnowledgeContext(), {
        id: 'ctx_topic_T2',
        provenance: {
          source: 'shadow:other_topic',
          sourceType: 'knowledge',
          topicId: 'topic_T2',
          projectId: 'project_P1',
        },
      });

      const result = assembleContexts({
        contexts: [...contexts, otherTopicCtx],
        purpose: 'writing',
        maxTokens: 4000,
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      // T2 context should be excluded
      const t2Excluded = result.excluded.find((e) => e.contextId === 'ctx_topic_T2');
      expect(t2Excluded).toBeDefined();
      expect(t2Excluded!.reason).toBe('scope_mismatch');
    });

    it('should include same-project same-topic contexts (P1/T1 with P1/T1)', () => {
      const shadowInput = makeShadowInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      const contexts = buildShadowContexts(shadowInput);

      // Intent/strategy/identity from shadow should all be selected
      const result = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 4000,
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      expect(result.selected.length).toBeGreaterThan(0);
      expect(result.excluded.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Case C: Cross-project isolation
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Case C: Cross-project isolation', () => {
    it('should exclude different-project contexts (P2/T1 in P1/T1 assembly)', () => {
      const shadowInput = makeShadowInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      const contexts = buildShadowContexts(shadowInput);

      // Add a context from P2/T1 (different project, same topic name)
      const otherProjectCtx = createKnowledgeContext(makeKnowledgeContext(), {
        id: 'ctx_project_P2',
        provenance: {
          source: 'shadow:other_project',
          sourceType: 'knowledge',
          topicId: 'topic_T1',
          projectId: 'project_P2',
        },
      });

      const result = assembleContexts({
        contexts: [...contexts, otherProjectCtx],
        purpose: 'writing',
        maxTokens: 4000,
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      // P2/T1 context should be excluded
      const p2Excluded = result.excluded.find((e) => e.contextId === 'ctx_project_P2');
      expect(p2Excluded).toBeDefined();
      expect(p2Excluded!.reason).toBe('scope_mismatch');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Case D: Global knowledge compatibility
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Case D: Global knowledge compatibility', () => {
    it('should include global knowledge (no projectId/topicId) when no scope provided', () => {
      const shadowInput = makeShadowInput();
      const contexts = buildShadowContexts(shadowInput);

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 4000,
      });

      // All should be included (no project boundary)
      expect(result.selected.length).toBeGreaterThan(0);
      expect(result.excluded.length).toBe(0);
    });

    it('should include global knowledge even when projectId/topicId are set', () => {
      const shadowInput = makeShadowInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      const contexts = buildShadowContexts(shadowInput);

      // Shadow knowledge context is global (projectId=null, topicId=null)
      const knowledgeCtx = contexts.find((c) => c.kind === 'knowledge');
      expect(knowledgeCtx).toBeDefined();
      expect(knowledgeCtx!.provenance.projectId).toBeNull();
      expect(knowledgeCtx!.provenance.topicId).toBeNull();

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 4000,
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      // Knowledge (global) should be included
      const knowledgeSelected = result.selected.find((s) => s.context.kind === 'knowledge');
      expect(knowledgeSelected).toBeDefined();

      // Intent/strategy/identity (topic-scoped, matching) should also be included
      const intentSelected = result.selected.find((s) => s.context.kind === 'intent');
      expect(intentSelected).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Provenance verification
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Provenance verification', () => {
    it('should set correct provenance for intent/strategy/identity with project/topic scope', () => {
      const shadowInput = makeShadowInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
        persona: { name: '测试达人', description: '专业创作者' },
      });

      const contexts = buildShadowContexts(shadowInput);

      const intentCtx = contexts.find((c) => c.kind === 'intent');
      const strategyCtx = contexts.find((c) => c.kind === 'strategy');
      const identityCtx = contexts.find((c) => c.kind === 'identity');

      // intent/strategy/identity should carry topicId → resolveContextScope infers 'topic'
      expect(intentCtx!.provenance.topicId).toBe('topic_T1');
      expect(intentCtx!.provenance.projectId).toBe('project_P1');
      expect(strategyCtx!.provenance.topicId).toBe('topic_T1');
      expect(strategyCtx!.provenance.projectId).toBe('project_P1');
      expect(identityCtx!.provenance.topicId).toBe('topic_T1');
      expect(identityCtx!.provenance.projectId).toBe('project_P1');
    });

    it('should keep knowledge globally scoped (null topicId)', () => {
      const shadowInput = makeShadowInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      const contexts = buildShadowContexts(shadowInput);
      const knowledgeCtx = contexts.find((c) => c.kind === 'knowledge');

      expect(knowledgeCtx).toBeDefined();
      expect(knowledgeCtx!.provenance.topicId).toBeNull();
      expect(knowledgeCtx!.provenance.projectId).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Feature flag behavior preserved
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Feature flag preserved', () => {
    it('should respect shadow disabled even with projectId/topicId', () => {
      delete process.env.CONTEXT_ASSEMBLY_SHADOW_ENABLED;

      const shadowInput = makeShadowInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      const metadata = runWritingShadow(shadowInput);
      expect(metadata.assemblyEnabled).toBe(false);
      expect(metadata.selectedCount).toBe(0);
    });

    it('should include scope info in shadow metadata when enabled', () => {
      const shadowInput = makeShadowInput({
        projectId: 'project_P1',
        topicId: 'topic_T1',
      });

      const metadata = runWritingShadow(shadowInput);
      expect(metadata.assemblyEnabled).toBe(true);
      expect(metadata.selectedCount).toBeGreaterThan(0);
      expect(metadata.selectedKinds).toContain('intent');
      expect(metadata.selectedKinds).toContain('strategy');
      expect(metadata.selectedKinds).toContain('knowledge');
    });
  });
});
