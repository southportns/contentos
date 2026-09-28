/**
 * P0.6.1 — Context Adapter Tests
 *
 * Tests for entity-to-context conversion.
 */

import { describe, it, expect } from 'vitest';
import {
  topicAdapter,
  adaptTopicToStrategy,
  strategyAdapter,
  draftAdapter,
  evaluationAdapter,
  type TopicInput,
} from '../context-adapter';
import { isContextObject, belongsToTopic, hasSourceType } from '../context-utils';
import type { ContentStrategy, Draft, Evaluation } from '@prisma/client';

describe('Context Adapters', () => {
  describe('Topic Adapter', () => {
    const mockTopic: TopicInput = {
      id: 'topic-abc',
      topic: '如何写出爆款文案',
      category: 'content_creation',
      platform: 'xiaohongshu',
      audience: '年轻职场人',
      contentType: 'knowledge',
      goal: '帮助用户提升文案水平',
      tone: 'encouraging',
      constraints: '不要写太长',
      status: 'STRATEGY',
      projectId: 'project-xyz',
      personaId: null,
      createdAt: '2026-09-28T00:00:00Z',
      updatedAt: '2026-09-28T00:00:00Z',
    };

    it('should adapt Topic to IntentContext', () => {
      const ctx = topicAdapter.adapt(mockTopic);

      expect(isContextObject(ctx)).toBe(true);
      expect(ctx.kind).toBe('intent');
      expect(ctx.type).toBe('topic_intent');
      expect(ctx.payload.goal).toBe('帮助用户提升文案水平');
      expect(ctx.payload.contentType).toBe('knowledge');
      expect(ctx.payload.audience).toBe('年轻职场人');
      expect(ctx.payload.task).toBe('如何写出爆款文案');
      expect(ctx.payload.constraints).toEqual(['不要写太长']);
    });

    it('should set provenance from topic data', () => {
      const ctx = topicAdapter.adapt(mockTopic);

      expect(ctx.provenance.source).toBe('topic:topic-abc');
      expect(ctx.provenance.sourceType).toBe('database');
      expect(ctx.provenance.topicId).toBe('topic-abc');
      expect(ctx.provenance.projectId).toBe('project-xyz');
    });

    it('should use retrieved as default lifecycle stage', () => {
      const ctx = topicAdapter.adapt(mockTopic);
      expect(ctx.lifecycle.stage).toBe('retrieved');
    });

    it('should allow lifecycle stage override', () => {
      const ctx = topicAdapter.adapt(mockTopic, { lifecycleStage: 'applied' });
      expect(ctx.lifecycle.stage).toBe('applied');
    });

    it('should produce valid context object for composition', () => {
      const ctx = topicAdapter.adapt(mockTopic);
      expect(belongsToTopic(ctx, 'topic-abc')).toBe(true);
      expect(hasSourceType(ctx, 'database')).toBe(true);
    });

    it('should handle null optional fields', () => {
      const minimalTopic: TopicInput = {
        id: 'topic-min',
        topic: '极简主题',
        category: null,
        platform: null,
        audience: null,
        contentType: null,
        goal: null,
        tone: null,
        constraints: null,
        status: 'DRAFT',
        projectId: 'project-1',
        personaId: null,
        createdAt: '2026-09-28T00:00:00Z',
        updatedAt: '2026-09-28T00:00:00Z',
      };

      const ctx = topicAdapter.adapt(minimalTopic);
      expect(ctx.payload.goal).toBeNull();
      expect(ctx.payload.constraints).toBeNull();
      expect(ctx.payload.audience).toBeNull();
      expect(isContextObject(ctx)).toBe(true);
    });

    it('should generate deterministic ID', () => {
      const ctx1 = topicAdapter.adapt(mockTopic);
      const ctx2 = topicAdapter.adapt(mockTopic);
      expect(ctx1.id).toBe(ctx2.id);
    });
  });

  describe('Topic to Strategy Adapter', () => {
    const mockTopic: TopicInput = {
      id: 'topic-abc',
      topic: '如何写出爆款文案',
      platform: 'xiaohongshu',
      projectId: 'project-xyz',
      createdAt: '2026-09-28T00:00:00Z',
      updatedAt: '2026-09-28T00:00:00Z',
    };

    it('should produce StrategyContext', () => {
      const ctx = adaptTopicToStrategy(mockTopic);

      expect(ctx.kind).toBe('strategy');
      expect(ctx.type).toBe('topic_strategy');
      expect(ctx.payload.topicId).toBe('topic-abc');
      expect(ctx.payload.topicName).toBe('如何写出爆款文案');
      expect(ctx.payload.platform).toBe('xiaohongshu');
    });
  });

  describe('Strategy Adapter', () => {
    const mockStrategy: ContentStrategy = {
      id: 'strategy-1',
      topicId: 'topic-abc',
      angleId: 'angle-1',
      coreThesis: '用真实故事打动读者',
      targetEmotion: '共鸣',
      targetAudience: '25-35岁职场女性',
      hookStrategy: '悬念式开头',
      contentStructure: null,
      storyStrategy: '个人经历',
      conflict: '职场困境',
      turningPoint: '突破时刻',
      endingStrategy: '开放式结尾',
      ctaStrategy: '鼓励评论互动',
      keyArguments: ['真实胜于完美', '情感连接'],
      suggestedReferences: ['参考爆款A', '参考爆款B'],
      tone: 'warm',
      estimatedWordCount: 2000,
      approvalStatus: 'approved',
      rejectionReason: null,
      approvedAt: '2026-09-28T00:00:00Z',
      rejectedAt: null,
      strategyKnowledge: null,
      createdAt: new Date('2026-09-28T00:00:00Z'),
      updatedAt: new Date('2026-09-28T00:00:00Z'),
    };

    it('should adapt ContentStrategy to StrategyContext', () => {
      const ctx = strategyAdapter.adapt(mockStrategy);

      expect(isContextObject(ctx)).toBe(true);
      expect(ctx.kind).toBe('strategy');
      expect(ctx.type).toBe('content_strategy');
      expect(ctx.payload.topicId).toBe('topic-abc');
      expect(ctx.payload.coreThesis).toBe('用真实故事打动读者');
      expect(ctx.payload.targetEmotion).toBe('共鸣');
      expect(ctx.payload.approvalStatus).toBe('approved');
    });

    it('should set provenance correctly', () => {
      const ctx = strategyAdapter.adapt(mockStrategy);

      expect(ctx.provenance.source).toBe('strategy:strategy-1');
      expect(ctx.provenance.topicId).toBe('topic-abc');
    });

    it('should derive confidence from approval status', () => {
      const approved = strategyAdapter.adapt(mockStrategy);
      expect(approved.confidence).toBe(0.9);

      const pending = strategyAdapter.adapt({ ...mockStrategy, approvalStatus: 'pending' });
      expect(pending.confidence).toBe(0.5);
    });
  });

  describe('Draft Adapter', () => {
    const mockDraft: Draft = {
      id: 'draft-1',
      topicId: 'topic-abc',
      version: 2,
      parentDraftId: 'draft-0',
      changeType: 'MANUAL_EDIT',
      changeReason: '调整开头',
      title: '如何提高文案能力',
      content: '这是正文...',
      outline: null,
      status: 'DRAFT',
      wordCount: 1500,
      createdAt: new Date('2026-09-28T00:00:00Z'),
      updatedAt: new Date('2026-09-28T00:00:00Z'),
    };

    it('should adapt Draft to ContentContext', () => {
      const ctx = draftAdapter.adapt(mockDraft);

      expect(isContextObject(ctx)).toBe(true);
      expect(ctx.kind).toBe('content');
      expect(ctx.type).toBe('draft');
      expect(ctx.payload.draftId).toBe('draft-1');
      expect(ctx.payload.version).toBe(2);
      expect(ctx.payload.title).toBe('如何提高文案能力');
      expect(ctx.payload.status).toBe('DRAFT');
      expect(ctx.payload.changeType).toBe('MANUAL_EDIT');
      expect(ctx.payload.parentDraftId).toBe('draft-0');
    });

    it('should set provenance with lineage', () => {
      const ctx = draftAdapter.adapt(mockDraft);

      expect(ctx.provenance.source).toBe('draft:draft-1');
      expect(ctx.provenance.topicId).toBe('topic-abc');
      expect(ctx.provenance.derivedFrom).toEqual(['draft-0']);
    });

    it('should handle initial draft (no parent)', () => {
      const initialDraft: Draft = { ...mockDraft, parentDraftId: null, version: 1, changeType: 'INITIAL' };
      const ctx = draftAdapter.adapt(initialDraft);

      expect(ctx.payload.parentDraftId).toBeNull();
      expect(ctx.provenance.derivedFrom).toBeUndefined();
    });
  });

  describe('Evaluation Adapter', () => {
    const mockEvaluation: Evaluation = {
      id: 'eval-1',
      draftId: 'draft-1',
      topicId: 'topic-abc',
      hookScore: 85,
      emotionScore: 90,
      relatabilityScore: 75,
      noveltyScore: 80,
      structureScore: 70,
      readabilityScore: 88,
      shareabilityScore: 82,
      platformFitScore: 90,
      aiStyleScore: 60,
      utilityScore: 78,
      emotionalImpactScore: 88,
      logicalClarityScore: 82,
      overallScore: 85,
      strengths: ['hook有力', '情感真实'],
      issues: ['结尾仓促'],
      suggestions: [
        { section: 'ending', issue: '结尾太突然', suggestion: '增加总结', priority: 'medium' },
      ],
      emotionalArcAnalysis: { achieved: true, analysis: '情感弧线完整' },
      conclusion: '总体良好，需要优化结尾',
      createdAt: new Date('2026-09-28T00:00:00Z'),
      updatedAt: new Date('2026-09-28T00:00:00Z'),
    };

    it('should adapt Evaluation to EvaluationContext', () => {
      const ctx = evaluationAdapter.adapt(mockEvaluation);

      expect(isContextObject(ctx)).toBe(true);
      expect(ctx.kind).toBe('evaluation');
      expect(ctx.type).toBe('evaluation');
      expect(ctx.payload.evaluationId).toBe('eval-1');
      expect(ctx.payload.draftId).toBe('draft-1');
      expect(ctx.payload.overallScore).toBe(85);
      expect(ctx.payload.platformFit).toBe(90);
      expect(ctx.payload.strengths).toEqual(['hook有力', '情感真实']);
      expect(ctx.payload.weaknesses).toEqual(['结尾仓促']);
    });

    it('should extract emotional arc achieved', () => {
      const ctx = evaluationAdapter.adapt(mockEvaluation);
      expect(ctx.payload.emotionalArcAchieved).toBe(true);
    });

    it('should calculate suggestion count', () => {
      const ctx = evaluationAdapter.adapt(mockEvaluation);
      expect(ctx.payload.suggestionCount).toBe(1);
    });

    it('should derive confidence from overallScore', () => {
      const ctx = evaluationAdapter.adapt(mockEvaluation);
      expect(ctx.confidence).toBe(0.85);
    });

    it('should set lifecycle to evaluated', () => {
      const ctx = evaluationAdapter.adapt(mockEvaluation);
      expect(ctx.lifecycle.stage).toBe('evaluated');
    });

    it('should handle null overallScore', () => {
      const noScore: Evaluation = { ...mockEvaluation, overallScore: null };
      const ctx = evaluationAdapter.adapt(noScore);
      expect(ctx.confidence).toBeNull();
    });

    it('should handle missing emotionalArcAnalysis', () => {
      const noArc: Evaluation = { ...mockEvaluation, emotionalArcAnalysis: null };
      const ctx = evaluationAdapter.adapt(noArc);
      expect(ctx.payload.emotionalArcAchieved).toBeNull();
    });
  });
});