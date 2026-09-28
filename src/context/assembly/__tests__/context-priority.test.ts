import { describe, it, expect } from 'vitest';
import {
  rankContexts,
  getBasePriority,
  getPurposeAdjustment,
  getConfidenceAdjustment,
  getRelevanceAdjustment,
  getRecencyAdjustment,
  BASE_PRIORITY,
} from '../context-priority';
import type { RankingOptions } from '../context-priority';
import { createContextObject } from '../../context-factory';
import type { ContextObject } from '../../context-object';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function makeContext(overrides: Partial<ContextObject> = {}): ContextObject {
  return createContextObject({
    kind: 'knowledge',
    type: 'test',
    payload: { test: true },
    provenance: {
      source: 'test',
      sourceType: 'test',
      topicId: 'topic_1',
      projectId: 'proj_1',
    },
    ...overrides,
  });
}

const defaultOptions: RankingOptions = {
  purpose: 'writing',
  topicId: 'topic_1',
  projectId: 'proj_1',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContextPriority', () => {
  describe('Base Priority', () => {
    it('should assign highest priority to identity', () => {
      expect(getBasePriority('identity')).toBe(BASE_PRIORITY.identity);
      expect(getBasePriority('identity')).toBeGreaterThan(getBasePriority('knowledge'));
    });

    it('should assign lowest priority to memory', () => {
      expect(getBasePriority('memory')).toBe(BASE_PRIORITY.memory);
      expect(getBasePriority('memory')).toBeLessThan(getBasePriority('content'));
    });

    it('should return consistent priority for each kind', () => {
      for (const kind of ['identity', 'intent', 'strategy', 'knowledge', 'content', 'evaluation', 'decision', 'outcome', 'memory'] as const) {
        expect(getBasePriority(kind)).toBe(BASE_PRIORITY[kind]);
      }
    });
  });

  describe('Purpose Adjustment', () => {
    it('should boost contexts relevant to the purpose', () => {
      // 'strategy' is relevant for 'writing' purpose
      const adj = getPurposeAdjustment('strategy', 'writing');
      expect(adj).toBeGreaterThan(0);
    });

    it('should give zero adjustment for non-relevant kinds', () => {
      // 'outcome' is NOT in writing's relevant kinds
      const adj = getPurposeAdjustment('outcome', 'writing');
      expect(adj).toBe(0);
    });

    it('should give higher boost to first relevant kinds', () => {
      const firstAdj = getPurposeAdjustment('identity', 'writing');
      const lastAdj = getPurposeAdjustment('content', 'writing');
      // identity comes first in writing relevant kinds
      expect(firstAdj).toBeGreaterThanOrEqual(lastAdj);
    });

    it('should have purpose-specific relevant kinds', () => {
      // strategy purpose boosts intent
      const intentAdj = getPurposeAdjustment('intent', 'strategy');
      expect(intentAdj).toBeGreaterThan(0);

      // evaluation purpose boosts evaluation
      const evalAdj = getPurposeAdjustment('evaluation', 'evaluation');
      expect(evalAdj).toBeGreaterThan(0);
    });
  });

  describe('Confidence Adjustment', () => {
    it('should give full boost for high confidence', () => {
      expect(getConfidenceAdjustment(0.9)).toBeGreaterThan(0);
      expect(getConfidenceAdjustment(1.0)).toBeGreaterThan(0);
    });

    it('should give partial boost for medium confidence', () => {
      const high = getConfidenceAdjustment(0.9);
      const medium = getConfidenceAdjustment(0.6);
      expect(high).toBeGreaterThan(medium);
    });

    it('should give zero for null confidence', () => {
      expect(getConfidenceAdjustment(null)).toBe(0);
    });

    it('should give zero for undefined confidence', () => {
      expect(getConfidenceAdjustment(undefined)).toBe(0);
    });

    it('should give small boost for low confidence', () => {
      const low = getConfidenceAdjustment(0.3);
      expect(low).toBeGreaterThan(0);
      const medium = getConfidenceAdjustment(0.6);
      expect(medium).toBeGreaterThan(low);
    });
  });

  describe('Relevance Adjustment', () => {
    it('should boost for matching topic', () => {
      const ctx = makeContext({
        provenance: { source: 'test', topicId: 'topic_match' },
      });
      const adj = getRelevanceAdjustment(ctx, 'topic_match', undefined);
      expect(adj).toBeGreaterThan(0);
    });

    it('should boost for matching project', () => {
      const ctx = makeContext({
        provenance: { source: 'test', projectId: 'proj_match' },
      });
      const adj = getRelevanceAdjustment(ctx, undefined, 'proj_match');
      expect(adj).toBeGreaterThan(0);
    });

    it('should give zero for no match', () => {
      const ctx = makeContext({
        provenance: { source: 'test', topicId: 'other', projectId: 'other_proj' },
      });
      const adj = getRelevanceAdjustment(ctx, 'topic_1', 'proj_1');
      expect(adj).toBe(0);
    });

    it('should combine topic and project relevance', () => {
      const ctx = makeContext({
        provenance: { source: 'test', topicId: 'topic_1', projectId: 'proj_1' },
      });
      const bothAdj = getRelevanceAdjustment(ctx, 'topic_1', 'proj_1');
      const topicOnlyAdj = getRelevanceAdjustment(ctx, 'topic_1', undefined);
      expect(bothAdj).toBeGreaterThan(topicOnlyAdj);
    });
  });

  describe('Recency Adjustment', () => {
    it('should give higher score to newer contexts', () => {
      const referenceTime = Date.now();
      const recent = new Date(referenceTime - 1000).toISOString(); // 1 second ago
      const old = new Date(referenceTime - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago

      const recentAdj = getRecencyAdjustment(recent, referenceTime);
      const oldAdj = getRecencyAdjustment(old, referenceTime);

      expect(recentAdj).toBeGreaterThan(oldAdj);
    });

    it('should give zero for invalid dates', () => {
      expect(getRecencyAdjustment('invalid', Date.now())).toBe(0);
    });

    it('should handle future-dated contexts', () => {
      const future = new Date(Date.now() + 100000).toISOString();
      const adj = getRecencyAdjustment(future, Date.now());
      expect(adj).toBeGreaterThan(0);
    });

    it('should decay exponentially', () => {
      const referenceTime = Date.now();
      const oneDayAgo = new Date(referenceTime - 24 * 60 * 60 * 1000).toISOString();
      const twoDaysAgo = new Date(referenceTime - 48 * 60 * 60 * 1000).toISOString();

      const oneDay = getRecencyAdjustment(oneDayAgo, referenceTime);
      const twoDays = getRecencyAdjustment(twoDaysAgo, referenceTime);

      // After one half-life (24h), score should be halved
      expect(oneDay).toBeCloseTo(twoDays * 2, 0);
    });
  });

  describe('Full Ranking', () => {
    it('should sort contexts by score descending', () => {
      const contexts = [
        makeContext({ id: 'ctx_low', kind: 'memory', confidence: 0.2 }),
        makeContext({ id: 'ctx_high', kind: 'identity', confidence: 0.95 }),
        makeContext({ id: 'ctx_mid', kind: 'knowledge', confidence: 0.5 }),
      ];

      const ranked = rankContexts(contexts, defaultOptions);

      expect(ranked[0].context.id).toBe('ctx_high'); // identity + high confidence
      expect(ranked[2].context.id).toBe('ctx_low');  // memory + low confidence
    });

    it('should include reasons for each score', () => {
      const contexts = [makeContext({ id: 'ctx_1', kind: 'intent' })];
      const ranked = rankContexts(contexts, defaultOptions);
      expect(ranked[0].reasons.length).toBeGreaterThan(0);
    });

    it('should boost required contexts significantly', () => {
      const contexts = [
        makeContext({ id: 'ctx_normal', kind: 'knowledge' }),
        makeContext({ id: 'ctx_required', kind: 'memory' }),
      ];

      const ranked = rankContexts(contexts, {
        ...defaultOptions,
        requiredKinds: ['memory'],
      });

      // Required memory should outrank normal knowledge
      expect(ranked[0].context.id).toBe('ctx_required');
    });

    it('should produce deterministic results', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'strategy', confidence: 0.8 }),
        makeContext({ id: 'ctx_2', kind: 'intent', confidence: 0.6 }),
      ];

      const ranked1 = rankContexts(contexts, defaultOptions);
      const ranked2 = rankContexts(contexts, defaultOptions);

      expect(ranked1.map(r => r.context.id)).toEqual(ranked2.map(r => r.context.id));
      expect(ranked1.map(r => r.score)).toEqual(ranked2.map(r => r.score));
    });
  });
});
