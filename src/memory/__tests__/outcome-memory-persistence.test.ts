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
});
