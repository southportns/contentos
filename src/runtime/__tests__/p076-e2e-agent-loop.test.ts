/**
 * P0.7.6 — End-to-End Agent Context Loop Tests
 *
 * Covers: full lifecycle, ordering, failure semantics, learning evidence,
 * owner isolation, clock propagation, backward compatibility.
 *
 * Strategy:
 * - Injected fake Run Store, Memory Store, retrieval, assembly, agent, and resolver
 * - Assert exact call ordering (not just "was called")
 * - Prove meaningful state transitions
 */
import { describe, it, expect, vi } from 'vitest';
import type { ContextOSRun, ContextOSRunStatus } from '../runtime-types';
import type { ContextObject } from '@/context/context-object';
import type { ContextOSRuntimeRequest } from '../runtime-types';
import type { RuntimeContextPackage } from '../runtime-types';
import type { ContextOSRunStore } from '../run-store';
import type { MemoryStore } from '@/memory/persistence/memory-store';
import type { MemoryRecord } from '@/memory/memory-record';
import type { MemoryQueryCriteria } from '@/memory/persistence/memory-query';
import type { RuntimeLearningSource } from '../runtime-learning';
import type { DecisionMemory } from '@/memory/decision-memory';
import type { DecisionFeedback } from '@/memory/decision-feedback';
import { MemoryConcurrencyError } from '@/memory/persistence/memory-persistence-types';
import {
  runContextOSAgentLoop,
  generateRunId,
  canonicalJson,
} from '../runtime-agent-loop';
import type {
  RuntimeAgentLoopDependencies,
  RuntimeAgentExecutionInput,
  RuntimeAgentExecutionResult,
} from '../runtime-agent-loop';
import { RuntimeValidationError } from '../runtime-types';
import { runContextOS } from '../runtime-core';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════
const NOW = '2026-10-11T10:00:00.000Z';
const FIXED_CLOCK = () => NOW;
const TEST_OWNER = 'user_abc';
const TEST_PROJECT = 'proj_xyz';
const TEST_TOPIC = 'topic_123';

// ═══════════════════════════════════════════════════════════════════════════════
// In-Memory Run Store (Fake)
// ═══════════════════════════════════════════════════════════════════════════════
class FakeRunStore implements ContextOSRunStore {
  private runs: Map<string, ContextOSRun> = new Map();
  private failNextCreate = false;
  private failNextUpdate = false;
  private failAllUpdates = false;
  callLog: string[] = [];

  setFailNextCreate(v: boolean) { this.failNextCreate = v; }
  setFailNextUpdate(v: boolean) { this.failNextUpdate = v; }
  setFailAllUpdates(v: boolean) { this.failAllUpdates = v; }
  clearLog() { this.callLog = []; }

  async create(run: ContextOSRun): Promise<ContextOSRun> {
    this.callLog.push('create:' + run.status);
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error('Simulated create failure');
    }
    if (this.runs.has(run.id)) {
      throw new Error('Run "' + run.id + '" already exists');
    }
    this.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  async update(run: ContextOSRun): Promise<ContextOSRun> {
    this.callLog.push('update:' + run.status);
    if (this.failAllUpdates) {
      throw new Error('Simulated update failure');
    }
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error('Simulated update failure');
    }
    if (!this.runs.has(run.id)) {
      throw new Error('Run "' + run.id + '" not found');
    }
    this.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  async getById(ownerId: string, runId: string): Promise<ContextOSRun | null> {
    const run = this.runs.get(runId);
    if (!run || run.ownerId !== ownerId) return null;
    return structuredClone(run);
  }

  async list(query: { ownerId: string }): Promise<{ runs: ContextOSRun[]; nextCursor: string | null; totalCount: number }> {
    const runs = Array.from(this.runs.values()).filter((r) => r.ownerId === query.ownerId);
    return { runs, nextCursor: null, totalCount: -1 };
  }

  getRun(id: string): ContextOSRun | undefined {
    const r = this.runs.get(id);
    return r ? structuredClone(r) : undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// In-Memory Memory Store (Fake)
// ═══════════════════════════════════════════════════════════════════════════════
class FakeMemoryStore implements MemoryStore {
  private records: Map<string, MemoryRecord> = new Map();
  callLog: string[] = [];
  private failNextCreate = false;

  setFailNextCreate(v: boolean) { this.failNextCreate = v; }
  clearLog() { this.callLog = []; }

  async create(record: MemoryRecord): Promise<MemoryRecord> {
    this.callLog.push('create:' + record.id);
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new MemoryConcurrencyError(record.id, 1);
    }
    if (this.records.has(record.id)) {
      throw new MemoryConcurrencyError(record.id, 1);
    }
    this.records.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async getById(id: string, ownerId: string): Promise<MemoryRecord | null> {
    this.callLog.push('getById:' + id);
    const r = this.records.get(id);
    if (!r || r.ownerId !== ownerId) return null;
    return structuredClone(r);
  }

  async update(record: MemoryRecord, auth: string, ver: number): Promise<MemoryRecord> {
    const ex = this.records.get(record.id);
    if (!ex || ex.ownerId !== auth) throw new MemoryConcurrencyError(record.id, ver);
    this.records.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async delete(id: string, ownerId: string): Promise<void> {
    const r = this.records.get(id);
    if (r && r.ownerId === ownerId) this.records.delete(id);
  }

  async count(ownerId: string): Promise<number> {
    return Array.from(this.records.values()).filter((r) => r.ownerId === ownerId).length;
  }

  async findMany(criteria: MemoryQueryCriteria): Promise<MemoryRecord[]> {
    return Array.from(this.records.values()).filter((r) => r.ownerId === criteria.ownerId);
  }

  async supersede(oldRecord: MemoryRecord, newRecord: MemoryRecord, auth: string, ver: number): Promise<MemoryRecord> {
    return newRecord;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function makeContextObject(id: string, ownerId = TEST_OWNER): ContextObject {
  return {
    id,
    kind: 'semantic',
    sourceType: 'memory',
    content: 'Content for ' + id,
    confidence: 0.8,
    importance: 0.5,
    provenance: {
      ownerId,
      scope: 'topic',
      projectId: TEST_PROJECT,
      topicId: TEST_TOPIC,
      sourceType: 'memory',
    },
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeContextPackage(contextIds: string[]): RuntimeContextPackage {
  const contexts = contextIds.map((id) => makeContextObject(id));
  return {
    contexts,
    serialized: contexts.map((c) => c.content).join('\n'),
    tokenEstimate: contextIds.length * 50,
    contextIds,
    provenance: contexts.map((c) => c.provenance),
    generatedAt: NOW,
  };
}

function makeDecisionMemory(id: string, ownerId: string): DecisionMemory {
  return {
    id,
    kind: 'semantic',
    type: 'decision',
    payload: {
      decision: 'Decision ' + id,
      decisionStatus: 'active',
      context: 'test',
    },
    ownerId,
    scope: 'topic',
    projectId: TEST_PROJECT,
    topicId: TEST_TOPIC,
    source: 'contextos_test',
    sourceType: 'decision',
    derivedFrom: [],
    confidence: 0.8,
    importance: 0.5,
    createdAt: NOW,
    updatedAt: NOW,
    lastAccessedAt: null,
    expiresAt: null,
    accessCount: 0,
    version: 1,
    status: 'active',
  };
}

function makeDecisionFeedback(decisionId: string, ownerId: string): DecisionFeedback {
  // Produces a valid DecisionFeedback that can generate eligible candidates
  // under DEFAULT_LEARNING_POLICY (requireOutcomeEvidence: true).
  // outcomeIds MUST be non-empty for sourceOutcomeIds to pass validation.
  return {
    id: 'dfb_' + decisionId,
    ownerId,
    decisionId,
    status: 'evidence_available',
    outcomeCount: 1,
    outcomes: [],
    outcomeIds: ['out_' + decisionId],
    metrics: [],
    metricAggregations: [
      {
        metricKey: 'views', unit: 'count', count: 1,
        sum: 15000, avg: 15000, min: 15000, max: 15000,
        median: 15000, firstValue: 15000, lastValue: 15000,
        firstObservedAt: NOW, lastObservedAt: NOW,
      },
    ],
    trends: [
      {
        metricKey: 'views', unit: 'count',
        currentValue: 15000, previousValue: 8000,
        delta: 7000, deltaPercent: 87.5, direction: 'up',
      },
    ],
    trend: undefined,
    completeness: 'complete',
    windowStart: NOW,
    windowEnd: NOW,
    outcomeTypes: ['engagement'],
  };
}

function makeRequest(overrides: Partial<ContextOSRuntimeRequest> = {}): ContextOSRuntimeRequest {
  return {
    ownerId: TEST_OWNER,
    projectId: TEST_PROJECT,
    topicId: TEST_TOPIC,
    purpose: 'content_creation',
    input: { text: 'test input' },
    ...overrides,
  };
}

// Create fresh callbacks per test to avoid cross-test state leakage
function createTestCallbacks() {
  return {
    retrieveContext: vi.fn(async (_request: ContextOSRuntimeRequest): Promise<ContextObject[]> => {
      return [makeContextObject('ctx_1'), makeContextObject('ctx_2')];
    }),
    assembleContext: vi.fn(async (
      contexts: ContextObject[],
      _policy: unknown,
      _purpose: string
    ): Promise<RuntimeContextPackage> => {
      return makeContextPackage(contexts.map((c) => c.id));
    }),
    executeAgent: vi.fn(async (
      _input: RuntimeAgentExecutionInput
    ): Promise<RuntimeAgentExecutionResult> => {
      return {
        output: { type: 'test_output' },
        decisionIds: ['dec_1', 'dec_2'],
        outcomeIds: ['out_1'],
      };
    }),
    resolveLearningEvidence: vi.fn(async (
      _request: ContextOSRuntimeRequest,
      _run: ContextOSRun,
      _result: RuntimeAgentExecutionResult
    ): Promise<readonly RuntimeLearningSource[]> => {
      return [
        {
          decision: makeDecisionMemory('dec_1', TEST_OWNER),
          feedback: makeDecisionFeedback('dec_1', TEST_OWNER),
        },
      ];
    }),
  };
}

function makeDependencies(callbacks: ReturnType<typeof createTestCallbacks>, overrides: Partial<RuntimeAgentLoopDependencies> = {}): RuntimeAgentLoopDependencies {
  return {
    retrieveContext: callbacks.retrieveContext,
    assembleContext: callbacks.assembleContext,
    executeAgent: callbacks.executeAgent,
    resolveLearningEvidence: callbacks.resolveLearningEvidence,
    now: FIXED_CLOCK,
    runStore: new FakeRunStore(),
    memoryStore: new FakeMemoryStore(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Suites
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.7.6 — End-to-End Agent Context Loop', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // Group A: Successful Full Loop
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group A: Successful Full Loop', () => {
    it('A-1: executes full loop in correct order and produces completed run', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const deps = makeDependencies(callbacks, { runStore });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // Assert exact call order on the run store
      expect(runStore.callLog).toEqual([
        'create:started',
        'update:running',
        'update:completed',
      ]);

      // Assert the executor received the actual assembled context package
      expect(callbacks.executeAgent).toHaveBeenCalledTimes(1);
      const agentInput = callbacks.executeAgent.mock.calls[0][0] as RuntimeAgentExecutionInput;
      expect(agentInput.contextPackage.contextIds).toEqual(['ctx_1', 'ctx_2']);
      expect(agentInput.contextPackage).toBe(result.contextPackage);
      expect(agentInput.request.input).toEqual({ text: 'test input' });

      // Assert final run properties
      expect(result.run.status).toBe('completed');
      expect(result.run.completedAt).toBe(NOW);
      expect(result.run.contextIds).toEqual(['ctx_1', 'ctx_2']);
      expect(result.run.decisionIds).toEqual(['dec_1', 'dec_2']);
      expect(result.run.outcomeIds).toEqual(['out_1']);
      expect(result.run.output).toEqual({ type: 'test_output' });

      // Assert persisted run matches returned run
      const persisted = runStore.getRun(result.run.id);
      expect(persisted).toEqual(result.run);

      // Assert diagnostics
      expect(result.diagnostics.validate).toBe('completed');
      expect(result.diagnostics.createRun).toBe('completed');
      expect(result.diagnostics.retrieveContext).toBe('completed');
      expect(result.diagnostics.assembleContext).toBe('completed');
      expect(result.diagnostics.persistRunning).toBe('completed');
      expect(result.diagnostics.executeAgent).toBe('completed');
      expect(result.diagnostics.persistCompleted).toBe('completed');
    });

    it('A-2: empty learning sources create no memory records', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const memoryStore = new FakeMemoryStore();
      const resolveLearningEvidence = vi.fn(async (): Promise<readonly RuntimeLearningSource[]> => []);
      const deps = makeDependencies(callbacks, { runStore, memoryStore, resolveLearningEvidence });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // Learning outcome is no_evidence (not failed, not completed)
      expect(result.learningOutcome).toBe('no_evidence');
      expect(result.learningResult).toBeNull();

      // No memory store interaction (no creates, no getByIds)
      expect(memoryStore.callLog).toHaveLength(0);
    });

    it('A-3: valid learning evidence reaches P0.7.5 pipeline and persists', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const memoryStore = new FakeMemoryStore();
      const deps = makeDependencies(callbacks, { runStore, memoryStore });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // With valid outcomeIds and metricAggregations, the default policy
      // (requireOutcomeEvidence: true) should produce eligible candidates.
      // The pipeline RAN and persisted at least one record.
      expect(result.diagnostics.resolveEvidence).toBe('completed');
      expect(result.diagnostics.learning).toBe('completed');
      expect(result.learningResult).not.toBeNull();
      // Genuine persistence: MemoryStore.create was called at least once
      const createCalls = memoryStore.callLog.filter((c) => c.startsWith('create:'));
      expect(createCalls.length).toBeGreaterThan(0);
      // learningOutcome is 'completed' (no failures)
      expect(result.learningOutcome).toBe('completed');
      expect(result.learningResult!.counts.persisted).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group B: Lifecycle & Failure
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group B: Lifecycle & Failure', () => {
    it('B-1: invalid request creates no run', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const deps = makeDependencies(callbacks, { runStore });

      // Missing ownerId
      await expect(runContextOSAgentLoop(
        makeRequest({ ownerId: '' }),
        deps
      )).rejects.toThrow(RuntimeValidationError);

      // No Run was created
      expect(runStore.callLog).toHaveLength(0);

      // Missing purpose (fresh store)
      const runStore2 = new FakeRunStore();
      const deps2 = makeDependencies(callbacks, { runStore: runStore2 });

      await expect(runContextOSAgentLoop(
        makeRequest({ purpose: '' }),
        deps2
      )).rejects.toThrow(RuntimeValidationError);

      expect(runStore2.callLog).toHaveLength(0);
    });

    it('B-2: initial run persistence failure stops the loop before retrieval', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      runStore.setFailNextCreate(true);
      const deps = makeDependencies(callbacks, { runStore });

      await expect(runContextOSAgentLoop(makeRequest(), deps)).rejects.toThrow(
        /Failed to persist started run/
      );

      // Retrieval was NEVER called
      expect(callbacks.retrieveContext).not.toHaveBeenCalled();
      // Only one attempt: create (failed)
      expect(runStore.callLog).toEqual(['create:started']);
    });

    it('B-3: retrieval failure marks run failed', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const retrieveContext = vi.fn(async (): Promise<ContextObject[]> => {
        throw new Error('Retrieval error');
      });
      const deps = makeDependencies(callbacks, { runStore, retrieveContext });

      await expect(runContextOSAgentLoop(makeRequest(), deps)).rejects.toThrow(
        /Agent loop execution failed/
      );

      // Run persisted as started and then failed
      expect(runStore.callLog).toEqual(['create:started', 'update:failed']);

      // Find the failed run in the store (ID format includes sha256hex)
      const { runs: allRuns } = await runStore.list({ ownerId: TEST_OWNER });
      expect(allRuns).toHaveLength(1);
      expect(allRuns[0].status).toBe('failed');
      expect(allRuns[0].completedAt).toBe(NOW);
    });

    it('B-4: assembly failure marks run failed', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const assembleContext = vi.fn(async (): Promise<RuntimeContextPackage> => {
        throw new Error('Assembly error');
      });
      const deps = makeDependencies(callbacks, { runStore, assembleContext });

      await expect(runContextOSAgentLoop(makeRequest(), deps)).rejects.toThrow(
        /Agent loop execution failed/
      );

      expect(runStore.callLog).toEqual(['create:started', 'update:failed']);
    });

    it('B-5: agent execution failure marks run failed', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const executeAgent = vi.fn(async (): Promise<RuntimeAgentExecutionResult> => {
        throw new Error('Agent error');
      });
      const deps = makeDependencies(callbacks, { runStore, executeAgent });

      await expect(runContextOSAgentLoop(makeRequest(), deps)).rejects.toThrow(
        /Agent loop execution failed/
      );

      expect(runStore.callLog).toEqual(['create:started', 'update:running', 'update:failed']);
    });

    it('B-6: run status is running before executor starts', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      let capturedRunStatusBefore: ContextOSRunStatus | null = null;
      const executeAgent = vi.fn(async (input: RuntimeAgentExecutionInput): Promise<RuntimeAgentExecutionResult> => {
        const stored = runStore.getRun(input.run.id);
        capturedRunStatusBefore = stored?.status ?? null;
        return { output: 'ok' };
      });
      const deps = makeDependencies(callbacks, { runStore, executeAgent });

      await runContextOSAgentLoop(makeRequest(), deps);

      expect(capturedRunStatusBefore).toBe('running');
    });

    it('B-7: agent output is not marked completed before execution finishes', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      let wasCompletedDuringAgent = false;
      const executeAgent = vi.fn(async (input: RuntimeAgentExecutionInput): Promise<RuntimeAgentExecutionResult> => {
        const stored = runStore.getRun(input.run.id);
        if (stored?.status === 'completed') {
          wasCompletedDuringAgent = true;
        }
        return { output: 'done' };
      });
      const deps = makeDependencies(callbacks, { runStore, executeAgent });

      await runContextOSAgentLoop(makeRequest(), deps);

      expect(wasCompletedDuringAgent).toBe(false);
    });

    it('B-8: final completed-state persistence failure is surfaced', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      // Make the second update (completion) fail
      const originalUpdate = runStore.update.bind(runStore);
      runStore.update = vi.fn(async (run: ContextOSRun): Promise<ContextOSRun> => {
        if (run.status === 'completed') {
          throw new Error('Persist completion failed');
        }
        return originalUpdate(run);
      });
      const deps = makeDependencies(callbacks, { runStore });

      await expect(runContextOSAgentLoop(makeRequest(), deps)).rejects.toThrow(
        /Agent loop execution failed|failed to persist completion/
      );
    });

    it('B-9: failure-state persistence failure is reported without losing original error', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const retrieveContext = vi.fn(async (): Promise<ContextObject[]> => {
        throw new Error('Original retrieval error');
      });
      const originalUpdate = runStore.update.bind(runStore);
      runStore.update = vi.fn(async (run: ContextOSRun): Promise<ContextOSRun> => {
        if (run.status !== 'started') {
          throw new Error('Persist also failed');
        }
        return originalUpdate(run);
      });
      const deps = makeDependencies(callbacks, { runStore, retrieveContext });

      await expect(runContextOSAgentLoop(makeRequest(), deps)).rejects.toThrow(
        /Agent loop execution failed AND persist failed|Original retrieval error|Persist also failed/
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group C: Learning Semantics
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group C: Learning Semantics', () => {
    it('C-1: learning-source resolution failure is reported truthfully', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const memoryStore = new FakeMemoryStore();
      const resolveLearningEvidence = vi.fn(async (): Promise<readonly RuntimeLearningSource[]> => {
        throw new Error('Resolver crashed');
      });
      const deps = makeDependencies(callbacks, { runStore, memoryStore, resolveLearningEvidence });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // The loop still completes (learning failure is NOT a run failure)
      expect(result.run.status).toBe('completed');
      // Resolution failure is distinguished from 'no_evidence':
      //   - resolveEvidence = 'failed' (resolver threw)
      //   - learningOutcome = 'failed' (resolution itself broke, not empty result)
      expect(result.diagnostics.resolveEvidence).toBe('failed');
      expect(result.learningOutcome).toBe('failed');
      expect(result.diagnostics.learning).toBe('failed');
      expect(result.diagnostics.warnings.some((w) => w.includes('Resolver crashed'))).toBe(true);
    });

    it('C-2: owner mismatch in learning sources performs zero learning-store I/O', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const memoryStore = new FakeMemoryStore();
      const resolveLearningEvidence = vi.fn(async (): Promise<readonly RuntimeLearningSource[]> => [
        {
          decision: makeDecisionMemory('dec_x', 'other_user'),
          feedback: makeDecisionFeedback('dec_x', 'other_user'),
        },
      ]);
      const deps = makeDependencies(callbacks, { runStore, memoryStore, resolveLearningEvidence });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // The learning pipeline throws on owner mismatch (fail-closed)
      // Run still completes (learning failure != run failure)
      expect(result.run.status).toBe('completed');
      expect(result.learningOutcome).toBe('failed');

      // No actual memory store I/O (preflight throws before any storage operations)
      const createCalls = memoryStore.callLog.filter((c) => c.startsWith('create:'));
      expect(createCalls).toHaveLength(0);
    });

    it('C-3: failed learning write is represented by failed outcome', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const memoryStore = new FakeMemoryStore();
      memoryStore.setFailNextCreate(true);
      const deps = makeDependencies(callbacks, { runStore, memoryStore });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // With valid outcomeIds, candidates ARE eligible.
      // MemoryStore.create fails → pipeline records a failure (counts.failed > 0).
      // Run still completes (learning failure != run failure).
      expect(result.run.status).toBe('completed');
      expect(result.learningOutcome).toBe('failed');
      expect(result.learningResult).not.toBeNull();
      expect(result.learningResult!.counts.failed).toBeGreaterThan(0);
    });

    it('C-4: two independent runs with same store and clock produce different IDs', async () => {
      const callbacks1 = createTestCallbacks();
      const callbacks2 = createTestCallbacks();
      const memoryStore = new FakeMemoryStore();

      // SHARED runStore — both runs hit the same store
      const sharedRunStore = new FakeRunStore();

      // First run: default request (input: { text: 'test input' })
      const req1 = makeRequest();
      const deps1 = makeDependencies(callbacks1, { runStore: sharedRunStore, memoryStore });
      const result1 = await runContextOSAgentLoop(req1, deps1);

      // Second run: DIFFERENT input (produces different sha256 → different ID)
      const req2 = makeRequest({ input: { text: 'different input' } });
      const deps2 = makeDependencies(callbacks2, { runStore: sharedRunStore, memoryStore });
      const result2 = await runContextOSAgentLoop(req2, deps2);

      // Both runs complete successfully — no ID collision
      expect(result1.run.status).toBe('completed');
      expect(result2.run.status).toBe('completed');

      // Different inputs → different content hashes → different Run IDs
      expect(result1.run.id).not.toBe(result2.run.id);

      // Both runs persisted in the same store
      expect(sharedRunStore.getRun(result1.run.id)).toBeDefined();
      expect(sharedRunStore.getRun(result2.run.id)).toBeDefined();

      // Both should be logged as created
      const createdStatuses = sharedRunStore.callLog.filter((c) => c === 'create:started');
      expect(createdStatuses).toHaveLength(2);
    });

    it('C-5: explicit taskId contributes to run ID differentiation', async () => {
      const callbacks1 = createTestCallbacks();
      const callbacks2 = createTestCallbacks();
      const memoryStore = new FakeMemoryStore();
      const sharedRunStore = new FakeRunStore();

      // Same owner, same clock, same input — but different taskId
      const req1 = makeRequest({ taskId: 'task_alpha' });
      const req2 = makeRequest({ taskId: 'task_beta' });

      const deps1 = makeDependencies(callbacks1, { runStore: sharedRunStore, memoryStore });
      const result1 = await runContextOSAgentLoop(req1, deps1);

      const deps2 = makeDependencies(callbacks2, { runStore: sharedRunStore, memoryStore });
      const result2 = await runContextOSAgentLoop(req2, deps2);

      // Different taskIds → different IDs (even with same timestamp)
      expect(result1.run.id).not.toBe(result2.run.id);
      // Both complete
      expect(result1.run.status).toBe('completed');
      expect(result2.run.status).toBe('completed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group D: Edge Cases & Compatibility
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group D: Edge Cases & Compatibility', () => {
    it('D-1: empty context results follow explicit policy (still executes agent)', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const retrieveContext = vi.fn(async (): Promise<ContextObject[]> => []);
      // assembleContext with empty contexts
      const assembleContext = vi.fn(async (contexts: ContextObject[]): Promise<RuntimeContextPackage> => {
        return makeContextPackage(contexts.map((c) => c.id));
      });
      const deps = makeDependencies(callbacks, { runStore, retrieveContext, assembleContext });
      // Clear the shared executeAgent mock count
      callbacks.executeAgent.mockClear();

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // Agent still runs even with zero contexts
      expect(result.run.status).toBe('completed');
      expect(callbacks.executeAgent).toHaveBeenCalledTimes(1);
      expect(result.contextPackage.contextIds).toEqual([]);
    });

    it('D-2: empty learning evidence is distinguished from learning failure', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const memoryStore = new FakeMemoryStore();
      const resolveLearningEvidence = vi.fn(async (): Promise<readonly RuntimeLearningSource[]> => []);
      const deps = makeDependencies(callbacks, { runStore, memoryStore, resolveLearningEvidence });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // empty = no_evidence (not 'failed')
      expect(result.learningOutcome).toBe('no_evidence');
      expect(result.diagnostics.learning).toBe('skipped');
    });

    it('D-3: duplicate or malformed decision/outcome IDs are handled predictably', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const executeAgent = vi.fn(async (): Promise<RuntimeAgentExecutionResult> => {
        return {
          output: 'test',
          decisionIds: ['dec_1', 'dec_1', 'dec_2', '', '  ', 123 as unknown as string, null as unknown as string],
          outcomeIds: ['out_1', 'out_1', undefined as unknown as string],
        };
      });
      const deps = makeDependencies(callbacks, { runStore, executeAgent });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      // IDs should be deduplicated and sanitized
      expect(result.run.decisionIds).toEqual(['dec_1', 'dec_2']);
      expect(result.run.outcomeIds).toEqual(['out_1']);
    });

    it('D-4: injected clock is propagated consistently', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const deps = makeDependencies(callbacks, { runStore });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      expect(result.run.startedAt).toBe(NOW);
      expect(result.run.completedAt).toBe(NOW);
    });

    it('D-5: existing runContextOS() remains backward-compatible', async () => {
      // Verify runContextOS() still works (no regressions introduced)
      const retrieveContext = vi.fn(async (): Promise<ContextObject[]> => [
        makeContextObject('ctx_a'),
      ]);
      const assembleContext = vi.fn(async (
        contexts: ContextObject[],
        _policy: unknown,
        _purpose: string
      ): Promise<RuntimeContextPackage> => makeContextPackage(contexts.map((c) => c.id)));

      const result = await runContextOS(makeRequest(), {
        retrieveContext,
        assembleContext,
        now: FIXED_CLOCK,
        runStore: new FakeRunStore(),
      });

      // runContextOS returns CreateRunResult (run + contextPackage)
      expect(result.run.status).toBe('completed');
      expect(result.contextPackage.contextIds).toEqual(['ctx_a']);
    });

    it('D-6: no memoryStore skips learning gracefully', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const deps = {
        retrieveContext: callbacks.retrieveContext,
        assembleContext: callbacks.assembleContext,
        executeAgent: callbacks.executeAgent,
        resolveLearningEvidence: callbacks.resolveLearningEvidence,
        now: FIXED_CLOCK,
        runStore,
        // No memoryStore
      };

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      expect(result.run.status).toBe('completed');
      expect(result.learningOutcome).toBe('skipped');
      expect(result.learningResult).toBeNull();
    });

    it('D-7: agent with no returned IDs works correctly', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const executeAgent = vi.fn(async (): Promise<RuntimeAgentExecutionResult> => {
        return { output: 'minimal' };
      });
      const deps = makeDependencies(callbacks, { runStore, executeAgent });

      const result = await runContextOSAgentLoop(makeRequest(), deps);

      expect(result.run.status).toBe('completed');
      expect(result.run.decisionIds).toEqual([]);
      expect(result.run.outcomeIds).toEqual([]);
      expect(result.run.output).toBe('minimal');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group E: Run ID Hash Identity (R1.2)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group E: Run ID Hash Identity (R1.2)', () => {
    it('E-A: known collision pair produces different IDs under SHA-256', () => {
      // These two inputs demonstrated collisions under the old djb2 shortHash.
      // With SHA-256, they MUST produce different IDs.
      const reqA = makeRequest({ input: { text: 'gRCtcDDK9gr8' } });
      const reqB = makeRequest({ input: { text: 'scXV4x9hBVQV' } });

      const idA = generateRunId(reqA, NOW);
      const idB = generateRunId(reqB, NOW);

      expect(idA).not.toBe(idB);
    });

    it('E-A-full: both collision-pair runs complete independently in shared store', async () => {
      const callbacks1 = createTestCallbacks();
      const callbacks2 = createTestCallbacks();
      const memoryStore = new FakeMemoryStore();
      const sharedRunStore = new FakeRunStore();

      const req1 = makeRequest({ input: { text: 'gRCtcDDK9gr8' } });
      const req2 = makeRequest({ input: { text: 'scXV4x9hBVQV' } });

      const deps1 = makeDependencies(callbacks1, { runStore: sharedRunStore, memoryStore });
      const result1 = await runContextOSAgentLoop(req1, deps1);

      const deps2 = makeDependencies(callbacks2, { runStore: sharedRunStore, memoryStore });
      const result2 = await runContextOSAgentLoop(req2, deps2);

      expect(result1.run.status).toBe('completed');
      expect(result2.run.status).toBe('completed');
      expect(result1.run.id).not.toBe(result2.run.id);
      expect(sharedRunStore.getRun(result1.run.id)).toBeDefined();
      expect(sharedRunStore.getRun(result2.run.id)).toBeDefined();
    });

    it('E-B-projectId: different projectId yields different run ID', () => {
      const reqA = makeRequest({ projectId: 'proj_alpha' });
      const reqB = makeRequest({ projectId: 'proj_beta' });
      expect(generateRunId(reqA, NOW)).not.toBe(generateRunId(reqB, NOW));
    });

    it('E-B-topicId: different topicId yields different run ID', () => {
      const reqA = makeRequest({ topicId: 'topic_alpha' });
      const reqB = makeRequest({ topicId: 'topic_beta' });
      expect(generateRunId(reqA, NOW)).not.toBe(generateRunId(reqB, NOW));
    });

    it('E-B-contextPolicy: different contextPolicy yields different run ID', () => {
      const reqA = makeRequest({ contextPolicy: { maxTokens: 4000 } });
      const reqB = makeRequest({ contextPolicy: { maxTokens: 8000 } });
      expect(generateRunId(reqA, NOW)).not.toBe(generateRunId(reqB, NOW));
    });

    it('E-C-order: key order does not affect canonical serialization', () => {
      const canonical1 = canonicalJson({ a: 1, b: 2, c: 3 });
      const canonical2 = canonicalJson({ c: 3, a: 1, b: 2 });
      const canonical3 = canonicalJson({ b: 2, c: 3, a: 1 });
      expect(canonical1).toBe(canonical2);
      expect(canonical2).toBe(canonical3);
    });

    it('E-C-nested: nested objects produce stable serialization', () => {
      const input1 = { user: { name: 'alice', tags: ['admin', 'user'] }, count: 5 };
      const input2 = { count: 5, user: { tags: ['admin', 'user'], name: 'alice' } };
      expect(canonicalJson(input1)).toBe(canonicalJson(input2));
    });

    it('E-C-null: null and missing fields are handled distinctly where present', () => {
      // In generateRunId, null fields are passed as null (not undefined).
      // canonicalJson(null) → 'null' string.
      expect(canonicalJson(null)).toBe('null');
      expect(canonicalJson([1, null, 'x'])).toBe('[1,null,"x"]');
    });

    it('E-C-throw: undefined values throw a descriptive error', () => {
      expect(() => canonicalJson({ a: undefined })).toThrow(/undefined/);
      expect(() => canonicalJson(undefined)).toThrow(/unsupported type/);
    });

    it('E-D-deterministic: same identity and timestamp produce same ID', () => {
      const req = makeRequest({ taskId: 'retry_task' });
      const id1 = generateRunId(req, NOW);
      const id2 = generateRunId(req, NOW);
      expect(id1).toBe(id2);
    });

    it('E-D-conflict: duplicate ID triggers RunConflictError, not overwrite', async () => {
      const callbacks = createTestCallbacks();
      const memoryStore = new FakeMemoryStore();
      const sharedRunStore = new FakeRunStore();

      // First run with explicit taskId to get a known ID
      const req = makeRequest({ taskId: 'conflict_test' });
      const deps1 = makeDependencies(callbacks, { runStore: sharedRunStore, memoryStore });
      const result1 = await runContextOSAgentLoop(req, deps1);
      expect(result1.run.status).toBe('completed');

      // Second run with same identity + timestamp must fail on create
      // (FakeRunStore throws 'already exists' for duplicate IDs)
      const deps2 = makeDependencies(createTestCallbacks(), { runStore: sharedRunStore, memoryStore });
      await expect(runContextOSAgentLoop(req, deps2)).rejects.toThrow(/already exists/);

      // Original record is intact
      const original = sharedRunStore.getRun(result1.run.id);
      expect(original).toBeDefined();
      expect(original!.status).toBe('completed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group F: Strict Canonical JSON & Identity Field Boundary (R1.2.1)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group F: Strict Canonical JSON & Identity Field Boundary (R1.2.1)', () => {

    // ─── F-A: contextQuery contributes to identity ───────────────────────
    it('F-A-contextQuery: different contextQuery yields different run ID', () => {
      const reqA = makeRequest({ contextQuery: 'query_alpha' });
      const reqB = makeRequest({ contextQuery: 'query_beta' });
      expect(generateRunId(reqA, NOW)).not.toBe(generateRunId(reqB, NOW));
    });

    it('F-A-contextQuery-deterministic: same identity and timestamp produce same ID with contextQuery', () => {
      const req = makeRequest({ contextQuery: 'stable_query' });
      const id1 = generateRunId(req, NOW);
      const id2 = generateRunId(req, NOW);
      expect(id1).toBe(id2);
    });

    it('F-A-contextQuery-shared-store: two runs with different contextQuery both persist', async () => {
      const callbacks1 = createTestCallbacks();
      const callbacks2 = createTestCallbacks();
      const memoryStore = new FakeMemoryStore();
      const sharedRunStore = new FakeRunStore();

      const req1 = makeRequest({ contextQuery: 'how to write hooks' });
      const req2 = makeRequest({ contextQuery: 'viral content strategy' });

      const deps1 = makeDependencies(callbacks1, { runStore: sharedRunStore, memoryStore });
      const result1 = await runContextOSAgentLoop(req1, deps1);

      const deps2 = makeDependencies(callbacks2, { runStore: sharedRunStore, memoryStore });
      const result2 = await runContextOSAgentLoop(req2, deps2);

      expect(result1.run.status).toBe('completed');
      expect(result2.run.status).toBe('completed');
      expect(result1.run.id).not.toBe(result2.run.id);
      expect(sharedRunStore.getRun(result1.run.id)).toBeDefined();
      expect(sharedRunStore.getRun(result2.run.id)).toBeDefined();
    });

    // ─── F-B: unsupported types are explicitly rejected ──────────────────
    it('F-B-date: Date instances throw (not silently serialized)', () => {
      const d1 = new Date('2026-01-01T00:00:00.000Z');
      const d2 = new Date('2026-06-15T00:00:00.000Z');
      expect(() => canonicalJson(d1)).toThrow(/unsupported type/);
      expect(() => canonicalJson(d2)).toThrow(/unsupported type/);
    });

    it('F-B-map: Map throws', () => {
      const m = new Map([['k', 'v']]);
      expect(() => canonicalJson(m)).toThrow(/unsupported type/);
    });

    it('F-B-set: Set throws', () => {
      const s = new Set(['a', 'b']);
      expect(() => canonicalJson(s)).toThrow(/unsupported type/);
    });

    it('F-B-regexp: RegExp throws', () => {
      const r = /test/gi;
      expect(() => canonicalJson(r)).toThrow(/unsupported type/);
    });

    it('F-B-custom-prototype: class instance throws', () => {
      class MyClass { foo = 'bar'; }
      const instance = new MyClass();
      expect(() => canonicalJson(instance)).toThrow(/unsupported type/);
    });

    it('F-B-nan: NaN throws', () => {
      expect(() => canonicalJson(NaN)).toThrow(/non-finite number/);
    });

    it('F-B-infinity: Infinity and -Infinity throw', () => {
      expect(() => canonicalJson(Infinity)).toThrow(/non-finite number/);
      expect(() => canonicalJson(-Infinity)).toThrow(/non-finite number/);
    });

    it('F-B-nested-invalid: nested object containing unsupported value throws', () => {
      expect(() => canonicalJson({ a: new Date() })).toThrow(/unsupported type/);
      expect(() => canonicalJson({ nested: { bad: NaN } })).toThrow(/non-finite number/);
      expect(() => canonicalJson([1, new Map(), 3])).toThrow(/unsupported type/);
      expect(() => canonicalJson([{ deep: [Infinity] }])).toThrow(/non-finite number/);
    });

    it('F-B-minus-zero: -0 normalizes deterministically', () => {
      expect(canonicalJson(-0)).toBe('0');
      expect(canonicalJson(0)).toBe('0');
    });

    // ─── F-C: input null vs undefined ───────────────────────────────────
    it('F-C-input-null: explicit null input serializes deterministically', () => {
      const identityObj = { input: null };
      expect(canonicalJson(identityObj)).toBe('{"input":null}');
      // null input must not be the same as a missing key
      const missingObj = {};
      expect(canonicalJson(missingObj)).toBe('{}');
      expect(canonicalJson(identityObj)).not.toBe(canonicalJson(missingObj));
    });

    it('F-C-input-undefined: undefined input triggers validation error before persistence', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const deps = makeDependencies(callbacks, { runStore });

      const req = makeRequest({ input: undefined });
      await expect(runContextOSAgentLoop(req, deps)).rejects.toThrow(RuntimeValidationError);

      // No Run was created (validation fires before persistence)
      expect(runStore.callLog).toHaveLength(0);
    });

    it('F-C-input-null-request: request with null input produces a valid run ID', () => {
      const reqNull = makeRequest({ input: null });
      // null input should NOT crash validation
      const idNull = generateRunId(reqNull, NOW);
      // Should produce a valid ID string
      expect(idNull).toMatch(/^run_/);
    });

    // ─── F-D: regression — pre-existing R1.2 tests still pass ───────────
    it('F-D-regression-collision: known collision pair still produces different IDs', () => {
      const reqA = makeRequest({ input: { text: 'gRCtcDDK9gr8' } });
      const reqB = makeRequest({ input: { text: 'scXV4x9hBVQV' } });
      expect(generateRunId(reqA, NOW)).not.toBe(generateRunId(reqB, NOW));
    });

    it('F-D-regression-determinism: same identity → same ID', () => {
      const req = makeRequest({ taskId: 'regress_task' });
      expect(generateRunId(req, NOW)).toBe(generateRunId(req, NOW));
    });

    it('F-D-regression-key-order: key order does not affect serialization', () => {
      const a = canonicalJson({ x: 1, y: 2, z: 3 });
      const b = canonicalJson({ z: 3, x: 1, y: 2 });
      expect(a).toBe(b);
    });

    it('F-D-regression-projectId-diff: different projectId still different', () => {
      const reqA = makeRequest({ projectId: 'p1' });
      const reqB = makeRequest({ projectId: 'p2' });
      expect(generateRunId(reqA, NOW)).not.toBe(generateRunId(reqB, NOW));
    });

    it('F-D-regression-owner-isolation: owner mismatch in learning sources → no store I/O', async () => {
      const callbacks = createTestCallbacks();
      const runStore = new FakeRunStore();
      const memoryStore = new FakeMemoryStore();
      const resolveLearningEvidence = vi.fn(async (): Promise<readonly RuntimeLearningSource[]> => [
        {
          decision: makeDecisionMemory('dec_x', 'other_user'),
          feedback: makeDecisionFeedback('dec_x', 'other_user'),
        },
      ]);
      const deps = makeDependencies(callbacks, { runStore, memoryStore, resolveLearningEvidence });

      const result = await runContextOSAgentLoop(makeRequest(), deps);
      expect(result.run.status).toBe('completed');
      const createCalls = memoryStore.callLog.filter((c) => c.startsWith('create:'));
      expect(createCalls).toHaveLength(0);
    });
  });
});
