/**
 * P0.6.3.2.3 — Memory Retrieval → Context Assembly Integration Tests
 *
 * Verifies the full integration path:
 *   Persistent Memory → MemoryRetriever → MemoryContextRetriever → ContextObject → Assembly
 *
 * Test Categories:
 *   A. Memory Retriever → Context (3 tests)
 *   B. Assembly Integration with Feature Flag (2 tests)
 *   C. Scope Isolation (2 tests)
 *   D. Budget Enforcement (1 test)
 *   E. Ranking Integration (1 test)
 *   F. Dedup (1 test)
 *   G. Provenance Preservation (1 test)
 *   H. Regression: Existing tests unaffected (2 tests)
 *
 * Test Strategy:
 *   - Uses InMemoryRetriever for deterministic, DB-free testing
 *   - Tests both feature flag ON and OFF behavior
 *   - Verifies scope isolation, budget enforcement, ranking, dedup
 *   - Confirms no regression to existing assembly behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assembleContexts } from '../context-assembler';
import { buildContextPackage } from '../context-package';
import { serializeContextPackage } from '../context-serializer';
import { MemoryContextRetriever } from '../memory-context-retriever';
import {
  assembleContextsWithMemory,
  isMemoryContextAssemblyEnabled,
} from '../context-assembly-memory';
import type { MemoryAssemblyOptions } from '../context-assembly-memory';
import { InMemoryRetriever } from '@/memory/memory-retriever';
import type { MemoryRecord } from '@/memory/memory-record';
import type { ContextAssemblyRequest } from '../types';
import type { ContextObject } from '../../context-object';
import { createIntentContext, createStrategyContext } from '../../context-factory';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function makeMemoryRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? `mem_${Math.random().toString(36).slice(2, 8)}`,
    kind: overrides.kind ?? 'semantic',
    type: overrides.type ?? 'test_memory',
    scope: overrides.scope ?? 'global',
    source: overrides.source ?? 'test_source',
    sourceType: overrides.sourceType ?? 'test',
    confidence: overrides.confidence ?? 0.8,
    importance: overrides.importance ?? 0.7,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    accessCount: overrides.accessCount ?? 0,
    version: overrides.version ?? 1,
    status: overrides.status ?? 'active',
    payload: overrides.payload ?? { text: 'test memory value' },
    ownerId: overrides.ownerId,
    projectId: overrides.projectId,
    topicId: overrides.topicId,
    derivedFrom: overrides.derivedFrom,
    lastAccessedAt: overrides.lastAccessedAt,
    expiresAt: overrides.expiresAt,
  };
}

function makeContext(overrides: Partial<ContextObject> = {}): ContextObject {
  return createIntentContext(
    { goal: 'Test goal' },
    {
      id: overrides.id ?? `ctx_${Math.random().toString(36).slice(2, 8)}`,
      provenance: {
        source: 'test',
        projectId: overrides.provenance?.projectId as string | undefined,
        topicId: overrides.provenance?.topicId as string | undefined,
        ...overrides.provenance,
      },
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Flag Management for Tests
// ═══════════════════════════════════════════════════════════════════════════════

let originalFlag: string | undefined;

beforeEach(() => {
  originalFlag = process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED;
});

afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED;
  } else {
    process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED = originalFlag;
  }
});

function enableFlag(): void {
  process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED = 'true';
}

function disableFlag(): void {
  delete process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Category A: Memory Retriever → Context
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.3.2.3 Memory Integration', () => {
  describe('A. Memory Retriever → Context', () => {
    it('A1: should convert MemoryRecord to ContextObject with correct fields', async () => {
      const record = makeMemoryRecord({
        id: 'mem_ctx_1',
        kind: 'semantic',
        type: 'writing_profile',
        scope: 'project',
        ownerId: 'user_A',
        projectId: 'proj_A',
        source: 'writing_profile_adapter',
        sourceType: 'adapter',
        confidence: 0.85,
        importance: 0.9,
      });

      const memoryRetriever = new InMemoryRetriever([record]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      const contexts = await retriever.retrieve(
        { kind: 'memory', projectId: 'proj_A' },
        { ownerId: 'user_A' }
      );

      expect(contexts).toHaveLength(1);
      const ctx = contexts[0];

      expect(ctx.id).toContain('mem_ctx_1');
      expect(ctx.kind).toBe('memory');
      // ctx.type = memoryKind (from createMemoryContext), payload.memoryType = record.type
      expect(ctx.type).toBe('semantic');
      expect(ctx.payload.memoryType).toBe('writing_profile');
      expect(ctx.confidence).toBe(0.85);

      // Provenance must be preserved
      expect(ctx.provenance.source).toBe('writing_profile_adapter');
      expect(ctx.provenance.sourceType).toBe('adapter');
      expect(ctx.provenance.ownerId).toBe('user_A');
      expect(ctx.provenance.projectId).toBe('proj_A');
    });

    it('A2: should use memoryRecordsToContexts for conversion (no second path)', async () => {
      const records = [
        makeMemoryRecord({ id: 'm1', kind: 'static', type: 'persona', ownerId: 'user_A', confidence: 0.9 }),
        makeMemoryRecord({ id: 'm2', kind: 'dynamic', type: 'draft', ownerId: 'user_A', confidence: 0.7 }),
      ];

      const memoryRetriever = new InMemoryRetriever(records);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      const contexts = await retriever.retrieve(
        { kind: 'memory' },
        { ownerId: 'user_A' }
      );

      expect(contexts).toHaveLength(2);
      // Verify payloads contain memory data
      expect(contexts[0].payload).toMatchObject({
        memoryKind: 'static',
        memoryType: 'persona',
        confidence: 0.9,
      });
      expect(contexts[1].payload).toMatchObject({
        memoryKind: 'dynamic',
        memoryType: 'draft',
        confidence: 0.7,
      });
    });

    it('A3: should return empty array when no memories match scope', async () => {
      const record = makeMemoryRecord({
        scope: 'project',
        ownerId: 'user_A',
        projectId: 'proj_A',
      });

      const memoryRetriever = new InMemoryRetriever([record]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      // Request for different project
      const contexts = await retriever.retrieve(
        { kind: 'memory', projectId: 'proj_B' },
        { ownerId: 'user_A' }
      );

      expect(contexts).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category B: Assembly Integration with Feature Flag
  // ═══════════════════════════════════════════════════════════════════════════

  describe('B. Assembly Integration with Feature Flag', () => {
    it('B1: should NOT retrieve memory when flag is OFF', async () => {
      disableFlag();

      const record = makeMemoryRecord({
        id: 'mem_flag_off',
        scope: 'global',
        ownerId: 'user_A',
      });

      const memoryRetriever = new InMemoryRetriever([record]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      const request: ContextAssemblyRequest = {
        contexts: [makeContext({ id: 'ctx_1' })],
        purpose: 'writing',
        maxTokens: 4000,
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { result, memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Flag OFF: no memory retrieved
      expect(memoryStats.enabled).toBe(false);
      expect(memoryStats.retrieved).toBe(0);
      expect(memoryStats.included).toBe(0);

      // Result should only contain the original context
      expect(result.selected.length).toBe(1);
      expect(result.selected[0].context.id).toBe('ctx_1');
    });

    it('B2: should include memory in assembly when flag is ON', async () => {
      enableFlag();

      const record = makeMemoryRecord({
        id: 'mem_flag_on',
        scope: 'global',
        ownerId: 'user_A',
        kind: 'semantic',
        importance: 0.95,
      });

      const memoryRetriever = new InMemoryRetriever([record]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      const request: ContextAssemblyRequest = {
        contexts: [
          makeContext({ id: 'ctx_1', confidence: 0.8 }),
        ],
        purpose: 'writing',
        maxTokens: 4000,
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { result, memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Flag ON: memory retrieved
      expect(memoryStats.enabled).toBe(true);
      expect(memoryStats.retrieved).toBe(1);
      expect(memoryStats.included).toBe(1);

      // Memory context should be in the package
      const pkg = buildContextPackage(result);
      expect(pkg.memory.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category C: Scope Isolation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('C. Scope Isolation', () => {
    it('C1: should isolate memory across users (ownerId boundary)', async () => {
      enableFlag();

      // User A's memories
      const recordA = makeMemoryRecord({
        id: 'mem_user_a',
        scope: 'project',
        ownerId: 'user_A',
        projectId: 'proj_A',
        topicId: 'topic_A',
      });

      // User B's memories
      const recordB = makeMemoryRecord({
        id: 'mem_user_b',
        scope: 'project',
        ownerId: 'user_B',
        projectId: 'proj_A',
        topicId: 'topic_A',
      });

      const memoryRetriever = new InMemoryRetriever([recordA, recordB]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      // Assembly for User A
      const request: ContextAssemblyRequest = {
        contexts: [],
        purpose: 'writing',
        projectId: 'proj_A',
        topicId: 'topic_A',
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { result, memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Only User A's memory should be retrieved
      expect(memoryStats.retrieved).toBe(1);
      expect(memoryStats.included).toBe(1);

      const pkg = buildContextPackage(result);
      expect(pkg.memory).toHaveLength(1);
      // Verify the memory belongs to user A
      expect(pkg.memory[0].provenance.ownerId).toBe('user_A');
    });

    it('C2: should allow global memory in project/topic context', async () => {
      enableFlag();

      // Global memory (no projectId/topicId)
      const globalRecord = makeMemoryRecord({
        id: 'mem_global_1',
        scope: 'global',
        ownerId: 'user_A',
      });

      const memoryRetriever = new InMemoryRetriever([globalRecord]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      // Assembly for a specific project/topic
      const request: ContextAssemblyRequest = {
        contexts: [],
        purpose: 'writing',
        projectId: 'proj_A',
        topicId: 'topic_A',
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Global memory should be available
      expect(memoryStats.retrieved).toBe(1);
      expect(memoryStats.included).toBe(1);
    });

    it('C3: should NOT return session-scoped memory', async () => {
      enableFlag();

      const sessionRecord = makeMemoryRecord({
        id: 'mem_session_1',
        scope: 'session',
        ownerId: 'user_A',
      });

      const memoryRetriever = new InMemoryRetriever([sessionRecord]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      const request: ContextAssemblyRequest = {
        contexts: [],
        purpose: 'writing',
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Session memories must never enter persistent retrieval
      expect(memoryStats.retrieved).toBe(0);
    });

    it('C4: should NOT return project memory from different project', async () => {
      enableFlag();

      const recordProjB = makeMemoryRecord({
        id: 'mem_proj_b',
        scope: 'project',
        ownerId: 'user_A',
        projectId: 'proj_B',
      });

      const memoryRetriever = new InMemoryRetriever([recordProjB]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      // Assembly for proj_A
      const request: ContextAssemblyRequest = {
        contexts: [],
        purpose: 'writing',
        projectId: 'proj_A',
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Different project memory should not leak
      expect(memoryStats.retrieved).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category D: Budget Enforcement
  // ═══════════════════════════════════════════════════════════════════════════

  describe('D. Budget Enforcement', () => {
    it('D1: memory contexts must respect budget constraints', async () => {
      enableFlag();

      // Create many memory records
      const records = Array.from({ length: 15 }, (_, i) =>
        makeMemoryRecord({
          id: `mem_budget_${i}`,
          scope: 'global',
          ownerId: 'user_A',
          importance: 0.9 - i * 0.01,  // descending importance
        })
      );

      const memoryRetriever = new InMemoryRetriever(records);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      // Very tight budget
      const request: ContextAssemblyRequest = {
        contexts: [],
        purpose: 'writing',
        maxTokens: 100,  // Very tight
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { result, memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Memory retrieved but not all included due to budget
      expect(memoryStats.retrieved).toBe(15);
      expect(memoryStats.included).toBeLessThan(15);

      // Budget warning should appear
      const budgetWarning = result.warnings.find((w) => w.code === 'BUDGET_EXCEEDED');
      expect(budgetWarning).toBeDefined();
    });

    it('D2: memory contexts must respect maxContexts constraint', async () => {
      enableFlag();

      const records = Array.from({ length: 10 }, (_, i) =>
        makeMemoryRecord({
          id: `mem_max_${i}`,
          scope: 'global',
          ownerId: 'user_A',
        })
      );

      const memoryRetriever = new InMemoryRetriever(records);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      const request: ContextAssemblyRequest = {
        contexts: [],
        purpose: 'writing',
        maxTokens: 4000,
        maxContexts: 3,  // Hard limit of 3 contexts
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { result, memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Retrieved 10 but included at most 3
      expect(memoryStats.retrieved).toBe(10);
      expect(memoryStats.included).toBeLessThanOrEqual(3);
      expect(result.metadata.selectedCount).toBeLessThanOrEqual(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category E: Ranking Integration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('E. Ranking Integration', () => {
    it('E1: memory contexts should participate in standard ranking (not self-sorted)', async () => {
      enableFlag();

      // Memory with high importance
      const memoryRecord = makeMemoryRecord({
        id: 'mem_rank_high',
        scope: 'global',
        ownerId: 'user_A',
        importance: 0.99,
        confidence: 0.99,
      });

      const memoryRetriever = new InMemoryRetriever([memoryRecord]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      // Intent context (normally higher base priority than memory)
      const intentCtx = createIntentContext(
        { goal: 'Create viral content' },
        {
          id: 'ctx_intent_rank',
          provenance: { source: 'topic:1', topicId: 'topic_1', projectId: 'proj_1' },
          confidence: 0.9,
        }
      );

      const request: ContextAssemblyRequest = {
        contexts: [intentCtx],
        purpose: 'writing',
        maxTokens: 4000,
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { result } = await assembleContextsWithMemory(request, memoryOpts);

      // Both should be present — ranking by standard pipeline
      expect(result.selected.length).toBe(2);

      // Intent should rank higher (base_priority: intent=100 > memory=20)
      // BUT: scoring includes purpose/recency adjustments. The intent context
      // is under 'writing' purpose, so it gets a significant boost.
      const intentScore = result.selected.find(
        (s) => s.context.id === 'ctx_intent_rank'
      )?.score ?? 0;
      const memoryScore = result.selected.find(
        (s) => s.context.kind === 'memory'
      )?.score ?? 0;

      // Intent (writing purpose) should outrank memory for writing purpose
      expect(intentScore).toBeGreaterThan(memoryScore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category F: Dedup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('F. Deduplication', () => {
    it('F1: equivalent memory contexts should be deduped', async () => {
      enableFlag();

      // Two memories with same source → will have same sourceTypeFingerprint
      const record1 = makeMemoryRecord({
        id: 'mem_dup_a',
        scope: 'global',
        ownerId: 'user_A',
        source: 'test_source',
        sourceType: 'test',
      });
      const record2 = makeMemoryRecord({
        id: 'mem_dup_b',
        scope: 'global',
        ownerId: 'user_A',
        source: 'test_source',
        sourceType: 'test',
      });

      const memoryRetriever = new InMemoryRetriever([record1, record2]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      const request: ContextAssemblyRequest = {
        contexts: [],
        purpose: 'writing',
        maxTokens: 4000,
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { memoryStats } = await assembleContextsWithMemory(request, memoryOpts);

      // Both retrieved, but one deduped (same source+type → duplicate)
      expect(memoryStats.retrieved).toBe(2);
      expect(memoryStats.deduped).toBe(1);
      expect(memoryStats.included).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category G: Provenance Preservation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('G. Provenance Preservation', () => {
    it('G1: ContextObject provenance must trace back to MemoryRecord source', async () => {
      enableFlag();

      const record = makeMemoryRecord({
        id: 'mem_provenance_1',
        kind: 'static',
        type: 'writing_profile',
        scope: 'project',
        ownerId: 'user_A',
        projectId: 'proj_X',
        topicId: 'topic_X',
        source: 'writing_profile_adapter_v2',
        sourceType: 'adapter',
        confidence: 0.92,
        derivedFrom: ['mem_older_1'],
      });

      const memoryRetriever = new InMemoryRetriever([record]);
      const retriever = new MemoryContextRetriever(memoryRetriever);

      const request: ContextAssemblyRequest = {
        contexts: [],
        purpose: 'strategy',
        projectId: 'proj_X',
        topicId: 'topic_X',
      };

      const memoryOpts: MemoryAssemblyOptions = {
        memoryRetriever: retriever,
        ownerId: 'user_A',
      };

      const { result } = await assembleContextsWithMemory(request, memoryOpts);

      const pkg = buildContextPackage(result);
      const memoryCtx = pkg.memory[0];

      // All provenance fields must be present and traceable
      expect(memoryCtx.provenance.source).toBe('writing_profile_adapter_v2');
      expect(memoryCtx.provenance.sourceType).toBe('adapter');
      expect(memoryCtx.provenance.ownerId).toBe('user_A');
      expect(memoryCtx.provenance.projectId).toBe('proj_X');
      expect(memoryCtx.provenance.topicId).toBe('topic_X');
      expect(memoryCtx.provenance.derivedFrom).toEqual(['mem_older_1']);

      // Payload structure verified
      expect(memoryCtx.payload).toMatchObject({
        memoryKind: 'static',
        memoryType: 'writing_profile',
        confidence: 0.92,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category H: Regression — Existing Behavior Unchanged
  // ═══════════════════════════════════════════════════════════════════════════

  describe('H. Regression Tests', () => {
    it('H1: assembleContextsWithMemory with flag OFF = identical to assembleContexts', async () => {
      disableFlag();

      const ctx1 = createIntentContext(
        { goal: 'Test goal' },
        { id: 'ctx_reg_1', provenance: { source: 'test', topicId: 't1', projectId: 'p1' } }
      );
      const ctx2 = createStrategyContext(
        { coreThesis: 'Test thesis' },
        { id: 'ctx_reg_2', provenance: { source: 'test', topicId: 't1', projectId: 'p1' } }
      );

      const request: ContextAssemblyRequest = {
        contexts: [ctx1, ctx2],
        purpose: 'writing',
        maxTokens: 4000,
      };

      // Standard assembly
      const standardResult = assembleContexts(request);

      // Assembly with memory (flag OFF should be identical)
      const { result: memoryResult } = await assembleContextsWithMemory(request, {
        memoryRetriever: new MemoryContextRetriever(new InMemoryRetriever()),
        ownerId: 'user_A',
      });

      // Results must be identical
      expect(memoryResult.metadata.inputCount).toBe(standardResult.metadata.inputCount);
      expect(memoryResult.metadata.selectedCount).toBe(standardResult.metadata.selectedCount);
      expect(memoryResult.tokenEstimate).toBe(standardResult.tokenEstimate);

      const stdPkg = buildContextPackage(standardResult);
      const memPkg = buildContextPackage(memoryResult);
      expect(serializeContextPackage(stdPkg)).toBe(serializeContextPackage(memPkg));
    });

    it('H2: assembleContexts (sync) is not modified', () => {
      // Verify the original function still works exactly as before
      const contexts = [
        createIntentContext(
          { goal: 'Viral content' },
          { id: 'ctx_sync_1', provenance: { source: 'topic:1' } }
        ),
        createStrategyContext(
          { coreThesis: 'Authentic storytelling' },
          { id: 'ctx_sync_2', provenance: { source: 'strategy:1' } }
        ),
      ];

      const result = assembleContexts({
        contexts,
        purpose: 'writing',
        maxTokens: 10000,
      });

      expect(result.selected.length).toBe(2);
      expect(result.metadata.purpose).toBe('writing');
      expect(result.metadata.inputCount).toBe(2);
    });

    it('H3: feature flag is read from environment variable', () => {
      delete process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED;
      expect(isMemoryContextAssemblyEnabled()).toBe(false);

      process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED = 'true';
      expect(isMemoryContextAssemblyEnabled()).toBe(true);

      process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED = '1';
      expect(isMemoryContextAssemblyEnabled()).toBe(true);

      process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED = 'false';
      expect(isMemoryContextAssemblyEnabled()).toBe(false);

      process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED = '0';
      expect(isMemoryContextAssemblyEnabled()).toBe(false);
    });
  });
}
