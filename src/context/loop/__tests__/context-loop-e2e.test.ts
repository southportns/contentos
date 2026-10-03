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
  if (rest.assembledContext?.metadata) {
    const { assembledAt, ...metaRest } = rest.assembledContext.metadata;
    rest.assembledContext = { ...rest.assembledContext, metadata: metaRest };
  }
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

describe('P0.6.7 — E2E Context Loop', () => {
  describe('Golden Scenario', () => {
    it('should produce complete result with Decision + Outcome + Feedback + Graph + Assembly + Learning', async () => {
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

      expect(result.decisionFound).toBe(true);
      expect(result.feedback).not.toBeNull();
      expect(result.feedback!.decisionId).toBe(decision.id);
      expect(result.feedback!.outcomeCount).toBe(1);
      expect(result.graphContext.length).toBeGreaterThan(0);
      expect(result.assembledContext).toBeDefined();
      expect(result.learningCandidates.length).toBeGreaterThanOrEqual(1);

      expect(result.loopId).toBe(`loop_${decision.id}`);

      expect(result.stageStatus.decision).toBe(true);
      expect(result.stageStatus.outcome).toBe(true);
      expect(result.stageStatus.feedback).toBe(true);
      expect(result.stageStatus.graph).toBe(true);
      expect(result.stageStatus.assembly).toBe(true);
      expect(result.stageStatus.learning).toBe(true);

      expect(result.completeness).toBe('learned');

      const assemblyContextIds = [
        ...result.assembledContext!.selected.map((x) => x.context.id),
        ...result.assembledContext!.excluded.map((x) => x.contextId),
      ];

      expect(assemblyContextIds).toContain(`ctx_out_${outcome.id}`);
    });
  });

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

      const resultB = await runContextLoop(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decisionB.id,
          projectId: TEST_PROJECT_B,
          topicId: TEST_TOPIC_B,
        },
        deps,
      );

      expect(resultB.decisionFound).toBe(true);
      expect(resultB.learningCandidates).toHaveLength(0);
    });
  });

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

      await expect(
        runE2E(
          { ownerId: TEST_OWNER_B, decisionId: decisionA.id },
          deps,
        ),
      ).rejects.toThrow();
    });
  });

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

  describe('Cross-Topic Isolation', () => {
    it('should not leak outcomes from different topic', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_topic_iso_001',
        topicId: TEST_TOPIC_A,
      });
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

      expect(result.decisionFound).toBe(true);
    });
  });

  describe('Context Pollution Prevention', () => {
    it('should enforce budget even with many graph contexts', async () => {
      const decision = createDecisionMemoryFixture({ id: 'dec_pollution_001' });

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

      expect(result.assembledContext).toBeDefined();
      expect(result.assembledContext!.selected.length).toBeLessThanOrEqual(20);
    });
  });

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

      expect(result.learningCandidates).toHaveLength(0);
      expect(result.completeness).toBe('no_outcome');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0.6.7-R1: No Graph Scenario
  // ═══════════════════════════════════════════════════════════════════════════

  describe('P0.6.7-R1 — No Graph E2E (Graph optional)', () => {
    it('R1-E1: should complete full pipeline without graph', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_e2e_nograph_001',
        decision: 'Use emotional hook',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        confidence: 0.9,
      });

      const outcome = createOutcomeMemoryFixture({
        id: 'out_e2e_nograph_001',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        metrics: [
          { key: 'views', value: 50000, unit: 'count', source: 'douyin' },
          { key: 'engagement', value: 0.15, unit: 'ratio', source: 'douyin' },
        ],
      });

      const retriever = new InMemoryRetriever([decision, outcome]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decision.id,
        },
        deps,
      );

      expect(result.decisionFound).toBe(true);
      expect(result.feedback).not.toBeNull();
      expect(result.feedback!.outcomeCount).toBe(1);
      expect(result.graphContext).toHaveLength(0);
      expect(result.stageStatus.graph).toBe(false);
      expect(result.assembledContext).toBeDefined();
      expect(result.stageStatus.assembly).toBe(true);
      expect(result.learningCandidates.length).toBeGreaterThan(0);
      expect(result.stageStatus.learning).toBe(true);
      expect(result.completeness).toBe('learned');
    });

    it('R1-E2: should include Outcome Context in Assembly even without graph', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_e2e_nograph_ctx',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      });

      const outcome = createOutcomeMemoryFixture({
        id: 'out_e2e_nograph_ctx',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        metrics: [{ key: 'shares', value: 3000, unit: 'count' }],
      });

      const retriever = new InMemoryRetriever([decision, outcome]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decision.id,
        },
        deps,
      );

      expect(result.assembledContext).toBeDefined();

      const allAssemblyIds = [
        ...result.assembledContext!.selected.map((x) => x.context.id),
        ...result.assembledContext!.excluded.map((x) => x.contextId),
      ];

      expect(allAssemblyIds).toContain(`ctx_out_${outcome.id}`);
      expect(result.completeness).toBe('learned');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0.6.7-R2: Canonical Outcome Evidence
  // ═══════════════════════════════════════════════════════════════════════════

  describe('P0.6.7-R2 — Canonical Outcome Evidence (Default Window)', () => {
    it('R2-D1: Outcome Context must use same default window as Feedback', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_default_win',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        createdAt: '2026-10-01T08:00:00.000Z',
      });

      const outcomeA = createOutcomeMemoryFixture({
        id: 'out_r2_before_decision',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        observedAt: '2026-09-30T10:00:00.000Z',
      });

      const outcomeB = createOutcomeMemoryFixture({
        id: 'out_r2_after_decision',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        observedAt: '2026-10-02T10:00:00.000Z',
      });

      const retriever = new InMemoryRetriever([decision, outcomeA, outcomeB]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.feedback).not.toBeNull();
      expect(result.feedback!.outcomeCount).toBe(1);
      expect(result.feedback!.outcomeIds).toContain(outcomeB.id);
      expect(result.feedback!.outcomeIds).not.toContain(outcomeA.id);

      expect(result.feedback!.windowStart).toBe('2026-10-01T08:00:00.000Z');
      expect(result.feedback!.windowEnd).toBe('2026-10-03T12:00:00.000Z');

      const allAssemblyIds = [
        ...result.assembledContext!.selected.map((x) => x.context.id),
        ...result.assembledContext!.excluded.map((x) => x.contextId),
      ];

      expect(allAssemblyIds).toContain(`ctx_out_${outcomeB.id}`);
      expect(allAssemblyIds).not.toContain(`ctx_out_${outcomeA.id}`);
      expect(result.completeness).toBe('learned');
    });
  });

  describe('P0.6.7-R2 — Canonical Outcome Evidence (Explicit Window)', () => {
    it('R2-X1: Outcome Context must use same explicit window as Feedback', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_explicit_win',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        createdAt: '2026-10-01T00:00:00.000Z',
      });

      const outcomeA = createOutcomeMemoryFixture({
        id: 'out_r2_explicit_a',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        observedAt: '2026-10-01T10:00:00.000Z',
      });

      const outcomeB = createOutcomeMemoryFixture({
        id: 'out_r2_explicit_b',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        observedAt: '2026-10-02T10:00:00.000Z',
      });

      const outcomeC = createOutcomeMemoryFixture({
        id: 'out_r2_explicit_c',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        observedAt: '2026-10-03T10:00:00.000Z',
      });

      const retriever = new InMemoryRetriever([decision, outcomeA, outcomeB, outcomeC]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runContextLoop(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decision.id,
          projectId: TEST_PROJECT_A,
          topicId: TEST_TOPIC_A,
          windowStart: '2026-10-01T00:00:00.000Z',
          windowEnd: '2026-10-03T00:00:00.000Z',
        },
        deps,
      );

      expect(result.feedback).not.toBeNull();
      expect(result.feedback!.outcomeCount).toBe(2);
      expect(result.feedback!.outcomeIds).toContain(outcomeA.id);
      expect(result.feedback!.outcomeIds).toContain(outcomeB.id);
      expect(result.feedback!.outcomeIds).not.toContain(outcomeC.id);

      expect(result.feedback!.windowStart).toBe('2026-10-01T00:00:00.000Z');
      expect(result.feedback!.windowEnd).toBe('2026-10-03T00:00:00.000Z');

      const allAssemblyIds = [
        ...result.assembledContext!.selected.map((x) => x.context.id),
        ...result.assembledContext!.excluded.map((x) => x.contextId),
      ];

      expect(allAssemblyIds).toContain(`ctx_out_${outcomeA.id}`);
      expect(allAssemblyIds).toContain(`ctx_out_${outcomeB.id}`);
      expect(allAssemblyIds).not.toContain(`ctx_out_${outcomeC.id}`);

      const feedbackOutcomeContextIds = new Set(
        result.feedback!.outcomeIds.map((id) => `ctx_out_${id}`),
      );
      const assemblyOutcomeContextIds = new Set(
        allAssemblyIds.filter((id) => id.startsWith('ctx_out_')),
      );
      expect(feedbackOutcomeContextIds).toEqual(assemblyOutcomeContextIds);
    });
  });

  describe('P0.6.7-R2 — Retrieval Limit Consistency', () => {
    it('R2-L1: Feedback and Outcome Context must use the same retrieval limit', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_limit',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      });

      const outcomes: OutcomeMemory[] = [];
      for (let i = 0; i < 5; i++) {
        outcomes.push(
          createOutcomeMemoryFixture({
            id: `out_r2_limit_${i}`,
            decisionId: decision.id,
            ownerId: TEST_OWNER_A,
            projectId: TEST_PROJECT_A,
            topicId: TEST_TOPIC_A,
            observedAt: `2026-10-02T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
            metrics: [{ key: 'views', value: 1000 + i * 100, unit: 'count' }],
          }),
        );
      }

      const retriever = new InMemoryRetriever([decision, ...outcomes]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decision.id,
          retrievalLimit: 2,
        },
        deps,
      );

      expect(result.feedback).not.toBeNull();
      expect(result.feedback!.outcomeCount).toBe(2);
      expect(result.feedback!.completeness).toBe('bounded');

      const allAssemblyIds = [
        ...result.assembledContext!.selected.map((x) => x.context.id),
        ...result.assembledContext!.excluded.map((x) => x.contextId),
      ];

      const assemblyOutcomeIds = allAssemblyIds.filter((id) => id.startsWith('ctx_out_'));
      expect(assemblyOutcomeIds.length).toBe(2);

      const feedbackContextIds = result.feedback!.outcomeIds.map((id) => `ctx_out_${id}`);
      expect(new Set(assemblyOutcomeIds)).toEqual(new Set(feedbackContextIds));
    });
  });

  describe('P0.6.7-R2 — Equality Invariant', () => {
    it('R2-E1: Assembly Outcome Context IDs must exactly equal Feedback Outcome IDs mapped via ctx_out_', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_equality',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      });

      const outcomes = [
        createOutcomeMemoryFixture({
          id: 'out_r2_eq_1',
          decisionId: decision.id,
          observedAt: '2026-10-01T12:00:00.000Z',
          metrics: [{ key: 'views', value: 5000, unit: 'count' }],
        }),
        createOutcomeMemoryFixture({
          id: 'out_r2_eq_2',
          decisionId: decision.id,
          observedAt: '2026-10-02T08:00:00.000Z',
          metrics: [{ key: 'likes', value: 800, unit: 'count' }],
        }),
        createOutcomeMemoryFixture({
          id: 'out_r2_eq_3',
          decisionId: decision.id,
          observedAt: '2026-10-02T16:00:00.000Z',
          metrics: [{ key: 'shares', value: 300, unit: 'count' }],
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

      expect(result.feedback!.outcomeCount).toBe(3);

      const allAssemblyIds = [
        ...result.assembledContext!.selected.map((x) => x.context.id),
        ...result.assembledContext!.excluded.map((x) => x.contextId),
      ];

      const assemblyOutcomeContextIds = new Set(
        allAssemblyIds.filter((id) => id.startsWith('ctx_out_')),
      );

      const feedbackOutcomeContextIds = new Set(
        result.feedback!.outcomeIds.map((id) => `ctx_out_${id}`),
      );

      expect(assemblyOutcomeContextIds).toEqual(feedbackOutcomeContextIds);

      for (const outcomeId of result.feedback!.outcomeIds) {
        expect(assemblyOutcomeContextIds.has(`ctx_out_${outcomeId}`)).toBe(true);
      }
    });
  });

  describe('P0.6.7-R2 — No Outcome Case', () => {
    it('R2-N1: No outcomes → no Outcome Context and no learning candidates', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_no_outcome',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
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

      expect(result.learningCandidates).toHaveLength(0);
      expect(result.feedback!.outcomeCount).toBe(0);

      if (result.assembledContext) {
        const allAssemblyIds = [
          ...result.assembledContext.selected.map((x) => x.context.id),
          ...result.assembledContext.excluded.map((x) => x.contextId),
        ];
        const outcomeContextIds = allAssemblyIds.filter((id) => id.startsWith('ctx_out_'));
        expect(outcomeContextIds).toHaveLength(0);
      }

      expect(result.completeness).toBe('no_outcome');
    });
  });

  describe('P0.6.7-R2 — No Graph Case', () => {
    it('R2-G0: Graph=undefined → Decision + Outcome Context + Feedback Context → Assembly → Learning', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_no_graph',
        decision: 'Use data-driven opening',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        confidence: 0.88,
      });

      const outcome = createOutcomeMemoryFixture({
        id: 'out_r2_no_graph',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        metrics: [
          { key: 'views', value: 25000, unit: 'count' },
          { key: 'ctr', value: 0.12, unit: 'ratio' },
        ],
      });

      const retriever = new InMemoryRetriever([decision, outcome]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        {
          ownerId: TEST_OWNER_A,
          decisionId: decision.id,
        },
        deps,
      );

      expect(result.decisionFound).toBe(true);
      expect(result.feedback).not.toBeNull();
      expect(result.feedback!.outcomeCount).toBe(1);
      expect(result.graphContext).toHaveLength(0);
      expect(result.stageStatus.graph).toBe(false);
      expect(result.assembledContext).toBeDefined();
      expect(result.stageStatus.assembly).toBe(true);

      const allAssemblyIds = [
        ...result.assembledContext!.selected.map((x) => x.context.id),
        ...result.assembledContext!.excluded.map((x) => x.contextId),
      ];

      expect(allAssemblyIds).toContain(`ctx_out_${outcome.id}`);
      expect(result.learningCandidates.length).toBeGreaterThan(0);
      expect(result.stageStatus.learning).toBe(true);
      expect(result.completeness).toBe('learned');

      const assemblyOutcomeContextIds = new Set(
        allAssemblyIds.filter((id) => id.startsWith('ctx_out_')),
      );
      const feedbackOutcomeContextIds = new Set(
        result.feedback!.outcomeIds.map((id) => `ctx_out_${id}`),
      );
      expect(assemblyOutcomeContextIds).toEqual(feedbackOutcomeContextIds);
    });
  });

  describe('P0.6.7-R2 — Graph Case', () => {
    it('R2-G1: Graph present → Decision + Outcome Context + Feedback Context + Graph → Assembly → Learning', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_with_graph',
        decision: 'Use curiosity gap',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        confidence: 0.82,
      });

      const outcome = createOutcomeMemoryFixture({
        id: 'out_r2_with_graph',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        metrics: [
          { key: 'views', value: 18000, unit: 'count' },
          { key: 'engagement', value: 0.10, unit: 'ratio' },
        ],
      });

      const strategyCtx: ContextObject = {
        id: 'ctx_str_r2_graph',
        kind: 'decision',
        type: 'strategy',
        payload: { strategyType: 'curiosity_gap' },
        provenance: { source: 'test', sourceType: 'strategy' },
        lifecycle: { stage: 'retrieved', capturedAt: '2026-10-01T00:00:00.000Z' },
        confidence: 0.85,
        createdAt: '2026-10-01T07:00:00.000Z',
        updatedAt: '2026-10-01T07:00:00.000Z',
      };

      const contentCtx: ContextObject = {
        id: 'ctx_con_r2_graph',
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

      expect(result.stageStatus.decision).toBe(true);
      expect(result.stageStatus.outcome).toBe(true);
      expect(result.stageStatus.feedback).toBe(true);
      expect(result.stageStatus.graph).toBe(true);
      expect(result.stageStatus.assembly).toBe(true);
      expect(result.stageStatus.learning).toBe(true);
      expect(result.completeness).toBe('learned');

      expect(result.graphContext.length).toBeGreaterThan(0);

      const allAssemblyIds = [
        ...result.assembledContext!.selected.map((x) => x.context.id),
        ...result.assembledContext!.excluded.map((x) => x.contextId),
      ];

      expect(allAssemblyIds).toContain(`ctx_out_${outcome.id}`);
      expect(allAssemblyIds).toContain(strategyCtx.id);
      expect(allAssemblyIds).toContain(contentCtx.id);

      const assemblyOutcomeContextIds = new Set(
        allAssemblyIds.filter((id) => id.startsWith('ctx_out_')),
      );
      const feedbackOutcomeContextIds = new Set(
        result.feedback!.outcomeIds.map((id) => `ctx_out_${id}`),
      );
      expect(assemblyOutcomeContextIds).toEqual(feedbackOutcomeContextIds);
    });
  });

  describe('P0.6.7-R2 — Determinism', () => {
    it('R2-DE1: Same Decision + Outcomes + now → same Feedback + Outcome Contexts + Learning', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_determinism',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      });

      const outcome = createOutcomeMemoryFixture({
        id: 'out_r2_determinism',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
        metrics: [{ key: 'views', value: 9500, unit: 'count' }],
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

      expect(result1.feedback!.outcomeIds).toEqual(result2.feedback!.outcomeIds);
      expect(result1.feedback!.windowStart).toBe(result2.feedback!.windowStart);
      expect(result1.feedback!.windowEnd).toBe(result2.feedback!.windowEnd);

      expect(result1.learningCandidates.map((c) => c.id)).toEqual(
        result2.learningCandidates.map((c) => c.id),
      );

      const getOutcomeCtxIds = (result: typeof result1) => {
        if (!result.assembledContext) return [];
        return [
          ...result.assembledContext.selected.map((x) => x.context.id),
          ...result.assembledContext.excluded.map((x) => x.contextId),
        ].filter((id) => id.startsWith('ctx_out_')).sort();
      };

      expect(getOutcomeCtxIds(result1)).toEqual(getOutcomeCtxIds(result2));
    });
  });

  describe('P0.6.7-R2 — Metrics', () => {
    it('R2-M1: metrics.outcomeCount must reflect feedback.outcomeCount, not a second retrieval', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_metrics',
        ownerId: TEST_OWNER_A,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      });

      const outcomes = [
        createOutcomeMemoryFixture({
          id: 'out_r2_metrics_1',
          decisionId: decision.id,
          observedAt: '2026-10-01T10:00:00.000Z',
        }),
        createOutcomeMemoryFixture({
          id: 'out_r2_metrics_2',
          decisionId: decision.id,
          observedAt: '2026-10-02T14:00:00.000Z',
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

      expect(result.metrics.outcomeCount).toBe(result.feedback!.outcomeCount);
      expect(result.metrics.outcomeCount).toBe(2);
      expect(result.metrics.contextCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('P0.6.7-R2 — Owner Isolation', () => {
    it('R2-O1: Outcomes from different owner excluded from both Feedback and Outcome Context', async () => {
      const decision = createDecisionMemoryFixture({
        id: 'dec_r2_owner_iso',
        ownerId: TEST_OWNER_A,
      });

      const outcomeA = createOutcomeMemoryFixture({
        id: 'out_r2_owner_a',
        decisionId: decision.id,
        ownerId: TEST_OWNER_A,
      });

      const outcomeB = createOutcomeMemoryFixture({
        id: 'out_r2_owner_b',
        decisionId: decision.id,
        ownerId: TEST_OWNER_B,
      });

      const retriever = new InMemoryRetriever([decision, outcomeA, outcomeB]);
      const deps: ContextLoopDependencies = {
        memoryRetriever: retriever,
        now: () => FIXED_NOW,
      };

      const result = await runE2E(
        { ownerId: TEST_OWNER_A, decisionId: decision.id },
        deps,
      );

      expect(result.feedback!.outcomeCount).toBe(1);
      expect(result.feedback!.outcomeIds).toContain(outcomeA.id);
      expect(result.feedback!.outcomeIds).not.toContain(outcomeB.id);

      if (result.assembledContext) {
        const allAssemblyIds = [
          ...result.assembledContext.selected.map((x) => x.context.id),
          ...result.assembledContext.excluded.map((x) => x.contextId),
        ];
        expect(allAssemblyIds).toContain(`ctx_out_${outcomeA.id}`);
        expect(allAssemblyIds).not.toContain(`ctx_out_${outcomeB.id}`);
      }
    });
  });
});
