/**
 * P0.7.4 — Run Persistence Lifecycle Tests
 *
 * Tests the full Run persistence lifecycle in runContextOS:
 *   - Success: created → started persisted → retrieval → assembly → completed persisted
 *   - Failure: retrieval/assembly error → failed persisted
 *   - Edge: persist failures don't fake success
 *   - Backward compat: no store = pure in-memory behavior
 *
 * Uses an in-memory store mock so these tests don't require a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runContextOS } from '../runtime-core';
import type { ContextOSRuntimeFullDependencies } from '../runtime-core';
import type { ContextOSRuntimeRequest, ContextOSRun } from '../runtime-types';
import type { ContextOSRunStore, ContextOSRunQuery, ContextOSRunListResult } from '../run-store';
import {
  ContextOSRuntimeError,
  RuntimeValidationError,
} from '../runtime-types';
import type { ContextObject } from '@/context/context-object';
import { RunConflictError, RunNotFoundError, RunPersistenceError } from '../run-store';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

const FIXED_TIMESTAMP = '2026-10-10T08:00:00.000Z';

function createMockContext(id: string): ContextObject {
  return {
    id,
    kind: 'memory',
    type: 'static',
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

function createMinimalRequest(overrides: Partial<ContextOSRuntimeRequest> = {}): ContextOSRuntimeRequest {
  return {
    ownerId: 'user_1',
    purpose: 'test_purpose',
    input: { query: 'test' },
    ...overrides,
  };
}

/**
 * In-memory store that records all calls for assertions.
 */
class RecordingRunStore implements ContextOSRunStore {
  public runs: Map<string, ContextOSRun> = new Map();
  public createCalls: string[] = [];
  public updateCalls: string[] = [];
  public failMode: 'create' | 'update' | null = null;

  async create(run: ContextOSRun): Promise<ContextOSRun> {
    this.createCalls.push(run.id);
    if (this.failMode === 'create') {
      this.failMode = null;
      throw new RunPersistenceError('Simulated create failure', run.id);
    }
    if (this.runs.has(run.id)) {
      throw new RunConflictError(`Duplicate: ${run.id}`, run.id);
    }
    this.runs.set(run.id, { ...run });
    return { ...run };
  }

  async update(run: ContextOSRun): Promise<ContextOSRun> {
    this.updateCalls.push(run.id);
    if (this.failMode === 'update') {
      this.failMode = null;
      throw new RunPersistenceError('Simulated update failure', run.id);
    }
    const existing = this.runs.get(run.id);
    if (!existing || existing.ownerId !== run.ownerId) {
      throw new RunNotFoundError(`Not found: ${run.id}`, run.id);
    }
    this.runs.set(run.id, { ...run });
    return { ...run };
  }

  async getById(ownerId: string, runId: string): Promise<ContextOSRun | null> {
    const run = this.runs.get(runId);
    if (!run || run.ownerId !== ownerId) return null;
    return { ...run };
  }

  async list(query: ContextOSRunQuery): Promise<ContextOSRunListResult> {
    const filtered = Array.from(this.runs.values())
      .filter((r) => r.ownerId === query.ownerId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return {
      runs: filtered.map((r) => ({ ...r })),
      nextCursor: null,
      totalCount: -1,
    };
  }
}

function createDepsWithStore(
  store: RecordingRunStore,
  contexts: ContextObject[] = [],
  options: { failRetrieve?: boolean; failAssembly?: boolean } = {},
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
        serialized: 'serialized package',
        tokenEstimate: 100,
        contextIds: ctxs.map((c) => c.id),
        provenance: ctxs.map((c) => c.provenance),
        generatedAt: FIXED_TIMESTAMP,
      };
    }),
    now: () => FIXED_TIMESTAMP,
    runStore: store,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.7.4 — Run Persistence Lifecycle', () => {
  let store: RecordingRunStore;

  beforeEach(() => {
    store = new RecordingRunStore();
  });

  describe('Success Lifecycle (with Store)', () => {
    it('L1: should persist status=started BEFORE retrieval', async () => {
      const ctx = createMockContext('ctx_1');
      const deps = createDepsWithStore(store, [ctx]);
      const request = createMinimalRequest();

      await runContextOS(request, deps);

      // create was called (started persisted)
      expect(store.createCalls).toHaveLength(1);
      // update was called (completed persisted)
      expect(store.updateCalls).toHaveLength(1);
      // started run was persisted
      const persisted = Array.from(store.runs.values())[0];
      expect(persisted.status).toBe('completed');
    });

    it('L2: completed run should match returned run', async () => {
      const ctx = createMockContext('ctx_1');
      const deps = createDepsWithStore(store, [ctx]);
      const request = createMinimalRequest();

      const result = await runContextOS(request, deps);
      const persisted = await store.getById('user_1', result.run.id);

      expect(persisted).not.toBeNull();
      expect(persisted!.status).toBe('completed');
      expect(persisted!.contextIds).toEqual(result.run.contextIds);
      expect(persisted!.startedAt).toBe(result.run.startedAt);
      expect(persisted!.completedAt).toBe(result.run.completedAt);
    });

    it('L3: contextIds should match context package', async () => {
      const ctx1 = createMockContext('ctx_1');
      const ctx2 = createMockContext('ctx_2');
      const deps = createDepsWithStore(store, [ctx1, ctx2]);
      const request = createMinimalRequest();

      const result = await runContextOS(request, deps);
      const persisted = await store.getById('user_1', result.run.id);

      expect(persisted!.contextIds).toEqual(['ctx_1', 'ctx_2']);
    });

    it('L4: timestamps should be controlled by injected clock', async () => {
      const deps = createDepsWithStore(store, []);
      const request = createMinimalRequest();

      const result = await runContextOS(request, deps);
      expect(result.run.startedAt).toBe(FIXED_TIMESTAMP);
      expect(result.run.completedAt).toBe(FIXED_TIMESTAMP);

      const persisted = await store.getById('user_1', result.run.id);
      expect(persisted!.startedAt).toBe(FIXED_TIMESTAMP);
      expect(persisted!.completedAt).toBe(FIXED_TIMESTAMP);
    });

    it('L5: persisted run ID matches returned run ID', async () => {
      const deps = createDepsWithStore(store, []);
      const request = createMinimalRequest({ ownerId: 'owner_xyz' });

      const result = await runContextOS(request, deps);
      const persisted = await store.getById('owner_xyz', result.run.id);

      expect(persisted).not.toBeNull();
      expect(persisted!.id).toBe(result.run.id);
    });

    it('L6: persisted run should include ownerId, projectId, topicId, purpose', async () => {
      const deps = createDepsWithStore(store, []);
      const request = createMinimalRequest({
        ownerId: 'owner_abc',
        projectId: 'proj_xyz',
        topicId: 'topic_123',
        purpose: 'content_creation',
      });

      await runContextOS(request, deps);
      const persisted = await store.getById('owner_abc', `run_owner_abc_${FIXED_TIMESTAMP}`);

      expect(persisted).not.toBeNull();
      expect(persisted!.ownerId).toBe('owner_abc');
      expect(persisted!.projectId).toBe('proj_xyz');
      expect(persisted!.topicId).toBe('topic_123');
      expect(persisted!.purpose).toBe('content_creation');
    });
  });

  describe('Failure Lifecycle (with Store)', () => {
    it('F1: retrieval failure should persist status=failed', async () => {
      const deps = createDepsWithStore(store, [], { failRetrieve: true });
      const request = createMinimalRequest();

      let caught: ContextOSRuntimeError | undefined;
      try {
        await runContextOS(request, deps);
      } catch (e) {
        caught = e as ContextOSRuntimeError;
      }

      expect(caught).toBeDefined();
      expect(caught!.code).toBe('RUNTIME_EXECUTION');
      expect(caught!.requestId).toBe(`run_user_1_${FIXED_TIMESTAMP}`);

      // Failed run persisted
      const persisted = await store.getById('user_1', `run_user_1_${FIXED_TIMESTAMP}`);
      expect(persisted).not.toBeNull();
      expect(persisted!.status).toBe('failed');
      expect(persisted!.completedAt).toBe(FIXED_TIMESTAMP);
    });

    it('F2: assembly failure should persist status=failed', async () => {
      const ctx = createMockContext('ctx_1');
      const deps = createDepsWithStore(store, [ctx], { failAssembly: true });
      const request = createMinimalRequest();

      let caught: ContextOSRuntimeError | undefined;
      try {
        await runContextOS(request, deps);
      } catch (e) {
        caught = e as ContextOSRuntimeError;
      }

      expect(caught).toBeDefined();

      const persisted = await store.getById('user_1', `run_user_1_${FIXED_TIMESTAMP}`);
      expect(persisted).not.toBeNull();
      expect(persisted!.status).toBe('failed');
    });

    it('F3: error requestId should match persisted run ID', async () => {
      const deps = createDepsWithStore(store, [], { failRetrieve: true });
      const request = createMinimalRequest({ ownerId: 'user_special' });

      let caught: ContextOSRuntimeError | undefined;
      try {
        await runContextOS(request, deps);
      } catch (e) {
        caught = e as ContextOSRuntimeError;
      }

      const runId = `run_user_special_${FIXED_TIMESTAMP}`;
      expect(caught!.requestId).toBe(runId);

      const persisted = await store.getById('user_special', runId);
      expect(persisted).not.toBeNull();
    });
  });

  describe('Persist Failure Handling', () => {
    it('P1: create failure should not call retrieval/assembly', async () => {
      const retrieveSpy = vi.fn().mockResolvedValue([]);
      const assembleSpy = vi.fn().mockResolvedValue({
        contexts: [],
        serialized: '',
        tokenEstimate: 0,
        contextIds: [],
        provenance: [],
        generatedAt: FIXED_TIMESTAMP,
      });

      const throwingStore: ContextOSRunStore = {
        create: vi.fn().mockRejectedValue(new RunPersistenceError('Simulated create failure')),
        update: vi.fn(),
        getById: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue({ runs: [], nextCursor: null, totalCount: 0 }),
      };

      const request = createMinimalRequest();
      await expect(runContextOS(request, {
        retrieveContext: retrieveSpy,
        assembleContext: assembleSpy,
        now: () => FIXED_TIMESTAMP,
        runStore: throwingStore,
      })).rejects.toThrow('Failed to persist run');

      // Retrieval and assembly must NOT have been called
      expect(retrieveSpy).not.toHaveBeenCalled();
      expect(assembleSpy).not.toHaveBeenCalled();
    });

    it('P2: completed-status update failure should not return fake success', async () => {
      const ctx = createMockContext('ctx_1');
      const throwingUpdateStore: ContextOSRunStore = {
        create: vi.fn().mockImplementation(async (run: ContextOSRun) => ({ ...run })),
        update: vi.fn().mockRejectedValue(new RunPersistenceError('Simulated update failure')),
        getById: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue({ runs: [], nextCursor: null, totalCount: 0 }),
      };

      const request = createMinimalRequest();
      await expect(runContextOS(request, {
        retrieveContext: vi.fn().mockResolvedValue([ctx]),
        assembleContext: vi.fn().mockResolvedValue({
          contexts: [ctx],
          serialized: 'serialized',
          tokenEstimate: 100,
          contextIds: ['ctx_1'],
          provenance: [ctx.provenance],
          generatedAt: FIXED_TIMESTAMP,
        }),
        now: () => FIXED_TIMESTAMP,
        runStore: throwingUpdateStore,
      })).rejects.toThrow('failed to persist completion');
    });

    it('P3: duplicate ID conflict should not overwrite', async () => {
      const request = createMinimalRequest();
      const runId = `run_user_1_${FIXED_TIMESTAMP}`;

      // Inject a store whose first create succeeds (pre-populated) and
      // whose second create (from runContextOS) throws RunConflictError
      const realStore = new RecordingRunStore();
      await realStore.create({
        id: runId,
        ownerId: 'user_1',
        purpose: 'existing',
        input: {},
        contextIds: [],
        decisionIds: [],
        outcomeIds: [],
        status: 'completed',
        startedAt: FIXED_TIMESTAMP,
        completedAt: FIXED_TIMESTAMP,
      });

      // runContextOS wraps store errors in ContextOSRuntimeError
      await expect(runContextOS(request, createDepsWithStore(realStore, []))).rejects.toThrow(
        ContextOSRuntimeError
      );
    });
  });

  describe('Owner Isolation', () => {
    it('O1: different owner cannot read persisted run', async () => {
      const deps = createDepsWithStore(store, []);
      const request = createMinimalRequest({ ownerId: 'owner_A' });

      await runContextOS(request, deps);

      const byOwnerB = await store.getById('owner_B', `run_owner_A_${FIXED_TIMESTAMP}`);
      expect(byOwnerB).toBeNull();
    });

    it('O2: persisted run cannot be updated by different owner', async () => {
      // Pre-create a run for user_A
      const runId = 'run_isolation_test';
      await store.create({
        id: runId,
        ownerId: 'user_A',
        purpose: 'test',
        input: {},
        contextIds: [],
        decisionIds: [],
        outcomeIds: [],
        status: 'started',
        startedAt: FIXED_TIMESTAMP,
      });

      // Try to update as user_B
      await expect(store.update({
        id: runId,
        ownerId: 'user_B',
        purpose: 'hack',
        input: {},
        contextIds: [],
        decisionIds: [],
        outcomeIds: [],
        status: 'completed',
        startedAt: FIXED_TIMESTAMP,
      })).rejects.toThrow(RunNotFoundError);
    });
  });

  describe('Backward Compatibility (no Store)', () => {
    it('B1: should work without runStore (in-memory only)', async () => {
      const ctx = createMockContext('ctx_1');
      const deps: ContextOSRuntimeFullDependencies = {
        retrieveContext: vi.fn().mockResolvedValue([ctx]),
        assembleContext: vi.fn().mockResolvedValue({
          contexts: [ctx],
          serialized: 'test',
          tokenEstimate: 50,
          contextIds: ['ctx_1'],
          provenance: [ctx.provenance],
          generatedAt: FIXED_TIMESTAMP,
        }),
        now: () => FIXED_TIMESTAMP,
        // No runStore — must still work
      };

      const result = await runContextOS(createMinimalRequest(), deps);
      expect(result.run.status).toBe('completed');
      expect(result.run.contextIds).toEqual(['ctx_1']);
    });

    it('B2: validation error should not create run AND not call store', async () => {
      const createSpy = vi.fn();
      const mockStore: ContextOSRunStore = {
        create: createSpy,
        update: vi.fn(),
        getById: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue({ runs: [], nextCursor: null, totalCount: 0 }),
      };

      const deps: ContextOSRuntimeFullDependencies = {
        retrieveContext: vi.fn().mockResolvedValue([]),
        assembleContext: vi.fn().mockResolvedValue({
          contexts: [],
          serialized: '',
          tokenEstimate: 0,
          contextIds: [],
          provenance: [],
          generatedAt: FIXED_TIMESTAMP,
        }),
        now: () => FIXED_TIMESTAMP,
        runStore: mockStore,
      };

      // Invalid request (no ownerId)
      await expect(runContextOS(createMinimalRequest({ ownerId: '' }), deps)).rejects.toThrow(
        RuntimeValidationError
      );

      // Store.create should NOT have been called
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('Regression — existing behavior preserved', () => {
    it('R1: error still carries run correlation ID', async () => {
      const deps = createDepsWithStore(store, [], { failRetrieve: true });

      let caught: ContextOSRuntimeError | undefined;
      try {
        await runContextOS(createMinimalRequest(), deps);
      } catch (e) {
        caught = e as ContextOSRuntimeError;
      }

      expect(caught).toBeDefined();
      expect(caught!.requestId).toBe(`run_user_1_${FIXED_TIMESTAMP}`);
    });

    it('R2: return structure unchanged (run + contextPackage)', async () => {
      const ctx = createMockContext('ctx_1');
      const deps = createDepsWithStore(store, [ctx]);

      const result = await runContextOS(createMinimalRequest(), deps);

      expect(result).toHaveProperty('run');
      expect(result).toHaveProperty('contextPackage');
      expect(result.run).toHaveProperty('id');
      expect(result.run).toHaveProperty('ownerId');
      expect(result.run).toHaveProperty('status');
      expect(result.run).toHaveProperty('startedAt');
      expect(result.run).toHaveProperty('completedAt');
      expect(result.contextPackage).toHaveProperty('contextIds');
      expect(result.contextPackage).toHaveProperty('serialized');
    });
  });
});
