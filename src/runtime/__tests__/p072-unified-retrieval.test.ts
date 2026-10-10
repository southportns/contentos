/**
 * P0.7.2-R1 — Unified Context Retrieval Tests
 *
 * Comprehensive test suite for the unified multi-source context retrieval
 * with hardened scope enforcement, provenance validation, and error
 * propagation.
 *
 * Test Groups:
 *   A. Memory Retrieval
 *   B. Decision Retrieval
 *   C. Outcome Retrieval
 *   D. Feedback Retrieval
 *   E. Knowledge Retrieval
 *   F. Graph Enrichment
 *   G. Unified Policy (kind filters, dedup, diagnostics)
 *   H. Scope & Owner Boundary (strengthened)
 *   I. Determinism
 *   J. Compatibility (backward-compat API)
 *   K. Error Propagation
 *   L. Outcome Metadata Preservation
 *   M. Scope Enforcement (allowedScopes)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  retrieveRuntimeContext,
  retrieveRuntimeContextWithMetadata,
  type RuntimeRetrievalDependencies,
} from '../runtime-context';
import type { ContextOSRuntimeRequest } from '../runtime-types';
import type { ContextObject } from '@/context/context-object';
import type { ContextProvenance } from '@/context/context-provenance';
import type { ContextLifecycleState } from '@/context/context-lifecycle';
import type { MemoryRecord } from '@/memory/memory-record';
import type { MemoryRetriever } from '@/memory/memory-retriever';
import type { ContextRetriever } from '@/context/assembly/types';
import { InMemoryRetriever } from '@/memory/memory-retriever';
import { ContextOSRuntimeError } from '../runtime-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures & Factories
// ═══════════════════════════════════════════════════════════════════════════════

const FIXED_TIMESTAMP = '2026-10-04T10:00:00.000Z';
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
 * Create a valid ContextObject for use in mock provider tests.
 * This factory ensures all required fields are present and correct.
 */
function createTestContextObject(overrides: Partial<ContextObject> & { id: string; kind: ContextObject['kind'] }): ContextObject {
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

// ═══════════════════════════════════════════════════════════════════════════════
// MemoryRecord Factories (for InMemoryRetriever)
// ═══════════════════════════════════════════════════════════════════════════════

function createGeneralMemoryRecord(
  id: string,
  scope: MemoryRecord['scope'],
  ownerId: string,
  projectId?: string,
  topicId?: string
): MemoryRecord {
  return {
    id,
    kind: 'static',
    type: 'general',
    payload: { value: `General ${id}` },
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

function createDecisionMemoryRecord(
  id: string,
  ownerId: string,
  scope: MemoryRecord['scope'] = 'project',
  projectId?: string
): MemoryRecord {
  return {
    id,
    kind: 'decision',
    type: 'decision',
    payload: {
      decision: `Decision ${id}`,
      rationale: `Rationale for ${id}`,
      decisionStatus: 'active',
      alternatives: [],
    },
    scope,
    ownerId,
    projectId: projectId ?? null,
    topicId: null,
    source: 'decision-factory',
    sourceType: 'memory',
    confidence: 0.9,
    importance: 0.7,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    accessCount: 0,
    version: 1,
    status: 'active',
  };
}

function createOutcomeMemoryRecord(
  id: string,
  ownerId: string,
  scope: MemoryRecord['scope'] = 'project',
  projectId?: string
): MemoryRecord {
  return {
    id,
    kind: 'outcome',
    type: 'outcome',
    payload: {
      outcomeType: 'engagement',
      targetType: 'content',
      targetId: `target_${id}`,
      metricKey: 'engagement_rate',
      value: 0.75,
      unit: 'ratio',
      observedAt: FIXED_TIMESTAMP,
    },
    scope,
    ownerId,
    projectId: projectId ?? null,
    topicId: null,
    source: 'outcome-service',
    sourceType: 'memory',
    confidence: 0.85,
    importance: 0.6,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    accessCount: 0,
    version: 1,
    status: 'active',
  };
}

function createMinimalRequest(overrides: Partial<ContextOSRuntimeRequest> = {}): ContextOSRuntimeRequest {
  return {
    ownerId: 'user_1',
    purpose: 'content_creation',
    input: { query: 'test' },
    ...overrides,
  };
}

/**
 * Create a real InMemoryRetriever with mixed record types.
 */
function createMixedRetriever(
  generalRecords: MemoryRecord[],
  decisionRecords: MemoryRecord[] = [],
  outcomeRecords: MemoryRecord[] = []
): InMemoryRetriever {
  const retriever = new InMemoryRetriever();
  retriever.addRecords([...generalRecords, ...decisionRecords, ...outcomeRecords]);
  return retriever;
}

/**
 * Create a mock KnowledgeRetriever.
 */
function createMockKnowledgeRetriever(contexts: ContextObject[]): ContextRetriever {
  return {
    kind: 'knowledge',
    retrieve: vi.fn(async () => contexts),
  } as ContextRetriever;
}

/**
 * Create a mock GraphContextProvider.
 */
function createMockGraphProvider(contexts: ContextObject[]): RuntimeRetrievalDependencies['graphContextProvider'] {
  return vi.fn(async () => contexts) as unknown as RuntimeRetrievalDependencies['graphContextProvider'];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group A: Memory Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Memory Retrieval', () => {
  it('A1: should convert general memory records to contexts', async () => {
    const records = [
      createGeneralMemoryRecord('mem1', 'global', 'user_1'),
      createGeneralMemoryRecord('mem2', 'project', 'user_1', 'proj_1'),
    ];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({ projectId: 'proj_1' });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(2);
    expect(result.sources.find((s) => s.source === 'memory')?.status).toBe('included');
  });

  it('A2: should exclude domain-specific records from general memory branch', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const decisions = [createDecisionMemoryRecord('d1', 'user_1', 'project', 'proj_1')];
    const outcomes = [createOutcomeMemoryRecord('o1', 'user_1', 'project', 'proj_1')];
    const retriever = createMixedRetriever(general, decisions, outcomes);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { includeDecisions: false, includeOutcomes: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // Only general memory should be returned
    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(1);
    expect(memoryCtxs[0].id).toBe('ctx_mem_g1');
  });

  it('A3: should return empty when includeMemory=false', async () => {
    const records = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      contextPolicy: { includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(0);
    expect(result.sources.find((s) => s.source === 'memory')?.status).toBe('disabled');
  });

  it('A4: should respect allowedScopes for memory retrieval', async () => {
    const records = [
      createGeneralMemoryRecord('g1', 'global', 'user_1'),
      createGeneralMemoryRecord('p1', 'project', 'user_1', 'proj_1'),
    ];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { allowedScopes: ['global'] },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(1);
    expect(memoryCtxs[0].id).toBe('ctx_mem_g1');
  });

  it('A5: should enforce source limit', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      createGeneralMemoryRecord(`m${i}`, 'global', 'user_1')
    );
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest();
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      sourceLimit: 3,
      now: NOW_FN,
    });

    // General memory should be limited to 3
    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(3);
  });

  it('A6: source with 0 results should be "included" (not disabled) when enabled', async () => {
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest();
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // Memory is enabled but returned 0 results → should be 'included'
    expect(result.sources.find((s) => s.source === 'memory')?.status).toBe('included');
    expect(result.sources.find((s) => s.source === 'memory')?.contextCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Decision Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Decision Retrieval', () => {
  it('B1: should return decision contexts when includeDecisions=true', async () => {
    const decisions = [
      createDecisionMemoryRecord('dec1', 'user_1', 'project', 'proj_1'),
    ];
    const retriever = createMixedRetriever([], decisions);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: {
        includeDecisions: true,
        includeMemory: false,
        includeOutcomes: false,
        includeFeedback: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const decCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_dec_'));
    expect(decCtxs.length).toBe(1);
    expect(decCtxs[0].id).toBe('ctx_dec_dec1');
    expect(decCtxs[0].kind).toBe('decision');
    expect(result.sources.find((s) => s.source === 'decision')?.status).toBe('included');
  });

  it('B2: should NOT leak decisions when includeDecisions=false', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const decisions = [createDecisionMemoryRecord('dec1', 'user_1', 'project', 'proj_1')];
    const retriever = createMixedRetriever(general, decisions);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { includeDecisions: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const decCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_dec_'));
    expect(decCtxs.length).toBe(0);
    expect(result.sources.find((s) => s.source === 'decision')?.status).toBe('disabled');
  });

  it('B3: should enforce owner isolation for decisions', async () => {
    const decisions = [
      createDecisionMemoryRecord('dec_a', 'user_1', 'project', 'proj_1'),
      createDecisionMemoryRecord('dec_b', 'user_2', 'project', 'proj_1'),
    ];
    const retriever = createMixedRetriever([], decisions);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      projectId: 'proj_1',
      contextPolicy: { includeDecisions: true, includeMemory: false, includeOutcomes: false, includeFeedback: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const decCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_dec_'));
    expect(decCtxs.length).toBe(1);
    expect(decCtxs[0].id).toBe('ctx_dec_dec_a');
  });

  it('B4: should handle decision source limit', async () => {
    const decisions = Array.from({ length: 5 }, (_, i) =>
      createDecisionMemoryRecord(`dec${i}`, 'user_1', 'project', 'proj_1')
    );
    const retriever = createMixedRetriever([], decisions);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { includeDecisions: true, includeMemory: false, includeOutcomes: false, includeFeedback: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      sourceLimit: 2,
      now: NOW_FN,
    });

    const decCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_dec_'));
    expect(decCtxs.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Outcome Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Outcome Retrieval', () => {
  it('C1: should return outcome contexts when includeOutcomes=true', async () => {
    const outcomes = [
      createOutcomeMemoryRecord('out1', 'user_1', 'project', 'proj_1'),
    ];
    const retriever = createMixedRetriever([], [], outcomes);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: {
        includeOutcomes: true,
        includeMemory: false,
        includeDecisions: false,
        includeFeedback: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const outCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_out_'));
    expect(outCtxs.length).toBe(1);
    expect(outCtxs[0].id).toBe('ctx_out_out1');
    expect(outCtxs[0].kind).toBe('outcome');
  });

  it('C2: should NOT leak outcomes when includeOutcomes=false', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const outcomes = [createOutcomeMemoryRecord('out1', 'user_1', 'project', 'proj_1')];
    const retriever = createMixedRetriever(general, [], outcomes);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { includeOutcomes: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const outCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_out_'));
    expect(outCtxs.length).toBe(0);
  });

  it('C3: should enforce owner isolation for outcomes', async () => {
    const outcomes = [
      createOutcomeMemoryRecord('out_a', 'user_1', 'project', 'proj_1'),
      createOutcomeMemoryRecord('out_b', 'user_2', 'project', 'proj_1'),
    ];
    const retriever = createMixedRetriever([], [], outcomes);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      projectId: 'proj_1',
      contextPolicy: { includeOutcomes: true, includeMemory: false, includeDecisions: false, includeFeedback: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const outCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_out_'));
    expect(outCtxs.length).toBe(1);
    expect(outCtxs[0].id).toBe('ctx_out_out_a');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Feedback Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Feedback Retrieval', () => {
  it('D1: should return empty feedback when includeFeedback=true but no decisions', async () => {
    const retriever = createMixedRetriever([], [], []);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: {
        includeFeedback: true,
        includeMemory: false,
        includeDecisions: false,
        includeOutcomes: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const fbCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_dfb_'));
    expect(fbCtxs.length).toBe(0);
    // Source ran successfully with 0 results → 'included'
    expect(result.sources.find((s) => s.source === 'feedback')?.status).toBe('included');
  });

  it('D2: should not generate feedback when includeFeedback=false', async () => {
    const decisions = [createDecisionMemoryRecord('dec1', 'user_1', 'project', 'proj_1')];
    const retriever = createMixedRetriever([], decisions);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { includeFeedback: false, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const fbCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_dfb_'));
    expect(fbCtxs.length).toBe(0);
    expect(result.sources.find((s) => s.source === 'feedback')?.status).toBe('disabled');
  });

  it('D3: should pass injected now to feedback generation', async () => {
    let capturedNow: string | undefined;
    const decisions = [createDecisionMemoryRecord('dec1', 'user_1', 'project', 'proj_1')];
    const retriever = createMixedRetriever([], decisions);

    const customNow = () => {
      capturedNow = '2026-10-04T15:30:00.000Z';
      return capturedNow;
    };

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { includeFeedback: true, includeMemory: false },
    });
    await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: customNow,
    });

    // The now function should have been used (feedback source calls it)
    expect(capturedNow).toBe('2026-10-04T15:30:00.000Z');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Knowledge Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Knowledge Retrieval', () => {
  it('E1: should call knowledge retriever when includeKnowledge=true and provider exists', async () => {
    const knowledgeCtxs: ContextObject[] = [
      createTestContextObject({
        id: 'ctx_know_1',
        kind: 'knowledge',
        type: 'static',
        payload: { text: 'Knowledge 1' },
        provenance: { source: 'knowledge-source', sourceType: 'knowledge', ownerId: 'shared', scope: 'global' },
        confidence: 0.9,
      }),
    ];
    const mockKnowledgeRetriever = createMockKnowledgeRetriever(knowledgeCtxs);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextPolicy: {
        includeKnowledge: true,
        includeMemory: false,
        includeDecisions: false,
        includeOutcomes: false,
        includeFeedback: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      knowledgeRetriever: mockKnowledgeRetriever,
      now: NOW_FN,
    });

    expect(mockKnowledgeRetriever.retrieve).toHaveBeenCalled();
    expect(result.sources.find((s) => s.source === 'knowledge')?.status).toBe('included');
  });

  it('E2: should NOT call knowledge retriever when includeKnowledge=false', async () => {
    const mockKnowledgeRetriever = createMockKnowledgeRetriever([]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextPolicy: { includeKnowledge: false, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      knowledgeRetriever: mockKnowledgeRetriever,
      now: NOW_FN,
    });

    expect(mockKnowledgeRetriever.retrieve).not.toHaveBeenCalled();
    expect(result.sources.find((s) => s.source === 'knowledge')?.status).toBe('disabled');
  });

  it('E3: should report unavailable when no knowledge provider', async () => {
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextPolicy: { includeKnowledge: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    expect(result.sources.find((s) => s.source === 'knowledge')?.status).toBe('unavailable');
  });

  it('E4: should pass contextQuery to knowledge retriever', async () => {
    const mockKnowledgeRetriever = createMockKnowledgeRetriever([]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextQuery: 'AI safety research',
      contextPolicy: { includeKnowledge: true, includeMemory: false },
    });
    await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      knowledgeRetriever: mockKnowledgeRetriever,
      now: NOW_FN,
    });

    expect(mockKnowledgeRetriever.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'AI safety research' })
    );
  });

  it('E5: should not fabricate knowledge when provider fails', async () => {
    const failingRetriever: ContextRetriever = {
      kind: 'knowledge',
      retrieve: vi.fn(async () => { throw new Error('Provider error'); }),
    } as unknown as ContextRetriever;
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextPolicy: { includeKnowledge: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      knowledgeRetriever: failingRetriever,
      now: NOW_FN,
    });

    expect(result.sources.find((s) => s.source === 'knowledge')?.status).toBe('failed');
    expect(result.contexts.filter((c) => c.kind === 'knowledge')).toHaveLength(0);
  });

  it('E6: unowned shared knowledge (global scope, sourceType=knowledge) should pass validation', async () => {
    const sharedKnowledge: ContextObject = createTestContextObject({
      id: 'ctx_know_shared_global',
      kind: 'knowledge',
      provenance: {
        source: 'knowledge',
        sourceType: 'knowledge',
        scope: 'global',
      },
    });
    const mockKnowledgeRetriever = createMockKnowledgeRetriever([sharedKnowledge]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: { includeKnowledge: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      knowledgeRetriever: mockKnowledgeRetriever,
      now: NOW_FN,
    });

    // Unowned shared global knowledge should pass validation
    expect(result.contexts.filter((c) => c.id === 'ctx_know_shared_global').length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group F: Graph Enrichment
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Graph Enrichment', () => {
  it('F1: graph is disabled by default', async () => {
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest();
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    expect(result.sources.find((s) => s.source === 'graph')?.status).toBe('disabled');
  });

  it('F2: should call graph provider when includeGraph=true', async () => {
    const graphCtxs: ContextObject[] = [
      createTestContextObject({
        id: 'ctx_graph_1',
        kind: 'memory',
        provenance: { source: 'graph-provider', sourceType: 'graph', ownerId: 'user_1', scope: 'global' },
        confidence: 0.7,
      }),
    ];
    const graphProvider = createMockGraphProvider(graphCtxs);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextPolicy: { includeGraph: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: graphProvider,
      now: NOW_FN,
    });

    expect(graphProvider).toHaveBeenCalled();
    expect(result.sources.find((s) => s.source === 'graph')?.status).toBe('included');
  });

  it('F3: should report unavailable when includeGraph=true but no provider', async () => {
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextPolicy: { includeGraph: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    expect(result.sources.find((s) => s.source === 'graph')?.status).toBe('unavailable');
  });

  it('F4: graph failure should not block other sources', async () => {
    const failingProvider = vi.fn(async () => { throw new Error('Graph error'); });
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(general);

    const request = createMinimalRequest({
      contextPolicy: { includeGraph: true, includeMemory: true },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: failingProvider as unknown as RuntimeRetrievalDependencies['graphContextProvider'],
      now: NOW_FN,
    });

    // Memory should still be included despite graph failure
    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(1);
    expect(result.sources.find((s) => s.source === 'graph')?.status).toBe('failed');
    expect(result.sources.find((s) => s.source === 'memory')?.status).toBe('included');
  });

  it('F5: graph context from different owner should be excluded', async () => {
    const foreignGraph: ContextObject = createTestContextObject({
      id: 'ctx_graph_foreign',
      kind: 'memory',
      provenance: { source: 'graph-provider', sourceType: 'graph', ownerId: 'other_user', scope: 'global' },
    });
    const graphProvider = createMockGraphProvider([foreignGraph]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: { includeGraph: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: graphProvider,
      now: NOW_FN,
    });

    expect(result.contexts.filter((c) => c.id === 'ctx_graph_foreign')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group G: Unified Policy (Kind Filters, Dedup, Diagnostics)
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Unified Policy', () => {
  it('G1: should apply allowedKinds whitelist', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(general);

    const request = createMinimalRequest({
      contextPolicy: {
        allowedKinds: ['memory' as ContextObject['kind']],
        includeMemory: true,
        includeDecisions: false,
        includeOutcomes: false,
        includeFeedback: false,
        includeKnowledge: false,
        includeGraph: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // Only 'memory' kind allowed
    result.contexts.forEach((ctx) => {
      expect(ctx.kind).toBe('memory');
    });
  });

  it('G2: should apply excludedKinds blacklist', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(general);

    const request = createMinimalRequest({
      contextPolicy: {
        excludedKinds: ['memory' as ContextObject['kind']],
        includeMemory: true,
        includeDecisions: false,
        includeOutcomes: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // 'memory' kind excluded → no memory contexts
    const memoryCtxs = result.contexts.filter((c) => c.kind === 'memory');
    expect(memoryCtxs.length).toBe(0);
  });

  it('G3: excludedKinds takes priority over allowedKinds', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(general);

    const request = createMinimalRequest({
      contextPolicy: {
        allowedKinds: ['memory' as ContextObject['kind']],
        excludedKinds: ['memory' as ContextObject['kind']],
        includeMemory: true,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // excludedKinds wins → no memory contexts
    const memoryCtxs = result.contexts.filter((c) => c.kind === 'memory');
    expect(memoryCtxs.length).toBe(0);
  });

  it('G4: should deduplicate contexts by id across sources', async () => {
    const general = [createGeneralMemoryRecord('shared', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(general);

    // Mock graph provider returns a context with same id as memory
    const duplicateGraphCtx: ContextObject = createTestContextObject({
      id: 'ctx_mem_shared', // Same ID as general memory would produce
      kind: 'memory',
      provenance: { source: 'graph', sourceType: 'graph', ownerId: 'user_1', scope: 'global' },
      confidence: 0.5,
    });
    const graphProvider = createMockGraphProvider([duplicateGraphCtx]);

    const request = createMinimalRequest({
      contextPolicy: { includeGraph: true },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: graphProvider,
      now: NOW_FN,
    });

    // Should have only ONE context with id ctx_mem_shared
    const sameIdCtxs = result.contexts.filter((c) => c.id === 'ctx_mem_shared');
    expect(sameIdCtxs.length).toBe(1);
  });

  it('G5: should report per-source diagnostics', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(general);

    const request = createMinimalRequest({
      contextPolicy: {
        includeMemory: true,
        includeDecisions: false,
        includeOutcomes: false,
        includeFeedback: false,
        includeKnowledge: false,
        includeGraph: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    expect(result.sources.length).toBe(6); // All 6 sources reported
    expect(result.sources.find((s) => s.source === 'memory')?.status).toBe('included');
    expect(result.sources.find((s) => s.source === 'decision')?.status).toBe('disabled');
    expect(result.sources.find((s) => s.source === 'graph')?.status).toBe('disabled');
  });

  it('G6: should aggregate warnings from failed sources', async () => {
    const failingGraphProvider = vi.fn(async () => { throw new Error('Graph unavailable'); });
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextPolicy: { includeGraph: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: failingGraphProvider as unknown as RuntimeRetrievalDependencies['graphContextProvider'],
      now: NOW_FN,
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('graph'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Scope & Owner Boundary (strengthened P0.7.2-R1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Scope & Owner Boundary', () => {
  it('H1: knowledge context with different owner should be excluded', async () => {
    const foreignKnowledge: ContextObject = createTestContextObject({
      id: 'ctx_know_foreign',
      kind: 'knowledge',
      provenance: { source: 'knowledge', sourceType: 'knowledge', ownerId: 'other_user', scope: 'global' },
      confidence: 0.8,
    });
    const mockKnowledgeRetriever = createMockKnowledgeRetriever([foreignKnowledge]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: { includeKnowledge: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      knowledgeRetriever: mockKnowledgeRetriever,
      now: NOW_FN,
    });

    // Foreign knowledge should be filtered out by owner validation
    expect(result.contexts.filter((c) => c.id === 'ctx_know_foreign')).toHaveLength(0);
  });

  it('H2: graph context from different owner should be excluded', async () => {
    const foreignGraph: ContextObject = createTestContextObject({
      id: 'ctx_graph_foreign',
      kind: 'memory',
      provenance: { source: 'graph', sourceType: 'graph', ownerId: 'other_user', scope: 'global' },
      confidence: 0.7,
    });
    const graphProvider = createMockGraphProvider([foreignGraph]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: { includeGraph: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: graphProvider,
      now: NOW_FN,
    });

    expect(result.contexts.filter((c) => c.id === 'ctx_graph_foreign')).toHaveLength(0);
  });

  it('H3: unowned shared knowledge (global scope, sourceType=knowledge) should be allowed', async () => {
    const sharedKnowledge: ContextObject = createTestContextObject({
      id: 'ctx_know_shared',
      kind: 'knowledge',
      provenance: { source: 'knowledge', sourceType: 'knowledge', scope: 'global' },
      confidence: 0.9,
    });
    const mockKnowledgeRetriever = createMockKnowledgeRetriever([sharedKnowledge]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: { includeKnowledge: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      knowledgeRetriever: mockKnowledgeRetriever,
      now: NOW_FN,
    });

    // Unowned (shared) knowledge with sourceType=knowledge + scope=global should pass through
    expect(result.contexts.filter((c) => c.id === 'ctx_know_shared').length).toBe(1);
  });

  it('H4: multi-scope retrieval should produce deduplicated results', async () => {
    // Same logical record appears in both global and project scope
    const record1 = createGeneralMemoryRecord('shared', 'global', 'user_1');
    const record2 = createGeneralMemoryRecord('shared', 'project', 'user_1', 'proj_1');
    record2.id = 'shared'; // Same ID, different scope
    const record3 = createGeneralMemoryRecord('unique_proj', 'project', 'user_1', 'proj_1');
    const retriever = new InMemoryRetriever([record1, record2, record3]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      projectId: 'proj_1',
      contextPolicy: { allowedScopes: ['global', 'project'], includeMemory: true, includeDecisions: false, includeOutcomes: false, includeFeedback: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // Should have 2 unique contexts (shared appears once + unique_proj)
    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(2);
    const ids = memoryCtxs.map((c) => c.id);
    expect(ids).toContain('ctx_mem_shared');
    expect(ids).toContain('ctx_mem_unique_proj');
  });

  it('H5: unowned data without proper sourceType/scope should be rejected', async () => {
    // Graph data without owner should NOT be treated as shared knowledge
    const unownedGraph: ContextObject = createTestContextObject({
      id: 'ctx_graph_unowned',
      kind: 'memory',
      provenance: { source: 'graph-provider', sourceType: 'graph', scope: 'global' },
    });
    const graphProvider = createMockGraphProvider([unownedGraph]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: { includeGraph: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: graphProvider,
      now: NOW_FN,
    });

    // Unowned graph data (sourceType !== 'knowledge') should be rejected
    expect(result.contexts.filter((c) => c.id === 'ctx_graph_unowned')).toHaveLength(0);
  });

  it('H6: unowned knowledge with unknown scope should be rejected', async () => {
    const unknownScopeKnowledge: ContextObject = createTestContextObject({
      id: 'ctx_know_unknown',
      kind: 'knowledge',
      provenance: { source: 'knowledge', sourceType: 'knowledge', scope: 'unknown' },
    });
    const mockKnowledgeRetriever = createMockKnowledgeRetriever([unknownScopeKnowledge]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: { includeKnowledge: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      knowledgeRetriever: mockKnowledgeRetriever,
      now: NOW_FN,
    });

    // Unknown scope → reject even if sourceType is knowledge
    expect(result.contexts.filter((c) => c.id === 'ctx_know_unknown')).toHaveLength(0);
  });

  it('H7: context with owner missing but sourceType=memory should be rejected', async () => {
    // regular graph/memory data without owner → reject
    const unownedMemory: ContextObject = createTestContextObject({
      id: 'ctx_unowned_memory',
      kind: 'memory',
      provenance: { source: 'memory-store', sourceType: 'memory', scope: 'global' },
    });
    const graphProvider = createMockGraphProvider([unownedMemory]);
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      ownerId: 'user_1',
      contextPolicy: { includeGraph: true, includeMemory: false },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: graphProvider,
      now: NOW_FN,
    });

    expect(result.contexts.filter((c) => c.id === 'ctx_unowned_memory')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group I: Determinism
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Determinism', () => {
  it('I1: same request + same records = same context IDs and order', async () => {
    const records = [
      createGeneralMemoryRecord('a', 'global', 'user_1'),
      createGeneralMemoryRecord('b', 'project', 'user_1', 'proj_1'),
      createGeneralMemoryRecord('c', 'global', 'user_1'),
    ];
    const retriever1 = new InMemoryRetriever([...records]);
    const retriever2 = new InMemoryRetriever([...records]);

    const request = createMinimalRequest({
      projectId: 'proj_1',
    });

    const result1 = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever1,
      now: NOW_FN,
    });
    const result2 = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever2,
      now: NOW_FN,
    });

    const ids1 = result1.contexts.map((c) => c.id);
    const ids2 = result2.contexts.map((c) => c.id);

    expect(ids1).toEqual(ids2);
    expect(ids1.length).toBeGreaterThan(0);
  });

  it('I2: diagnostics should be deterministic', async () => {
    const records = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever1 = new InMemoryRetriever([...records]);
    const retriever2 = new InMemoryRetriever([...records]);

    const request = createMinimalRequest();

    const result1 = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever1,
      now: NOW_FN,
    });
    const result2 = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever2,
      now: NOW_FN,
    });

    const sourceNames1 = result1.sources.map((s) => s.source).sort();
    const sourceNames2 = result2.sources.map((s) => s.source).sort();

    expect(sourceNames1).toEqual(sourceNames2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group J: Compatibility (Backward-Compat API)
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Compatibility', () => {
  it('J1: retrieveRuntimeContext returns ContextObject[] (backward-compat)', async () => {
    const records = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      contextPolicy: { includeDecisions: false, includeOutcomes: false, includeFeedback: false },
    });
    const result = await retrieveRuntimeContext(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // Must be an array of ContextObject
    expect(Array.isArray(result)).toBe(true);
    result.forEach((ctx) => {
      expect(ctx).toHaveProperty('id');
      expect(ctx).toHaveProperty('kind');
      expect(ctx).toHaveProperty('provenance');
      expect(ctx).toHaveProperty('payload');
      expect(ctx).toHaveProperty('lifecycle');
    });
  });

  it('J2: retrieveRuntimeContext contextCount matches array length', async () => {
    const records = [
      createGeneralMemoryRecord('g1', 'global', 'user_1'),
      createGeneralMemoryRecord('g2', 'global', 'user_1'),
    ];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      contextPolicy: { includeDecisions: false, includeOutcomes: false, includeFeedback: false },
    });
    const result = await retrieveRuntimeContext(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    expect(result.length).toBe(2);
  });

  it('J3: existing createRuntimeRunner still works', async () => {
    const records: MemoryRecord[] = [];
    const retriever = new InMemoryRetriever(records);

    const runner = createMinimalRunner(retriever);
    const request = createMinimalRequest();
    const result = await runner(request);

    expect(result).toHaveProperty('run');
    expect(result).toHaveProperty('contextPackage');
    expect(result.run.ownerId).toBe('user_1');
  });
});

// Helper for J3 — create a minimal runner similar to createRuntimeRunner but with all defaults
import { createRuntimeRunner } from '../runtime-context';
function createMinimalRunner(retriever: MemoryRetriever) {
  return createRuntimeRunner(retriever, NOW_FN);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group K: Error Propagation (P0.7.2-R1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Error Propagation', () => {
  it('K1: primary memory retriever failure should reject the promise', async () => {
    const failingRetriever: MemoryRetriever = {
      retrieve: async () => { throw new Error('DB connection lost'); },
    };
    const request = createMinimalRequest();

    await expect(
      retrieveRuntimeContextWithMetadata(request, {
        memoryRetriever: failingRetriever,
        now: NOW_FN,
      })
    ).rejects.toThrow(ContextOSRuntimeError);
  });

  it('K2: primary memory failure should include error message', async () => {
    const failingRetriever: MemoryRetriever = {
      retrieve: async () => { throw new Error('DB connection lost'); },
    };
    const request = createMinimalRequest();

    try {
      await retrieveRuntimeContextWithMetadata(request, {
        memoryRetriever: failingRetriever,
        now: NOW_FN,
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextOSRuntimeError);
      expect((err as ContextOSRuntimeError).code).toBe('RUNTIME_EXECUTION');
      expect((err as Error).message).toContain('DB connection lost');
    }
  });

  it('K3: optional source failure should not block other sources', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(general);

    const failingGraphProvider = vi.fn(async () => { throw new Error('Graph unavailable'); });

    const request = createMinimalRequest({
      contextPolicy: { includeGraph: true, includeMemory: true },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      graphContextProvider: failingGraphProvider as unknown as RuntimeRetrievalDependencies['graphContextProvider'],
      now: NOW_FN,
    });

    // Memory should still be included despite graph failure
    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(1);
    expect(result.sources.find((s) => s.source === 'graph')?.status).toBe('failed');
    expect(result.sources.find((s) => s.source === 'memory')?.status).toBe('included');
  });

  it('K4: decision source failure should not block memory', async () => {
    const general = [createGeneralMemoryRecord('g1', 'global', 'user_1')];
    const retriever = new InMemoryRetriever(general);

    // Create a retriever that throws only for decision queries
    // Decision retrieval is identified by policy.includeSuperseded being true
    const originalRetrieve = retriever.retrieve.bind(retriever);
    const spyRetriever: MemoryRetriever = {
      retrieve: async (req) => {
        // Simulate decision retrieval failure (decisions set includeSuperseded=true)
        if (req.policy?.includeSuperseded === true) {
          throw new Error('Decision store unavailable');
        }
        return originalRetrieve(req);
      },
    };

    const request = createMinimalRequest({
      contextPolicy: {
        includeMemory: true,
        includeDecisions: true,
        includeOutcomes: false,
        includeFeedback: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: spyRetriever,
      now: NOW_FN,
    });

    // Memory should still be included
    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    expect(memoryCtxs.length).toBe(1);
    // Decision should be marked as failed
    expect(result.sources.find((s) => s.source === 'decision')?.status).toBe('failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group L: Outcome Metadata Preservation (P0.7.2-R1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L. Outcome Metadata Preservation', () => {
  it('L1: source report includes metadata when outcome retrieval succeeds', async () => {
    const outcomes = [createOutcomeMemoryRecord('o1', 'user_1', 'project', 'proj_1')];
    const retriever = new InMemoryRetriever(outcomes);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: {
        includeOutcomes: true,
        includeMemory: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const outcomeSource = result.sources.find((s) => s.source === 'outcome');
    expect(outcomeSource).toBeDefined();
    expect(outcomeSource!.status).toBe('included');
    expect(outcomeSource!.metadata).toBeDefined();
    expect(outcomeSource!.metadata!.scannedRecords).toBeGreaterThanOrEqual(0);
    expect(outcomeSource!.metadata!.batchesFetched).toBeGreaterThanOrEqual(0);
    expect(typeof outcomeSource!.metadata!.truncated).toBe('boolean');
    expect(typeof outcomeSource!.metadata!.exhausted).toBe('boolean');
  });

  it('L2: metadata is undefined when outcome source is disabled', async () => {
    const retriever = new InMemoryRetriever([]);

    const request = createMinimalRequest({
      contextPolicy: {
        includeOutcomes: false,
        includeMemory: false,
      },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const outcomeSource = result.sources.find((s) => s.source === 'outcome');
    expect(outcomeSource).toBeDefined();
    expect(outcomeSource!.status).toBe('disabled');
    expect(outcomeSource!.metadata).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group M: Scope Enforcement (allowedScopes)
// ═══════════════════════════════════════════════════════════════════════════════

describe('M. Scope Enforcement', () => {
  it('M1: allowedScopes=["project"] filters memory to project scope', async () => {
    const records = [
      createGeneralMemoryRecord('g1', 'global', 'user_1'),
      createGeneralMemoryRecord('p1', 'project', 'user_1', 'proj_1'),
      createGeneralMemoryRecord('t1', 'topic', 'user_1', 'proj_1', 'topic_1'),
    ];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      topicId: 'topic_1',
      contextPolicy: { allowedScopes: ['project'] },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // When scope is 'project', only project-scoped records are returned
    // (explicit scope matching excludes global records)
    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    const scopes = memoryCtxs.map((c) => c.provenance.scope);
    // Must include project
    expect(scopes).toContain('project');
    // Must NOT include topic or global (scope is strictly 'project')
    expect(scopes).not.toContain('topic');
    expect(scopes).not.toContain('global');
  });

  it('M2: allowedScopes=["topic"] filters memory to topic + global', async () => {
    const records = [
      createGeneralMemoryRecord('g1', 'global', 'user_1'),
      createGeneralMemoryRecord('p1', 'project', 'user_1', 'proj_1'),
      createGeneralMemoryRecord('t1', 'topic', 'user_1', 'proj_1', 'topic_1'),
    ];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      topicId: 'topic_1',
      contextPolicy: { allowedScopes: ['topic'] },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    // When scope is 'topic', only topic-scoped records are returned
    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    const scopes = memoryCtxs.map((c) => c.provenance.scope);
    expect(scopes).toContain('topic');
    // Must NOT include project or global (scope is strictly 'topic')
    expect(scopes).not.toContain('project');
    expect(scopes).not.toContain('global');
  });

  it('M3: allowedScopes=["global"] returns only global records', async () => {
    const records = [
      createGeneralMemoryRecord('g1', 'global', 'user_1'),
      createGeneralMemoryRecord('p1', 'project', 'user_1', 'proj_1'),
    ];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { allowedScopes: ['global'] },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    // Only global records (InMemoryRetriever allows global here)
    expect(memoryCtxs.length).toBe(1);
    expect(memoryCtxs[0].id).toBe('ctx_mem_g1');
  });

  it('M4: allowedScopes=["global","project"] returns both scopes', async () => {
    const records = [
      createGeneralMemoryRecord('g1', 'global', 'user_1'),
      createGeneralMemoryRecord('p1', 'project', 'user_1', 'proj_1'),
      createGeneralMemoryRecord('t1', 'topic', 'user_1', 'proj_1', 'topic_1'),
    ];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      topicId: 'topic_1',
      contextPolicy: { allowedScopes: ['global', 'project'] },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    const scopes = memoryCtxs.map((c) => c.provenance.scope);
    expect(scopes).toContain('global');
    expect(scopes).toContain('project');
    expect(scopes).not.toContain('topic');
  });

  it('M5: empty allowedScopes means no scope restriction (default behavior)', async () => {
    const records = [
      createGeneralMemoryRecord('g1', 'global', 'user_1'),
      createGeneralMemoryRecord('p1', 'project', 'user_1', 'proj_1'),
    ];
    const retriever = new InMemoryRetriever(records);

    const request = createMinimalRequest({
      projectId: 'proj_1',
      contextPolicy: { allowedScopes: [] },
    });
    const result = await retrieveRuntimeContextWithMetadata(request, {
      memoryRetriever: retriever,
      now: NOW_FN,
    });

    const memoryCtxs = result.contexts.filter((c) => c.id.startsWith('ctx_mem_'));
    // All records returned when no scope restriction
    expect(memoryCtxs.length).toBe(2);
  });
});