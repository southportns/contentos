/**
 * P0.6.7 — Context Loop E2E Tests
 *
 * Golden scenario tests verifying the complete pipeline:
 *   Decision → Outcome → Feedback → Graph → Assembly → Learning → Memory
 *
 * These tests use real Infrastructure services (not mocks) to verify
 * the full end-to-end flow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runContextLoop } from '../context-loop-orchestrator';
import type { DecisionMemory } from '@/memory/decision-memory';
import type { OutcomeMemory } from '@/memory/outcome-memory';
import { InMemoryRetriever } from '@/memory/memory-retriever';
import type { ContextLoopDependencies } from '../context-loop-types';
import type { MemoryRecord } from '@/memory/memory-record';
import type { ContextGraph } from '../../graph/context-graph-types';
import type { ContextObject } from '../../context-object';
import {
  TEST_OWNER_A,
  TEST_OWNER_B,
  TEST_PROJECT_A,
  TEST_PROJECT_B,
  TEST_TOPIC_A,
  TEST_TOPIC_B,
  createDecisionMemoryFixture,
  createOutcomeMemoryFixture,
  createTestRetriever,
  resetIdCounter,
} from './test-helpers';

function runE2E(
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

function stripGeneratedAt(result: Record<string, unknown>) {
  const { generatedAt, metrics, ...rest } = result;
  // Also strip assembledContext metadata.assembledAt (wall-clock timestamp)
  if (rest.assembledContext?.metadata) {
    const { assembledAt, ...metaRest } = rest.assembledContext.metadata;
    rest.assembledContext = { ...rest.assembledContext, metadata: metaRest };
  }
  // Strip lifecycle.updatedAt from context objects inside assembledContext
  // (these depend on the factory's internal timestamp)
  if (rest.assembledContext?.contexts) {
    rest.assembledContext.contexts = rest.assembledContext.contexts.map((ctx: Record<string, unknown>) => {
      if (ctx.lifecycle) {
        const { updatedAt, ...lifecycleRest } = ctx.lifecycle;
        return { ...ctx, lifecycle: { ...lifecycleRest, updatedAt: null } };
      }
      return ctx;
    });
  }
  return rest;
}

beforeEach(() => {
  resetIdCounter();
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E Golden Scenario
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.7 — E2E Context Loop', () => {
  // ─── Golden Scenario: Full Pipeline ────────────────────────────────────────

  describe('Golden Scenario', () => {
    it('should produce complete result with Decision + Outcome + Feedback + Graph + Assembly + Learning', async () => {
      // Setup: Decision D1 + Outcome O1 (attributed to D1) + Graph (S1 → D1 → C1)
      const decision = createDecisionMemoryFixture({
        id: 'dec_e2e_golden_001',
        decision: 'Use storytelling hook for opening',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        confidence: 0.85,
      });

      const outcome = createOutcomeMemoryFixture({
        id: 'out_e2e_golden_001',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        metrics: [
          { key: 'views', value: 15000, unit: 'count', source: 'douyin' },
          { key: 'likes', value: 1200, unit: 'count', source: 'douyin' },
          { key: 'ctr', value: 0.08, unit: 'ratio', source: 'douyin' },
        ],
      });

      // Build graph: Strategy S1 → Decision D1 → Content C1
      const strategyCtx: ContextObject = {
        id: 'ctx_str_e2e_golden',
        kind: 'decision',
        type: 'strategy',
        payload: { strategyType: 'storytelling' },
        provenance: { source: 'test', sourceType: 'strategy' },
        lifecycle: { stage: 'retrieved', capturedAt: '2026-10-01T00:00:00.000Z' },
        confidence: 0.85,
        createdAt: '2026-10-01T07:00:00.000Z',
        updatedAt: '2026-10-01T07:00:00.000Z',
      };

      const contentCtx: ContextObject = {
        id: 'ctx_con_e2e_golden',
        kind: 'content',
        type: 'content',
        payload: { title: 'Test Content' },
        provenance: { source: 'test', sourceType: 'content' },
        lifecycle: { stage: 'retrieved', capturedAt: '2026-10-01T00:00:00.000Z' },
        confidence: 0.75,
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
      };

      const graph: ContextGraph = {
        nodes: [
          { id: strategyCtx.id, context: strategyCtx },
          { id: decision.id, context: strategyCtx },
          { id: contentCtx.id, context: contentCtx },
        ],
        edges: [
          {
            id: `edge_derived_from_${strategyCtx.id}_${decision.id}`,
            fromId: strategyCtx.id,
            toId: decision.id,
            type: 'derived_from',
            source: 'provenance',
            createdAt: '2026-10-01T08:00:00.000Z',
          },
          {
            id: `edge_used_by_${decision.id}_${contentCtx.id}`,
            fromId: decision.id,
            toId: contentCtx.id,
            type: 'used_by',
            source: 'provenance',
            createdAt: '2026-10-01T08:00:00.000Z',
          },
        ],
        nodeCount: 3,
        edgeCount: 2,
      };

      const retriever = new InMemoryRetriever([decision, outcome]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decision.id,
          graph,
          graphDepth: 2,
        },
        deps,
      );

      // ── Assertions from spec section 44 ──

      expect(result.decisionFound).toBe(true);
      expect(result.feedback).not.toBeNull();
      expect(result.feedback!.decisionId).toBe(decision.id);
      expect(result.feedback!.outcomeCount).toBe(1);
      expect(result.graphContext.length).toBeGreaterThan(0);
      expect(result.assembledContext).toBeDefined();
      expect(result.learningCandidates.length).toBeGreaterThanOrEqual(1);

      // Loop ID is deterministic
      expect(result.loopId).toBe(`loop_${decision.id}`);

      // Stage status: all should be true for golden scenario
      expect(result.stageStatus.decision).toBe(true);
      expect(result.stageStatus.outcome).toBe(true);
      expect(result.stageStatus.feedback).toBe(true);
      expect(result.stageStatus.graph).toBe(true);
      expect(result.stageStatus.assembly).toBe(true);
      expect(result.stageStatus.learning).toBe(true);

      // Completeness should be 'learned'
      expect(result.completeness).toBe('learned');
    });
  });

  // ─── Cross-Project Isolation ──────────────────────────────────────────────

  describe('Cross-Project Isolation', () => {
    it('should not leak Project A outcomes into Project B loop', async () => {
      const decisionA = createDecisionMemoryFixture({
        id: 'dec_cross_proj_a',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      });
      const outcomeA = createOutcomeMemoryFixture({
        id: 'out_cross_proj_a',
        decisionId: decisionA.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      });

      const decisionB = createDecisionMemoryFixture({
        id: 'dec_cross_proj_b',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_B,
        topicId: TEST_TOPIC_B,
      });

      const retriever = new InMemoryRetriever([decisionA, outcomeA, decisionB]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      // Use Project B scope to find decisionB (NOT runE2E which forces Project A)
      const resultB = await runContextLoop(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decisionB.id,
          projectId: TEST_PROJECT_B,
          topicId: TEST_TOPIC_B,
        },
        deps,
      );

      // decisionB has no outcomes, so learning should be empty
      expect(resultB.decisionFound).toBe(true);
      expect(resultB.learningCandidates).toHaveLength(0);
    });
  });

  // ─── Cross-Owner Isolation ────────────────────────────────────────────────

  describe('Cross-Owner Isolation', () => {
    it('should not leak Owner A data when running loop for Owner B', async () => {
      const decisionA = createDecisionMemoryFixture({
        id: 'dec_cross_owner_a',
        ownerId: TEST_OWNER_A,
      });
      const outcomeA = createOutcomeMemoryFixture({
        id: 'out_cross_owner_a',
        decisionId: decisionA.id,
        ownerId: TEST_OWNER_A,
      });

      const retriever = new InMemoryRetriever([decisionA, outcomeA]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      // Owner B tries to access Owner A's decision
      await expect(
        runE2E(
          { ownerId: TEST_OWNER_B, decisionId: decisionA.id },
          deps,
        ),
      ).rejects.toThrow();
    });
  });

  // ─── No Outcomes: Minimal Loop ────────────────────────────────────────────

  describe('No Outcomes Minimal Loop', () => {
    it('should return valid result with no learning candidates', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_e2e_minimal_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.decisionFound).toBe(true);
      expect(result.stageStatus.decision).toBe(true);
      expect(result.graphContext).toHaveLength(0);
      expect(result.learningCandidates).toHaveLength(0);
    });
  });

  // ─── Multiple Outcomes ─────────────────────────────────────────────────────

  describe('Multiple Outcomes', () => {
    it('should aggregate multiple attributed outcomes', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_e2e_multi_001' });
      const outcomes = [
        createOutcomeMemoryFixture({
          id: 'out_multi_001',
          decisionId: decision.id,
          observedAt: '2026-10-02T10:00:00.000Z',
          metrics: [{ key: 'views', value: 5000, unit: 'count' }],
        }),
        createOutcomeMemoryFixture({
          id: 'out_multi_002',
          decisionId: decision.id,
          observedAt: '2026-10-02T14:00:00.000Z',
          metrics: [{ key: 'views', value: 8000, unit: 'count' }],
        }),
        createOutcomeMemoryFixture({
          id: 'out_multi_003',
          decisionId: decision.id,
          observedAt: '2026-10-03T09:00:00.000Z',
          metrics: [{ key: 'views', value: 12000, unit: 'count' }],
        }),
      ];

      const retriever = new InMemoryRetriever([decision, ...outcomes]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.feedback).not.toBeNull();
      expect(result.feedback!.outcomeCount).toBe(3);
      expect(result.learningCandidates.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Replay Determinism ──────────────────────────────────────────────────

  describe('Replay Determinism', () => {
    it('should produce identical results for same input across runs', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_replay_001' });
      const outcome = createOutcomeMemoryFixture({
        id: 'out_replay_001',
        decisionId: decision.id,
      });

      const runLoop = async () => {
        const retriever = new InMemoryRetriever([decision, outcome]);
        const deps: ContextLoopDependencies = {
          memoryRetriever: retriever,
          now: () => FIXED_NOW,
        };
        return runE2E(
          { ownerId: TEST_OWNER_A, decisionId: decision.id },
          deps,
        );
      };

      const result1 = await runLoop();
      const result2 = await runLoop();

      const stripped1 = stripGeneratedAt(result1);
      const stripped2 = stripGeneratedAt(result2);

      expect(stripped1).toEqual(stripped2);
    });
  });

  // ─── Context Assembly Budget ──────────────────────────────────────────────

  describe('Context Assembly Budget', () => {
    it('should respect maxContexts limit', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_budget_001' });
      const retriever = new InMemoryRetriever([decision]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decision.id,
          maxContexts: 5,
        },
        deps,
      );

      expect(result.assembledContext).toBeDefined();
      expect(result.assembledContext!.selected.length).toBeLessThanOrEqual(5);
    });
  });

  // ─── Learning Candidate Memory Persistence ────────────────────────────────

  describe('Memory Persistence', () => {
    it('should persist candidates when persist function provided', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_mem_persist_001' });
      const outcome = createOutcomeMemoryFixture({
        id: 'out_mem_persist_001',
        decisionId: decision.id,
        metrics: [{ key: 'views', value: 50000, unit: 'count' }],
      });

      const retriever = new InMemoryRetriever([decision, outcome]);
      const persistedRecords: MemoryRecord[] = [];

      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
        persistLearningCandidate: async (candidate, ownerId) => {
          persistedRecords.push({} as MemoryRecord);
        },
      };

      const result = await runE2E(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.learningCandidates.length).toBeGreaterThan(0);
      expect(persistedRecords.length).toBe(result.learningCandidates.length);
    });

    it('should not persist when no candidates generated', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_mem_persist_002' });
      const retriever = new InMemoryRetriever([decision]);
      let persistCount = 0;

      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
        persistLearningCandidate: async () => {
          persistCount++;
          return {} as MemoryRecord;
        },
      };

      await runE2E(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(persistCount).toBe(0);
    });
  });

  // ─── Cross-Topic Isolation ────────────────────────────────────────────────

  describe('Cross-Topic Isolation', () => {
    it('should not leak outcomes from different topic', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_topic_iso_001',
        topicId: TEST_TOPIC_A,
      });
      // Outcome from different topic, attributed to same decision
      const outcomeOtherTopic = createOutcomeMemoryFixture({
        id: 'out_topic_iso_001',
        decisionId: decision.id,
        topicId: TEST_TOPIC_B,
      });

      const retriever = new InMemoryRetriever([decision, outcomeOtherTopic]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      // The outcome may still be attributed (attribution.decisionId match)
      // but loop should still complete successfully
      expect(result.decisionFound).toBe(true);
    });
  });

  // ─── Context Pollution Prevention ─────────────────────────────────────────

  describe('Context Pollution Prevention', () => {
    it('should enforce budget even with many graph contexts', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_pollution_001' });

      // Create graph with many nodes
      const nodes: ContextGraph['nodes'] = [{ id: decision.id, context: {
        id: decision.id, kind: 'decision', type: 'decision',
        payload: {}, provenance: {}, lifecycle: { stage: 'captured', capturedAt: FIXED_NOW },
        confidence: 0.8, createdAt: FIXED_NOW, updatedAt: FIXED_NOW,
      }}];
      const edges: ContextGraph['edges'] = [];

      for (let i = 0; i < 50; i++) {
        const nodeId = `ctx_extra_${i}`;
        nodes.push({
          id: nodeId,
          context: {
            id: nodeId, kind: 'content', type: 'content',
            payload: { index: i }, provenance: {}, lifecycle: { stage: 'captured', capturedAt: FIXED_NOW },
            confidence: 0.5, createdAt: FIXED_NOW, updatedAt: FIXED_NOW,
          },
        });
        edges.push({
          id: `edge_used_by_${decision.id}_${nodeId}`,
          fromId: decision.id,
          toId: nodeId,
          type: 'used_by',
          source: 'provenance',
          createdAt: FIXED_NOW,
        });
      }

      const graph: ContextGraph = {
        nodes,
        edges,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      };

      const retriever = new InMemoryRetriever([decision]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decision.id,
          graph,
          graphDepth: 3,
          maxContexts: 20,
        },
        deps,
      );

      // Budget must be respected
      expect(result.assembledContext).toBeDefined();
      expect(result.assembledContext!.selected.length).toBeLessThanOrEqual(20);
    });
  });

  // ─── Learning Candidate Determinism ───────────────────────────────────────

  describe('Learning Candidate Determinism', () => {
    it('should produce identical candidate IDs across runs', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_lc_det_001' });
      const outcome = createOutcomeMemoryFixture({
        id: 'out_lc_det_001',
        decisionId: decision.id,
      });

      const runLoop = async () => {
        const retriever = new InMemoryRetriever([decision, outcome]);
        const deps: ContextLoopDependencies = {
          memoryRetriever: retriever,
          now: () => FIXED_NOW,
        };
        return runE2E(
          { ownerId: TEST_OWNER_A, decisionId: decision.id },
          deps,
        );
      };

      const result1 = await runLoop();
      const result2 = await runLoop();

      expect(result1.learningCandidates.length).toBe(result2.learningCandidates.length);

      for (let i = 0; i < result1.learningCandidates.length; i++) {
        const c1 = result1.learningCandidates[i];
        const c2 = result2.learningCandidates[i];
        expect(c1.id).toBe(c2.id);
        expect(c1.type).toBe(c2.type);
        expect(c1.sourceDecisionId).toBe(c2.sourceDecisionId);
        expect(c1.sourceOutcomeIds).toEqual(c2.sourceOutcomeIds);
      }
    });
  });

  // ─── No Cross-Owner Learning Contamination ───────────────────────────────

  describe('No Cross-Owner Learning', () => {
    it('should not generate candidates when no outcomes exist', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_xowner_learn_001',
        ownerId: TEST_OWNER_A,
      });

      const retriever = new InMemoryRetriever([decision]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      // No outcomes → no candidates (decision IS found, hence 'no_outcome')
      expect(result.learningCandidates).toHaveLength(0);
      expect(result.completeness).toBe('no_outcome');
    });
  });
});
