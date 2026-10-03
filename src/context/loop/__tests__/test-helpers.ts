/**
 * P0.6.7 — Context Loop Test Helpers
 *
 * Shared fixtures and factory functions for testing the Context Loop module.
 */

import type { MemoryRecord } from '@/memory/memory-record';
import type { DecisionMemory } from '@/memory/decision-memory';
import type { OutcomeMemory } from '@/memory/outcome-memory';
import type { OutcomeMemoryPayload } from '@/memory/outcome-memory';
import type { DecisionMemoryPayload } from '@/memory/memory-types';
import type { DecisionStatus } from '@/memory/memory-types';
import type { MemoryScope } from '@/memory/memory-scope';
import { createDecisionMemory } from '@/memory/decision-memory-factory';
import type { ContextObject } from '../../context-object';
import type { ContextGraph } from '../../graph/context-graph-types';
import { buildContextGraph } from '../../graph/context-graph-builder';
import { createDecisionContext } from '../../context-factory';
import { InMemoryRetriever } from '@/memory/memory-retriever';
import type { MemoryRetriever } from '@/memory/memory-retriever';

// ═══════════════════════════════════════════════════════════════════════════════
// ID Generators (deterministic for tests)
// ═══════════════════════════════════════════════════════════════════════════════

let _idCounter = 0;

/** Generate a deterministic test ID */
function testId(prefix: string): string {
  _idCounter++;
  return `${prefix}_${String(_idCounter).padStart(3, '0')}`;
}

/** Reset the ID counter (call in beforeEach) */
export function resetIdCounter(): void {
  _idCounter = 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Owner / Project / Topic IDs
// ═══════════════════════════════════════════════════════════════════════════════

export const TEST_OWNER_A = 'owner_user_a';
export const TEST_OWNER_B = 'owner_user_b';
export const TEST_PROJECT_A = 'proj_alpha';
export const TEST_PROJECT_B = 'proj_beta';
export const TEST_TOPIC_A = 'topic_growth';
export const TEST_TOPIC_B = 'topic_engagement';

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateDecisionFixtureOptions {
  id?: string;
  decision?: string;
  ownerId?: string;
  projectId?: string;
  topicId?: string;
  decisionStatus?: DecisionStatus;
  confidence?: number;
  importance?: number;
  scope?: MemoryScope;
  source?: string;
  sourceType?: string;
  rationale?: string;
  expectedOutcome?: string;
  createdAt?: string;
}

export function createDecisionMemoryFixture(
  options: CreateDecisionFixtureOptions = {},
): DecisionMemory {
  const id = options.id ?? testId('dec');
  const now = options.createdAt ?? '2026-10-01T08:00:00.000Z';

  return createDecisionMemory({
    id,
    decision: options.decision ?? 'Use storytelling hook for opening',
    rationale: options.rationale ?? 'Higher engagement expected',
    expectedOutcome: options.expectedOutcome ?? 'views > 10000',
    decisionStatus: options.decisionStatus ?? 'active',
    ownerId: options.ownerId ?? TEST_OWNER_A,
    projectId: options.projectId ?? TEST_PROJECT_A,
    topicId: options.topicId ?? TEST_TOPIC_A,
    scope: options.scope ?? 'topic',
    source: options.source ?? 'test_fixture',
    sourceType: options.sourceType ?? 'decision',
    confidence: options.confidence ?? 0.8,
    importance: options.importance ?? 0.9,
    createdAt: now,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateOutcomeFixtureOptions {
  id?: string;
  ownerId?: string;
  projectId?: string;
  topicId?: string;
  decisionId?: string;
  outcomeType?: OutcomeMemoryPayload['outcomeType'];
  targetType?: OutcomeMemoryPayload['outcomeType'];
  targetId?: string;
  summary?: string;
  expectedOutcome?: string;
  observedAt?: string;
  confidence?: number;
  importance?: number;
  metrics?: Array<{ key: string; value: number; unit?: string; source?: string }>;
}

export function createOutcomeMemoryFixture(
  options: CreateOutcomeFixtureOptions = {},
): OutcomeMemory {
  const id = options.id ?? testId('out');
  const now = options.observedAt ?? '2026-10-02T10:00:00.000Z';

  const payload: OutcomeMemoryPayload = {
    outcomeType: options.outcomeType ?? 'engagement',
    targetType: 'content',
    targetId: options.targetId ?? 'content_001',
    metrics: options.metrics ?? [
      { key: 'views', value: 15000, unit: 'count', source: 'douyin' },
      { key: 'likes', value: 1200, unit: 'count', source: 'douyin' },
      { key: 'ctr', value: 0.08, unit: 'ratio', source: 'douyin' },
    ],
    summary: options.summary ?? 'Strong engagement after decision',
    expectedOutcome: options.expectedOutcome ?? 'views > 10000',
    observedAt: now,
    attribution: {
      decisionId: options.decisionId,
      contentId: options.targetId ?? 'content_001',
      topicId: options.topicId,
    },
  };

  return {
    id,
    kind: 'episodic',
    type: 'outcome',
    payload,
    scope: 'topic',
    ownerId: options.ownerId ?? TEST_OWNER_A,
    projectId: options.projectId ?? TEST_PROJECT_A,
    topicId: options.topicId ?? TEST_TOPIC_A,
    source: 'test_fixture',
    sourceType: 'outcome',
    derivedFrom: options.decisionId ? [options.decisionId] : undefined,
    confidence: options.confidence ?? 0.85,
    importance: options.importance ?? 0.7,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: null,
    accessCount: 0,
    expiresAt: null,
    status: 'active',
    version: 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Retriever with Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

export function createTestRetriever(
  decisions: DecisionMemory[] = [],
  outcomes: OutcomeMemory[] = [],
): InMemoryRetriever {
  const allRecords: MemoryRecord[] = [...decisions, ...outcomes];
  return new InMemoryRetriever(allRecords);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ContextObject Fixtures for Graph
// ═══════════════════════════════════════════════════════════════════════════════

export function createStrategyContextFixture(id: string, ownerId = TEST_OWNER_A): ContextObject {
  return createDecisionContext(
    {
      decisionType: 'strategy',
      actor: ownerId,
      selected: 'Storytelling approach for educational content',
      rejected: null,
      reason: 'Higher retention in A/B test',
      alternatives: null,
    },
    {
      id,
      provenance: {
        source: 'strategy_context',
        sourceType: 'strategy',
        ownerId,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      },
      lifecycleStage: 'retrieved',
      confidence: 0.85,
      createdAt: '2026-10-01T07:00:00.000Z',
      updatedAt: '2026-10-01T07:00:00.000Z',
    },
  );
}

export function createContentContextFixture(id: string, ownerId = TEST_OWNER_A): ContextObject {
  // Use createDecisionContext as a base since we don't have a direct content context factory
  return createDecisionContext(
    {
      decisionType: 'content',
      actor: ownerId,
      selected: 'Hook: "What if everything you knew was wrong?"',
      rejected: null,
      reason: 'Pattern interrupt for scroll-stopping effect',
      alternatives: null,
    },
    {
      id,
      provenance: {
        source: 'content_context',
        sourceType: 'content',
        ownerId,
        projectId: TEST_PROJECT_A,
        topicId: TEST_TOPIC_A,
      },
      lifecycleStage: 'retrieved',
      confidence: 0.75,
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Graph Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

export interface GoldenScenarioFixture {
  decision: DecisionMemory;
  outcome: OutcomeMemory;
  strategyCtx: ContextObject;
  contentCtx: ContextObject;
  graph: ContextGraph;
}

/**
 * Create a golden scenario fixture with:
 * - Decision D1 (id: dec_golden_001)
 * - Outcome O1 (attributed to D1)
 * - Strategy S1 (derived_from → D1)
 * - Content C1 (used_by ← D1)
 * - Graph connecting them
 */
export function createGoldenScenarioFixture(): GoldenScenarioFixture {
  const decision = createDecisionMemoryFixture({
    id: 'dec_golden_001',
    decision: 'Use storytelling hook for opening',
    ownerId: TEST_OWNER_A,
    projectId: TEST_PROJECT_A,
    topicId: TEST_TOPIC_A,
  });

  const outcome = createOutcomeMemoryFixture({
    id: 'out_golden_001',
    decisionId: decision.id,
    ownerId: TEST_OWNER_A,
    projectId: TEST_PROJECT_A,
    topicId: TEST_TOPIC_A,
    metrics: [
      { key: 'views', value: 15000, unit: 'count' },
      { key: 'engagement_rate', value: 0.08, unit: 'ratio' },
    ],
  });

  const strategyCtx = createStrategyContextFixture('ctx_str_golden_001');
  const contentCtx = createContentContextFixture('ctx_con_golden_001');

  // Build a graph from the contexts by adding provenance relationships
  // We need to manually create the graph since provenance-based builder
  // would require setting up the relationships in provenance fields.
  // Instead, we'll build a simple graph directly.
  const graph = buildSimpleGraph(decision.id, strategyCtx, contentCtx);

  return { decision, outcome, strategyCtx, contentCtx, graph };
}

/**
 * Build a simple graph with:
 * - Strategy → Decision (derived_from)
 * - Content ← Decision (used_by)
 */
function buildSimpleGraph(
  decisionId: string,
  strategyCtx: ContextObject,
  contentCtx: ContextObject,
): ContextGraph {
  const baseTime = '2026-10-01T08:00:00.000Z';

  return {
    nodes: [
      { id: strategyCtx.id, context: strategyCtx },
      { id: decisionId, context: strategyCtx }, // placeholder — replaced below
      { id: contentCtx.id, context: contentCtx },
    ],
    edges: [
      {
        id: `edge_derived_from_${strategyCtx.id}_${decisionId}`,
        fromId: strategyCtx.id,
        toId: decisionId,
        type: 'derived_from',
        source: 'provenance',
        createdAt: baseTime,
      },
      {
        id: `edge_used_by_${decisionId}_${contentCtx.id}`,
        fromId: decisionId,
        toId: contentCtx.id,
        type: 'used_by',
        source: 'provenance',
        createdAt: baseTime,
      },
    ],
    nodeCount: 3,
    edgeCount: 2,
  };
}
