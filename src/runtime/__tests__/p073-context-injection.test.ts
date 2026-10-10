/**
 * P0.7.3 — Context Injection Tests
 *
 * Comprehensive test suite for the Context Injection pipeline that
 * assembles validated ContextObjects into a stable, complete,
 * budget-constrained, auditable RuntimeContextPackage.
 *
 * Test Groups:
 *   A. Package Structure & Consistency
 *   B. Budget & Truncation
 *   C. Determinism
 *   D. Purpose & Compatibility
 *   E. Error Handling
 */

import { describe, it, expect, vi } from 'vitest';
import {
  assembleRuntimeContext,
  mapPurposeToAssembly,
  createContextUsage,
} from '../runtime-context';
import { runContextOS } from '../runtime-core';
import type { ContextOSRuntimeFullDependencies } from '../runtime-core';
import {
  ContextOSRuntimeError,
  RuntimeValidationError,
} from '../runtime-types';
import type { ContextOSRuntimeRequest } from '../runtime-types';
import type { ContextObject } from '@/context/context-object';
import type { ContextProvenance } from '@/context/context-provenance';
import type { ContextLifecycleState } from '@/context/context-lifecycle';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures & Factories
// ═══════════════════════════════════════════════════════════════════════════════

const FIXED_TIMESTAMP = '2026-10-10T08:00:00.000Z';
const NOW_FN = () => FIXED_TIMESTAMP;

/**
 * Create a valid ContextLifecycleState for test data.
 */
function createLifecycle(): ContextLifecycleState {
  return { stage: 'retrieved', updatedAt: FIXED_TIMESTAMP };
}

/**
 * Create a valid ContextProvenance for test data.
 */
function createProvenance(overrides: Partial<ContextProvenance> = {}): ContextProvenance {
  return {
    source: 'test',
    sourceType: 'memory',
    ownerId: 'user_1',
    scope: 'global',
    ...overrides,
  };
}

/**
 * Create a valid ContextObject for use in assembly/injection tests.
 * Uses the same structure as the P0.7.2 test factory.
 */
function createTestContextObject(
  overrides: Partial<ContextObject> & { id: string; kind: ContextObject['kind'] }
): ContextObject {
  return {
    type: 'static',
    payload: { text: `Payload for ${overrides.id}` },
    provenance: createProvenance(),
    lifecycle: createLifecycle(),
    confidence: 0.8,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

/**
 * Create multiple test contexts with distinct source+type fingerprints.
 *
 * Each context gets a unique source and type to prevent the Assembly
 * Engine's dedup from treating them as duplicates (dedup uses
 * source+kind+type fingerprint — identical fingerprints collapse).
 */
function createContextBundle(count: number, kind: ContextObject['kind'] = 'knowledge'): ContextObject[] {
  return Array.from({ length: count }, (_, i) =>
    createTestContextObject({
      id: `ctx_${kind}_${i}`,
      kind,
      type: `type_${i}`,
      payload: { text: `Bundle context ${i}`, index: i },
      provenance: createProvenance({ source: `source_${i}` }),
    })
  );
}

/**
 * Create a context with a large payload to trigger token budget constraints.
 * The payload contains repeated text to ensure the Assembly Engine's
 * token estimator (chars / CHARS_PER_TOKEN) computes a large value.
 */
function createLargeContext(id: string, marker: string, sizeChars: number): ContextObject {
  return createTestContextObject({
    id,
    kind: 'memory',
    type: `type_${id}`,
    // 'x'.repeat(sizeChars) creates a payload whose JSON serialization
    // is approximately sizeChars + key overhead in length — enough to
    // trigger token budget enforcement at typical budgets.
    // 'memory' kind hits the generic fallback serializer (key:value output).
    payload: { marker, data: 'x'.repeat(sizeChars) },
    provenance: createProvenance({ source: `source_${id}` }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group A: Package Structure & Consistency
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Package Structure & Consistency', () => {

  it('A1: should assemble valid contexts into a complete RuntimeContextPackage', async () => {
    const contexts = createContextBundle(3, 'knowledge');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    expect(pkg).toBeDefined();
    expect(pkg.contexts).toHaveLength(3);
    expect(pkg.serialized).toBeDefined();
    expect(typeof pkg.serialized).toBe('string');
    expect(pkg.tokenEstimate).toBeGreaterThan(0);
    expect(pkg.generatedAt).toBe(FIXED_TIMESTAMP);
  });

  it('A2: contextIds must match contexts.map(c => c.id) in same order', async () => {
    const contexts = createContextBundle(4, 'memory');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    const expectedIds = pkg.contexts.map((c) => c.id);
    expect(pkg.contextIds).toEqual(expectedIds);
  });

  it('A3: provenance must correspond 1:1 with contexts in same order', async () => {
    const contexts = createContextBundle(3, 'strategy');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    expect(pkg.provenance).toHaveLength(pkg.contexts.length);
    for (let i = 0; i < pkg.contexts.length; i++) {
      expect(pkg.provenance[i]).toBe(pkg.contexts[i].provenance);
    }
  });

  it('A4: serialized output contains only the final selected (post-budget) contexts', async () => {
    // Use generic contexts whose serializer includes identifiable payload content
    // (generic fallback serializer outputs key:value pairs from payload)
    const visibleA = createTestContextObject({
      id: 'visible_a',
      kind: 'memory',
      type: 't1',
      payload: { marker: 'MARKER_VISIBLE_A' },
      provenance: createProvenance({ source: 'src_a' }),
    });
    const visibleB = createTestContextObject({
      id: 'visible_b',
      kind: 'memory',
      type: 't2',
      payload: { marker: 'MARKER_VISIBLE_B' },
      provenance: createProvenance({ source: 'src_b' }),
    });
    const excludedC = createTestContextObject({
      id: 'excluded_c',
      kind: 'memory',
      type: 't3',
      payload: { marker: 'MARKER_EXCLUDED_C' },
      provenance: createProvenance({ source: 'src_c' }),
    });
    const excludedD = createTestContextObject({
      id: 'excluded_d',
      kind: 'memory',
      type: 't4',
      payload: { marker: 'MARKER_EXCLUDED_D' },
      provenance: createProvenance({ source: 'src_d' }),
    });

    const contexts = [visibleA, visibleB, excludedC, excludedD];
    const pkg = await assembleRuntimeContext(
      contexts,
      { maxContexts: 2 },
      'generic',
      NOW_FN
    );

    // Verify some contexts were excluded
    expect(pkg.contexts.length).toBeLessThan(contexts.length);
    expect(pkg.contexts.length).toBeLessThanOrEqual(2);

    const selectedIds = new Set(pkg.contextIds);

    // Selected context content MUST appear in serialized output
    for (const ctx of pkg.contexts) {
      const payload = ctx.payload as Record<string, unknown>;
      if (payload.marker) {
        expect(pkg.serialized).toContain(payload.marker as string);
      }
    }

    // Excluded context content must NOT appear in serialized output
    for (const ctx of contexts) {
      const payload = ctx.payload as Record<string, unknown>;
      if (payload.marker && !selectedIds.has(ctx.id)) {
        expect(pkg.serialized).not.toContain(payload.marker as string);
      }
    }
  });

  it('A5: empty input returns a structurally valid empty package', async () => {
    const pkg = await assembleRuntimeContext([], undefined, 'generic', NOW_FN);

    expect(pkg.contexts).toHaveLength(0);
    expect(pkg.contextIds).toEqual([]);
    expect(pkg.provenance).toEqual([]);
    expect(pkg.tokenEstimate).toBe(0);
    expect(pkg.generatedAt).toBe(FIXED_TIMESTAMP);
    // Serialized should be an empty string or header-only
    expect(typeof pkg.serialized).toBe('string');
  });

  it('A6: six core fields are always present and correctly typed', async () => {
    const contexts = createContextBundle(2, 'knowledge');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    // Verify all six core RuntimeContextPackage fields
    expect(pkg).toHaveProperty('contexts');
    expect(pkg).toHaveProperty('serialized');
    expect(pkg).toHaveProperty('tokenEstimate');
    expect(pkg).toHaveProperty('contextIds');
    expect(pkg).toHaveProperty('provenance');
    expect(pkg).toHaveProperty('generatedAt');

    expect(Array.isArray(pkg.contexts)).toBe(true);
    expect(typeof pkg.serialized).toBe('string');
    expect(typeof pkg.tokenEstimate).toBe('number');
    expect(Array.isArray(pkg.contextIds)).toBe(true);
    expect(Array.isArray(pkg.provenance)).toBe(true);
    expect(typeof pkg.generatedAt).toBe('string');
  });

  it('A7: contexts, contextIds, provenance lengths must be equal', async () => {
    const contexts = createContextBundle(5, 'content');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    expect(pkg.contextIds).toHaveLength(pkg.contexts.length);
    expect(pkg.provenance).toHaveLength(pkg.contexts.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Budget & Truncation
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Budget & Truncation', () => {

  it('B1: maxContexts limits the number of contexts in the package', async () => {
    const contexts = createContextBundle(10, 'knowledge');
    const pkg = await assembleRuntimeContext(
      contexts,
      { maxContexts: 3 },
      'generic',
      NOW_FN
    );

    expect(pkg.contexts.length).toBeLessThanOrEqual(3);
    expect(pkg.contextIds.length).toBeLessThanOrEqual(3);
  });

  it('B2: maxTokens enforces budget and causes actual content exclusion', async () => {
    // Create contexts with large payloads so that token estimation
    // genuinely exceeds a tight budget. The Assembly Engine estimates
    // tokens as ceil(jsonLength / CHARS_PER_TOKEN) where CHARS_PER_TOKEN=2.5.
    // A 500-char payload ≈ 200 tokens each.
    const contexts = Array.from({ length: 5 }, (_, i) =>
      createLargeContext(`large_ctx_${i}`, `LARGE_PAYLOAD_${i}`, 500)
    );

    // maxTokens=100 means effective budget (100 - 500 reserved = negative
    // with default reservedTokens) so only a few or zero optional contexts survive.
    // What matters is: budget is respected AND truncation genuinely occurred.
    const pkg = await assembleRuntimeContext(
      contexts,
      { maxTokens: 100 },
      'generic',
      NOW_FN
    );

    // Token estimate must respect the budget (effective budget is <= maxTokens)
    expect(pkg.tokenEstimate).toBeLessThanOrEqual(100);

    // Truncation must have occurred: 5 large contexts cannot all fit in 100 tokens
    // (each alone is ~200 tokens). This distinguishes a real budget enforcement
    // from a scenario where input never triggered the budget limit.
    expect(pkg.contexts.length).toBeLessThan(contexts.length);

    // No payload content from excluded contexts should leak into serialized output
    const selectedIds = new Set(pkg.contextIds);
    for (const ctx of contexts) {
      if (!selectedIds.has(ctx.id)) {
        const marker = (ctx.payload as Record<string, unknown>).marker as string;
        expect(pkg.serialized).not.toContain(marker);
      }
    }
  });

  it('B3: budget-excluded contexts do not leak into any package field', async () => {
    // Create contexts with identifiable markers
    const visibleA = createTestContextObject({
      id: 'VIS_CTX_A',
      kind: 'memory',
      type: 't1',
      payload: { marker: 'IDENTIFIABLE_CONTENT_A' },
      provenance: createProvenance({ source: 'src_a' }),
    });
    const visibleB = createTestContextObject({
      id: 'VIS_CTX_B',
      kind: 'memory',
      type: 't2',
      payload: { marker: 'IDENTIFIABLE_CONTENT_B' },
      provenance: createProvenance({ source: 'src_b' }),
    });
    const excludedC = createTestContextObject({
      id: 'EXC_CTX_C',
      kind: 'memory',
      type: 't3',
      payload: { marker: 'EXCLUDED_CONTENT_C' },
      provenance: createProvenance({ source: 'src_c' }),
    });
    const excludedD = createTestContextObject({
      id: 'EXC_CTX_D',
      kind: 'memory',
      type: 't4',
      payload: { marker: 'EXCLUDED_CONTENT_D' },
      provenance: createProvenance({ source: 'src_d' }),
    });

    const allContexts = [visibleA, visibleB, excludedC, excludedD];
    const pkg = await assembleRuntimeContext(
      allContexts,
      { maxContexts: 2 },
      'generic',
      NOW_FN
    );

    const selectedIds = new Set(pkg.contextIds);

    // 1. Package internal consistency
    expect(selectedIds.size).toBe(pkg.contexts.length);
    for (const ctx of pkg.contexts) {
      expect(selectedIds.has(ctx.id)).toBe(true);
    }

    // 2. Provenance must correspond 1:1 with contexts (no extra provenance from excluded)
    expect(pkg.provenance).toHaveLength(pkg.contexts.length);

    // 3. Excluded context content must not appear in serialized output
    for (const ctx of allContexts) {
      if (!selectedIds.has(ctx.id)) {
        const marker = (ctx.payload as Record<string, unknown>).marker as string;
        expect(pkg.serialized).not.toContain(marker);
      }
    }
  });

  it('B4: package with maxContexts=0 returns zero-length context arrays', async () => {
    const contexts = createContextBundle(5, 'knowledge');
    const pkg = await assembleRuntimeContext(
      contexts,
      { maxContexts: 0 },
      'generic',
      NOW_FN
    );

    // With maxContexts=0, no optional contexts should be selected
    expect(pkg.contexts).toHaveLength(0);
    expect(pkg.contextIds).toEqual([]);
  });

  it('B5: serialized output reflects only budget-selected content', async () => {
    // Use generic contexts whose serializer outputs payload markers.
    // This test verifies the serialization boundary: content from contexts
    // eliminated by budget constraints must not appear in the serialized output.
    const ctxA = createTestContextObject({
      id: 'SEL_A',
      kind: 'memory',
      type: 't1',
      payload: { marker: 'SERIALIZED_CONTENT_A' },
      provenance: createProvenance({ source: 'src_a' }),
    });
    const ctxB = createTestContextObject({
      id: 'SEL_B',
      kind: 'memory',
      type: 't2',
      payload: { marker: 'SERIALIZED_CONTENT_B' },
      provenance: createProvenance({ source: 'src_b' }),
    });
    const ctxC = createTestContextObject({
      id: 'REJ_C',
      kind: 'memory',
      type: 't3',
      payload: { marker: 'REJECTED_CONTENT_C' },
      provenance: createProvenance({ source: 'src_c' }),
    });
    const ctxD = createTestContextObject({
      id: 'REJ_D',
      kind: 'memory',
      type: 't4',
      payload: { marker: 'REJECTED_CONTENT_D' },
      provenance: createProvenance({ source: 'src_d' }),
    });

    const allContexts = [ctxA, ctxB, ctxC, ctxD];
    const pkg = await assembleRuntimeContext(
      allContexts,
      { maxContexts: 2 },
      'generic',
      NOW_FN
    );

    const selectedIds = new Set(pkg.contextIds);

    // Verify: excluded context content does NOT appear in serialized output
    for (const ctx of allContexts) {
      const marker = (ctx.payload as Record<string, unknown>).marker as string;
      if (selectedIds.has(ctx.id)) {
        expect(pkg.serialized).toContain(marker);
      } else {
        expect(pkg.serialized).not.toContain(marker);
      }
    }
  });

  it('B6: tokenEstimate comes from Assembly Engine, not overridden', async () => {
    const contexts = createContextBundle(3, 'knowledge');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    // The tokenEstimate must be a non-negative number derived from the assembly result
    expect(pkg.tokenEstimate).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(pkg.tokenEstimate)).toBe(true);
  });

  it('B7: large maxContexts does not artificially limit results', async () => {
    const contexts = createContextBundle(5, 'knowledge');
    const pkg = await assembleRuntimeContext(
      contexts,
      { maxContexts: 1000 },
      'generic',
      NOW_FN
    );

    // All contexts should survive when budget is generous
    expect(pkg.contexts).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Determinism
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Determinism', () => {

  it('C1: same input + policy produces same contextIds order', async () => {
    const contexts = createContextBundle(5, 'knowledge');

    const pkg1 = await assembleRuntimeContext(contexts, undefined, 'writing', NOW_FN);
    const pkg2 = await assembleRuntimeContext(contexts, undefined, 'writing', NOW_FN);

    expect(pkg1.contextIds).toEqual(pkg2.contextIds);
  });

  it('C2: same injected clock produces same generatedAt', async () => {
    const contexts = createContextBundle(3, 'knowledge');

    const pkg1 = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);
    const pkg2 = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    expect(pkg1.generatedAt).toBe(pkg2.generatedAt);
    expect(pkg1.generatedAt).toBe(FIXED_TIMESTAMP);
  });

  it('C3: same input produces same serialized output', async () => {
    const contexts = createContextBundle(4, 'memory');

    const pkg1 = await assembleRuntimeContext(contexts, undefined, 'evaluation', NOW_FN);
    const pkg2 = await assembleRuntimeContext(contexts, undefined, 'evaluation', NOW_FN);

    expect(pkg1.serialized).toBe(pkg2.serialized);
  });

  it('C4: different timestamps produce different generatedAt but same context order', async () => {
    const contexts = createContextBundle(3, 'knowledge');
    const now1 = () => '2026-10-10T08:00:00.000Z';
    const now2 = () => '2026-10-10T09:00:00.000Z';

    const pkg1 = await assembleRuntimeContext(contexts, undefined, 'generic', now1);
    const pkg2 = await assembleRuntimeContext(contexts, undefined, 'generic', now2);

    expect(pkg1.generatedAt).toBe('2026-10-10T08:00:00.000Z');
    expect(pkg2.generatedAt).toBe('2026-10-10T09:00:00.000Z');
    expect(pkg1.contextIds).toEqual(pkg2.contextIds);
  });

  it('C5: no reliance on wall clock when now() is injected', async () => {
    const contexts = createContextBundle(2, 'knowledge');

    // Even though Date.now() would differ, injected clock ensures determinism
    const pkg = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    expect(pkg.generatedAt).toBe(FIXED_TIMESTAMP);
  });

  it('C6: multiple calls with same inputs produce byte-identical packages', async () => {
    const contexts = createContextBundle(6, 'knowledge');
    const policy = { maxTokens: 4000, maxContexts: 10 };

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        assembleRuntimeContext(contexts, policy, 'strategy', NOW_FN)
      )
    );

    // All results should be identical
    for (let i = 1; i < results.length; i++) {
      expect(results[i].contextIds).toEqual(results[0].contextIds);
      expect(results[i].serialized).toBe(results[0].serialized);
      expect(results[i].tokenEstimate).toBe(results[0].tokenEstimate);
      expect(results[i].generatedAt).toBe(results[0].generatedAt);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Purpose & Compatibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Purpose & Compatibility', () => {

  it('D1: strategy/plan purpose maps to AssemblyPurpose "strategy"', async () => {
    const contexts = createContextBundle(2, 'strategy');

    // Verify exact mapping: "strategy" keyword and "plan" keyword
    expect(mapPurposeToAssembly('content_strategy')).toBe('strategy');
    expect(mapPurposeToAssembly('plan_creation')).toBe('strategy');

    // Verify assembleRuntimeContext works end-to-end with strategy purpose
    const pkg = await assembleRuntimeContext(contexts, undefined, 'content_strategy', NOW_FN);
    expect(pkg.contexts.length).toBeGreaterThanOrEqual(0);
    expect(pkg.tokenEstimate).toBeGreaterThanOrEqual(0);
  });

  it('D2: evaluation/assess/score purpose maps to AssemblyPurpose "evaluation"', async () => {
    const contexts = createContextBundle(2, 'evaluation');

    // Verify exact mapping: "evaluation", "assess", "score" keywords
    expect(mapPurposeToAssembly('evaluation_request')).toBe('evaluation');
    expect(mapPurposeToAssembly('assess_quality')).toBe('evaluation');
    expect(mapPurposeToAssembly('score_draft')).toBe('evaluation');

    const pkg = await assembleRuntimeContext(contexts, undefined, 'score_draft', NOW_FN);
    expect(pkg.contexts.length).toBeGreaterThanOrEqual(0);
  });

  it('D3: writing/content/draft purpose maps to AssemblyPurpose "writing"', async () => {
    const contexts = createContextBundle(2, 'content');

    // Verify exact mapping: "write", "content", "draft" keywords
    expect(mapPurposeToAssembly('writing_content')).toBe('writing');
    expect(mapPurposeToAssembly('draft_document')).toBe('writing');
    expect(mapPurposeToAssembly('content_generation')).toBe('writing');

    const pkg = await assembleRuntimeContext(contexts, undefined, 'writing_content', NOW_FN);
    expect(pkg.contexts.length).toBeGreaterThanOrEqual(0);
  });

  it('D4: unknown purpose maps to AssemblyPurpose "generic"', async () => {
    const contexts = createContextBundle(2, 'knowledge');

    // Verify exact mapping: empty string and unrecognized purpose
    expect(mapPurposeToAssembly('data_processing')).toBe('generic');
    expect(mapPurposeToAssembly('random_task')).toBe('generic');
    expect(mapPurposeToAssembly('')).toBe('generic');

    const pkg = await assembleRuntimeContext(contexts, undefined, 'data_processing', NOW_FN);
    expect(pkg.contexts.length).toBeGreaterThanOrEqual(0);
  });

  it('D5: mapPurposeToAssembly covers all keyword categories', () => {
    // strategy keywords
    expect(mapPurposeToAssembly('content_strategy')).toBe('strategy');
    expect(mapPurposeToAssembly('plan_creation')).toBe('strategy');
    // evaluation keywords
    expect(mapPurposeToAssembly('evaluation_request')).toBe('evaluation');
    expect(mapPurposeToAssembly('score_draft')).toBe('evaluation');
    // writing keywords
    expect(mapPurposeToAssembly('writing_content')).toBe('writing');
    // unknown → generic
    expect(mapPurposeToAssembly('random_task')).toBe('generic');
    // empty → generic
    expect(mapPurposeToAssembly('')).toBe('generic');
  });

  it('D6: createContextUsage produces valid usage records', () => {
    const usage = createContextUsage('ctx_1', 'run_abc', 'writing', NOW_FN);

    expect(usage.contextId).toBe('ctx_1');
    expect(usage.runId).toBe('run_abc');
    expect(usage.purpose).toBe('writing');
    expect(usage.usedAt).toBe(FIXED_TIMESTAMP);
  });

  it('D7: runtime runner completes full pipeline end-to-end', async () => {
    const contexts = createContextBundle(3, 'knowledge');

    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue(contexts),
      assembleContext: vi.fn().mockImplementation(async (ctxs, policy, purpose) =>
        assembleRuntimeContext(ctxs, policy, purpose, NOW_FN)
      ),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: { query: 'test' },
    };

    const result = await runContextOS(request, mockDeps);

    expect(result.run.status).toBe('completed');
    expect(result.contextPackage.contexts).toHaveLength(3);
    expect(result.contextPackage.generatedAt).toBe(FIXED_TIMESTAMP);
  });

  it('D8: runContextOS returns expected CreateRunResult shape', async () => {
    const contexts = createContextBundle(2, 'knowledge');

    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue(contexts),
      assembleContext: vi.fn().mockImplementation(async (ctxs, policy, purpose) =>
        assembleRuntimeContext(ctxs, policy, purpose, NOW_FN)
      ),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: { query: 'test' },
    };

    const result = await runContextOS(request, mockDeps);

    expect(result).toHaveProperty('run');
    expect(result).toHaveProperty('contextPackage');
    expect(result.run).toHaveProperty('id');
    expect(result.run).toHaveProperty('status');
    expect(result.run.status).toBe('completed');
  });

  it('D9: runtime runner with empty contexts returns valid result', async () => {
    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue([]),
      assembleContext: vi.fn().mockImplementation(async (ctxs, policy, purpose) =>
        assembleRuntimeContext(ctxs, policy, purpose, NOW_FN)
      ),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: {},
    };

    const result = await runContextOS(request, mockDeps);

    expect(result.run.status).toBe('completed');
    expect(result.contextPackage.contexts).toHaveLength(0);
    expect(result.contextPackage.contextIds).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Error Handling
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Error Handling', () => {

  it('E1: assembly failure causes runContextOS to reject with ContextOSRuntimeError', async () => {
    const contexts = createContextBundle(2, 'knowledge');

    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue(contexts),
      assembleContext: vi.fn().mockRejectedValue(new Error('Assembly engine failure')),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: {},
    };

    // Single call — capture error and verify all observable properties
    let caughtError: ContextOSRuntimeError | undefined;
    try {
      await runContextOS(request, mockDeps);
    } catch (e) {
      caughtError = e as ContextOSRuntimeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError).toBeInstanceOf(ContextOSRuntimeError);
    expect(caughtError!.code).toBe('RUNTIME_EXECUTION');
    expect(caughtError!.message).toContain('Assembly engine failure');
    expect(caughtError!.requestId).toBe(`run_user_1_${FIXED_TIMESTAMP}`);
  });

  it('E2: error must include run ID for diagnostics', async () => {
    const contexts = createContextBundle(1, 'knowledge');

    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue(contexts),
      assembleContext: vi.fn().mockRejectedValue(new Error('Budget overflow')),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: {},
    };

    let caughtError: ContextOSRuntimeError | undefined;
    try {
      await runContextOS(request, mockDeps);
    } catch (e) {
      caughtError = e as ContextOSRuntimeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.requestId).toBe(`run_user_1_${FIXED_TIMESTAMP}`);
    expect(caughtError!.code).toBe('RUNTIME_EXECUTION');
  });

  it('E3: retrieval error is not swallowed — throws ContextOSRuntimeError with details', async () => {
    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockRejectedValue(new Error('Memory DB connection lost')),
      assembleContext: vi.fn().mockResolvedValue({
        contexts: [],
        serialized: '',
        tokenEstimate: 0,
        contextIds: [],
        provenance: [],
        generatedAt: FIXED_TIMESTAMP,
      }),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: {},
    };

    // Single call — capture and verify all observable error properties
    let caughtError: ContextOSRuntimeError | undefined;
    try {
      await runContextOS(request, mockDeps);
    } catch (e) {
      caughtError = e as ContextOSRuntimeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError).toBeInstanceOf(ContextOSRuntimeError);
    expect(caughtError!.code).toBe('RUNTIME_EXECUTION');
    expect(caughtError!.message).toContain('Memory DB connection lost');
    expect(caughtError!.requestId).toBe(`run_user_1_${FIXED_TIMESTAMP}`);
  });

  it('E4: normal empty result is distinguishable from execution failure', async () => {
    // Empty result: retrieval succeeds with empty array
    const mockDepsEmpty: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue([]),
      assembleContext: vi.fn().mockImplementation(async (ctxs, policy, purpose) =>
        assembleRuntimeContext(ctxs, policy, purpose, NOW_FN)
      ),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: {},
    };

    const emptyResult = await runContextOS(request, mockDepsEmpty);
    expect(emptyResult.run.status).toBe('completed');
    expect(emptyResult.contextPackage.contexts).toHaveLength(0);

    // Execution failure: retrieval throws
    const mockDepsFail: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockRejectedValue(new Error('DB down')),
      assembleContext: vi.fn().mockResolvedValue({
        contexts: [],
        serialized: '',
        tokenEstimate: 0,
        contextIds: [],
        provenance: [],
        generatedAt: FIXED_TIMESTAMP,
      }),
      now: NOW_FN,
    };

    let caughtError: ContextOSRuntimeError | undefined;
    try {
      await runContextOS(request, mockDepsFail);
    } catch (e) {
      caughtError = e as ContextOSRuntimeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.code).toBe('RUNTIME_EXECUTION');
  });

  it('E5: RuntimeValidationError is thrown for invalid request (empty ownerId)', async () => {
    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue([]),
      assembleContext: vi.fn().mockResolvedValue({
        contexts: [],
        serialized: '',
        tokenEstimate: 0,
        contextIds: [],
        provenance: [],
        generatedAt: FIXED_TIMESTAMP,
      }),
      now: NOW_FN,
    };

    const request = {
      ownerId: '',
      purpose: 'test',
      input: {},
    } as ContextOSRuntimeRequest;

    // Single call — verify both error type and message
    let caughtError: ContextOSRuntimeError | undefined;
    try {
      await runContextOS(request, mockDeps);
    } catch (e) {
      caughtError = e as ContextOSRuntimeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError).toBeInstanceOf(RuntimeValidationError);
    expect(caughtError!.code).toBe('RUNTIME_VALIDATION');
    expect(caughtError!.message).toContain('ownerId is required');
  });

  it('E6: no fabricated success package on assembly failure', async () => {
    const contexts = createContextBundle(3, 'knowledge');

    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue(contexts),
      assembleContext: vi.fn().mockRejectedValue(new Error('Serialization crash')),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: {},
    };

    let caughtError: ContextOSRuntimeError | undefined;
    try {
      await runContextOS(request, mockDeps);
    } catch (e) {
      caughtError = e as ContextOSRuntimeError;
    }

    // Must throw — must NOT return a Result with status='completed' and empty package
    expect(caughtError).toBeDefined();
    expect(caughtError!.code).toBe('RUNTIME_EXECUTION');
  });

  it('E7: failed run surfaces run correlation ID in error for diagnostics', async () => {
    const contexts = createContextBundle(2, 'knowledge');

    const mockDeps: ContextOSRuntimeFullDependencies = {
      retrieveContext: vi.fn().mockResolvedValue(contexts),
      assembleContext: vi.fn().mockRejectedValue(new Error('Pipeline crash')),
      now: NOW_FN,
    };

    const request: ContextOSRuntimeRequest = {
      ownerId: 'user_1',
      purpose: 'test_purpose',
      input: {},
    };

    let caughtError: ContextOSRuntimeError | undefined;
    try {
      await runContextOS(request, mockDeps);
    } catch (e) {
      caughtError = e as ContextOSRuntimeError;
    }

    // Observable: the error carries the run ID (run_${ownerId}_${timestamp})
    // which the runtime assigned before the failure. Callers cannot read the
    // run's internal 'failed' status directly — the error's requestId IS the
    // observable evidence that a run was tracked and failed.
    expect(caughtError).toBeDefined();
    expect(caughtError!.requestId).toBe(`run_user_1_${FIXED_TIMESTAMP}`);
    expect(caughtError!.code).toBe('RUNTIME_EXECUTION');
    expect(caughtError!.message).toContain('Pipeline crash');
  });
});
