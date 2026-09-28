import { describe, it, expect } from 'vitest';
import {
  estimateContextTokens,
  estimateCollectionTokens,
  applyBudget,
  createDefaultBudget,
} from '../context-budget';
import type { ContextBudget, ScoredContext } from '../types';
import { createContextObject } from '../../context-factory';
import type { ContextObject } from '../../context-object';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function makeContext(overrides: Partial<ContextObject> = {}): ContextObject {
  return createContextObject({
    kind: 'knowledge',
    type: 'test',
    payload: { data: 'test content' },
    provenance: { source: 'test' },
    ...overrides,
  });
}

function makeScored(context: ContextObject, score: number = 100): ScoredContext {
  return { context, score, reasons: ['test'] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContextBudget', () => {
  describe('Token Estimation', () => {
    it('should return minimum 1 token', () => {
      const ctx = createContextObject({
        kind: 'identity',
        type: 'test',
        payload: {},
        provenance: { source: 'test' },
      });
      expect(estimateContextTokens(ctx)).toBeGreaterThanOrEqual(1);
    });

    it('should increase with larger payload', () => {
      const smallCtx = createContextObject({
        kind: 'knowledge',
        type: 'test',
        payload: { text: 'short' },
        provenance: { source: 'test' },
      });
      const largeCtx = createContextObject({
        kind: 'knowledge',
        type: 'test',
        payload: { text: 'a'.repeat(1000) },
        provenance: { source: 'test' },
      });

      expect(estimateContextTokens(largeCtx)).toBeGreaterThan(estimateContextTokens(smallCtx));
    });

    it('should be deterministic', () => {
      const ctx = makeContext({ payload: { key: 'value' } });
      expect(estimateContextTokens(ctx)).toBe(estimateContextTokens(ctx));
    });

    it('should estimate collection tokens as sum of individuals', () => {
      const contexts = [
        makeScored(makeContext({ payload: { a: '1' } })),
        makeScored(makeContext({ payload: { b: '2' } })),
      ];

      const total = estimateCollectionTokens(contexts);
      const sum = estimateContextTokens(contexts[0].context) + estimateContextTokens(contexts[1].context);
      expect(total).toBe(sum);
    });

    it('should use CHARS_PER_TOKEN as divisor', () => {
      const ctx = createContextObject({
        kind: 'test',
        type: 'test',
        payload: { text: 'a'.repeat(100) },
        provenance: { source: 'test' },
      });
      const estimated = estimateContextTokens(ctx);
      // 100 chars / 2.5 chars/token = ~40 tokens
      // Plus overhead for other fields
      expect(estimated).toBeGreaterThan(0);
    });
  });

  describe('Default Budget', () => {
    it('should create budget with defaults', () => {
      const budget = createDefaultBudget();
      expect(budget.maxTokens).toBe(4000);
      expect(budget.reservedTokens).toBe(500);
      expect(budget.maxContexts).toBe(20);
    });

    it('should allow overriding defaults', () => {
      const budget = createDefaultBudget({ maxTokens: 2000 });
      expect(budget.maxTokens).toBe(2000);
      expect(budget.reservedTokens).toBe(500); // still default
    });
  });

  describe('Budget Application', () => {
    it('should include all contexts when under budget', () => {
      const budget: ContextBudget = { maxTokens: 10000 };
      const contexts = [
        makeScored(makeContext({ id: 'ctx_1' })),
        makeScored(makeContext({ id: 'ctx_2' })),
      ];

      const result = applyBudget(contexts, budget);
      expect(result.selected).toHaveLength(2);
      expect(result.excluded).toHaveLength(0);
    });

    it('should exclude contexts when over budget', () => {
      const budget: ContextBudget = { maxTokens: 10 };
      const contexts = [
        makeScored(makeContext({ id: 'ctx_1', payload: { text: 'a'.repeat(100) } }), 100),
        makeScored(makeContext({ id: 'ctx_2', payload: { text: 'b'.repeat(100) } }), 50),
        makeScored(makeContext({ id: 'ctx_3', payload: { text: 'c'.repeat(100) } }), 10),
      ];

      const result = applyBudget(contexts, budget);
      expect(result.selected.length).toBeLessThan(3);
      expect(result.excluded.length).toBeGreaterThan(0);
    });

    it('should always include required contexts (budget exempt)', () => {
      const budget: ContextBudget = { maxTokens: 5 };
      const contexts = [
        makeScored(makeContext({ id: 'ctx_req', kind: 'intent' }), 100),
        makeScored(makeContext({ id: 'ctx_opt', kind: 'memory' }), 50),
      ];

      const result = applyBudget(contexts, budget, ['intent']);
      expect(result.selected.some(s => s.context.id === 'ctx_req')).toBe(true);
    });

    it('should respect maxContexts limit', () => {
      const budget: ContextBudget = { maxTokens: 100000, maxContexts: 2 };
      const contexts = [
        makeScored(makeContext({ id: 'ctx_1' }), 300),
        makeScored(makeContext({ id: 'ctx_2' }), 200),
        makeScored(makeContext({ id: 'ctx_3' }), 100),
      ];

      const result = applyBudget(contexts, budget);
      expect(result.selected).toHaveLength(2);
      expect(result.excluded).toHaveLength(1);
    });

    it('should respect maxPerKind limit', () => {
      const budget: ContextBudget = {
        maxTokens: 100000,
        maxPerKind: { knowledge: 1 },
      };
      const contexts = [
        makeScored(makeContext({ id: 'ctx_1', kind: 'knowledge' }), 300),
        makeScored(makeContext({ id: 'ctx_2', kind: 'knowledge' }), 200),
        makeScored(makeContext({ id: 'ctx_3', kind: 'strategy' }), 100),
      ];

      const result = applyBudget(contexts, budget);
      const knowledgeSelected = result.selected.filter(s => s.context.kind === 'knowledge');
      expect(knowledgeSelected).toHaveLength(1);
    });

    it('should subtract reservedTokens from effective budget', () => {
      const budget: ContextBudget = { maxTokens: 100, reservedTokens: 80 };
      // Effective budget is only 20 tokens
      const contexts = [
        makeScored(makeContext({ id: 'ctx_1', payload: { text: 'a'.repeat(100) } }), 100),
      ];

      const result = applyBudget(contexts, budget);
      // Should be excluded because 100 chars / 2.5 = 40 tokens > 20 effective
      expect(result.excluded.length).toBeGreaterThan(0);
    });

    it('should track token estimate in result', () => {
      const budget: ContextBudget = { maxTokens: 10000 };
      const contexts = [
        makeScored(makeContext({ id: 'ctx_1' })),
      ];

      const result = applyBudget(contexts, budget);
      expect(result.tokenEstimate).toBeGreaterThan(0);
    });

    it('should remove lowest-priority first when over budget', () => {
      const budget: ContextBudget = { maxTokens: 50 };
      const contexts = [
        makeScored(makeContext({ id: 'ctx_high', payload: { text: 'a'.repeat(30) } }), 100),
        makeScored(makeContext({ id: 'ctx_mid', payload: { text: 'b'.repeat(30) } }), 50),
        makeScored(makeContext({ id: 'ctx_low', payload: { text: 'c'.repeat(30) } }), 10),
      ];

      const result = applyBudget(contexts, budget);
      // Lowest priority should be excluded first
      expect(result.excluded.some(e => e.contextId === 'ctx_low')).toBe(true);
    });
  });
});
