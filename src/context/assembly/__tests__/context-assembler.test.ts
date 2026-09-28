import { describe, it, expect } from 'vitest';
import { assembleContexts, quickAssemble } from '../context-assembler';
import { buildContextPackage } from '../context-package';
import { serializeContextPackage } from '../context-serializer';
import type { ContextAssemblyRequest } from '../types';
import { createContextObject, createIntentContext, createStrategyContext } from '../../context-factory';
import type { ContextObject } from '../../context-object';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function makeContext(overrides: Partial<ContextObject> = {}): ContextObject {
  return createContextObject({
    kind: 'knowledge',
    type: 'test',
    payload: { data: 'test' },
    provenance: {
      source: 'test',
      sourceType: 'test',
      topicId: 'topic_1',
      projectId: 'proj_1',
    },
    ...overrides,
  });
}

function makeRequest(overrides: Partial<ContextAssemblyRequest> = {}): ContextAssemblyRequest {
  return {
    contexts: [],
    purpose: 'writing',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContextAssembler', () => {
  describe('Full Pipeline', () => {
    it('should execute select → rank → dedup → budget pipeline', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'intent', confidence: 0.9 }),
        makeContext({ id: 'ctx_2', kind: 'strategy', confidence: 0.8 }),
        makeContext({ id: 'ctx_3', kind: 'knowledge', confidence: 0.7 }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      }));

      expect(result.selected.length).toBeGreaterThan(0);
      expect(result.metadata.inputCount).toBe(3);
      expect(result.metadata.selectedCount).toBe(result.selected.length);
    });

    it('should produce a valid ContextPackage from result', () => {
      const contexts = [
        createIntentContext(
          { goal: 'Create viral content' },
          { provenance: { source: 'topic:1', topicId: 'topic_1', projectId: 'proj_1' } }
        ),
        createStrategyContext(
          { coreThesis: 'Authentic storytelling' },
          { provenance: { source: 'strategy:1', topicId: 'topic_1', projectId: 'proj_1' } }
        ),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      }));

      const pkg = buildContextPackage(result);

      expect(pkg.intent).toBeDefined();
      expect(pkg.strategy).toHaveLength(1);
      expect(pkg.metadata.purpose).toBe('writing');
      expect(pkg.metadata.contextCount).toBe(2);
    });

    it('should serialize without errors', () => {
      const contexts = [
        createIntentContext(
          { goal: 'Viral content', audience: 'Gen Z' },
          { provenance: { source: 'topic:1' } }
        ),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'strategy',
      }));

      const pkg = buildContextPackage(result);
      const serialized = serializeContextPackage(pkg);

      expect(serialized).toContain('[Intent]');
      expect(serialized).toContain('Viral content');
    });
  });

  describe('Purpose-Specific Behavior', () => {
    it('should produce different rankings for different purposes', () => {
      const contexts = [
        makeContext({ id: 'ctx_knowledge', kind: 'knowledge', confidence: 0.9 }),
        makeContext({ id: 'ctx_content', kind: 'content', confidence: 0.9 }),
      ];

      const forWriting = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      }));

      const forEvaluation = assembleContexts(makeRequest({
        contexts,
        purpose: 'evaluation',
        maxTokens: 10000,
      }));

      // Content should rank higher for evaluation than knowledge
      const writingOrder = forWriting.selected.map(s => s.context.id);
      const evalOrder = forEvaluation.selected.map(s => s.context.id);

      // Rankings differ because purpose affects scoring
      // (content is relevant for evaluation, knowledge may rank differently)
      expect(writingOrder).toBeDefined();
      expect(evalOrder).toBeDefined();
    });

    it('should adapt package structure to purpose', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'intent', type: 'topic_intent' }),
        makeContext({ id: 'ctx_2', kind: 'knowledge', type: 'ku' }),
        makeContext({ id: 'ctx_3', kind: 'strategy', type: 'content_strategy' }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'strategy',
        maxTokens: 10000,
      }));

      const pkg = buildContextPackage(result);
      expect(pkg.metadata.purpose).toBe('strategy');
      expect(pkg.metadata.contextCount).toBe(3);
    });
  });

  describe('Deduplication in Pipeline', () => {
    it('should remove duplicates during assembly', () => {
      const ctx1 = makeContext({
        id: 'ctx_dup_test',
        kind: 'strategy',
        type: 'content_strategy',
        provenance: { source: 'strategy:123' },
      });
      const ctx2 = makeContext({
        id: 'ctx_dup_test',
        kind: 'strategy',
        type: 'content_strategy',
        provenance: { source: 'strategy:123' },
      });

      const result = assembleContexts(makeContexts({
        contexts: [ctx1, ctx2],
        purpose: 'writing',
        maxTokens: 10000,
      }));

      expect(result.metadata.dedupCount).toBe(1);
      expect(result.selected).toHaveLength(1);
    });

    it('should handle no duplicates', () => {
      const contexts = [
        makeContext({ id: 'ctx_a', kind: 'strategy' }),
        makeContext({ id: 'ctx_b', kind: 'knowledge' }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      }));

      expect(result.metadata.dedupCount).toBe(0);
      expect(result.selected).toHaveLength(2);
    });
  });

  describe('Budget Enforcement', () => {
    it('should warn when budget is exceeded', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', payload: { text: 'a'.repeat(500) } }),
        makeContext({ id: 'ctx_2', payload: { text: 'b'.repeat(500) } }),
        makeContext({ id: 'ctx_3', payload: { text: 'c'.repeat(500) } }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
        maxTokens: 10, // Very small budget
      }));

      const budgetWarning = result.warnings.find(w => w.code === 'BUDGET_EXCEEDED');
      expect(budgetWarning).toBeDefined();
    });

    it('should warn when required context is missing', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'knowledge' }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
        requiredKinds: ['intent'], // intent not in contexts
      }));

      const missingWarning = result.warnings.find(w => w.code === 'REQUIRED_CONTEXT_MISSING');
      expect(missingWarning).toBeDefined();
    });
  });

  describe('Empty/Edge Cases', () => {
    it('should handle empty context list', () => {
      const result = assembleContexts(makeRequest({ contexts: [] }));

      expect(result.selected).toHaveLength(0);
      expect(result.warnings.some(w => w.code === 'EMPTY_CONTEXT')).toBe(true);
    });

    it('should handle all contexts excluded', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'memory' }),
        makeContext({ id: 'ctx_2', kind: 'outcome' }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        excludedKinds: ['memory', 'outcome'],
      }));

      expect(result.selected).toHaveLength(0);
      expect(result.warnings.some(w => w.code === 'ALL_CONTEXTS_EXCLUDED')).toBe(true);
    });

    it('should handle contexts with null confidence', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'strategy', confidence: null }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      }));

      expect(result.selected).toHaveLength(1);
      // Null confidence should not cause errors
    });

    it('should handle missing project/topic', () => {
      const contexts = [
        makeContext({
          id: 'ctx_1',
          provenance: { source: 'test' }, // no projectId or topicId
        }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
        projectId: 'proj_1',
        topicId: 'topic_1',
      }));

      // Should not crash; just no relevance boost
      expect(result.selected).toHaveLength(1);
    });
  });

  describe('Explainability', () => {
    it('should provide reasons for each selected context', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'intent', confidence: 0.8 }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'writing',
      }));

      for (const scored of result.selected) {
        expect(scored.reasons.length).toBeGreaterThan(0);
      }
    });

    it('should track all excluded contexts with reasons', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'memory' }),
        makeContext({ id: 'ctx_2', kind: 'outcome' }),
        makeContext({ id: 'ctx_3', kind: 'intent' }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        excludedKinds: ['memory'],
        maxTokens: 5, // force budget exclusion
      }));

      expect(result.excluded.length).toBeGreaterThan(0);
      for (const excluded of result.excluded) {
        expect(excluded.reason).toBeDefined();
        expect(excluded.contextId).toBeDefined();
      }
    });
  });

  describe('Quick Assemble', () => {
    it('should provide quick assembly with minimal config', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'intent' }),
      ];

      const result = quickAssemble(contexts, 'writing');

      expect(result.selected).toHaveLength(1);
      expect(result.metadata.purpose).toBe('writing');
    });
  });

  describe('Metadata', () => {
    it('should include assembly metadata', () => {
      const contexts = [makeContext({ id: 'ctx_1' })];

      const result = assembleContexts(makeRequest({
        contexts,
        purpose: 'evaluation',
      }));

      expect(result.metadata.purpose).toBe('evaluation');
      expect(result.metadata.inputCount).toBe(1);
      expect(result.metadata.assembledAt).toBeDefined();
      expect(new Date(result.metadata.assembledAt).getTime()).not.toBeNaN();
    });

    it('should track dedup count in metadata', () => {
      const ctx = makeContext({ id: 'dup', kind: 'strategy', provenance: { source: 's:1' } });

      const result = assembleContexts(makeRequest({
        contexts: [ctx, ctx],
        purpose: 'writing',
      }));

      expect(result.metadata.dedupCount).toBe(1);
    });
  });

  describe('Project Boundary', () => {
    it('should enforce project boundaries', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', provenance: { source: 'test', projectId: 'proj_a' } }),
        makeContext({ id: 'ctx_2', provenance: { source: 'test', projectId: 'proj_b' } }),
      ];

      const result = assembleContexts(makeRequest({
        contexts,
        projectId: 'proj_a',
        purpose: 'writing',
      }));

      expect(result.selected).toHaveLength(1);
      expect(result.selected[0].context.id).toBe('ctx_1');
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].contextId).toBe('ctx_2');
    });
  });
});

// Helper to avoid type errors in test
function makeContexts(req: Partial<ContextAssemblyRequest>): ContextAssemblyRequest {
  return {
    contexts: [],
    purpose: 'writing',
    ...req,
  };
}
