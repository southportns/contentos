import { describe, it, expect } from 'vitest';
import { selectContexts, PURPOSE_RELEVANT_KINDS } from '../context-selector';
import type { ContextAssemblyRequest } from '../types';
import type { ContextObject } from '../../context-object';
import { createContextObject } from '../../context-factory';

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

function makeRequest(overrides: Partial<ContextAssemblyRequest> = {}): ContextAssemblyRequest {
  return {
    contexts: [],
    purpose: 'generic',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContextSelector', () => {
  describe('Basic Selection', () => {
    it('should return empty result for empty input', () => {
      const result = selectContexts(makeRequest({ contexts: [] }));
      expect(result.selected).toHaveLength(0);
      expect(result.excluded).toHaveLength(0);
    });

    it('should select all valid contexts when no filters applied', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'intent' }),
        makeContext({ id: 'ctx_2', kind: 'strategy' }),
        makeContext({ id: 'ctx_3', kind: 'knowledge' }),
      ];
      const result = selectContexts(makeRequest({ contexts }));
      expect(result.selected).toHaveLength(3);
      expect(result.excluded).toHaveLength(0);
    });
  });

  describe('Required/Excluded Kinds', () => {
    it('should exclude contexts with excluded kinds', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'intent' }),
        makeContext({ id: 'ctx_2', kind: 'memory' }),
        makeContext({ id: 'ctx_3', kind: 'outcome' }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        excludedKinds: ['memory', 'outcome'],
      }));
      expect(result.selected).toHaveLength(1);
      expect(result.excluded).toHaveLength(2);
      expect(result.selected[0].id).toBe('ctx_1');
      expect(result.excluded[0].reason).toBe('excluded_kind');
    });

    it('should include required kinds', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'strategy' }),
        makeContext({ id: 'ctx_2', kind: 'intent' }),
      ];
      // Required kinds don't affect selection, only ranking
      const result = selectContexts(makeRequest({
        contexts,
        requiredKinds: ['intent'],
      }));
      expect(result.selected).toHaveLength(2);
    });

    it('should handle both required and excluded kinds together', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', kind: 'intent' }),
        makeContext({ id: 'ctx_2', kind: 'strategy' }),
        makeContext({ id: 'ctx_3', kind: 'memory' }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        requiredKinds: ['intent'],
        excludedKinds: ['memory'],
      }));
      expect(result.selected).toHaveLength(2);
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].reason).toBe('excluded_kind');
    });
  });

  describe('Project Filtering', () => {
    it('should exclude contexts from different projects', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', provenance: { source: 'test', projectId: 'proj_1', topicId: 't1' } }),
        makeContext({ id: 'ctx_2', provenance: { source: 'test', projectId: 'proj_2', topicId: 't2' } }),
        makeContext({ id: 'ctx_3', provenance: { source: 'test', projectId: 'proj_1', topicId: 't3' } }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        projectId: 'proj_1',
      }));
      expect(result.selected).toHaveLength(2);
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].contextId).toBe('ctx_2');
    });

    it('should allow contexts with no project affinity (global contexts)', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', provenance: { source: 'test' } }), // no projectId
        makeContext({ id: 'ctx_2', provenance: { source: 'test', projectId: 'proj_1' } }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        projectId: 'proj_1',
      }));
      // Global (no projectId) should be included
      expect(result.selected).toHaveLength(2);
    });

    it('should include all contexts when no projectId specified', () => {
      const contexts = [
        makeContext({ id: 'ctx_1', provenance: { source: 'test', projectId: 'proj_a' } }),
        makeContext({ id: 'ctx_2', provenance: { source: 'test', projectId: 'proj_b' } }),
      ];
      const result = selectContexts(makeRequest({ contexts }));
      expect(result.selected).toHaveLength(2);
    });
  });

  describe('Invalid Context Handling', () => {
    it('should exclude invalid contexts', () => {
      const validCtx = makeContext({ id: 'ctx_valid' });
      const invalidCtx = { id: '', kind: 'knowledge', type: 'test', payload: null } as unknown as ContextObject;
      const result = selectContexts(makeRequest({
        contexts: [validCtx, invalidCtx],
      }));
      expect(result.selected).toHaveLength(1);
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].reason).toBe('invalid');
    });
  });

  describe('Purpose Relevant Kinds', () => {
    it('should define relevant kinds for each purpose', () => {
      expect(PURPOSE_RELEVANT_KINDS['generic']).toContain('identity');
      expect(PURPOSE_RELEVANT_KINDS['generic']).toContain('knowledge');
      expect(PURPOSE_RELEVANT_KINDS['strategy']).toContain('intent');
      expect(PURPOSE_RELEVANT_KINDS['strategy']).toContain('knowledge');
      expect(PURPOSE_RELEVANT_KINDS['writing']).toContain('strategy');
      expect(PURPOSE_RELEVANT_KINDS['writing']).toContain('content');
      expect(PURPOSE_RELEVANT_KINDS['evaluation']).toContain('evaluation');
      expect(PURPOSE_RELEVANT_KINDS['evaluation']).toContain('content');
    });
  });
});
