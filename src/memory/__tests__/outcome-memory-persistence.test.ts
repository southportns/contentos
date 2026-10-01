/**
 * P0.6.5.1 — Outcome Memory Persistence Integration Tests (Strict)
 *
 * Real SQLite database integration tests covering the full pipeline:
 *
 *   createOutcomeMemory()
 *         ↓
 *   PrismaMemoryStore.create()
 *         ↓
 *   DatabaseMemoryRetriever
 *         ↓
 *   retrieveOutcomeMemories() / getOutcomeHistory() / getLatestOutcome()
 *         ↓
 *   Outcome Memory
 *         ↓
 *   Context Bridge (outcomeMemoryToContext)
 *         ↓
 *   Outcome Context
 *
 * STRICT MODE: Database initialization failure causes explicit test FAIL.
 * No silent skip. No console.warn + return. Tests prove real DB execution.
 *
 * Prerequisites: Requires `npx prisma db push` to work (must be run from
 * project root with correct schema.prisma).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// ─── Setup Isolated Test DB ─────────────────────────────────────────────────
// THROWS on failure (no silent skip)

let tempDbPath: string;
let tempDir: string;

function setupTestDatabase(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'p0651-outcome-'));
  tempDbPath = join(tempDir, 'test.db');
  const dbUrl = `file:${tempDbPath}`;

  execSync(`npx prisma db push --accept-data-loss --force-reset --url "${dbUrl}"`, {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  process.env.DATABASE_URL = dbUrl;
}

// ─── Import after DATABASE_URL is set ──────────────────────────────────────

import { PrismaMemoryStore } from '../persistence/prisma-memory-store';
import { DatabaseMemoryRetriever } from '../database-memory-retriever';
import { createOutcomeMemory } from '../outcome-memory-factory';
import { retrieveOutcomeMemories, getOutcomeHistory, getLatestOutcome } from '../outcome-memory-retrieval';
import { outcomeMemoryToContext } from '../memory-utils';
import type { OutcomeMemory } from '../outcome-memory';

// ─── State ─────────────────────────────────────────────────────────────────

let store: PrismaMemoryStore;
let retriever: DatabaseMemoryRetriever;

beforeAll(async () => {
  setupTestDatabase();

  // Verify DB is accessible — THROW if not
  const { prisma } = await import('@/lib/prisma');
  await prisma.memoryRecord.count();

  store = new PrismaMemoryStore();
  retriever = new DatabaseMemoryRetriever(store);
});

afterAll(async () => {
  // Restore original DATABASE_URL
  delete process.env.DATABASE_URL;

  // Clean up temp directory (best-effort: Windows may lock the DB briefly)
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error — temp dir will be cleaned by OS
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Persistence Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.5.1 — Outcome Memory Persistence (DB Integration)', () => {

  // ─── Test 1: create → persist → retrieve ──────────────────────────────
  describe('Test 1: create → persist → retrieve', () => {
    it('should create outcome, persist to DB, and retrieve by ID', async () => {
      const outcome = createOutcomeMemory({
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'content_db_test_1',
        observedAt: '2026-10-01T10:00:00.000Z',
        ownerId: 'user_db_1',
        projectId: 'proj_db_1',
        topicId: 'topic_db_1',
        metrics: [
          { key: 'views', value: 5000, source: 'douyin' },
          { key: 'likes', value: 300, source: 'douyin' },
        ],
      });

      // Persist
      const stored = await store.create(outcome);
      expect(stored.id).toBe(outcome.id);
      expect(stored.payload.outcomeType).toBe('engagement');

      // Retrieve by ID
      const retrieved = await store.getById(outcome.id, 'user_db_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.payload.targetId).toBe('content_db_test_1');
      expect(retrieved!.payload.metrics).toHaveLength(2);
    });

    it('should persist and retrieve through retriever', async () => {
      const outcome = createOutcomeMemory({
        id: 'out_db_ret_1',
        outcomeType: 'performance',
        targetType: 'content',
        targetId: 'content_ret_1',
        observedAt: '2026-10-01T12:00:00.000Z',
        ownerId: 'user_db_ret',
        projectId: 'proj_db_ret',
      });

      await store.create(outcome);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_db_ret',
        projectId: 'proj_db_ret',
        topicId: undefined,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.find(r => r.id === 'out_db_ret_1')).toBeDefined();
    });
  });

  // ─── Test 2: multiple observations (time series) ──────────────────────
  describe('Test 2: multiple observations (time series)', () => {
    it('should store multiple observations for the same target', async () => {
      const baseTime = new Date('2026-10-01T00:00:00.000Z');

      const outcomes: OutcomeMemory[] = [];
      for (let i = 0; i < 5; i++) {
        const observedAt = new Date(baseTime.getTime() + i * 24 * 60 * 60 * 1000).toISOString();
        outcomes.push(createOutcomeMemory({
          id: `out_ts_${i}`,
          outcomeType: 'performance',
          targetType: 'content',
          targetId: 'content_ts_same',
          observedAt,
          ownerId: 'user_ts',
          projectId: 'proj_ts',
          metrics: [{ key: 'views', value: (i + 1) * 10000, source: 'douyin' }],
        }));
      }

      // Persist all
      for (const outcome of outcomes) {
        await store.create(outcome);
      }

      // Retrieve history should return all 5, sorted by observedAt DESC
      const history = await getOutcomeHistory(retriever, {
        ownerId: 'user_ts',
        projectId: 'proj_ts',
        topicId: undefined,
        targetType: 'content',
        targetId: 'content_ts_same',
      });

      expect(history).toHaveLength(5);

      // Sorted descending
      for (let i = 0; i < history.length - 1; i++) {
        const current = new Date(history[i].payload.observedAt).getTime();
        const next = new Date(history[i + 1].payload.observedAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }

      // Latest should be most recent
      const latest = await getLatestOutcome(retriever, {
        ownerId: 'user_ts',
        projectId: 'proj_ts',
        targetType: 'content',
        targetId: 'content_ts_same',
      });

      expect(latest).not.toBeNull();
      expect(latest!.id).toBe('out_ts_4'); // Last observation (i=4)
      expect(latest!.payload.metrics![0].value).toBe(50000);
    });
  });

  // ─── Test 3: history ordering ─────────────────────────────────────────
  describe('Test 3: history ordering', () => {
    it('should return history sorted by observedAt DESC', async () => {
      const outcomes = [
        createOutcomeMemory({
          id: 'out_ord_1',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'content_ord',
          observedAt: '2026-09-01T00:00:00.000Z',
          ownerId: 'user_ord',
          projectId: 'proj_ord',
        }),
        createOutcomeMemory({
          id: 'out_ord_2',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'content_ord',
          observedAt: '2026-11-01T00:00:00.000Z',
          ownerId: 'user_ord',
          projectId: 'proj_ord',
        }),
        createOutcomeMemory({
          id: 'out_ord_3',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'content_ord',
          observedAt: '2026-10-01T00:00:00.000Z',
          ownerId: 'user_ord',
          projectId: 'proj_ord',
        }),
      ];

      for (const outcome of outcomes) {
        await store.create(outcome);
      }

      const history = await getOutcomeHistory(retriever, {
        ownerId: 'user_ord',
        projectId: 'proj_ord',
        targetType: 'content',
        targetId: 'content_ord',
      });

      expect(history).toHaveLength(3);
      // Nov → Oct → Sep
      expect(history[0].id).toBe('out_ord_2');
      expect(history[1].id).toBe('out_ord_3');
      expect(history[2].id).toBe('out_ord_1');
    });
  });

  // ─── Test 4: latest outcome ───────────────────────────────────────────
  describe('Test 4: latest outcome', () => {
    it('should return only the most recent outcome for a target', async () => {
      const outcomes = [
        createOutcomeMemory({
          id: 'out_late_1',
          outcomeType: 'performance',
          targetType: 'content',
          targetId: 'content_late',
          observedAt: '2026-10-01T00:00:00.000Z',
          ownerId: 'user_late',
          projectId: 'proj_late',
        }),
        createOutcomeMemory({
          id: 'out_late_2',
          outcomeType: 'performance',
          targetType: 'content',
          targetId: 'content_late',
          observedAt: '2026-10-15T00:00:00.000Z',
          ownerId: 'user_late',
          projectId: 'proj_late',
        }),
        createOutcomeMemory({
          id: 'out_late_3',
          outcomeType: 'performance',
          targetType: 'content',
          targetId: 'content_late',
          observedAt: '2026-10-10T00:00:00.000Z',
          ownerId: 'user_late',
          projectId: 'proj_late',
        }),
      ];

      for (const outcome of outcomes) {
        await store.create(outcome);
      }

      const latest = await getLatestOutcome(retriever, {
        ownerId: 'user_late',
        projectId: 'proj_late',
        targetType: 'content',
        targetId: 'content_late',
      });

      expect(latest).not.toBeNull();
      expect(latest!.id).toBe('out_late_2');
      expect(latest!.payload.observedAt).toBe('2026-10-15T00:00:00.000Z');
    });

    it('should return null when no outcome exists for target', async () => {
      const latest = await getLatestOutcome(retriever, {
        ownerId: 'user_late',
        projectId: 'proj_late',
        targetType: 'content',
        targetId: 'content_nonexistent_target',
      });

      expect(latest).toBeNull();
    });
  });

  // ─── Test 5: target filtering ─────────────────────────────────────────
  describe('Test 5: target filtering', () => {
    it('should filter outcomes by targetType', async () => {
      const contentOutcome = createOutcomeMemory({
        id: 'out_filter_content',
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'target_filter_c',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_filter',
        projectId: 'proj_filter',
      });

      const draftOutcome = createOutcomeMemory({
        id: 'out_filter_draft',
        outcomeType: 'publication',
        targetType: 'draft',
        targetId: 'target_filter_d',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_filter',
        projectId: 'proj_filter',
      });

      await store.create(contentOutcome);
      await store.create(draftOutcome);

      const contentResults = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_filter',
        projectId: 'proj_filter',
        targetType: 'content',
      });

      expect(contentResults.every(r => r.payload.targetType === 'content')).toBe(true);
      expect(contentResults.find(r => r.id === 'out_filter_draft')).toBeUndefined();
    });

    it('should filter outcomes by outcomeType', async () => {
      const perfOutcome = createOutcomeMemory({
        id: 'out_filter_perf',
        outcomeType: 'performance',
        targetType: 'content',
        targetId: 'target_perf_1',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_filter_type',
        projectId: 'proj_filter_type',
      });

      const failOutcome = createOutcomeMemory({
        id: 'out_filter_fail',
        outcomeType: 'failure',
        targetType: 'content',
        targetId: 'target_fail_1',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_filter_type',
        projectId: 'proj_filter_type',
      });

      await store.create(perfOutcome);
      await store.create(failOutcome);

      const failResults = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_filter_type',
        projectId: 'proj_filter_type',
        outcomeType: 'failure',
      });

      expect(failResults.every(r => r.payload.outcomeType === 'failure')).toBe(true);
    });
  });

  // ─── Test 6: owner isolation ──────────────────────────────────────────
  describe('Test 6: owner isolation', () => {
    it('user_B outcomes should NOT be visible to user_A', async () => {
      const outcomeA = createOutcomeMemory({
        id: 'out_iso_a',
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'content_iso_a',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_iso_a',
        projectId: 'proj_iso',
      });

      const outcomeB = createOutcomeMemory({
        id: 'out_iso_b',
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'content_iso_b',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_iso_b',
        projectId: 'proj_iso',
      });

      await store.create(outcomeA);
      await store.create(outcomeB);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_iso_a',
        projectId: 'proj_iso',
      });

      const ownerIds = results.map(r => r.ownerId);
      expect(ownerIds).not.toContain('user_iso_b');
      expect(results.find(r => r.id === 'out_iso_a')).toBeDefined();
    });
  });

  // ─── Test 7: project isolation ────────────────────────────────────────
  describe('Test 7: project isolation', () => {
    it('project_B outcomes should NOT be visible in project_A', async () => {
      const outcomeA = createOutcomeMemory({
        id: 'out_projiso_a',
        outcomeType: 'performance',
        targetType: 'content',
        targetId: 'content_projiso_a',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_projiso',
        projectId: 'proj_iso_a',
      });

      const outcomeB = createOutcomeMemory({
        id: 'out_projiso_b',
        outcomeType: 'performance',
        targetType: 'content',
        targetId: 'content_projiso_b',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_projiso',
        projectId: 'proj_iso_b',
      });

      await store.create(outcomeA);
      await store.create(outcomeB);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_projiso',
        projectId: 'proj_iso_a',
      });

      expect(results.every(r => r.projectId === 'proj_iso_a')).toBe(true);
      expect(results.find(r => r.id === 'out_projiso_b')).toBeUndefined();
    });
  });

  // ─── Test 8: topic isolation ──────────────────────────────────────────
  describe('Test 8: topic isolation', () => {
    it('topic_B outcomes should NOT be visible in topic_A', async () => {
      const outcomeA = createOutcomeMemory({
        id: 'out_topiciso_a',
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'content_topiso_a',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_topiso',
        projectId: 'proj_topiso',
        topicId: 'topic_iso_a',
      });

      const outcomeB = createOutcomeMemory({
        id: 'out_topiciso_b',
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'content_topiso_b',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_topiso',
        projectId: 'proj_topiso',
        topicId: 'topic_iso_b',
      });

      await store.create(outcomeA);
      await store.create(outcomeB);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_topiso',
        projectId: 'proj_topiso',
        topicId: 'topic_iso_a',
      });

      // Should only see topic_A outcomes (or global)
      const topicBResults = results.filter(r => r.topicId === 'topic_iso_b');
      expect(topicBResults).toHaveLength(0);
    });
  });

  // ─── Test 9: attribution ──────────────────────────────────────────────
  describe('Test 9: attribution', () => {
    it('should preserve attribution through persistence and retrieval', async () => {
      const outcome = createOutcomeMemory({
        id: 'out_attr_1',
        outcomeType: 'performance',
        targetType: 'content',
        targetId: 'content_attr_1',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_attr',
        projectId: 'proj_attr',
        attribution: {
          decisionId: 'dec_attr_1',
          contentId: 'content_attr_1',
          draftId: 'draft_attr_1',
        },
      });

      await store.create(outcome);

      const retrieved = await store.getById(outcome.id, 'user_attr');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.payload.attribution?.decisionId).toBe('dec_attr_1');
      expect(retrieved!.payload.attribution?.contentId).toBe('content_attr_1');
      expect(retrieved!.payload.attribution?.draftId).toBe('draft_attr_1');
    });

    it('attribution should survive retrieval via outcome retriever', async () => {
      const outcome = createOutcomeMemory({
        id: 'out_attr_2',
        outcomeType: 'conversion',
        targetType: 'content',
        targetId: 'content_attr_2',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_attr_2',
        projectId: 'proj_attr_2',
        attribution: { decisionId: 'dec_link_test_2' },
      });

      await store.create(outcome);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_attr_2',
        projectId: 'proj_attr_2',
      });

      const found = results.find(r => r.id === 'out_attr_2');
      expect(found).toBeDefined();
      expect(found!.payload.attribution?.decisionId).toBe('dec_link_test_2');
    });
  });

  // ─── Test 10: context bridge ──────────────────────────────────────────
  describe('Test 10: context bridge (DB → retrieve → context)', () => {
    it('should convert persisted outcome to ContextObject via full pipeline', async () => {
      const outcome = createOutcomeMemory({
        id: 'out_ctx_pipeline',
        outcomeType: 'performance',
        targetType: 'content',
        targetId: 'content_ctx_pipeline',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_ctx_pipeline',
        projectId: 'proj_ctx_pipeline',
        metrics: [
          { key: 'views', value: 100000, source: 'douyin' },
          { key: 'likes', value: 5000, source: 'douyin' },
        ],
        summary: 'Viral video test result',
      });

      // Create → Persist
      await store.create(outcome);

      // Retrieve
      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_ctx_pipeline',
        projectId: 'proj_ctx_pipeline',
      });

      const found = results.find(r => r.id === 'out_ctx_pipeline');
      expect(found).toBeDefined();

      // Bridge to Context
      const ctx = outcomeMemoryToContext(found!);

      expect(ctx.kind).toBe('outcome');
      expect(ctx.type).toBe('outcome');
      expect(ctx.payload.outcomeType).toBe('performance');
      expect(ctx.payload.observedAt).toBe('2026-10-01T00:00:00.000Z');
      expect(ctx.payload.value).toHaveLength(2);
      expect(ctx.provenance.ownerId).toBe('user_ctx_pipeline');
      expect(ctx.provenance.projectId).toBe('proj_ctx_pipeline');
    });

    it('should preserve outcomeType and metrics in context after DB round-trip', async () => {
      const outcome = createOutcomeMemory({
        id: 'out_ctx_metrics',
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'content_ctx_metrics',
        observedAt: '2026-10-02T00:00:00.000Z',
        ownerId: 'user_ctx_m',
        projectId: 'proj_ctx_m',
        metrics: [
          { key: 'ctr', value: 5.5, unit: 'percent', source: 'douyin' },
          { key: 'completion_rate', value: 42.3, unit: 'percent', source: 'douyin' },
          { key: 'followers_gained', value: 150, unit: 'count', source: 'douyin' },
        ],
      });

      await store.create(outcome);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_ctx_m',
        projectId: 'proj_ctx_m',
      });

      const found = results.find(r => r.id === 'out_ctx_metrics');
      expect(found).toBeDefined();

      const ctx = outcomeMemoryToContext(found!);
      expect(ctx.payload.outcomeType).toBe('engagement');
      const metrics = ctx.payload.value as Array<{ key: string; value: number }>;
      expect(metrics).toHaveLength(3);
      expect(metrics.find(m => m.key === 'ctr')?.value).toBe(5.5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0.6.5.1-R1 — Retrieval Hardening Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('P0.6.5.1-R1 — Retrieval Hardening (DB)', () => {

    // ─── R1-T1: DB-level Type Filtering ──────────────────────────────────
    describe('R1-T1: DB-level type filtering', () => {
      it('should return only outcome when mixed types exist (outcome + decision + profile)', async () => {
        const owner = 'user_r1_t1';
        const proj = 'proj_r1_t1';

        // Create different memory types for the same owner/project
        const outcome = createOutcomeMemory({
          id: 'r1_t1_outcome',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'target_r1_t1',
          observedAt: '2026-10-01T00:00:00.000Z',
          ownerId: owner,
          projectId: proj,
        });

        // Create decision memory with type='decision'
        const decisionRecord = {
          id: 'r1_t1_decision',
          kind: 'semantic' as const,
          type: 'decision' as const,
          payload: { title: 'Test decision' },
          scope: 'project' as const,
          ownerId: owner,
          projectId: proj,
          topicId: null,
          source: 'test',
          sourceType: 'integration_test',
          derivedFrom: undefined,
          confidence: 0.8,
          importance: 0.7,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          lastAccessedAt: null,
          accessCount: 0,
          expiresAt: null,
          version: 1,
          status: 'active' as const,
        };

        // Create a writing-profile-like memory (writing_profile type)
        const profileRecord = {
          id: 'r1_t1_profile',
          kind: 'static' as const,
          type: 'writing_profile' as const,
          payload: { tone: 'formal' },
          scope: 'global' as const,
          ownerId: owner,
          projectId: null,
          topicId: null,
          source: 'test',
          sourceType: 'integration_test',
          derivedFrom: undefined,
          confidence: 0.9,
          importance: 0.5,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          lastAccessedAt: null,
          accessCount: 0,
          expiresAt: null,
          version: 1,
          status: 'active' as const,
        };

        await store.create(outcome);
        await store.create(decisionRecord);
        await store.create(profileRecord);

        // Retrieve outcomes — should only return outcome type
        const results = await retrieveOutcomeMemories(retriever, {
          ownerId: owner,
          projectId: proj,
        });

        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('r1_t1_outcome');
        expect(results[0].type).toBe('outcome');

        // Decision and profile must NOT appear
        expect(results.find(r => r.id === 'r1_t1_decision')).toBeUndefined();
        expect(results.find(r => r.id === 'r1_t1_profile')).toBeUndefined();
      });
    });

    // ─── R1-T2: Mixed Memory Volume ──────────────────────────────────────
    describe('R1-T2: mixed memory volume (80 regular + 20 outcome)', () => {
      it('should return exactly 10 outcomes from a pool of 100+ mixed records', async () => {
        const owner = 'user_r1_t2';
        const proj = 'proj_r1_t2';

        // Create 80 regular (non-outcome) memories
        for (let i = 0; i < 80; i++) {
          const regularRecord = {
            id: `r1_t2_regular_${i}`,
            kind: 'static' as const,
            type: 'writing_profile' as const,
            payload: { index: i },
            scope: 'global' as const,
            ownerId: owner,
            projectId: null,
            topicId: null,
            source: 'test',
            sourceType: 'integration_test',
            derivedFrom: undefined,
            confidence: 0.8,
            importance: 0.5,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
            lastAccessedAt: null,
            accessCount: 0,
            expiresAt: null,
            version: 1,
            status: 'active' as const,
          };
          await store.create(regularRecord);
        }

        // Create 20 outcome memories (same owner/project)
        for (let i = 0; i < 20; i++) {
          const outcome = createOutcomeMemory({
            id: `r1_t2_outcome_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_r1_t2',
            observedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
          });
          await store.create(outcome);
        }

        // Request limit=10 outcomes
        const results = await retrieveOutcomeMemories(retriever, {
          ownerId: owner,
          projectId: proj,
          limit: 10,
        });

        // MUST return exactly 10 outcomes — not less due to regular memory filling the slot
        expect(results).toHaveLength(10);

        // ALL results must be type=outcome
        expect(results.every(r => r.type === 'outcome')).toBe(true);

        // No regular memories in the result
        expect(results.every(r => !r.id.startsWith('r1_t2_regular_'))).toBe(true);
      });
    });

    // ─── R1-T3: History > 100 ────────────────────────────────────────────
    describe('R1-T3: history > 100 (150 observations, limit=150)', () => {
      it('should return 150 outcomes sorted by observedAt DESC when limit=150', async () => {
        const owner = 'user_r1_t3';
        const proj = 'proj_r1_t3';
        const targetId = 'target_r1_t3';

        // Create 150 outcome observations with sequential timestamps
        for (let i = 0; i < 150; i++) {
          const outcome = createOutcomeMemory({
            id: `r1_t3_out_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId,
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
          });
          await store.create(outcome);
        }

        // Request with limit=150
        const history = await getOutcomeHistory(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId,
          limit: 150,
        });

        // MUST return exactly 150
        expect(history).toHaveLength(150);

        // Sorted by observedAt DESC
        for (let i = 0; i < history.length - 1; i++) {
          const current = new Date(history[i].payload.observedAt).getTime();
          const next = new Date(history[i + 1].payload.observedAt).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }

        // MostRecent (i=149) should be first
        expect(history[0].id).toBe('r1_t3_out_149');
      });
    });

    // ─── R1-T4: Latest correctness with high bounded window ──────────────
    describe('R1-T4: latest correctness within bounded window', () => {
      it('should find the latest observation when within the bounded window (limit)', async () => {
        const owner = 'user_r1_t4';
        const proj = 'proj_r1_t4';
        const targetId = 'target_r1_t4';

        // Create 120 observations; the latest is at i=119 (latest timestamp)
        for (let i = 0; i < 120; i++) {
          const outcome = createOutcomeMemory({
            id: `r1_t4_out_${i}`,
            outcomeType: 'engagement',
            targetType: 'content',
            targetId,
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
          });
          await store.create(outcome);
        }

        // Request latest with explicit limit >= total observations
        const latest = await getLatestOutcome(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId,
          limit: 200, // exceeds actual count but within MAX limit
        });

        expect(latest).not.toBeNull();
        expect(latest!.id).toBe('r1_t4_out_119');
      });

      it('should respect MAX limit clamp (prevent unbounded query)', async () => {
        const owner = 'user_r1_t4b';
        const proj = 'proj_r1_t4b';
        const targetId = 'target_r1_t4b';

        // Create a few observations
        for (let i = 0; i < 5; i++) {
          const outcome = createOutcomeMemory({
            id: `r1_t4b_out_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId,
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
          });
          await store.create(outcome);
        }

        // Request with limit beyond max — should clamp and still return latest
        const latest = await getLatestOutcome(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId,
          limit: 5000, // Will be clamped to MAX_OUTCOME_HISTORY_LIMIT (500)
        });

        expect(latest).not.toBeNull();
        expect(latest!.id).toBe('r1_t4b_out_4');
      });
    });

    // ─── R1-T5: Isolation (no regression) ───────────────────────────────
    describe('R1-T5: owner/topic/project isolation (regression)', () => {
      it('should NOT leak outcomes across owners even with type filter', async () => {
        const outcomeA = createOutcomeMemory({
          id: 'r1_t5_a',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'target_r1_t5_a',
          observedAt: '2026-10-01T00:00:00.000Z',
          ownerId: 'user_r1_t5_a',
          projectId: 'proj_r1_t5',
        });
        const outcomeB = createOutcomeMemory({
          id: 'r1_t5_b',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'target_r1_t5_b',
          observedAt: '2026-10-01T00:00:00.000Z',
          ownerId: 'user_r1_t5_b',
          projectId: 'proj_r1_t5',
        });

        await store.create(outcomeA);
        await store.create(outcomeB);

        const results = await retrieveOutcomeMemories(retriever, {
          ownerId: 'user_r1_t5_a',
          projectId: 'proj_r1_t5',
        });

        const ownerIds = results.map(r => r.ownerId);
        expect(ownerIds.every(o => o === 'user_r1_t5_a')).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0.6.5.1-R2 — Target Retrieval Completeness Tests (DB)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('P0.6.5.1-R2 — Target Retrieval Completeness (DB)', () => {

    // ─── R2-T1: Multi-Target Mix ────────────────────────────────────────
    describe('R2-T1: multi-target mix (80 target A + 20 target B, query B)', () => {
      it('should return all 20 target_B outcomes via batch retrieval', async () => {
        const owner = 'user_r2_t1_db';
        const proj = 'proj_r2_t1_db';

        // 80 target_A outcomes (high importance)
        for (let i = 0; i < 80; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t1_db_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.9,
          });
          await store.create(outcome);
        }

        // 20 target_B outcomes (lower importance)
        for (let i = 0; i < 20; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t1_db_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            observedAt: new Date(Date.UTC(2026, 3, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.5,
          });
          await store.create(outcome);
        }

        const results = await retrieveOutcomeMemories(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId: 'target_B',
          limit: 20,
        });

        // MUST return all 20 target_B outcomes
        expect(results).toHaveLength(20);

        // ALL results must be target_B
        expect(results.every(r => {
          const payload = r.payload as { targetId: string };
          return payload.targetId === 'target_B';
        })).toBe(true);

        // Sorted by observedAt DESC
        for (let i = 1; i < results.length; i++) {
          const prev = new Date((results[i - 1].payload as { observedAt: string }).observedAt).getTime();
          const curr = new Date((results[i].payload as { observedAt: string }).observedAt).getTime();
          expect(prev).toBeGreaterThanOrEqual(curr);
        }
      });
    });

    // ─── R2-T2: Multi-OutcomeType Mix ──────────────────────────────────
    describe('R2-T2: multi-outcomeType mix (50 perf + 30 eng + 20 conv, query conv)', () => {
      it('should return all 20 conversion outcomes via batch retrieval', async () => {
        const owner = 'user_r2_t2_db';
        const proj = 'proj_r2_t2_db';

        // 50 performance outcomes (high importance, sort first)
        for (let i = 0; i < 50; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t2_db_perf_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_r2_t2_db',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.95,
          });
          await store.create(outcome);
        }

        // 30 engagement outcomes
        for (let i = 0; i < 30; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t2_db_eng_${i}`,
            outcomeType: 'engagement',
            targetType: 'content',
            targetId: 'target_r2_t2_db',
            observedAt: new Date(Date.UTC(2026, 1, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.8,
          });
          await store.create(outcome);
        }

        // 20 conversion outcomes
        for (let i = 0; i < 20; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t2_db_conv_${i}`,
            outcomeType: 'conversion',
            targetType: 'content',
            targetId: 'target_r2_t2_db',
            observedAt: new Date(Date.UTC(2026, 2, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.6,
          });
          await store.create(outcome);
        }

        const results = await retrieveOutcomeMemories(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId: 'target_r2_t2_db',
          outcomeType: 'conversion',
          limit: 20,
        });

        expect(results).toHaveLength(20);
        expect(results.every(r => {
          const payload = r.payload as { outcomeType: string };
          return payload.outcomeType === 'conversion';
        })).toBe(true);
      });
    });

    // ─── R2-T3: Multi-Target + Multi-Type Mix ──────────────────────────
    describe('R2-T3: multi-target + multi-type mix (DB)', () => {
      it('should accurately return target_B + conversion subset', async () => {
        const owner = 'user_r2_t3_db';
        const proj = 'proj_r2_t3_db';

        // 60 outcomes: 3 targets × 20 each, with mixed outcomeTypes
        const targets = ['tA', 'tB', 'tC'];
        const types: Array<'performance' | 'engagement' | 'conversion'> = ['performance', 'engagement', 'conversion'];
        let idx = 0;

        for (const target of targets) {
          for (let i = 0; i < 20; i++) {
            const outcome = createOutcomeMemory({
              id: `r2_t3_db_out_${idx}`,
              outcomeType: types[i % 3],
              targetType: 'content',
              targetId: target,
              observedAt: new Date(Date.UTC(2026, 0, 1 + (idx % 28), 0, 0, idx % 60)).toISOString(),
              ownerId: owner,
              projectId: proj,
              importance: 0.9 - (idx % 10) * 0.05,
            });
            await store.create(outcome);
            idx++;
          }
        }

        // Query: target_B + conversion type
        const results = await retrieveOutcomeMemories(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId: 'tB',
          outcomeType: 'conversion',
          limit: 50,
        });

        // tB has 20 outcomes, every 3rd is conversion ≈ 6-7 conversion records
        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(50);

        // ALL must be target_B AND conversion
        for (const r of results) {
          const payload = r.payload as { targetId: string; outcomeType: string };
          expect(payload.targetId).toBe('tB');
          expect(payload.outcomeType).toBe('conversion');
        }

        // Sorted by observedAt DESC
        for (let i = 1; i < results.length; i++) {
          const prev = new Date((results[i - 1].payload as { observedAt: string }).observedAt).getTime();
          const curr = new Date((results[i].payload as { observedAt: string }).observedAt).getTime();
          expect(prev).toBeGreaterThanOrEqual(curr);
        }
      });
    });

    // ─── R2-T4: History Completeness ────────────────────────────────────
    describe('R2-T4: history completeness (100 target A + 50 target B, query B limit=50)', () => {
      it('should return 50 target_B outcomes sorted by observedAt DESC', async () => {
        const owner = 'user_r2_t4_db';
        const proj = 'proj_r2_t4_db';

        // 100 target_A outcomes (high importance, sort first)
        for (let i = 0; i < 100; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t4_db_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.95,
          });
          await store.create(outcome);
        }

        // 50 target_B outcomes (lower importance)
        for (let i = 0; i < 50; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t4_db_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            observedAt: new Date(Date.UTC(2026, 3, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.7,
          });
          await store.create(outcome);
        }

        const history = await getOutcomeHistory(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId: 'target_B',
          limit: 50,
        });

        // MUST return all 50 target_B outcomes
        expect(history).toHaveLength(50);

        // ALL target_B
        expect(history.every(r => {
          const payload = r.payload as { targetId: string };
          return payload.targetId === 'target_B';
        })).toBe(true);

        // Sorted by observedAt DESC
        for (let i = 1; i < history.length; i++) {
          const prev = new Date((history[i - 1].payload as { observedAt: string }).observedAt).getTime();
          const curr = new Date((history[i].payload as { observedAt: string }).observedAt).getTime();
          expect(prev).toBeGreaterThanOrEqual(curr);
        }
      });
    });

    // ─── R2-T5: Latest Outcome Correctness ──────────────────────────────
    describe('R2-T5: latest outcome (target B with truly latest observation)', () => {
      it('should return target_B truly latest observation via batch scan', async () => {
        const owner = 'user_r2_t5_db';
        const proj = 'proj_r2_t5_db';

        // 80 target_A outcomes (high importance, later observedAt)
        for (let i = 0; i < 80; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t5_db_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            // Latest timestamps
            observedAt: new Date(Date.UTC(2026, 11, 31, 0, 0, i % 60)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.99,
          });
          await store.create(outcome);
        }

        // 10 target_B outcomes (earlier observedAt, but truly latest for B)
        for (let i = 0; i < 10; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t5_db_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            observedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.5,
          });
          await store.create(outcome);
        }

        const latest = await getLatestOutcome(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId: 'target_B',
        });

        expect(latest).not.toBeNull();
        expect((latest!.payload as { targetId: string }).targetId).toBe('target_B');
        // Must be the LAST observation for target_B (highest observedAt)
        expect(latest!.id).toBe('r2_t5_db_b_9');
      });
    });

    // ─── R2-T6: Batch Bound ─────────────────────────────────────────────
    describe('R2-T6: batch bound (no infinite loop)', () => {
      it('should complete quickly and return only matches when target has few records', async () => {
        const owner = 'user_r2_t6_db';
        const proj = 'proj_r2_t6_db';

        // 200 target_A outcomes
        for (let i = 0; i < 200; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t6_db_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.9,
          });
          await store.create(outcome);
        }

        // Only 5 target_B outcomes
        for (let i = 0; i < 5; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t6_db_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            observedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
            importance: 0.5,
          });
          await store.create(outcome);
        }

        const startTime = Date.now();
        const results = await retrieveOutcomeMemories(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId: 'target_B',
          limit: 50,
        });
        const elapsed = Date.now() - startTime;

        // Should return all 5 target_B matches
        expect(results).toHaveLength(5);
        expect(results.every(r => {
          const payload = r.payload as { targetId: string };
          return payload.targetId === 'target_B';
        })).toBe(true);

        // Should complete within reasonable time (< 5s)
        expect(elapsed).toBeLessThan(5000);
      });
    });

    // ─── R2-T7: Regression (DB) ─────────────────────────────────────────
    describe('R2-T7: regression (DB — basic single-target retrieval)', () => {
      it('should still correctly retrieve outcomes for a single target with no mix', async () => {
        const owner = 'user_r2_t7_db';
        const proj = 'proj_r2_t7_db';

        for (let i = 0; i < 15; i++) {
          const outcome = createOutcomeMemory({
            id: `r2_t7_db_out_${i}`,
            outcomeType: 'engagement',
            targetType: 'content',
            targetId: 'target_single_db',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: owner,
            projectId: proj,
          });
          await store.create(outcome);
        }

        const results = await retrieveOutcomeMemories(retriever, {
          ownerId: owner,
          projectId: proj,
          targetType: 'content',
          targetId: 'target_single_db',
          limit: 15,
        });

        expect(results).toHaveLength(15);
        expect(results.every(r => {
          const payload = r.payload as { targetId: string };
          return payload.targetId === 'target_single_db';
        })).toBe(true);
      });
    });
  });
});
