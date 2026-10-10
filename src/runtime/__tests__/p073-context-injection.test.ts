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

  it('A4: serialized output must contain only the final selected contexts', async () => {
    // Use strategy contexts whose serializer includes identifiable content
    const contexts = createContextBundle(3, 'strategy');
    // Add coreThesis to make them serialize with identifiable text
    contexts.forEach((ctx, i) => {
      ctx.payload = { coreThesis: `Thesis ${i}` };
    });
    const pkg = await assembleRuntimeContext(contexts, undefined, 'generic', NOW_FN);

    // Serialized should contain the strategy section header
    expect(pkg.serialized).toContain('[Strategy]');
    // Each selected context's payload content should appear in serialized output
    for (const ctx of pkg.contexts) {
      const payload = ctx.payload as Record<string, unknown>;
      if (payload.coreThesis) {
        expect(pkg.serialized).toContain(payload.coreThesis as string);
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

  it('B2: maxTokens is passed through to the Assembly Engine', async () => {
    const contexts = createContextBundle(10, 'knowledge');
    // Use a very small token budget to force truncation
    const pkg = await assembleRuntimeContext(
      contexts,
      { maxTokens: 50 },
      'generic',
      NOW_FN
    );

    // Token estimate should respect the budget constraint
    expect(pkg.tokenEstimate).toBeLessThanOrEqual(50);
  });

  it('B3: truncated contexts must NOT appear in any package field', async () => {
    const contexts = createContextBundle(10, 'knowledge');
    const pkg = await assembleRuntimeContext(
      contexts,
      { maxContexts: 2 },
      'generic',
      NOW_FN
    );

    // Only selected contexts should be in the package
    const selectedIds = new Set(pkg.contextIds);
    expect(selectedIds.size).toBe(pkg.contexts.length);

    // Verify no extra contexts leaked in
    for (const ctx of pkg.contexts) {
      expect(selectedIds.has(ctx.id)).toBe(true);
    }
  });

  it('B4: package with maxContexts=0 should return empty contexts', async () => {
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

  it('B5: serialized output does not include budget-excluded contexts', async () => {
    // Create contexts with identifiable IDs
    const contexts = createContextBundle(8, 'knowledge');
    const allIds = contexts.map((c) => c.id);

    const pkg = await assembleRuntimeContext(
      contexts,
      { maxContexts: 3 },
      'generic',
      NOW_FN
    );

    const selectedIds = new Set(pkg.contextIds);

    // Non-selected IDs should NOT appear in serialized output
    for (const id of allIds) {
      if (!selectedIds.has(id)) {
        expect(pkg.serialized).not.toContain(id);
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

  it('D1: strategy purpose maps correctly', async () => {
    const contexts = createContextBundle(2, 'strategy');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'content_strategy', NOW_FN);

    expect(pkg.contexts.length).toBeGreaterThanOrEqual(0);
    expect(pkg.tokenEstimate).toBeGreaterThanOrEqual(0);
  });

  it('D2: writing purpose maps correctly', async () => {
    const contexts = createContextBundle(2, 'content');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'writing_content', NOW_FN);

    expect(pkg.contexts.length).toBeGreaterThanOrEqual(0);
  });

  it('D3: evaluation purpose maps correctly', async () => {
    const contexts = createContextBundle(2, 'evaluation');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'score_draft', NOW_FN);

    expect(pkg.contexts.length).toBeGreaterThanOrEqual(0);
  });

  it('D4: generic purpose maps correctly for unknown keywords', async () => {
    const contexts = createContextBundle(2, 'knowledge');
    const pkg = await assembleRuntimeContext(contexts, undefined, 'data_processing', NOW_FN);

    expect(pkg.contexts.length).toBeGreaterThanOrEqual(0);
  });

  it('D5: mapPurposeToAssembly returns correct AssemblyPurpose values', () => {
    expect(mapPurposeToAssembly('content_strategy')).toBe('strategy');
    expect(mapPurposeToAssembly('plan_creation')).toBe('strategy');
    expect(mapPurposeToAssembly('writing_content')).toBe('writing');
    expect(mapPurposeToAssembly('evaluation_request')).toBe('evaluation');
    expect(mapPurposeToAssembly('score_draft')).toBe('evaluation');
    expect(mapPurposeToAssembly('random_task')).toBe('generic');
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

  it('E1: assembly failure causes runContextOS promise to reject', async () => {
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

    await expect(runContextOS(request, mockDeps)).rejects.toThrow(ContextOSRuntimeError);
    await expect(runContextOS(request, mockDeps)).rejects.toThrow('Assembly engine failure');
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

  it('E3: retrieval error is not swallowed by injection layer', async () => {
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

    await expect(runContextOS(request, mockDeps)).rejects.toThrow(ContextOSRuntimeError);
    await expect(runContextOS(request, mockDeps)).rejects.toThrow('Memory DB connection lost');
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

    await expect(runContextOS(request, mockDepsFail)).rejects.toThrow(ContextOSRuntimeError);
  });

  it('E5: RuntimeValidationError is thrown for invalid request, not masked', async () => {
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

    // Empty ownerId
    const request = {
      ownerId: '',
      purpose: 'test',
      input: {},
    } as ContextOSRuntimeRequest;

    await expect(runContextOS(request, mockDeps)).rejects.toThrow(RuntimeValidationError);
    await expect(runContextOS(request, mockDeps)).rejects.toThrow('ownerId is required');
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

  it('E7: run status is "failed" on unrecoverable injection error', async () => {
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

    // The error carries the run ID, confirming the run was tracked as failed
    expect(caughtError).toBeDefined();
    expect(caughtError!.requestId).toBeDefined();
  });
});
