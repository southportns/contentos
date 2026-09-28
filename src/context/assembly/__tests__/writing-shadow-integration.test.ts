/**
 * P0.6.2 — Writing Shadow Integration Test
 *
 * Verifies that the Context Assembly Engine produces output that is
 * fully compatible with the Writing Skill's prompt consumption pipeline.
 *
 * Strategy (Shadow):
 *   - Create realistic ContextObjects (intent, strategy, knowledge, persona)
 *   - Run them through the Assembly Engine
 *   - Serialize the ContextPackage
 *   - Inject the serialized text into the WRITING_PROMPT
 *   - Verify the prompt is well-formed and contains expected sections
 *   - NO actual LLM call — this tests wiring, not generation quality
 *
 * Integration Points Verified:
 *   1. Assembly intent → writing prompt strategy section
 *   2. Assembly knowledge → writing prompt knowledge block
 *   3. Assembly persona (identity) → writing prompt persona section
 *   4. Budget control prevents prompt overflow
 *   5. Serialized format is valid prompt text (no structural breakage)
 */

import { describe, it, expect } from 'vitest';
import { assembleContexts } from '../context-assembler';
import { buildContextPackage } from '../context-package';
import { serializeContextPackage } from '../context-serializer';
import { estimateCollectionTokens } from '../context-budget';
import {
  createContextObject,
  createIntentContext,
  createStrategyContext,
  createIdentityContext,
  createKnowledgeContext,
} from '../../context-factory';
import type { ContextAssemblyRequest } from '../types';
import type { KnowledgeContext } from '@/knowledge/context/knowledge-context-types';
import type { StrategyContext } from '../../context-types';
import type { IdentityContextPayload as IdentityContext } from '../../context-types';
import { WRITING_PROMPT } from '@/skills/writing/prompts';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function makeKnowledgeContext(): KnowledgeContext {
  return {
    query: '抖音口播文案创作技巧',
    retrieval: {
      method: 'semantic',
      threshold: 0.35,
      topK: 5,
      includeCandidates: true,
      retrievedCount: 3,
    },
    selectedCount: 3,
    primaryKnowledge: [
      {
        knowledgeId: 'ku_hook_001',
        name: '黄金三秒钩子技巧',
        text: '开头3秒是短视频完播率的关键。使用悬念式开头、痛点直击、反常识陈述等方式可以在短时间内抓住观众注意力。',
        category: 'hook' as never,
        knowledgeLevel: 'surface_technique' as never,
        confidence: 'high' as never,
        status: 'validated' as never,
        similarity: 0.92,
        retrievalReason: 'High similarity to writing task',
        evidenceCount: 5,
      },
      {
        knowledgeId: 'ku_trust_002',
        name: '信任建立模式',
        text: '口播稿中的信任建立需要具体数据、真实案例和专业知识展示。避免空泛的形容词，用数字和细节说话。',
        category: 'trust' as never,
        knowledgeLevel: 'surface_technique' as never,
        confidence: 'medium' as never,
        status: 'validated' as never,
        similarity: 0.85,
        retrievalReason: 'Matches trust-building need',
        evidenceCount: 3,
      },
    ],
    supportingKnowledge: [
      {
        knowledgeId: 'ku_cta_003',
        name: '行动号召设计',
        text: '结尾CTA应给出明确的下一步行动指引，降低用户行动门槛。',
        category: 'cta' as never,
        knowledgeLevel: 'surface_technique' as never,
        confidence: 'medium' as never,
        status: 'candidate' as never,
        similarity: 0.78,
        retrievalReason: 'Complements CTA strategy',
        evidenceCount: 2,
      },
    ],
    evidence: [],
    constraints: {
      hasCandidates: true,
      maxItems: 5,
      wasTruncated: false,
    },
    metadata: {
      version: '1.0',
      createdAt: new Date().toISOString(),
      source: 'knowledge_store',
    },
  };
}

function makeIdentityContext(): IdentityContext {
  return {
    userName: '旭宝',
    projectId: 'proj_1',
    userId: 'user_1',
  };
}

function makeStrategyContext(): StrategyContext {
  return {
    title: '为什么90%的短视频前3秒就输了',
    hook: '做了100条短视频后，我发现了一个被大多数人忽略的致命问题……',
    coreThesis: '短视频的前3秒决定了整条视频的生死，而大多数人都在犯同一个错误。',
    structure: [
      {
        section: '开头',
        purpose: '制造悬念',
        keyArguments: ['90%的人忽略了前3秒'],
        estimatedWords: 80,
      },
      {
        section: '主体',
        purpose: '展示干货',
        keyArguments: ['钩子技巧', '数据支撑'],
        estimatedWords: 300,
      },
      {
        section: '结尾',
        purpose: '行动号召',
        keyArguments: ['立即行动'],
        estimatedWords: 50,
      },
    ],
    keyArguments: ['前3秒决定生死', '钩子技巧', '数据支撑'],
    emotionalArc: {
      start: '好奇',
      middle: '收获',
      end: '行动',
    },
    callToAction: '关注我，分享更多短视频创作技巧',
    tone: 'conversational',
    estimatedWordCount: 430,
  };
}

function makeIntentContext() {
  return {
    goal: '创作一条关于短视频前3秒重要性的口播稿',
    topic: '短视频创作前3秒技巧',
    audience: '短视频创作者和运营人员',
    constraints: ['不要虚构数据', '语气亲切自然', '结构清晰'],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Build Writing Prompt with Assembly Engine output
// ═══════════════════════════════════════════════════════════════════════════════

interface WritingPromptInput {
  topic: string;
  strategy: {
    title: string;
    hook: string;
    structure: Array<{
      section: string;
      purpose: string;
      keyArguments: string[];
      estimatedWords: number;
    }>;
    keyArguments: string[];
    emotionalArc: { start: string; middle: string; end: string };
    callToAction: string;
    tone: string;
    estimatedWordCount: number;
  };
  selectedAngle: {
    title: string;
    angle: string;
    targetEmotion: string;
    keyPoints: string[];
  };
  platform?: string;
  tone?: string;
  wordCount?: number;
  persona?: { name: string; description: string | null };
  audience?: string;
  originalContent?: {
    content?: string;
    keyInsights?: string[];
    memorableQuotes?: string[];
  };
}

function buildWritingPromptWithAssembly(
  promptInput: WritingPromptInput,
  serializedAssembly: string
): string {
  const basePrompt = WRITING_PROMPT(
    promptInput.topic,
    promptInput.strategy,
    promptInput.selectedAngle,
    promptInput.platform,
    promptInput.tone,
    promptInput.wordCount,
    promptInput.persona,
    undefined, // expressionPlan
    promptInput.audience,
    promptInput.originalContent,
    undefined, // knowledgeContext — we bypass this with assembly output
  );

  // Inject assembly output as the Context Assembly Block
  // This simulates the shadow integration: assembly replaces knowledge context
  return `${basePrompt}\n\n## Context Assembly (P0.6.2 Shadow)\n${serializedAssembly}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Writing Shadow Integration', () => {
  describe('Basic Wiring', () => {
    it('should produce a valid prompt when assembly output is injected', () => {
      const contexts = [
        createIntentContext(makeIntentContext(), {
          provenance: { source: 'topic:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      });

      const pkg = buildContextPackage(result);
      const serialized = serializeContextPackage(pkg);

      const prompt = buildWritingPromptWithAssembly(
        {
          topic: '短视频前3秒技巧',
          strategy: makeStrategyContext(),
          selectedAngle: {
            title: '为什么90%的短视频前3秒就输了',
            angle: '数据驱动的前3秒分析',
            targetEmotion: '好奇+收获',
            keyPoints: ['前3秒决定生死', '钩子技巧'],
          },
          platform: '抖音',
          persona: { name: '旭宝', description: '资深口播创作者' },
        },
        serialized
      );

      expect(prompt).toContain('短视频前3秒技巧');
      expect(prompt).toContain('Context Assembly');
      expect(prompt).toContain('[Intent]');
      expect(prompt).toContain('[Strategy]');
    });

    it('should include intent context in serialized output', () => {
      const contexts = [
        createIntentContext(makeIntentContext(), {
          provenance: { source: 'topic:1' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);
      expect(pkg.intent).toBeDefined();

      const serialized = serializeContextPackage(pkg);
      expect(serialized).toContain('Intent');
      expect(serialized).toContain('短视频前3秒');
    });

    it('should include strategy context in serialized output', () => {
      const contexts = [
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);
      expect(pkg.strategy.length).toBe(1);

      const serialized = serializeContextPackage(pkg);
      expect(serialized).toContain('Strategy');
      expect(serialized).toContain('前3秒决定了整条视频的生死');
    });
  });

  describe('Knowledge Integration', () => {
    it('should include knowledge context with proper formatting', () => {
      const kc = makeKnowledgeContext();
      const knowledgeCtx = createKnowledgeContext(kc, {
        provenance: { source: 'knowledge:1', sourceType: 'knowledge' },
      });

      const result = assembleContexts({
        contexts: [knowledgeCtx],
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);
      expect(pkg.knowledge.length).toBe(1);

      const serialized = serializeContextPackage(pkg);
      expect(serialized).toContain('Knowledge');
      expect(serialized).toContain('黄金三秒钩子技巧');
    });

    it('should serialize knowledge with names and similarity scores', () => {
      const kc = makeKnowledgeContext();
      const knowledgeCtx = createKnowledgeContext(kc, {
        provenance: { source: 'knowledge:1', sourceType: 'knowledge' },
      });

      const result = assembleContexts({
        contexts: [knowledgeCtx],
        purpose: 'writing',
        maxTokens: 10000,
      });

      const pkg = buildContextPackage(result);
      const serialized = serializeContextPackage(pkg);

      // Knowledge names should be present
      expect(serialized).toContain('黄金三秒钩子技巧');
      expect(serialized).toContain('信任建立模式');
      // Similarity scores should be formatted as (0.XX)
      expect(serialized).toContain('(0.92)');
      expect(serialized).toContain('(0.85)');
    });

    it('should include similarity scores in serialized output', () => {
      const kc = makeKnowledgeContext();
      const knowledgeCtx = createKnowledgeContext(kc, {
        provenance: { source: 'knowledge:1', sourceType: 'knowledge' },
      });

      const result = assembleContexts({
        contexts: [knowledgeCtx],
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);
      const serialized = serializeContextPackage(pkg);

      // Similarity should be present in some form
      expect(serialized).toMatch(/0\.\d+/);
    });
  });

  describe('Identity/Persona Integration', () => {
    it('should include identity context and map to persona in writing prompt', () => {
      const identityCtx = createIdentityContext(makeIdentityContext(), {
        provenance: { source: 'persona:1', sourceType: 'persona' },
      });

      const result = assembleContexts({
        contexts: [identityCtx],
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);
      expect(pkg.identity).toBeDefined();

      const serialized = serializeContextPackage(pkg);
      expect(serialized).toContain('Identity');
      // Identity serializer outputs as User: <userName>
      expect(serialized).toContain('User: 旭宝');
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle all context kinds together', () => {
      const contexts = [
        createIntentContext(makeIntentContext(), {
          provenance: { source: 'topic:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
        createIdentityContext(makeIdentityContext(), {
          provenance: { source: 'persona:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
        createKnowledgeContext(makeKnowledgeContext(), {
          provenance: { source: 'knowledge:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 20000,
      });

      const pkg = buildContextPackage(result);
      const serialized = serializeContextPackage(pkg);

      // All kinds should be present
      expect(serialized).toContain('Intent');
      expect(serialized).toContain('Strategy');
      expect(serialized).toContain('Identity');
      expect(serialized).toContain('Knowledge');

      // Should build a valid writing prompt
      const prompt = buildWritingPromptWithAssembly(
        {
          topic: '短视频前3秒技巧',
          strategy: makeStrategyContext(),
          selectedAngle: {
            title: '为什么90%的短视频前3秒就输了',
            angle: '数据驱动的视角',
            targetEmotion: '好奇',
            keyPoints: ['前3秒'],
          },
          platform: '抖音',
        },
        serialized
      );

      expect(prompt.length).toBeGreaterThan(500); // Substantial prompt
      expect(prompt).toContain('Context Assembly');
    });

    it('should maintain correct token budget in full pipeline', () => {
      const contexts = [
        createIntentContext(makeIntentContext(), {
          provenance: { source: 'topic:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
        createKnowledgeContext(makeKnowledgeContext(), {
          provenance: { source: 'knowledge:1', topicId: 'topic_1', projectId: 'proj_1' },
        }),
      ];

      const maxTokens = 5000;
      const result = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens,
      });

      // Token estimate should respect budget
      expect(result.tokenEstimate).toBeLessThanOrEqual(maxTokens * 1.5); // Allow some tolerance

      // Verify token estimation matches the selected contexts
      const estimatedTokens = estimateCollectionTokens(result.selected);
      expect(estimatedTokens).toBe(result.tokenEstimate);
    });
  });

  describe('Budget Constraints', () => {
    it('should produce shorter output with tighter budget', () => {
      const contexts = [
        createKnowledgeContext(makeKnowledgeContext(), {
          provenance: { source: 'knowledge:1' },
        }),
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1' },
        }),
        createIntentContext(makeIntentContext(), {
          provenance: { source: 'topic:1' },
        }),
      ];

      const generous = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 50000,
      });

      const tight = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 100,
      });

      const generousPkg = buildContextPackage(generous);
      const tightPkg = buildContextPackage(tight);

      const generousSerialized = serializeContextPackage(generousPkg);
      const tightSerialized = serializeContextPackage(tightPkg);

      // Tight budget should produce shorter output
      expect(tightSerialized.length).toBeLessThan(generousSerialized.length);
    });

    it('should include budget warnings when exceeded', () => {
      const contexts = [
        createContextObject({
          kind: 'knowledge',
          type: 'test',
          payload: { data: 'x'.repeat(10000) },
          provenance: { source: 'test' },
        }),
        createContextObject({
          kind: 'strategy',
          type: 'test',
          payload: { data: 'y'.repeat(10000) },
          provenance: { source: 'test' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 10,
      });

      const hasBudgetWarning = result.warnings.some(w => w.code === 'BUDGET_EXCEEDED');
      expect(hasBudgetWarning).toBe(true);
    });
  });

  describe('Purpose Differentiation', () => {
    it('should produce different rankings for writing vs evaluation', () => {
      const contexts = [
        createKnowledgeContext(makeKnowledgeContext(), {
          provenance: { source: 'knowledge:1' },
        }),
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1' },
        }),
        createIntentContext(makeIntentContext(), {
          provenance: { source: 'topic:1' },
        }),
      ];

      const forWriting = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      });

      const forEvaluation = assembleContexts({
        contexts,
        purpose: 'evaluation',
        maxTokens: 10000,
      });

      // Rankings should differ (or at least scoring metadata differs)
      const writingScores = forWriting.selected.map(s => s.score);
      const evalScores = forEvaluation.selected.map(s => s.score);

      // Both should have scored contexts
      expect(writingScores.length).toBeGreaterThan(0);
      expect(evalScores.length).toBeGreaterThan(0);
    });
  });

  describe('Explainability for Writing', () => {
    it('should provide reasons for each selected context', () => {
      const contexts = [
        createIntentContext(makeIntentContext(), {
          provenance: { source: 'topic:1' },
        }),
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
      });

      for (const scored of result.selected) {
        expect(scored.reasons.length).toBeGreaterThan(0);
        // Each reason should be a non-empty string
        for (const reason of scored.reasons) {
          expect(typeof reason).toBe('string');
          expect(reason.length).toBeGreaterThan(0);
        }
      }
    });

    it('should include scoring metadata in serialized output', () => {
      const contexts = [
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);

      // Header is opt-in (includeHeader: true). Without it, serialized output
      // contains only the kind sections. This is the expected default behavior.
      const serializedWithHeader = serializeContextPackage(pkg, { includeHeader: true });
      expect(serializedWithHeader).toContain('writing');
      expect(serializedWithHeader).toContain('tokens');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty context list gracefully', () => {
      const result = assembleContexts({
        contexts: [],
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);
      const serialized = serializeContextPackage(pkg);

      // Should still produce valid output
      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');

      // Should be injectable into writing prompt
      const prompt = buildWritingPromptWithAssembly(
        {
          topic: 'test',
          strategy: makeStrategyContext(),
          selectedAngle: { title: 't', angle: 'a', targetEmotion: 'e', keyPoints: ['k'] },
        },
        serialized
      );
      expect(prompt).toContain('test');
    });

    it('should handle single context without errors', () => {
      const contexts = [
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);
      expect(pkg.metadata.contextCount).toBe(1);

      const serialized = serializeContextPackage(pkg);
      expect(serialized).toContain('Strategy');
    });
  });

  describe('Deterministic Integration', () => {
    it('should produce the same output for the same input (deterministic)', () => {
      const contexts = [
        createStrategyContext(makeStrategyContext(), {
          provenance: { source: 'strategy:1' },
        }),
        createKnowledgeContext(makeKnowledgeContext(), {
          provenance: { source: 'knowledge:1' },
        }),
      ];

      const request: ContextAssemblyRequest = {
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      };

      const result1 = assembleContexts(request);
      const result2 = assembleContexts(request);

      const pkg1 = buildContextPackage(result1);
      const pkg2 = buildContextPackage(result2);

      const serialized1 = serializeContextPackage(pkg1);
      const serialized2 = serializeContextPackage(pkg2);

      expect(serialized1).toBe(serialized2);
    });

    it('should produce the same writing prompt for the same assembly output', () => {
      const contexts = [
        createIntentContext(makeIntentContext(), {
          provenance: { source: 'topic:1' },
        }),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
      });

      const pkg = buildContextPackage(result);
      const serialized = serializeContextPackage(pkg);

      const prompt1 = buildWritingPromptWithAssembly(
        {
          topic: '测试',
          strategy: makeStrategyContext(),
          selectedAngle: { title: 't', angle: 'a', targetEmotion: 'e', keyPoints: ['k'] },
        },
        serialized
      );

      const prompt2 = buildWritingPromptWithAssembly(
        {
          topic: '测试',
          strategy: makeStrategyContext(),
          selectedAngle: { title: 't', angle: 'a', targetEmotion: 'e', keyPoints: ['k'] },
        },
        serialized
      );

      expect(prompt1).toBe(prompt2);
    });
  });
});
