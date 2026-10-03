/**
 * P0.6.7 — Context Loop Orchestrator Tests
 *
 * Tests for the runContextLoop orchestrator function.
 * Uses Dependency Injection (InMemoryRetriever injected) for isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runContextLoop } from '../context-loop-orchestrator';
import { MemoryNotFoundError } from '@/memory/persistence/memory-persistence-types';
import type { DecisionMemory } from '@/memory/decision-memory';
import type { OutcomeMemory } from '@/memory/outcome-memory';
import { InMemoryRetriever } from '@/memory/memory-retriever';
import type { ContextLoopDependencies } from '../context-loop-types';
import {
  TEST_OWNER_A,
  TEST_OWNER_B,
  TEST_PROJECT_A,
  TEST_PROJECT_B,
  TEST_TOPIC_A,
  TEST_TOPIC_B,
  createDecisionMemoryFixture,
  createOutcomeMemoryFixture,
  createGoldenScenarioFixture,
  resetIdCounter,
} from './test-helpers';

/**
 * Helper: run loop with default scope params to match topic-scoped fixtures.
 */
function runWithDefaultScope(
  request: { ownerId: string; decisionId: string;[key: string]: unknown },
  deps: import('../context-loop-types').ContextLoopDependencies,
) {
  return runContextLoop(
    {
      projectId: TEST_PROJECT_A,
      topicId: TEST_TOPIC_A,
      ...request,
    },
    deps,
  );
}

const FIXED_NOW = '2026-10-03T12:00:00.000Z';

// ═══════════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════════

function createDeps(overrides: Partial<ContextLoopDependencies> = {}): ContextLoopDependencies {
  return {
    memoryRetriever: new InMemoryRetriever(),
    now: () => FIXED_NOW,
    ...overrides,
  };
}

beforeEach(() => {
  resetIdCounter();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.7 — Context Loop Orchestrator', () => {
  // ─── Request Validation ───────────────────────────────────────────────────

  describe('request validation', () => {
    it('should throw when ownerId is empty', async () => {
      const deps = createDeps();

      await expect(
        runContextLoop({ ownerId: '', decisionId: 'dec_001' }, deps),
      ).rejects.toThrow('ownerId is required');
    });

    it('should throw when decisionId is empty', async () => {
      const deps = createDeps();

      await expect(
        runContextLoop({ ownerId: TEST_OWNER_A, decisionId: '' }, deps),
      ).rejects.toThrow('decisionId is required');
    });

    it('should throw when ownerId is whitespace-only', async () => {
      const deps = createDeps();

      await expect(
        runContextLoop({ ownerId: '  ', decisionId: 'dec_001' }, deps),
      ).rejects.toThrow('ownerId is required');
    });
  });

  // ─── Decision Not Found ───────────────────────────────────────────────────

  describe('decision not found', () => {
    it('should throw MemoryNotFoundError when decision does not exist', async () => {
      const deps = createDeps();

      await expect(
        runWithDefaultScope({ ownerId: TEST_OWNER_A, decisionId: 'nonexistent' }, deps),
      ).rejects.toThrow(MemoryNotFoundError);
    });

    it('should throw MemoryNotFoundError when decision belongs to different owner', async () => {
      const decision = createDecisionMemoryFixture({ ownerId: TEST_OWNER_B });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      await expect(
        runWithDefaultScope({ ownerId: TEST_OWNER_A, decisionId: decision.id }, deps),
      ).rejects.toThrow(MemoryNotFoundError);
    });
  });

  // ─── Decision Found, No Outcomes ──────────────────────────────────────────

  describe('decision found, no outcomes', () => {
    it('should return partial result with decisionFound=true', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_no_outcome_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.decisionFound).toBe(true);
      expect(result.loopId).toBe(`loop_${decision.id}`);
    });

    it('should have empty learningCandidates when no outcomes', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_no_outcome_002' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.learningCandidates).toHaveLength(0);
    });

    it('should have completeness=no_outcome when no attributed outcomes', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_no_outcome_003' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      // Decision exists but no outcomes → no_outcome
      expect(result.completeness).toBe('no_outcome');
    });

    it('should have stageStatus.decision=true', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_no_outcome_004' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.stageStatus.decision).toBe(true);
    });
  });

  // ─── Owner Isolation ─────────────────────────────────────────────────────

  describe('owner isolation', () => {
    it('should NOT return cross-owner outcomes', async () => {
      const decisionA = createDecisionMemoryFixture({
        id: 'dec_owner_a_001',
        ownerId: TEST_OWNER_A,
      });
      const outcomeB = createOutcomeMemoryFixture({
        id: 'out_owner_b_001',
        decisionId: decisionA.id, // Attributed to A's decision!
        ownerId: TEST_OWNER_B, // But belongs to Owner B
      });

      const retriever = new InMemoryRetriever([decisionA, outcomeB]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decisionA.id },
        deps,
      );

      // outcomeB should not affect owner A because it belongs to B
      // feedback should exist but reflect owner A's outcomes only
      if (result.feedback) {
        expect(result.feedback.outcomeCount).toBe(0);
      }
    });

    it('should NOT leak decision existence to other owners', async () => {
      const decision = createDecisionMemoryFixture({ ownerId: TEST_OWNER_B });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      await expect(
        runWithDefaultScope(
          { ownerId: TEST_OWNER_A, decisionId: decision.id },
          deps,
        ),
      ).rejects.toThrow(MemoryNotFoundError);
    });
  });

  // ─── Graph Optional ──────────────────────────────────────────────────────

  describe('graph optional', () => {
    it('should succeed without graph (no graphContext)', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_no_graph_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.graphContext).toHaveLength(0);
    });

    it('should populate graphContext when graph provided', async () => {
      const golden = createGoldenScenarioFixture();
      const retriever = new InMemoryRetriever([golden.decision, golden.outcome]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        {
          ownerId: TEST_OWNER_A,
          decisionId: golden.decision.id,
          graph: golden.graph,
          graphDepth: 2,
        },
        deps,
      );

      expect(result.graphContext.length).toBeGreaterThan(0);
      expect(result.stageStatus.graph).toBe(true);
    });
  });

  // ─── Learning Candidate Integration ───────────────────────────────────────

  describe('learning candidate generation', () => {
    it('should generate candidates when outcomes exist', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_learn_001', confidence: 0.85 });
      const outcome = createOutcomeMemoryFixture({
        id: 'out_learn_001',
        decisionId: decision.id,
        metrics: [
          { key: 'views', value: 50000, unit: 'count' },
          { key: 'engagement_rate', value: 0.12, unit: 'ratio' },
        ],
      });

      const retriever = new InMemoryRetriever([decision, outcome]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      // DIAGNOSTIC - throw to see values
      if (result.learningCandidates.length === 0) {
        throw new Error(`DIAG: warnings=${JSON.stringify(result.warnings)} feedback=${result.feedback ? JSON.stringify({oc: result.feedback.outcomeCount, st: result.feedback.status}) : 'null'} stages=${JSON.stringify(result.stageStatus)}`);
      }

      expect(result.learningCandidates.length).toBeGreaterThan(0);
      expect(result.stageStatus.learning).toBe(true);
    });

    it('should NOT generate candidates without outcomes', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_no_learn_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.learningCandidates).toHaveLength(0);
      expect(result.stageStatus.learning).toBe(false);
    });
  });

  // ─── Assembly Integration ─────────────────────────────────────────────────

  describe('context assembly', () => {
    it('should assemble context when decision exists', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_asm_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.assembledContext).toBeDefined();
      expect(result.stageStatus.assembly).toBe(true);
    });

    it('should include decision context in assembly', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_asm_002' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.assembledContext).toBeDefined();
      // Decision context + feedback context expected
      expect(result.assembledContext!.metadata.inputCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Determinism ─────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('should produce deterministic result (except generatedAt)', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_det_001' });
      const outcome = createOutcomeMemoryFixture({
        id: 'out_det_001',
        decisionId: decision.id,
      });
      const retriever = new InMemoryRetriever([decision, outcome]);

      const deps1 = createDeps({ memoryRetriever: retriever });
      const deps2 = createDeps({ memoryRetriever: new InMemoryRetriever([decision, outcome]) });

      const result1 = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps1,
      );
      const result2 = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps2,
      );

      expect(result1.decisionFound).toBe(result2.decisionFound);
      expect(result1.learningCandidates.length).toBe(result2.learningCandidates.length);
      expect(result1.completeness).toBe(result2.completeness);
      expect(result1.stageStatus).toEqual(result2.stageStatus);

      if (result1.feedback && result2.feedback) {
        expect(result1.feedback.outcomeCount).toBe(result2.feedback.outcomeCount);
      }

      // Learning candidate IDs should be deterministic
      for (let i = 0; i < result1.learningCandidates.length; i++) {
        expect(result1.learningCandidates[i].id).toBe(result2.learningCandidates[i].id);
      }
    });

    it('should have deterministic loopId', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_loopid_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.loopId).toBe(`loop_${decision.id}`);
    });
  });

  // ─── Metrics and Observability ───────────────────────────────────────────

  describe('metrics', () => {
    it('should include timing metrics', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_metrics_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalMs).toBeGreaterThanOrEqual(0);
    });

    it('should report zero outcomes when none attributed', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_metrics_002' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.metrics.outcomeCount).toBe(0);
      expect(result.metrics.learningCandidateCount).toBe(0);
    });
  });

  // ─── Warning Handling ────────────────────────────────────────────────────

  describe('warnings', () => {
    it('should return warnings array (possibly empty)', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_warn_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should include graph unavailable warning silently (no warning, just skips)', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_warn_002' });
      const retriever = new InMemoryRetriever([decision]);
      const deps = createDeps({ memoryRetriever: retriever });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      // No explicit warning for missing graph — just empty graphContext
      expect(result.graphContext).toHaveLength(0);
    });
  });

  // ─── Optional Persistence ────────────────────────────────────────────────

  describe('optional persistence', () => {
    it('should call persistLearningCandidate when provided and candidates exist', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_persist_001', confidence: 0.9 });
      const outcome = createOutcomeMemoryFixture({
        id: 'out_persist_001',
        decisionId: decision.id,
        metrics: [{ key: 'views', value: 100000, unit: 'count' }],
      });

      const retriever = new InMemoryRetriever([decision, outcome]);
      const persistedIds: string[] = [];

      const deps = createDeps({
        memoryRetriever: retriever,
        persistLearningCandidate: async (candidate, ownerId) => {
          persistedIds.push(candidate.id);
          return {} as Record<string, unknown>; // Mock MemoryRecord
        },
      });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.learningCandidates.length).toBeGreaterThan(0);
      expect(persistedIds.length).toBe(result.learningCandidates.length);
    });

    it('should NOT call persist when no candidates', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_persist_002' });
      const retriever = new InMemoryRetriever([decision]);
      let persistCalled = false;

      const deps = createDeps({
        memoryRetriever: retriever,
        persistLearningCandidate: async () => {
          persistCalled = true;
          return {} as Record<string, unknown>;
        },
      });

      await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(persistCalled).toBe(false);
    });
  });

  // ─── Custom Decision Feedback Builder ────────────────────────────────────

  describe('custom decisionFeedbackBuilder', () => {
    it('should use injected builder when provided', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_custom_001' });
      const retriever = new InMemoryRetriever([decision]);

      let builderCalled = false;
      const mockFeedback = {
        id: 'dfb_custom',
        ownerId: TEST_OWNER_A,
        decisionId: decision.id,
        decisionStatus: 'active' as const,
        decisionCreatedAt: decision.createdAt,
        outcomeCount: 5,
        outcomeIds: ['o1', 'o2', 'o3', 'o4', 'o5'],
        outcomeTypes: ['engagement'],
        windowStart: '2026-10-01T00:00:00.000Z',
        windowEnd: FIXED_NOW,
        metricAggregations: [],
        trends: [],
        status: 'evidence_available' as const,
        completeness: 'complete' as const,
        generatedAt: FIXED_NOW,
      };

      const deps = createDeps({
        memoryRetriever: retriever,
        decisionFeedbackBuilder: async () => {
          builderCalled = true;
          return mockFeedback;
        },
      });

      const result = await runWithDefaultScope(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(builderCalled).toBe(true);
      expect(result.feedback?.outcomeCount).toBe(5);
    });
  });
});
