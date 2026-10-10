/**
 * P0.7.4 — Prisma Run Store Integration Tests (Real SQLite)
 *
 * Tests the PrismaContextOSRunStore against a real SQLite database:
 *   - Field mapping (ContextOSRun → AgentRun → ContextOSRun)
 *   - Owner isolation at DB level
 *   - JSON round-trip for contextIds/decisionIds/outcomeIds
 *   - Pagination with composite cursor
 *   - Conflict rejection (no overwrite)
 *
 * Setup: Creates a temp SQLite DB with `prisma db push` before all tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { ContextOSRun, ContextOSRunStatus } from '../runtime-types';
import { PrismaContextOSRunStore } from '../prisma-run-store';
import { RunConflictError, RunNotFoundError } from '../run-store';

// ═══════════════════════════════════════════════════════════════════════════════
// Setup: Isolated Test DB
// ═══════════════════════════════════════════════════════════════════════════════

let tempDir: string;
let tempDbPath: string;
let store: PrismaContextOSRunStore;

function createRun(overrides: Partial<ContextOSRun> = {}): ContextOSRun {
  return {
    id: 'run_test_1',
    ownerId: 'user_1',
    projectId: undefined,
    topicId: undefined,
    purpose: 'test',
    input: { query: 'test' },
    contextIds: [],
    decisionIds: [],
    outcomeIds: [],
    output: undefined,
    status: 'started',
    startedAt: '2026-10-10T00:00:00.000Z',
    completedAt: undefined,
    ...overrides,
  };
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'p074-prisma-run-'));
  tempDbPath = join(tempDir, 'test.db');
  const dbUrl = `file:${tempDbPath}`;

  execSync(`npx prisma db push --accept-data-loss --force-reset --url "${dbUrl}"`, {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  process.env.DATABASE_URL = dbUrl;

  // Verify DB accessible
  const { prisma } = await import('@/lib/prisma');
  await prisma.agentRun.count();

  store = new PrismaContextOSRunStore();
}, 30000); // 30s hook timeout — prisma db push can be slow under parallel load

afterAll(async () => {
  // Windows: SQLite may hold file lock briefly; retry with delay
  if (tempDir) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch {
        if (attempt === 4) break; // final attempt failed — ignore on Windows
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }
});

beforeEach(async () => {
  // Clean table between tests
  const { prisma } = await import('@/lib/prisma');
  await prisma.agentRun.deleteMany();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('PrismaContextOSRunStore — Field Mapping', () => {
  it('should persist and retrieve a run with all fields', async () => {
    const run = createRun({
      id: 'run_field_test',
      ownerId: 'owner_xyz',
      projectId: 'proj_1',
      topicId: 'topic_1',
      purpose: 'content_creation',
      input: { query: 'test', nested: { value: 42 } },
      contextIds: ['ctx_1', 'ctx_2'],
      decisionIds: ['dec_1'],
      outcomeIds: ['out_1'],
      output: { result: 'draft_v1' },
      status: 'completed',
      startedAt: '2026-10-10T08:00:00.000Z',
      completedAt: '2026-10-10T08:01:00.000Z',
    });

    await store.create(run);
    const retrieved = await store.getById('owner_xyz', 'run_field_test');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('run_field_test');
    expect(retrieved!.ownerId).toBe('owner_xyz');
    expect(retrieved!.projectId).toBe('proj_1');
    expect(retrieved!.topicId).toBe('topic_1');
    expect(retrieved!.purpose).toBe('content_creation');
    expect(retrieved!.input).toEqual({ query: 'test', nested: { value: 42 } });
    expect(retrieved!.output).toEqual({ result: 'draft_v1' });
    expect(retrieved!.status).toBe('completed');
    expect(retrieved!.startedAt).toBe('2026-10-10T08:00:00.000Z');
    expect(retrieved!.completedAt).toBe('2026-10-10T08:01:00.000Z');
    expect(retrieved!.contextIds).toEqual(['ctx_1', 'ctx_2']);
    expect(retrieved!.decisionIds).toEqual(['dec_1']);
    expect(retrieved!.outcomeIds).toEqual(['out_1']);
  });

  it('should handle null/undefined optional fields', async () => {
    const run = createRun({
      id: 'run_null_test',
      input: undefined,
      output: undefined,
    });

    await store.create(run);
    const retrieved = await store.getById('user_1', 'run_null_test');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.projectId).toBeUndefined();
    expect(retrieved!.topicId).toBeUndefined();
    expect(retrieved!.output).toBeUndefined();
    expect(retrieved!.contextIds).toEqual([]);
  });

  it('should store and retrieve all 4 status values', async () => {
    const statuses: ContextOSRunStatus[] = ['started', 'running', 'completed', 'failed'];

    for (const status of statuses) {
      await store.create(createRun({ id: `run_${status}`, status }));
    }

    for (const status of statuses) {
      const retrieved = await store.getById('user_1', `run_${status}`);
      expect(retrieved!.status).toBe(status);
    }
  });
});

describe('PrismaContextOSRunStore — Owner Isolation', () => {
  it('should not return runs from other owners', async () => {
    await store.create(createRun({ id: 'run_ownerA', ownerId: 'owner_A' }));

    const byOwnerB = await store.getById('owner_B', 'run_ownerA');
    expect(byOwnerB).toBeNull();
  });

  it('should list only the querying owner\'s runs', async () => {
    await store.create(createRun({ id: 'run_list_1', ownerId: 'user_A' }));
    await store.create(createRun({ id: 'run_list_2', ownerId: 'user_A' }));
    await store.create(createRun({ id: 'run_list_3', ownerId: 'user_B' }));

    const result = await store.list({ ownerId: 'user_A' });
    expect(result.runs).toHaveLength(2);
    expect(result.runs.every((r) => r.ownerId === 'user_A')).toBe(true);
  });

  it('should reject update from non-owner', async () => {
    await store.create(createRun({ id: 'run_update_iso', ownerId: 'user_A' }));

    await expect(store.update(createRun({ id: 'run_update_iso', ownerId: 'user_B' }))).rejects.toThrow(
      RunNotFoundError
    );
  });
});

describe('PrismaContextOSRunStore — Conflict Handling', () => {
  it('should reject duplicate ID creation', async () => {
    await store.create(createRun({ id: 'run_dup' }));

    await expect(store.create(createRun({ id: 'run_dup' }))).rejects.toThrow(RunConflictError);
  });

  it('should not overwrite existing run on conflict', async () => {
    await store.create(createRun({ id: 'run_overwrite', purpose: 'original' }));

    try {
      await store.create(createRun({ id: 'run_overwrite', purpose: 'overwritten' }));
    } catch {
      // expected
    }

    const retrieved = await store.getById('user_1', 'run_overwrite');
    expect(retrieved!.purpose).toBe('original');
  });
});

describe('PrismaContextOSRunStore — Pagination', () => {
  beforeEach(async () => {
    // Create 7 runs with different startedAt
    for (let i = 0; i < 7; i++) {
      await store.create(createRun({
        id: `run_page_${i}`,
        ownerId: 'page_user',
        startedAt: `2026-10-10T00:0${i}:00.000Z`,
      }));
    }
  });

  it('should paginate with limit', async () => {
    const result = await store.list({ ownerId: 'page_user', limit: 3 });
    expect(result.runs).toHaveLength(3);
    expect(result.nextCursor).not.toBeNull();
  });

  it('should paginate through all results with cursor', async () => {
    const allIds: string[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      const result = await store.list({ ownerId: 'page_user', limit: 3, cursor: cursor ?? undefined });
      allIds.push(...result.runs.map((r) => r.id));
      cursor = result.nextCursor;
      pageCount++;
    } while (cursor && pageCount < 10);

    expect(allIds).toHaveLength(7);
    expect(new Set(allIds).size).toBe(7); // no duplicates
  });

  it('should return null nextCursor on last page', async () => {
    const result = await store.list({ ownerId: 'page_user', limit: 100 });
    expect(result.nextCursor).toBeNull();
  });

  it('should provide deterministic ordering', async () => {
    const result = await store.list({ ownerId: 'page_user', limit: 100 });
    for (let i = 1; i < result.runs.length; i++) {
      expect(result.runs[i].startedAt >= result.runs[i - 1].startedAt).toBe(true);
    }
  });
});

describe('PrismaContextOSRunStore — Filters', () => {
  beforeEach(async () => {
    await store.create(createRun({ id: 'run_f1', ownerId: 'filter_user', projectId: 'proj_A', status: 'completed' }));
    await store.create(createRun({ id: 'run_f2', ownerId: 'filter_user', projectId: 'proj_B', status: 'failed' }));
    await store.create(createRun({ id: 'run_f3', ownerId: 'filter_user', projectId: 'proj_A', status: 'started' }));
  });

  it('should filter by projectId', async () => {
    const result = await store.list({ ownerId: 'filter_user', projectId: 'proj_A' });
    expect(result.runs).toHaveLength(2);
    expect(result.runs.every((r) => r.projectId === 'proj_A')).toBe(true);
  });

  it('should filter by status', async () => {
    const result = await store.list({ ownerId: 'filter_user', status: 'completed' });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].id).toBe('run_f1');
  });

  it('should combine owner + status + projectId filters', async () => {
    const result = await store.list({ ownerId: 'filter_user', projectId: 'proj_A', status: 'completed' });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].id).toBe('run_f1');
  });
});

describe('PrismaContextOSRunStore — JSON Array Round-trip', () => {
  it('should correctly store and retrieve contextIds array', async () => {
    const run = createRun({
      id: 'run_json_test',
      contextIds: ['c1', 'c2', 'c3'],
      decisionIds: ['d1', 'd2'],
      outcomeIds: ['o1'],
    });

    await store.create(run);
    const retrieved = await store.getById('user_1', 'run_json_test');

    expect(retrieved!.contextIds).toEqual(['c1', 'c2', 'c3']);
    expect(retrieved!.decisionIds).toEqual(['d1', 'd2']);
    expect(retrieved!.outcomeIds).toEqual(['o1']);
  });

  it('should handle empty arrays', async () => {
    const run = createRun({ id: 'run_empty_arrays', contextIds: [], decisionIds: [], outcomeIds: [] });

    await store.create(run);
    const retrieved = await store.getById('user_1', 'run_empty_arrays');

    expect(retrieved!.contextIds).toEqual([]);
    expect(retrieved!.decisionIds).toEqual([]);
    expect(retrieved!.outcomeIds).toEqual([]);
  });
});

describe('PrismaContextOSRunStore — DateTime Round-trip', () => {
  it('should preserve ISO string timestamps after round-trip', async () => {
    const run = createRun({
      id: 'run_ts_test',
      startedAt: '2026-10-10T12:30:45.123Z',
      completedAt: '2026-10-10T12:31:00.456Z',
    });

    await store.create(run);
    const retrieved = await store.getById('user_1', 'run_ts_test');

    expect(retrieved!.startedAt).toBe('2026-10-10T12:30:45.123Z');
    expect(retrieved!.completedAt).toBe('2026-10-10T12:31:00.456Z');
  });
});
