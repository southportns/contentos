import { describe, it, expect } from 'vitest';
import { selectContexts, PURPOSE_RELEVANT_KINDS, resolveContextScope, isScopeCompatible } from '../context-selector';
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // P0.6.2-R1: Scope Resolution
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('resolveContextScope', () => {
    it('should return explicit scope when set to global', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'global' } });
      expect(resolveContextScope(ctx)).toBe('global');
    });

    it('should return explicit scope when set to project', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'project', projectId: 'proj_1' } });
      expect(resolveContextScope(ctx)).toBe('project');
    });

    it('should return explicit scope when set to topic', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'topic', projectId: 'proj_1', topicId: 't1' } });
      expect(resolveContextScope(ctx)).toBe('topic');
    });

    it('should return explicit scope when set to unknown', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'unknown' } });
      expect(resolveContextScope(ctx)).toBe('unknown');
    });

    it('should infer project scope when projectId exists but scope is not set', () => {
      const ctx = makeContext({ provenance: { source: 'test', projectId: 'proj_1' } });
      expect(resolveContextScope(ctx)).toBe('project');
    });

    it('should infer global scope when neither scope nor projectId is set', () => {
      const ctx = makeContext({ provenance: { source: 'test' } });
      expect(resolveContextScope(ctx)).toBe('global');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // P0.6.2-R1: Scope Compatibility
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('isScopeCompatible', () => {
    it('should always allow global scope when request has projectId', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'global' } });
      const request = makeRequest({ projectId: 'proj_1' });
      expect(isScopeCompatible('global', ctx, request)).toBe(true);
    });

    it('should allow project scope when projectId matches', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'project', projectId: 'proj_1' } });
      const request = makeRequest({ projectId: 'proj_1' });
      expect(isScopeCompatible('project', ctx, request)).toBe(true);
    });

    it('should reject project scope when projectId does NOT match', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'project', projectId: 'proj_2' } });
      const request = makeRequest({ projectId: 'proj_1' });
      expect(isScopeCompatible('project', ctx, request)).toBe(false);
    });

    it('should allow topic scope when projectId and topicId match', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'topic', projectId: 'proj_1', topicId: 't1' } });
      const request = makeRequest({ projectId: 'proj_1', topicId: 't1' });
      expect(isScopeCompatible('topic', ctx, request)).toBe(true);
    });

    it('should reject topic scope when projectId does NOT match', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'topic', projectId: 'proj_2', topicId: 't1' } });
      const request = makeRequest({ projectId: 'proj_1', topicId: 't1' });
      expect(isScopeCompatible('topic', ctx, request)).toBe(false);
    });

    it('should reject topic scope when projectId matches but topicId does not', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'topic', projectId: 'proj_1', topicId: 't2' } });
      const request = makeRequest({ projectId: 'proj_1', topicId: 't1' });
      expect(isScopeCompatible('topic', ctx, request)).toBe(false);
    });

    it('should allow topic scope when request has no topicId filter', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'topic', projectId: 'proj_1', topicId: 't2' } });
      const request = makeRequest({ projectId: 'proj_1' });
      expect(isScopeCompatible('topic', ctx, request)).toBe(true);
    });

    it('should always reject unknown scope when request has projectId', () => {
      const ctx = makeContext({ provenance: { source: 'test', scope: 'unknown' } });
      const request = makeRequest({ projectId: 'proj_1' });
      expect(isScopeCompatible('unknown', ctx, request)).toBe(false);
    });

    it('should allow all scopes when request has no projectId', () => {
      const globalCtx = makeContext({ provenance: { source: 'test', scope: 'global' } });
      const projectCtx = makeContext({ provenance: { source: 'test', scope: 'project', projectId: 'proj_2' } });
      const topicCtx = makeContext({ provenance: { source: 'test', scope: 'topic', projectId: 'proj_2', topicId: 't2' } });
      const unknownCtx = makeContext({ provenance: { source: 'test', scope: 'unknown' } });
      const request = makeRequest({ projectId: undefined });

      expect(isScopeCompatible('global', globalCtx, request)).toBe(true);
      expect(isScopeCompatible('project', projectCtx, request)).toBe(true);
      expect(isScopeCompatible('topic', topicCtx, request)).toBe(true);
      expect(isScopeCompatible('unknown', unknownCtx, request)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // P0.6.2-R1: Scope-based Selection Integration
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Scope-based Selection (P0.6.2-R1)', () => {
    it('should exclude unknown scope contexts when project boundary exists', () => {
      const contexts = [
        makeContext({ id: 'ctx_global', provenance: { source: 'test', scope: 'global' } }),
        makeContext({ id: 'ctx_unknown', provenance: { source: 'test', scope: 'unknown' } }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        projectId: 'proj_1',
      }));
      expect(result.selected).toHaveLength(1);
      expect(result.selected[0].id).toBe('ctx_global');
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].contextId).toBe('ctx_unknown');
      expect(result.excluded[0].reason).toBe('unknown_scope');
    });

    it('should exclude mismatched project scope with scope_mismatch reason', () => {
      const contexts = [
        makeContext({ id: 'ctx_match', provenance: { source: 'test', scope: 'project', projectId: 'proj_1' } }),
        makeContext({ id: 'ctx_mismatch', provenance: { source: 'test', scope: 'project', projectId: 'proj_2' } }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        projectId: 'proj_1',
      }));
      expect(result.selected).toHaveLength(1);
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].reason).toBe('scope_mismatch');
    });

    it('should exclude mismatched topic scope with scope_mismatch reason', () => {
      const contexts = [
        makeContext({ id: 'ctx_topic_match', provenance: { source: 'test', scope: 'topic', projectId: 'proj_1', topicId: 't1' } }),
        makeContext({ id: 'ctx_topic_mismatch', provenance: { source: 'test', scope: 'topic', projectId: 'proj_1', topicId: 't2' } }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        projectId: 'proj_1',
        topicId: 't1',
      }));
      expect(result.selected).toHaveLength(1);
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].reason).toBe('scope_mismatch');
    });

    it('should allow inferred project scope without explicit scope field', () => {
      const contexts = [
        makeContext({ id: 'ctx_no_scope', provenance: { source: 'test', projectId: 'proj_1' } }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        projectId: 'proj_1',
      }));
      expect(result.selected).toHaveLength(1);
      expect(result.excluded).toHaveLength(0);
    });

    it('should allow inferred global scope (no projectId, no scope)', () => {
      const contexts = [
        makeContext({ id: 'ctx_global_inferred', provenance: { source: 'test' } }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        projectId: 'proj_1',
      }));
      expect(result.selected).toHaveLength(1);
      expect(result.excluded).toHaveLength(0);
    });

    it('should exclude inferred project scope that does not match', () => {
      const contexts = [
        makeContext({ id: 'ctx_proj_2', provenance: { source: 'test', projectId: 'proj_2' } }),
      ];
      const result = selectContexts(makeRequest({
        contexts,
        projectId: 'proj_1',
      }));
      expect(result.selected).toHaveLength(0);
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].reason).toBe('scope_mismatch');
    });
  });
});
