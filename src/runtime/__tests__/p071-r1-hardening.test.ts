/**
 * P0.7.1-R1 — Runtime Foundation Hardening Tests
 *
 * Tests for 3 architectural fixes:
 *   - Fix A: assembleRuntimeContext injected clock
 *   - Fix B: createRuntimeRunner clock propagation
 *   - Fix C: Multi-scope retrieval semantics
 *
 * Plus security tests for owner isolation preservation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runContextOS,
} from '../runtime-core';
import {
  retrieveRuntimeContext,
  assembleRuntimeContext,
  createRuntimeRunner,
} from '../runtime-context';
import type { ContextOSRuntimeFullDependencies } from '../runtime-core';
import type { ContextOSRuntimeRequest } from '../runtime-types';
import type { ContextObject } from '@/context/context-object';
import type { MemoryRetriever } from '@/memory/memory-retriever';
import type { MemoryRecord } from '@/memory/memory-record';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

const FIXED_TIMESTAMP = '2026-10-03T12:00:00.000Z';

function createMockContext(id: string, kind: string = 'memory'): ContextObject {
  return {
    id,
    kind: kind as ContextObject['kind'],
    type: 'static' as ContextObject['type'],
    content: { text: `Context ${id}` },
    confidence: 0.8,
    importance: 0.5,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    provenance: {
      source: 'test',
      sourceType: 'memory',
      ownerId: 'user_1',
    },
  };
}

function createMockMemoryRecord(
  id: string,
  scope: MemoryRecord['scope'],
  ownerId: string = 'user_1',
  projectId?: string,
  topicId?: string
): MemoryRecord {
  return {
    id,
    kind: 'static',
    type: 'test',
    payload: { value: `Memory ${id}` },
    scope,
    ownerId,
    projectId: projectId ?? null,
    topicId: topicId ?? null,
    source: 'test',
    sourceType: 'memory',
    confidence: 0.8,
    importance: 0.5,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    accessCount: 0,
    version: 1,
    status: 'active',
  };
}

function createMockDependencies(
  contexts: ContextObject[] = [],
  options: { failRetrieve?: boolean; failAssembly?: boolean } = {}
): ContextOSRuntimeFullDependencies {
  return {
    retrieveContext: vi.fn().mockImplementation(async () => {
      if (options.failRetrieve) throw new Error('Retrieval failed');
      return contexts;
    }),
    assembleContext: vi.fn().mockImplementation(async (ctxs) => {
      if (options.failAssembly) throw new Error('Assembly failed');
      return {
        contexts: ctxs,
        serialized: 'serialized context package',
        tokenEstimate: 100,
        contextIds: ctxs.map((c) => c.id),
        provenance: ctxs.map((c) => c.provenance),
        generatedAt: FIXED_TIMESTAMP,
      };
    }),
    now: () => FIXED_TIMESTAMP,
  };
}

function createMinimalRequest(overrides: Partial<ContextOSRuntimeRequest> = {}): ContextOSRuntimeRequest {
  return {
    ownerId: 'user_1',
    purpose: 'test_purpose',
    input: { query: 'test' },
    ...overrides,
  };
}

/**
 * Create a mock MemoryRetriever that records calls and returns configured records.
 */
function createRecordingMockRetriever(records: MemoryRecord[]) {
  const retrieveSpy = vi.fn(async (request: {
    ownerId?: string;
    projectId?: string;
    topicId?: string;
    scope?: string;
  }) => {
    // Owner isolation: only return records matching ownerId
    let filtered = records.filter((r) => r.ownerId === request.ownerId);

    // Scope filtering: if scope specified, only return that scope
    if (request.scope) {
      filtered = filtered.filter((r) => r.scope === request.scope);
    }

    return filtered;
  });

  return { retrieveSpy, retriever: { retrieve: retrieveSpy } as MemoryRetriever };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group A — Assembly Clock (Fix A)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group A — Assembly Clock (Fix A)', () => {
  it('A-R1-1: should use injected clock for generatedAt', async () => {
    const mockNow = () => '2026-10-03T12:00:00.000Z';
    const contexts = [createMockContext('ctx_1')];

    const result = await assembleRuntimeContext(
      contexts,
      undefined,
      'test_purpose',
      mockNow
    );

    expect(result.generatedAt).toBe('2026-10-03T12:00:00.000Z');
  });

  it('A-R1-2: should use different timestamps when clock changes', async () => {
    const contexts = [createMockContext('ctx_1')];

    const result1 = await assembleRuntimeContext(
      contexts,
      undefined,
      'test',
      () => '2026-01-01T00:00:00.000Z'
    );

    const result2 = await assembleRuntimeContext(
      contexts,
      undefined,
      'test',
      () => '2026-12-31T23:59:59.000Z'
    );

    expect(result1.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result2.generatedAt).toBe('2026-12-31T23:59:59.000Z');
    expect(result1.generatedAt).not.toBe(result2.generatedAt);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B — Runner Clock Propagation (Fix B)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group B — Runner Clock Propagation (Fix B)', () => {
  it('B-R1-1: should propagate clock to startedAt, completedAt, and generatedAt', async () => {
    const injectedClock = () => '2026-10-03T12:00:00.000Z';
    const records: MemoryRecord[] = [];
    const { retriever } = createRecordingMockRetriever(records);

    const runner = createRuntimeRunner(retriever, injectedClock);
    const request = createMinimalRequest();
    const result = await runner(request);

    // All timestamps must come from the injected clock
    expect(result.run.startedAt).toBe('2026-10-03T12:00:00.000Z');
    expect(result.run.completedAt).toBe('2026-10-03T12:00:00.000Z');
    expect(result.contextPackage.generatedAt).toBe('2026-10-03T12:00:00.000Z');
  });

  it('B-R1-2: should produce identical timestamps when clock is constant', async () => {
    const fixedClock = () => '2026-06-15T08:30:00.000Z';
    const records: MemoryRecord[] = [];
    const { retriever } = createRecordingMockRetriever(records);

    const runner = createRuntimeRunner(retriever, fixedClock);
    const request = createMinimalRequest();
    const result = await runner(request);

    // With constant clock, all timestamps are identical
    expect(result.run.startedAt).toBe(result.run.completedAt);
    expect(result.run.startedAt).toBe(result.contextPackage.generatedAt);
  });

  it('B-R1-3: should propagate clock through runContextOS direct call', async () => {
    const injectedClock = () => '2026-10-03T12:00:00.000Z';
    const deps = createMockDependencies([], {});
    deps.now = injectedClock;

    const request = createMinimalRequest();
    const result = await runContextOS(request, deps);

    expect(result.run.startedAt).toBe('2026-10-03T12:00:00.000Z');
    expect(result.run.completedAt).toBe('2026-10-03T12:00:00.000Z');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C — Scope Retrieval (Fix C)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group C — Scope Retrieval (Fix C)', () => {
  it('C-R1-1: should not pass scope when allowedScopes is undefined', async () => {
    const records = [
      createMockMemoryRecord('m1', 'global', 'user_1'),
      createMockMemoryRecord('m2', 'project', 'user_1', 'proj_1'),
    ];
    const { retrieveSpy, retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({
      contextPolicy: { allowedScopes: undefined },
    });

    await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    // Should be called without scope parameter
    expect(retrieveSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ scope: expect.anything() })
    );
  });

  it('C-R1-2: should pass single scope when allowedScopes has one entry', async () => {
    const records = [createMockMemoryRecord('m1', 'global', 'user_1')];
    const { retrieveSpy, retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({
      contextPolicy: { allowedScopes: ['global'] },
    });

    await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    expect(retrieveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'global' })
    );
    // Should be called exactly once
    expect(retrieveSpy).toHaveBeenCalledTimes(1);
  });

  it('C-R1-3: should retrieve from all scopes when multiple allowedScopes', async () => {
    const records = [
      createMockMemoryRecord('m1', 'global', 'user_1'),
      createMockMemoryRecord('m2', 'project', 'user_1', 'proj_1'),
    ];
    const { retrieveSpy, retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { allowedScopes: ['global', 'project'] },
    });

    const contexts = await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    // Should be called twice (once per scope)
    expect(retrieveSpy).toHaveBeenCalledTimes(2);
    expect(retrieveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'global' })
    );
    expect(retrieveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'project' })
    );

    // Both contexts should be present (IDs prefixed by memoryRecordsToContexts)
    expect(contexts).toHaveLength(2);
    expect(contexts.map((c) => c.id).sort()).toEqual(['ctx_mem_m1', 'ctx_mem_m2']);
  });

  it('C-R1-4: should deduplicate records with same id from multiple scopes', async () => {
    // m1 appears in both global and project scope
    const records = [
      createMockMemoryRecord('m1', 'global', 'user_1'),
      createMockMemoryRecord('m1', 'project', 'user_1', 'proj_1'),
      createMockMemoryRecord('m2', 'project', 'user_1', 'proj_1'),
    ];
    const { retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { allowedScopes: ['global', 'project'] },
    });

    const contexts = await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    // m1 should appear only once, m2 should appear (IDs prefixed)
    expect(contexts).toHaveLength(2);
    const ids = contexts.map((c) => c.id);
    expect(ids).toContain('ctx_mem_m1');
    expect(ids).toContain('ctx_mem_m2');
    // No duplicates
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('C-R1-5: should preserve order with first-occurrence-wins dedup', async () => {
    const records = [
      createMockMemoryRecord('m_global', 'global', 'user_1'),
      createMockMemoryRecord('m_dupe', 'global', 'user_1'),
      createMockMemoryRecord('m_dupe', 'project', 'user_1', 'proj_1'),
      createMockMemoryRecord('m_project', 'project', 'user_1', 'proj_1'),
    ];
    const { retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { allowedScopes: ['global', 'project'] },
    });

    const contexts = await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    // Should have 3 unique records (IDs prefixed)
    expect(contexts).toHaveLength(3);
    const ids = contexts.map((c) => c.id);
    expect(ids).toEqual(['ctx_mem_m_global', 'ctx_mem_m_dupe', 'ctx_mem_m_project']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Security Tests — Owner Isolation Preservation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Security — Owner Isolation Preservation', () => {
  it('SEC-R1-1: should preserve ownerId, projectId, topicId in multi-scope retrieval', async () => {
    const records = [
      createMockMemoryRecord('m1', 'global', 'owner_A'),
      createMockMemoryRecord('m2', 'project', 'owner_A', 'proj_X'),
      createMockMemoryRecord('m3', 'project', 'owner_B', 'proj_X'), // different owner
    ];
    const { retrieveSpy, retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({
      ownerId: 'owner_A',
      projectId: 'proj_X',
      topicId: 'topic_Y',
      contextPolicy: { allowedScopes: ['global', 'project'] },
    });

    const contexts = await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    // Verify all retrieval calls include ownerId, projectId, topicId
    expect(retrieveSpy).toHaveBeenCalledTimes(2);
    expect(retrieveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner_A',
        projectId: 'proj_X',
        topicId: 'topic_Y',
      })
    );

    // Only owner_A records should be returned (IDs prefixed)
    expect(contexts).toHaveLength(2);
    expect(contexts.map((c) => c.id).sort()).toEqual(['ctx_mem_m1', 'ctx_mem_m2']);
  });

  it('SEC-R1-2: cross-owner memories must never enter Runtime Context', async () => {
    const records = [
      createMockMemoryRecord('ownerA_g1', 'global', 'owner_A'),
      createMockMemoryRecord('ownerA_p1', 'project', 'owner_A', 'proj_shared'),
      createMockMemoryRecord('ownerB_g1', 'global', 'owner_B'),
      createMockMemoryRecord('ownerB_p1', 'project', 'owner_B', 'proj_shared'),
    ];
    const { retriever } = createRecordingMockRetriever(records);

    // Request as owner_A
    const request = createMinimalRequest({
      ownerId: 'owner_A',
      projectId: 'proj_shared',
      contextPolicy: { allowedScopes: ['global', 'project'] },
    });

    const contexts = await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    // Only owner_A records (IDs prefixed)
    expect(contexts).toHaveLength(2);
    const ids = contexts.map((c) => c.id);
    expect(ids).toContain('ctx_mem_ownerA_g1');
    expect(ids).toContain('ctx_mem_ownerA_p1');
    expect(ids).not.toContain('ctx_mem_ownerB_g1');
    expect(ids).not.toContain('ctx_mem_ownerB_p1');
  });

  it('SEC-R1-3: single scope retrieval must still pass ownerId', async () => {
    const records = [createMockMemoryRecord('m1', 'global', 'owner_A')];
    const { retrieveSpy, retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({
      ownerId: 'owner_A',
      projectId: 'proj_X',
      topicId: 'topic_Y',
      contextPolicy: { allowedScopes: ['global'] },
    });

    await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    expect(retrieveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner_A',
        projectId: 'proj_X',
        topicId: 'topic_Y',
        scope: 'global',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Regression — Existing API Compatibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('Regression — API Compatibility', () => {
  it('REG-1: assembleRuntimeContext works without 4th param (now)', async () => {
    const contexts = [createMockContext('ctx_1')];

    // Should work without the now parameter (uses default)
    const result = await assembleRuntimeContext(
      contexts,
      undefined,
      'test_purpose'
    );

    expect(result).toBeDefined();
    expect(result.generatedAt).toBeDefined();
    expect(typeof result.generatedAt).toBe('string');
  });

  it('REG-2: createRuntimeRunner works without 2nd param (now)', async () => {
    const records: MemoryRecord[] = [];
    const { retriever } = createRecordingMockRetriever(records);

    // Should work without the now parameter (uses default)
    const runner = createRuntimeRunner(retriever);
    const request = createMinimalRequest();
    const result = await runner(request);

    expect(result).toBeDefined();
    expect(result.run.startedAt).toBeDefined();
    expect(result.contextPackage.generatedAt).toBeDefined();
  });

  it('REG-3: retrieveRuntimeContext works with no policy (backward compat)', async () => {
    const records = [
      createMockMemoryRecord('m1', 'global', 'user_1'),
    ];
    const { retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({ contextPolicy: undefined });
    const contexts = await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    expect(contexts).toBeDefined();
    expect(contexts.length).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Determinism — Same input + same clock = same output
// ═══════════════════════════════════════════════════════════════════════════════

describe('Determinism', () => {
  it('DET-1: same request + same clock = same package', async () => {
    const clock = () => '2026-10-03T12:00:00.000Z';
    const contexts = [createMockContext('ctx_1'), createMockContext('ctx_2')];

    const result1 = await assembleRuntimeContext(contexts, undefined, 'writing', clock);
    const result2 = await assembleRuntimeContext(contexts, undefined, 'writing', clock);

    expect(result1.generatedAt).toBe(result2.generatedAt);
    expect(result1.contextIds).toEqual(result2.contextIds);
    expect(result1.tokenEstimate).toBe(result2.tokenEstimate);
  });

  it('DET-2: deterministic dedup with same records in same order', async () => {
    const records = [
      createMockMemoryRecord('m1', 'global', 'user_1'),
      createMockMemoryRecord('m1', 'project', 'user_1', 'proj_1'),
      createMockMemoryRecord('m2', 'project', 'user_1', 'proj_1'),
    ];
    const { retriever } = createRecordingMockRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { allowedScopes: ['global', 'project'] },
    });

    const result1 = await retrieveRuntimeContext(request, { memoryRetriever: retriever });
    const result2 = await retrieveRuntimeContext(request, { memoryRetriever: retriever });

    expect(result1.map((c) => c.id)).toEqual(result2.map((c) => c.id));
  });
});
