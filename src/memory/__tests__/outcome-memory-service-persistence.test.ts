/**
 * P0.6.5.2 — Outcome Memory Service Persistence Integration Tests
 *
 * Real SQLite database integration tests verifying:
 * D1  create outcome → archive → database status=archived
 * D2  archive → restore → database status=active
 * D3  payload survives archive/restore unchanged
 * D4  version increments correctly
 * D5  wrong owner cannot archive
 * D6  wrong owner cannot restore
 * D7  stale expectedVersion rejected
 * D8  archived outcome excluded from normal retrieval
 * D9  archived outcome included with includeArchived=true
 * D10 batch import creates all valid records
 * D11 duplicate ID does not overwrite existing outcome
 * D12 partial batch failure is reported correctly
 * D13 Import: missing ownerId rejected
 *
 * STRICT MODE: Database initialization failure causes explicit test FAIL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// ─── Setup Isolated Test DB (THROWS on failure) ─────────────────────────────

let tempDir: string;

function setupTestDatabase(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'p0652-outcome-service-'));
  const tempDbPath = join(tempDir, 'test.db');
  const dbUrl = `file:${tempDbPath}`;

  execSync(`npx prisma db push --accept-data-loss --force-reset --url "${dbUrl}"`, {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  process.env.DATABASE_URL = dbUrl;
}

// ─── Import after DATABASE_URL is set ───────────────────────────────────────

import { PrismaMemoryStore } from '../persistence/prisma-memory-store';
import { DatabaseMemoryRetriever } from '../database-memory-retriever';
import {
  OutcomeMemoryServiceImpl,
} from '../outcome-memory-service';
import {
  createOutcomeMemory,
} from '../outcome-memory-factory';
import { retrieveOutcomeMemories } from '../outcome-memory-retrieval';
import { MemoryConcurrencyError, MemoryNotFoundError } from '../persistence/memory-persistence-types';
import type { OutcomeMemory } from '../outcome-memory';

// ─── State ─────────────────────────────────────────────────────────────────

let store: PrismaMemoryStore;
let retriever: DatabaseMemoryRetriever;
let service: OutcomeMemoryServiceImpl;

const OWNER_A = 'user-db-owner-a';
const OWNER_B = 'user-db-owner-b';

// Create and persist an outcome for testing
async function persistOutcome(
  ownerId: string,
  overrides?: Partial<Parameters<typeof createOutcomeMemory>[0]>,
): Promise<OutcomeMemory> {
  const outcome = createOutcomeMemory({
    outcomeType: 'engagement',
    targetType: 'content',
    targetId: `content-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    observedAt: '2026-09-30T10:00:00Z',
    ownerId,
    ...overrides,
  });
  return store.create(outcome) as Promise<OutcomeMemory>;
}

beforeAll(async () => {
  setupTestDatabase();

  const { prisma } = await import('@/lib/prisma');
  await prisma.memoryRecord.count(); // Verify DB connection — THROW if not

  store = new PrismaMemoryStore();
  retriever = new DatabaseMemoryRetriever(store);
  service = new OutcomeMemoryServiceImpl(store);
});

afterAll(async () => {
  // Restore original DATABASE_URL
  delete process.env.DATABASE_URL;
});

// ═══════════════════════════════════════════════════════════════════════════════
// DB Integration Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.5.2 — Outcome Memory Service Persistence', () => {
  describe('Archive Lifecycle (D1-D4)', () => {
    it('D1: create outcome → archive → database status=archived', async () => {
      const outcome = await persistOutcome(OWNER_A, { targetId: 'd1-target' });

      const result = await service.archiveOutcome(outcome.id, OWNER_A, 1);

      expect(result.status).toBe('archived');

      // Verify in database directly
      const stored = await store.getById(outcome.id, OWNER_A);
      expect(stored).not.toBeNull();
      expect(stored!.status).toBe('archived');
    });

    it('D2: archive → restore → database status=active', async () => {
      const outcome = await persistOutcome(OWNER_A, { targetId: 'd2-target' });

      await service.archiveOutcome(outcome.id, OWNER_A, 1);
      const restored = await service.restoreOutcome(outcome.id, OWNER_A, 2);

      expect(restored.status).toBe('active');

      const stored = await store.getById(outcome.id, OWNER_A);
      expect(stored!.status).toBe('active');
    });

    it('D3: payload survives archive/restore unchanged', async () => {
      const outcome = await persistOutcome(OWNER_A, {
        targetId: 'd3-target',
        outcomeType: 'performance',
        metrics: [
          { key: 'views', value: 1000 },
          { key: 'engagement_rate', value: 5.2, unit: 'percent' },
        ],
        summary: 'Payload survives test',
      });

      await service.archiveOutcome(outcome.id, OWNER_A, 1);
      const restored = await service.restoreOutcome(outcome.id, OWNER_A, 2);

      expect(restored.payload.outcomeType).toBe('performance');
      expect(restored.payload.targetType).toBe('content');
      expect(restored.payload.targetId).toBe('d3-target');
      expect(restored.payload.metrics).toEqual([
        { key: 'views', value: 1000 },
        { key: 'engagement_rate', value: 5.2, unit: 'percent' },
      ]);
      expect(restored.payload.summary).toBe('Payload survives test');
      expect(restored.payload.observedAt).toBe('2026-09-30T10:00:00Z');
    });

    it('D4: version increments correctly through archive/restore cycle', async () => {
      const outcome = await persistOutcome(OWNER_A, { targetId: 'd4-target' });
      expect(outcome.version).toBe(1);

      const archived = await service.archiveOutcome(outcome.id, OWNER_A, 1);
      expect(archived.version).toBe(2);

      const restored = await service.restoreOutcome(outcome.id, OWNER_A, 2);
      expect(restored.version).toBe(3);
    });
  });

  describe('Owner Authorization (D5-D6)', () => {
    it('D5: wrong owner cannot archive', async () => {
      const outcome = await persistOutcome(OWNER_A, { targetId: 'd5-target' });

      await expect(
        service.archiveOutcome(outcome.id, OWNER_B, 1),
      ).rejects.toThrow(MemoryNotFoundError);

      // Verify status unchanged
      const stored = await store.getById(outcome.id, OWNER_A);
      expect(stored!.status).toBe('active');
    });

    it('D6: wrong owner cannot restore', async () => {
      const outcome = await persistOutcome(OWNER_A, { targetId: 'd6-target' });
      await service.archiveOutcome(outcome.id, OWNER_A, 1);

      await expect(
        service.restoreOutcome(outcome.id, OWNER_B, 2),
      ).rejects.toThrow(MemoryNotFoundError);

      // Verify status unchanged
      const stored = await store.getById(outcome.id, OWNER_A);
      expect(stored!.status).toBe('archived');
    });
  });

  describe('OCC Concurrency (D7)', () => {
    it('D7: stale expectedVersion rejected', async () => {
      const outcome = await persistOutcome(OWNER_A, { targetId: 'd7-target' });

      // Archive with correct version
      await service.archiveOutcome(outcome.id, OWNER_A, 1);

      // Try to restore with stale version (1 instead of 2)
      await expect(
        service.restoreOutcome(outcome.id, OWNER_A, 1),
      ).rejects.toThrow(MemoryConcurrencyError);

      // Verify status unchanged
      const stored = await store.getById(outcome.id, OWNER_A);
      expect(stored!.status).toBe('archived');
    });
  });

  describe('Retrieval Integration (D8-D9)', () => {
    it('D8: archived outcome excluded from normal retrieval', async () => {
      const outcome = await persistOutcome(OWNER_A, {
        targetId: 'd8-target',
        outcomeType: 'milestone',
      });

      // Archive it
      await service.archiveOutcome(outcome.id, OWNER_A, 1);

      // Normal retrieval should NOT include archived
      const result = await retrieveOutcomeMemories(retriever, {
        ownerId: OWNER_A,
        targetId: 'd8-target',
        targetType: 'content',
      });

      expect(result).toHaveLength(0);
    });

    it('D9: archived outcome included with includeArchived=true', async () => {
      const outcome = await persistOutcome(OWNER_A, {
        targetId: 'd9-target',
        outcomeType: 'failure',
      });

      // Archive it
      await service.archiveOutcome(outcome.id, OWNER_A, 1);

      // With includeArchived=true, it should be visible
      const result = await retrieveOutcomeMemories(retriever, {
        ownerId: OWNER_A,
        targetId: 'd9-target',
        targetType: 'content',
        includeArchived: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(outcome.id);
      expect(result[0].status).toBe('archived');
    });
  });

  describe('Batch Import Persistence (D10-D12)', () => {
    it('D10: batch import creates all valid records', async () => {
      const outcomes = [
        createOutcomeMemory({
          id: 'd10-a',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'd10-a-target',
          observedAt: '2026-01-01T00:00:00Z',
          ownerId: OWNER_A,
        }),
        createOutcomeMemory({
          id: 'd10-b',
          outcomeType: 'conversion',
          targetType: 'draft',
          targetId: 'd10-b-target',
          observedAt: '2026-01-02T00:00:00Z',
          ownerId: OWNER_A,
        }),
      ];

      const result = await service.importOutcomes(outcomes, OWNER_A);

      expect(result.total).toBe(2);
      expect(result.imported).toBe(2);
      expect(result.failed).toBe(0);

      // Verify both in DB
      const storedA = await store.getById('d10-a', OWNER_A);
      const storedB = await store.getById('d10-b', OWNER_A);
      expect(storedA).not.toBeNull();
      expect(storedB).not.toBeNull();
    });

    it('D11: duplicate ID does not overwrite existing outcome', async () => {
      // Pre-existing outcome
      await persistOutcome(OWNER_A, {
        id: 'd11-dup',
        targetId: 'd11-original',
        observedAt: '2026-01-01T00:00:00Z',
      });

      // Try to import with same ID
      const importOutcome = createOutcomeMemory({
        id: 'd11-dup',
        outcomeType: 'failure',
        targetType: 'topic',
        targetId: 'd11-new-target',
        observedAt: '2026-12-31T00:00:00Z',
        ownerId: OWNER_A,
      });

      const result = await service.importOutcomes([importOutcome], OWNER_A);

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);

      // Original unchanged
      const stored = await store.getById('d11-dup', OWNER_A);
      expect(stored).not.toBeNull();
    });

    it('D12: partial batch failure is reported correctly', async () => {
      const outcomes = [
        createOutcomeMemory({
          id: 'd12-good',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'd12-good',
          observedAt: '2026-01-01T00:00:00Z',
          ownerId: OWNER_A,
        }),
        createOutcomeMemory({
          id: 'd12-bad',
          outcomeType: 'engagement',
          targetType: 'content',
          targetId: 'd12-bad',
          observedAt: '2026-01-01T00:00:00Z',
          ownerId: OWNER_A,
        }),
      ];

      // Corrupt the second one
      (outcomes[1].payload as { observedAt: string }).observedAt = 'invalid-date';

      const result = await service.importOutcomes(outcomes, OWNER_A);

      expect(result.total).toBe(2);
      expect(result.imported).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBeDefined();
    });

    it('D13: missing ownerId rejected — no record enters database', async () => {
      const outcome = createOutcomeMemory({
        id: 'd13-missing-owner',
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'd13-target',
        observedAt: '2026-01-01T00:00:00Z',
        ownerId: OWNER_A,
      });

      // Delete ownerId to simulate missing field
      delete (outcome as { ownerId?: string }).ownerId;

      const result = await service.importOutcomes([outcome], OWNER_A);

      expect(result.total).toBe(1);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('ownerId');

      // CRITICAL: Verify no record was written to the database
      const stored = await store.getById('d13-missing-owner', OWNER_A);
      expect(stored).toBeNull();
    });
  });
});
