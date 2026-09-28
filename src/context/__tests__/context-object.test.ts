/**
 * P0.6.1 — Context Object Tests
 *
 * Tests for the core ContextObject abstraction.
 */

import { describe, it, expect } from 'vitest';
import {
  createIdentityContext,
  createIntentContext,
  createStrategyContext,
  createContentContext,
  createEvaluationContext,
  createDecisionContext,
  createOutcomeContext,
  createMemoryContext,
} from '../context-factory';
import {
  isContextObject,
  isContextKind,
  getContextId,
  getContextKind,
  getContextType,
  getContextProvenance,
  getContextLifecycleStage,
  getContextConfidence,
} from '../context-utils';
import { CONTEXT_KINDS, CONTEXT_KIND_LABELS } from '../context-kind';
import { CONTEXT_LIFECYCLE_STAGES } from '../context-lifecycle';

describe('Context Object', () => {
  describe('Creation & Structure', () => {
    it('should create IdentityContext with all required fields', () => {
      const ctx = createIdentityContext({
        userId: 'user-1',
        projectId: 'proj-1',
        personaId: 'persona-1',
      });

      expect(ctx.id).toBeDefined();
      expect(ctx.id.length).toBeGreaterThan(0);
      expect(ctx.kind).toBe('identity');
      expect(ctx.type).toBe('identity');
      expect(ctx.payload.userId).toBe('user-1');
      expect(ctx.payload.projectId).toBe('proj-1');
      expect(ctx.payload.personaId).toBe('persona-1');
      expect(ctx.provenance).toBeDefined();
      expect(ctx.lifecycle).toBeDefined();
      expect(ctx.lifecycle.stage).toBe('captured');
      expect(ctx.createdAt).toBeDefined();
      expect(ctx.updatedAt).toBeDefined();
      expect(ctx.confidence).toBeNull();
    });

    it('should create IntentContext with goal and constraints', () => {
      const ctx = createIntentContext({
        goal: '创作爆款文案',
        contentType: 'emotional',
        audience: '年轻女性',
        constraints: ['不要虚构数据', '语气轻松'],
      });

      expect(ctx.kind).toBe('intent');
      expect(ctx.type).toBe('intent');
      expect(ctx.payload.goal).toBe('创作爆款文案');
      expect(ctx.payload.contentType).toBe('emotional');
      expect(ctx.payload.audience).toBe('年轻女性');
      expect(ctx.payload.constraints).toEqual(['不要虚构数据', '语气轻松']);
    });

    it('should create StrategyContext with correct kind', () => {
      const ctx = createStrategyContext({
        topicId: 'topic-1',
        topicName: '主题名',
        coreThesis: '核心论点',
        platform: 'xiaohongshu',
        approvalStatus: 'approved',
      });

      expect(ctx.kind).toBe('strategy');
      expect(ctx.type).toBe('strategy');
      expect(ctx.payload.coreThesis).toBe('核心论点');
      expect(ctx.payload.approvalStatus).toBe('approved');
    });

    it('should create ContentContext with draft metadata', () => {
      const ctx = createContentContext({
        draftId: 'draft-1',
        version: 2,
        title: '标题',
        wordCount: 1500,
        status: 'DRAFT',
        changeType: 'MANUAL_EDIT',
        parentDraftId: 'draft-0',
      });

      expect(ctx.kind).toBe('content');
      expect(ctx.type).toBe('content');
      expect(ctx.payload.draftId).toBe('draft-1');
      expect(ctx.payload.version).toBe(2);
      expect(ctx.payload.parentDraftId).toBe('draft-0');
    });

    it('should create EvaluationContext with scores', () => {
      const ctx = createEvaluationContext({
        evaluationId: 'eval-1',
        draftId: 'draft-1',
        overallScore: 85,
        platformFit: 90,
        strengths: ['hook有力', '情感真实'],
        weaknesses: ['结尾仓促'],
      });

      expect(ctx.kind).toBe('evaluation');
      expect(ctx.type).toBe('evaluation');
      expect(ctx.payload.overallScore).toBe(85);
      expect(ctx.payload.strengths).toEqual(['hook有力', '情感真实']);
    });

    it('should create DecisionContext', () => {
      const ctx = createDecisionContext({
        decisionType: 'strategy_approval',
        actor: 'user-1',
        selected: 'strategy-1',
        reason: '论点清晰',
      });

      expect(ctx.kind).toBe('decision');
      expect(ctx.type).toBe('decision');
      expect(ctx.payload.decisionType).toBe('strategy_approval');
      expect(ctx.payload.selected).toBe('strategy-1');
    });

    it('should create OutcomeContext', () => {
      const ctx = createOutcomeContext({
        outcomeType: 'publication',
        source: 'xiaohongshu',
        observedAt: '2026-09-28T00:00:00Z',
      });

      expect(ctx.kind).toBe('outcome');
      expect(ctx.type).toBe('outcome');
      expect(ctx.payload.outcomeType).toBe('publication');
    });

    it('should create MemoryContext', () => {
      const ctx = createMemoryContext({
        memoryKind: 'static',
        key: 'user_style_preference',
        value: ['casual', 'humorous'],
      });

      expect(ctx.kind).toBe('memory');
      expect(ctx.type).toBe('static');
      expect(ctx.payload.memoryKind).toBe('static');
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt and updatedAt to now by default', () => {
      const before = Date.now();
      const ctx = createIdentityContext({ userId: 'user-1' });
      const after = Date.now();

      const createdMs = new Date(ctx.createdAt).getTime();
      expect(createdMs).toBeGreaterThanOrEqual(before);
      expect(createdMs).toBeLessThanOrEqual(after);
      expect(ctx.updatedAt).toBe(ctx.createdAt);
    });

    it('should allow custom timestamps', () => {
      const ctx = createIdentityContext(
        { userId: 'user-1' },
        {
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        }
      );

      expect(ctx.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(ctx.updatedAt).toBe('2026-01-02T00:00:00Z');
    });
  });

  describe('Confidence', () => {
    it('should allow setting confidence', () => {
      const ctx = createStrategyContext(
        { topicId: 't1', coreThesis: 'test' },
        { confidence: 0.85 }
      );

      expect(ctx.confidence).toBe(0.85);
    });

    it('should default confidence to null', () => {
      const ctx = createIdentityContext({ userId: 'user-1' });
      expect(ctx.confidence).toBeNull();
    });
  });

  describe('Provenance', () => {
    it('should populate provenance from options', () => {
      const ctx = createIdentityContext(
        { userId: 'user-1' },
        {
          provenance: {
            source: 'test_source',
            sourceType: 'test',
            ownerId: 'owner-1',
            projectId: 'proj-1',
          },
        }
      );

      expect(ctx.provenance.source).toBe('test_source');
      expect(ctx.provenance.sourceType).toBe('test');
      expect(ctx.provenance.ownerId).toBe('owner-1');
      expect(ctx.provenance.projectId).toBe('proj-1');
    });

    it('should default provenance to empty object', () => {
      const ctx = createIdentityContext({ userId: 'user-1' });
      expect(ctx.provenance).toEqual({});
    });
  });
});

describe('ContextKind Registry', () => {
  it('should contain all 9 context kinds', () => {
    expect(CONTEXT_KINDS).toHaveLength(9);
    expect(CONTEXT_KINDS).toContain('identity');
    expect(CONTEXT_KINDS).toContain('intent');
    expect(CONTEXT_KINDS).toContain('knowledge');
    expect(CONTEXT_KINDS).toContain('strategy');
    expect(CONTEXT_KINDS).toContain('content');
    expect(CONTEXT_KINDS).toContain('evaluation');
    expect(CONTEXT_KINDS).toContain('decision');
    expect(CONTEXT_KINDS).toContain('outcome');
    expect(CONTEXT_KINDS).toContain('memory');
  });

  it('should have labels for all kinds', () => {
    for (const kind of CONTEXT_KINDS) {
      expect(CONTEXT_KIND_LABELS[kind]).toBeDefined();
      expect(typeof CONTEXT_KIND_LABELS[kind]).toBe('string');
    }
  });
});

describe('Lifecycle Stages', () => {
  it('should contain all 8 lifecycle stages', () => {
    expect(CONTEXT_LIFECYCLE_STAGES).toHaveLength(8);
    expect(CONTEXT_LIFECYCLE_STAGES).toEqual(
      expect.arrayContaining([
        'captured',
        'normalized',
        'stored',
        'retrieved',
        'applied',
        'evaluated',
        'updated',
        'learned',
      ])
    );
  });
});

describe('Type Guards', () => {
  it('isContextObject should validate correct context', () => {
    const ctx = createIdentityContext({ userId: 'user-1' });
    expect(isContextObject(ctx)).toBe(true);
  });

  it('isContextObject should reject null', () => {
    expect(isContextObject(null)).toBe(false);
  });

  it('isContextObject should reject undefined', () => {
    expect(isContextObject(undefined)).toBe(false);
  });

  it('isContextObject should reject non-object', () => {
    expect(isContextObject('string')).toBe(false);
    expect(isContextObject(123)).toBe(false);
  });

  it('isContextObject should reject object missing required fields', () => {
    expect(isContextObject({})).toBe(false);
    expect(isContextObject({ id: '1', kind: 'identity' })).toBe(false);
  });

  it('isContextKind should validate known kinds', () => {
    expect(isContextKind('identity')).toBe(true);
    expect(isContextKind('strategy')).toBe(true);
    expect(isContextKind('unknown')).toBe(false);
    expect(isContextKind(null)).toBe(false);
    expect(isContextKind(123)).toBe(false);
  });

  it('getContextId should return context id', () => {
    const ctx = createIdentityContext({ userId: 'user-1' });
    expect(getContextId(ctx)).toBe(ctx.id);
  });

  it('getContextKind should return kind', () => {
    const ctx = createStrategyContext({ topicId: 't1', coreThesis: 'test' });
    expect(getContextKind(ctx)).toBe('strategy');
  });

  it('getContextType should return type', () => {
    const ctx = createContentContext({ draftId: 'd1' });
    expect(getContextType(ctx)).toBe('content');
  });

  it('getContextProvenance should return provenance', () => {
    const ctx = createIdentityContext(
      { userId: 'user-1' },
      { provenance: { source: 'test' } }
    );
    expect(getContextProvenance(ctx).source).toBe('test');
  });

  it('getContextLifecycleStage should return stage', () => {
    const ctx = createIdentityContext({ userId: 'user-1' });
    expect(getContextLifecycleStage(ctx)).toBe('captured');
  });

  it('getContextConfidence should return confidence or null', () => {
    const ctx1 = createIdentityContext({ userId: 'u1' }, { confidence: 0.9 });
    expect(getContextConfidence(ctx1)).toBe(0.9);

    const ctx2 = createIdentityContext({ userId: 'u2' });
    expect(getContextConfidence(ctx2)).toBeNull();
  });
});