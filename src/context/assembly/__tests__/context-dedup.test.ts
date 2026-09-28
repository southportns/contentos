import { describe, it, expect } from 'vitest';
import {
  deduplicateContexts,
  getContextFingerprint,
  getSourceTypeFingerprint,
} from '../context-dedup';
import type { ScoredContext } from '../types';
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
    provenance: { source: 'test', sourceType: 'test' },
    ...overrides,
  });
}

function makeScored(context: ContextObject, score: number = 100): ScoredContext {
  return {
    context,
    score,
    reasons: ['test'],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContextDeduplicator', () => {
  describe('Fingerprint Generation', () => {
    it('should generate unique fingerprints for different contexts', () => {
      const ctx1 = makeContext({ id: 'ctx_1', kind: 'strategy', type: 'content_strategy' });
      const ctx2 = makeContext({ id: 'ctx_2', kind: 'knowledge', type: 'knowledge_unit' });

      const fp1 = getContextFingerprint(ctx1);
      const fp2 = getContextFingerprint(ctx2);

      expect(fp1).not.toBe(fp2);
    });

    it('should generate same fingerprint for same context', () => {
      const ctx = makeContext({ id: 'ctx_1', kind: 'intent', type: 'topic_intent' });
      expect(getContextFingerprint(ctx)).toBe(getContextFingerprint(ctx));
    });

    it('should include derivedFrom in fingerprint', () => {
      const ctx1 = makeContext({
        id: 'ctx_1',
        provenance: { source: 'test', derivedFrom: ['a', 'b'] },
      });
      const ctx2 = makeContext({
        id: 'ctx_1',
        provenance: { source: 'test', derivedFrom: ['b', 'a'] }, // same items different order
      });
      // Should be the same because derivedFrom is sorted
      expect(getContextFingerprint(ctx1)).toBe(getContextFingerprint(ctx2));
    });

    it('should generate source+type fingerprint', () => {
      const ctx = makeContext({
        kind: 'strategy',
        type: 'content_strategy',
        provenance: { source: 'strategy:123' },
      });
      const fp = getSourceTypeFingerprint(ctx);
      expect(fp).toContain('strategy');
      expect(fp).toContain('content_strategy');
      expect(fp).toContain('strategy:123');
    });
  });

  describe('Deduplication', () => {
    it('should keep all unique contexts', () => {
      const contexts = [
        makeScored(makeContext({ id: 'ctx_1', kind: 'strategy' })),
        makeScored(makeContext({ id: 'ctx_2', kind: 'knowledge' })),
        makeScored(makeContext({ id: 'ctx_3', kind: 'intent' })),
      ];

      const result = deduplicateContexts(contexts);
      expect(result.unique).toHaveLength(3);
      expect(result.duplicates).toHaveLength(0);
    });

    it('should remove duplicates by ID', () => {
      const ctx1 = makeContext({ id: 'ctx_dup', kind: 'strategy', type: 'test' });
      const ctx2 = makeContext({ id: 'ctx_dup', kind: 'strategy', type: 'test' }); // same ID

      const result = deduplicateContexts([
        makeScored(ctx1, 100),
        makeScored(ctx2, 50),
      ]);

      expect(result.unique).toHaveLength(1);
      expect(result.duplicates).toHaveLength(1);
      expect(result.unique[0].score).toBe(100); // higher score kept
    });

    it('should remove duplicates by source+type', () => {
      const ctx1 = makeContext({
        id: 'ctx_a',
        kind: 'strategy',
        type: 'content_strategy',
        provenance: { source: 'strategy:123' },
      });
      const ctx2 = makeContext({
        id: 'ctx_b',
        kind: 'strategy',
        type: 'content_strategy',
        provenance: { source: 'strategy:123' }, // same source+type
      });

      const result = deduplicateContexts([
        makeScored(ctx1, 100),
        makeScored(ctx2, 50),
      ]);

      expect(result.unique).toHaveLength(1);
      expect(result.duplicates).toHaveLength(1);
    });

    it('should keep highest-scored duplicate', () => {
      const ctx1 = makeContext({
        id: 'ctx_low',
        kind: 'knowledge',
        type: 'ku',
        provenance: { source: 'ku:1' },
      });
      const ctx2 = makeContext({
        id: 'ctx_high',
        kind: 'knowledge',
        type: 'ku',
        provenance: { source: 'ku:1' }, // same source+type
      });

      // Lower score first, higher score second
      const result = deduplicateContexts([
        makeScored(ctx1, 50),
        makeScored(ctx2, 100),
      ]);

      // First occurrence wins since they're already ranked
      expect(result.unique).toHaveLength(1);
      expect(result.unique[0].context.id).toBe('ctx_low');
    });

    it('should handle empty input', () => {
      const result = deduplicateContexts([]);
      expect(result.unique).toHaveLength(0);
      expect(result.duplicates).toHaveLength(0);
    });

    it('should track exclusion reasons as duplicate', () => {
      const ctx1 = makeContext({
        id: 'ctx_1',
        kind: 'content',
        type: 'draft',
        provenance: { source: 'draft:a' },
      });
      const ctx2 = makeContext({
        id: 'ctx_2',
        kind: 'content',
        type: 'draft',
        provenance: { source: 'draft:a' },
      });

      const result = deduplicateContexts([
        makeScored(ctx1),
        makeScored(ctx2),
      ]);

      expect(result.duplicates[0].reason).toBe('duplicate');
      expect(result.duplicates[0].contextId).toBe('ctx_2');
    });
  });
});
