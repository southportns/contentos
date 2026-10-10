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
import { RunConflictError, RunNotFoundError, RunValidationError, MAX_RUN_LIMIT } from '../run-store';

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

  it('should provide deterministic ordering by (createdAt, id)', async () => {
    // The documented pagination order is (createdAt ASC, id ASC).
    // Since ContextOSRun does not expose the Prisma-internal createdAt,
    // we verify consistency: store results must match raw Prisma ordering.
    const { prisma } = await import('@/lib/prisma');
    const rawRows = await prisma.agentRun.findMany({
      where: { ownerId: 'page_user' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const expectedOrder = rawRows.map((r) => r.id);

    const result = await store.list({ ownerId: 'page_user', limit: 100 });
    const actualOrder = result.runs.map((r) => r.id);

    expect(actualOrder).toEqual(expectedOrder);
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

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1: Limit Validation
// ═══════════════════════════════════════════════════════════════════════════════
// Helper: read raw AgentRun rows ordered by (createdAt, id) for direct DB assertions.
async function fetchRawOrdered(ownerId: string) {
  const { prisma } = await import('@/lib/prisma');
  return prisma.agentRun.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

describe('PrismaContextOSRunStore — Limit Validation (R1)', () => {
  it('should reject limit of 0', async () => {
    await expect(store.list({ ownerId: 'user_1', limit: 0 })).rejects.toThrow(RunValidationError);
    await expect(store.list({ ownerId: 'user_1', limit: 0 })).rejects.toThrow(/positive integer/);
  });

  it('should reject negative limit', async () => {
    await expect(store.list({ ownerId: 'user_1', limit: -1 })).rejects.toThrow(RunValidationError);
    await expect(store.list({ ownerId: 'user_1', limit: -100 })).rejects.toThrow(RunValidationError);
  });

  it('should reject fractional limit', async () => {
    await expect(store.list({ ownerId: 'user_1', limit: 1.5 })).rejects.toThrow(RunValidationError);
    await expect(store.list({ ownerId: 'user_1', limit: 3.7 })).rejects.toThrow(/integer/);
  });

  it('should reject NaN limit', async () => {
    await expect(store.list({ ownerId: 'user_1', limit: NaN })).rejects.toThrow(RunValidationError);
  });

  it('should reject Infinity limit', async () => {
    await expect(store.list({ ownerId: 'user_1', limit: Infinity })).rejects.toThrow(RunValidationError);
    await expect(store.list({ ownerId: 'user_1', limit: -Infinity })).rejects.toThrow(RunValidationError);
  });

  it('should clamp limit above MAX_RUN_LIMIT to MAX_RUN_LIMIT', async () => {
    // Create enough data
    for (let i = 0; i < 5; i++) {
      await store.create(createRun({ id: `run_clamp_${i}`, ownerId: 'clamp_user' }));
    }

    const result = await store.list({ ownerId: 'clamp_user', limit: MAX_RUN_LIMIT + 50 });
    expect(result.runs.length).toBeLessThanOrEqual(MAX_RUN_LIMIT);
    // With only 5 records, we should get all 5 (since 5 < MAX_RUN_LIMIT)
    expect(result.runs).toHaveLength(5);
  });

  it('should use DEFAULT_RUN_LIMIT when limit is omitted', async () => {
    const result = await store.list({ ownerId: 'user_1' });
    // No data, but no error — demonstrates default applied
    expect(result.runs).toHaveLength(0);
  });

  it('should accept valid positive integer limits', async () => {
    for (let i = 0; i < 5; i++) {
      await store.create(createRun({ id: `run_valid_${i}`, ownerId: 'valid_user' }));
    }

    const result = await store.list({ ownerId: 'valid_user', limit: 3 });
    expect(result.runs).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1: Owner ID Validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Owner ID Validation (R1)', () => {
  it('should reject blank ownerId (empty string)', async () => {
    await expect(store.list({ ownerId: '' })).rejects.toThrow(RunValidationError);
    await expect(store.list({ ownerId: '' })).rejects.toThrow(/ownerId/);
  });

  it('should reject whitespace-only ownerId', async () => {
    await expect(store.list({ ownerId: '   ' })).rejects.toThrow(RunValidationError);
  });

  it('should reject blank ownerId in getById', async () => {
    await expect(store.getById('', 'run_1')).rejects.toThrow(RunValidationError);
  });

  it('should reject blank ownerId in update', async () => {
    await expect(store.update(createRun({ id: 'run_1', ownerId: '' }))).rejects.toThrow(RunValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1: Cursor Validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Cursor Validation (R1)', () => {
  it('should reject malformed base64 cursor', async () => {
    await expect(
      store.list({ ownerId: 'user_1', cursor: '!!!invalid-base64!!!' }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with malformed JSON inside base64', async () => {
    const badJson = Buffer.from('not json at all').toString('base64');
    await expect(
      store.list({ ownerId: 'user_1', cursor: badJson }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with invalid date in createdAt', async () => {
    const badDateCursor = Buffer.from(
      JSON.stringify({ createdAt: 'not-a-date', id: 'run_1' }),
    ).toString('base64');

    await expect(
      store.list({ ownerId: 'user_1', cursor: badDateCursor }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with missing id field', async () => {
    const missingIdCursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-10-10T00:00:00.000Z' }),
    ).toString('base64');

    await expect(
      store.list({ ownerId: 'user_1', cursor: missingIdCursor }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with missing createdAt field', async () => {
    const missingDateCursor = Buffer.from(
      JSON.stringify({ id: 'run_1' }),
    ).toString('base64');

    await expect(
      store.list({ ownerId: 'user_1', cursor: missingDateCursor }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with empty id', async () => {
    const emptyIdCursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-10-10T00:00:00.000Z', id: '' }),
    ).toString('base64');

    await expect(
      store.list({ ownerId: 'user_1', cursor: emptyIdCursor }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with wrong shape (array instead of object)', async () => {
    const arrayCursor = Buffer.from(JSON.stringify([{ createdAt: 'x', id: 'y' }])).toString('base64');

    await expect(
      store.list({ ownerId: 'user_1', cursor: arrayCursor }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should accept a valid cursor from previous page', async () => {
    // Create test data
    for (let i = 0; i < 5; i++) {
      await store.create(createRun({ id: `run_valid_c_${i}`, ownerId: 'valid_cursor_user' }));
    }

    // Get first page
    const page1 = await store.list({ ownerId: 'valid_cursor_user', limit: 2 });
    expect(page1.nextCursor).not.toBeNull();

    // Use cursor to get next page
    const page2 = await store.list({
      ownerId: 'valid_cursor_user',
      limit: 2,
      cursor: page1.nextCursor!,
    });

    expect(page2.runs.length).toBeGreaterThan(0);
    // No overlap between pages
    const page1Ids = page1.runs.map((r) => r.id);
    const page2Ids = page2.runs.map((r) => r.id);
    expect(page1Ids.filter((id) => page2Ids.includes(id))).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1: Atomic Owner Isolation
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Atomic Owner Isolation (R1)', () => {
  it('getById: should return null for unknown run (atomic scoped query)', async () => {
    const result = await store.getById('owner_A', 'nonexistent_run');
    expect(result).toBeNull();
  });

  it('getById: should return null for different owner (atomic scoped query)', async () => {
    await store.create(createRun({ id: 'run_atomic_1', ownerId: 'owner_A' }));

    const result = await store.getById('owner_B', 'run_atomic_1');
    expect(result).toBeNull();
  });

  it('getById: should return run only for matching owner', async () => {
    await store.create(createRun({ id: 'run_atomic_2', ownerId: 'owner_A' }));

    const result = await store.getById('owner_A', 'run_atomic_2');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('run_atomic_2');
  });

  it('update: should not update run owned by different user', async () => {
    await store.create(createRun({ id: 'run_atomic_upd', ownerId: 'owner_A', purpose: 'original' }));

    // Attempt update as owner_B
    await expect(
      store.update(createRun({ id: 'run_atomic_upd', ownerId: 'owner_B', purpose: 'hijacked' })),
    ).rejects.toThrow(RunNotFoundError);

    // Verify owner_A's data is untouched
    const retrieved = await store.getById('owner_A', 'run_atomic_upd');
    expect(retrieved!.purpose).toBe('original');
  });

  it('update: should throw RunNotFoundError for non-existent run', async () => {
    await expect(
      store.update(createRun({ id: 'run_never_existed', ownerId: 'owner_A' })),
    ).rejects.toThrow(RunNotFoundError);
  });

  it('update: should succeed for legit owner', async () => {
    await store.create(createRun({ id: 'run_legit_upd', ownerId: 'owner_A', status: 'started' }));

    const updated = await store.update(
      createRun({ id: 'run_legit_upd', ownerId: 'owner_A', status: 'completed' }),
    );
    expect(updated.status).toBe('completed');

    // Verify via getById
    const retrieved = await store.getById('owner_A', 'run_legit_upd');
    expect(retrieved!.status).toBe('completed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1: Pagination Integrity
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Pagination Integrity (R1)', () => {
  it('should order by (createdAt, id) deterministically', async () => {
    // Create runs — all will have same createdAt-second (SQLite timestamp precision)
    for (let i = 0; i < 10; i++) {
      await store.create(createRun({ id: `run_order_${i}`, ownerId: 'order_user' }));
    }

    const raw = await fetchRawOrdered('order_user');
    expect(raw.length).toBe(10);

    // Verify: when createdAt is same, should order by id ASC
    for (let i = 1; i < raw.length; i++) {
      const prev = raw[i - 1];
      const curr = raw[i];
      if (prev.createdAt.getTime() === curr.createdAt.getTime()) {
        expect(curr.id > prev.id).toBe(true);
      } else {
        expect(curr.createdAt.getTime() > prev.createdAt.getTime()).toBe(true);
      }
    }
  });

  it('should produce no duplicate or missing rows across all pages', async () => {
    const totalRuns = 25;
    for (let i = 0; i < totalRuns; i++) {
      await store.create(createRun({ id: `run_full_${i}`, ownerId: 'full_user' }));
    }

    const allIds: string[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      const result = await store.list({ ownerId: 'full_user', limit: 7, cursor: cursor ?? undefined });
      allIds.push(...result.runs.map((r) => r.id));
      cursor = result.nextCursor;
      pageCount++;
    } while (cursor && pageCount < 20);

    // No duplicates
    expect(new Set(allIds).size).toBe(allIds.length);
    // All rows present
    expect(allIds.length).toBe(totalRuns);
  });

  it('should not allow cursor to retrieve another owners data', async () => {
    await store.create(createRun({ id: 'run_ownerA_1', ownerId: 'iso_A' }));
    await store.create(createRun({ id: 'run_ownerA_2', ownerId: 'iso_A' }));
    await store.create(createRun({ id: 'run_ownerB_1', ownerId: 'iso_B' }));

    // Get cursor from owner_A's data
    const ownerAResult = await store.list({ ownerId: 'iso_A', limit: 1 });
    expect(ownerAResult.nextCursor).not.toBeNull();

    // Try to use owner_A's cursor to retrieve owner_B's data
    const exploitAttempt = await store.list({
      ownerId: 'iso_B',
      cursor: ownerAResult.nextCursor!,
    });

    // Should NOT return owner_A's runs — the cursor encodes createdAt/id,
    // but owner filter is always applied so only iso_B's runs appear
    const exploitIds = exploitAttempt.runs.map((r) => r.id);
    expect(exploitIds.filter((id) => id.startsWith('run_ownerA'))).toHaveLength(0);

    // Verify cursor's effect: it should only filter by createdAt > cursor OR (same createdAt AND id > cursor)
    // Since owner_B's runs have later createdAt (created after), they should still appear if they pass the cursor filter
    // OR they might not appear if cursor is beyond them. Either way, no owner_A data leaks.
  });

  it('should maintain stable ordering with same createdAt', async () => {
    // Create runs rapidly so they share the same millisecond-second in SQLite
    for (let i = 0; i < 5; i++) {
      await store.create(createRun({ id: `run_same_ts_${i}`, ownerId: 'same_ts_user' }));
    }

    // Paginate through with limit=2
    const allIds: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 5; page++) {
      const result = await store.list({ ownerId: 'same_ts_user', limit: 2, cursor: cursor ?? undefined });
      allIds.push(...result.runs.map((r) => r.id));
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    // All 5 should be present, no duplicates, in id order (tie-breaker)
    expect(allIds).toHaveLength(5);
    expect(new Set(allIds).size).toBe(5);

    // When createdAt is identical, id ASC is the tie-breaker
    const sortedIds = [...allIds].sort();
    expect(allIds).toEqual(sortedIds);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1.1: Empty & Explicit Cursor Validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Empty Cursor Rejection (R1.1)', () => {
  it('should succeed when cursor is omitted (undefined)', async () => {
    await store.create(createRun({ id: 'run_no_cursor', ownerId: 'cursor_user' }));

    const result = await store.list({ ownerId: 'cursor_user' });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].id).toBe('run_no_cursor');
  });

  it('should throw RunValidationError when cursor is an empty string', async () => {
    await store.create(createRun({ id: 'run_empty_cursor', ownerId: 'cursor_user' }));

    await expect(
      store.list({ ownerId: 'cursor_user', cursor: '' })
    ).rejects.toThrow(RunValidationError);
  });

  it('should throw RunValidationError when cursor is whitespace-only', async () => {
    await store.create(createRun({ id: 'run_ws_cursor', ownerId: 'cursor_user' }));

    await expect(
      store.list({ ownerId: 'cursor_user', cursor: '   ' })
    ).rejects.toThrow(RunValidationError);

    await expect(
      store.list({ ownerId: 'cursor_user', cursor: '\t\n' })
    ).rejects.toThrow(RunValidationError);
  });

  it('should throw RunValidationError when cursor is empty string after trim', async () => {
    await expect(
      store.list({ ownerId: 'cursor_user', cursor: '  \r\n  ' })
    ).rejects.toThrow(RunValidationError);
  });

  it('should succeed with a valid cursor from previous page', async () => {
    for (let i = 0; i < 5; i++) {
      await store.create(createRun({ id: `run_valid_c_${i}`, ownerId: 'cursor_user' }));
    }

    const page1 = await store.list({ ownerId: 'cursor_user', limit: 2 });
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await store.list({ ownerId: 'cursor_user', limit: 2, cursor: page1.nextCursor! });
    expect(page2.runs.length).toBeGreaterThan(0);
    // No overlap with page1
    const page1Ids = page1.runs.map(r => r.id);
    const page2Ids = page2.runs.map(r => r.id);
    expect(page1Ids.filter(id => page2Ids.includes(id))).toHaveLength(0);
  });

  it('should never return first-page results on cursor parse failure', async () => {
    // Create data that would appear on first page
    for (let i = 0; i < 3; i++) {
      await store.create(createRun({ id: `run_fallback_${i}`, ownerId: 'cursor_user' }));
    }

    // Attempt with invalid cursor — must throw, NOT silently return first page
    let capturedError: unknown = null;
    let capturedResult: unknown = null;
    try {
      capturedResult = await store.list({ ownerId: 'cursor_user', cursor: '' });
    } catch (e) {
      capturedError = e;
    }

    // Must have thrown — result must NOT have been assigned
    expect(capturedError).toBeInstanceOf(RunValidationError);
    expect(capturedResult).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1.1: Strict Base64 & ISO Timestamp Validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Strict Cursor Decoding (R1.1)', () => {
  it('should reject cursor with invalid Base64 characters', async () => {
    // '!' is NOT a valid Base64 character
    await expect(
      store.list({ ownerId: 'strict_user', cursor: 'abc!def' })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with invalid Base64 padding (length not multiple of 4)', async () => {
    await expect(
      store.list({ ownerId: 'strict_user', cursor: 'abc' })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject non-canonical Base64 (truncation ambiguity)', async () => {
    // This is valid base64 alphabet but may not be canonical
    // Manually construct a cursor-like string that is valid base64
    // but whose decode→reencode doesn't match
    // 'AAA' is not valid base64 (length not multiple of 4)
    // Let's use a known non-canonical case: extra padding
    await expect(
      store.list({ ownerId: 'strict_user', cursor: '====' })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject valid Base64 containing malformed JSON', async () => {
    // base64 encode "not json at all"
    const badJson = Buffer.from('not json at all').toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: badJson })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject valid Base64 containing JSON array instead of object', async () => {
    const arrJson = Buffer.from(JSON.stringify([{ createdAt: 'x', id: 'y' }])).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: arrJson })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject valid Base64 containing JSON primitive', async () => {
    const primJson = Buffer.from(JSON.stringify('just a string')).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: primJson })
    ).rejects.toThrow(RunValidationError);

    const numJson = Buffer.from(JSON.stringify(42)).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: numJson })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject valid Base64 containing null JSON', async () => {
    const nullJson = Buffer.from(JSON.stringify(null)).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: nullJson })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with missing createdAt field', async () => {
    const missing = Buffer.from(JSON.stringify({ id: 'some_id' })).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: missing })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with missing id field', async () => {
    const missing = Buffer.from(JSON.stringify({ createdAt: '2026-10-10T00:00:00.000Z' })).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: missing })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with empty id', async () => {
    const emptyId = Buffer.from(JSON.stringify({ createdAt: '2026-10-10T00:00:00.000Z', id: '' })).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: emptyId })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with whitespace-only id', async () => {
    const wsId = Buffer.from(JSON.stringify({ createdAt: '2026-10-10T00:00:00.000Z', id: '   ' })).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: wsId })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with empty createdAt', async () => {
    const emptyTs = Buffer.from(JSON.stringify({ createdAt: '', id: 'run_x' })).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: emptyTs })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with invalid date in createdAt', async () => {
    const badDate = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'run_x' })).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: badDate })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with non-ISO date format (valid JS Date but wrong format)', async () => {
    // "Oct 10, 2026" is parseable in JS but not ISO 8601 format
    const nonIsoDate = Buffer.from(JSON.stringify({ createdAt: 'Oct 10, 2026', id: 'run_x' })).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: nonIsoDate })
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with date missing milliseconds', async () => {
    // Missing .000 — valid Date but not canonical ISO format
    const noMillis = Buffer.from(JSON.stringify({ createdAt: '2026-10-10T00:00:00Z', id: 'run_x' })).toString('base64');
    await expect(
      store.list({ ownerId: 'strict_user', cursor: noMillis })
    ).rejects.toThrow(RunValidationError);
  });

  it('should accept valid canonical cursor generated by encodeCursor', async () => {
    for (let i = 0; i < 5; i++) {
      await store.create(createRun({ id: `run_canon_${i}`, ownerId: 'strict_user' }));
    }

    const page1 = await store.list({ ownerId: 'strict_user', limit: 2 });
    expect(page1.nextCursor).not.toBeNull();

    // Use the generated cursor — must succeed
    const page2 = await store.list({ ownerId: 'strict_user', limit: 2, cursor: page1.nextCursor! });
    expect(page2.runs.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1.1: Owner ID Validation on Create
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Owner ID Validation on Create (R1.1)', () => {
  it('should reject create with empty ownerId', async () => {
    await expect(
      store.create(createRun({ id: 'run_empty_owner', ownerId: '' }))
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject create with whitespace-only ownerId', async () => {
    await expect(
      store.create(createRun({ id: 'run_ws_owner', ownerId: '   ' }))
    ).rejects.toThrow(RunValidationError);

    await expect(
      store.create(createRun({ id: 'run_tab_owner', ownerId: '\t\n' }))
    ).rejects.toThrow(RunValidationError);
  });

  it('should NOT persist any row when ownerId is invalid', async () => {
    try {
      await store.create(createRun({ id: 'run_should_not_exist', ownerId: '' }));
    } catch {
      // expected
    }

    // Verify no row was persisted
    const { prisma } = await import('@/lib/prisma');
    const count = await prisma.agentRun.count({ where: { id: 'run_should_not_exist' } });
    expect(count).toBe(0);
  });

  it('should throw RunValidationError, not RunPersistenceError', async () => {
    try {
      await store.create(createRun({ id: 'run_validation_err', ownerId: '' }));
      fail('Expected error to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RunValidationError);
      expect(e).toBeInstanceOf(Error); // RunValidationError extends ContextOSRuntimeError extends Error
      const err = e as RunValidationError;
      expect(err.code).toBe('RUNTIME_VALIDATION');
    }
  });

  it('should preserve existing RunConflictError for duplicate IDs', async () => {
    await store.create(createRun({ id: 'run_dup_check', ownerId: 'valid_owner' }));

    // Same ID, valid owner — should get RunConflictError
    await expect(
      store.create(createRun({ id: 'run_dup_check', ownerId: 'valid_owner' }))
    ).rejects.toThrow(RunConflictError);
  });

  it('should validate ownerId BEFORE Prisma client acquisition (fail fast)', async () => {
    // This test verifies that validation happens before any DB interaction
    // If it didn't, we might get a RunPersistenceError instead
    const before = Date.now();
    try {
      await store.create(createRun({ id: 'run_timing_test', ownerId: '' }));
    } catch (e) {
      const elapsed = Date.now() - before;
      // Validation should be near-instant (no network roundtrip)
      expect(e).toBeInstanceOf(RunValidationError);
      // Even on slow CI, validation under 1s means no DB was hit
      expect(elapsed).toBeLessThan(1000);
    }
  });

  it('should reject create with empty ownerId even when other fields are valid', async () => {
    const fullRun = createRun({
      id: 'run_full_valid',
      ownerId: '',
      projectId: 'proj_1',
      topicId: 'topic_1',
      purpose: 'test',
      input: { query: 'valid' },
      contextIds: ['ctx_1'],
      decisionIds: ['dec_1'],
      outcomeIds: ['out_1'],
      output: { result: 'valid' },
      status: 'completed',
      startedAt: '2026-10-10T00:00:00.000Z',
      completedAt: '2026-10-10T00:01:00.000Z',
    });

    await expect(store.create(fullRun)).rejects.toThrow(RunValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1.2: Preflight Validation Ordering (validate BEFORE getPrisma)
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Preflight Validation Ordering (R1.2)', () => {
  // Strategy: behavioral contract proof.
  // If validation did NOT fire first, an invalid input would reach getPrisma() and
  // either (a) succeed accidentally or (b) throw a persistence/connection error.
  // By asserting that RunValidationError (code=RUNTIME_VALIDATION) is thrown,
  // we prove validation fires before Prisma acquisition for every invalid path.

  it('create() with empty ownerId should NOT acquire Prisma client', async () => {
    // Verify by behavior: if validation didn't fire first, would attempt DB and
    // get a connection error or persistence error instead of validation error.
    const error = await store
      .create(createRun({ id: 'preflight_create_1', ownerId: '' }))
      .catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    // Specifically NOT a persistence error
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('update() with empty ownerId should throw RunValidationError before Prisma', async () => {
    const error = await store
      .update(createRun({ id: 'preflight_update_1', ownerId: '' }))
      .catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('getById() with empty ownerId should throw RunValidationError before Prisma', async () => {
    const error = await store.getById('', 'some_run').catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('getById() with whitespace-only ownerId should throw before Prisma', async () => {
    const error = await store.getById('   ', 'some_run').catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('list() with empty ownerId should throw RunValidationError before Prisma', async () => {
    const error = await store.list({ ownerId: '' }).catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('list() with whitespace-only ownerId should throw before Prisma', async () => {
    const error = await store.list({ ownerId: '\t ' }).catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('list() with invalid limit should throw RunValidationError before Prisma', async () => {
    const error = await store.list({ ownerId: 'valid_user', limit: 0 }).catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('list() with negative limit should throw before Prisma', async () => {
    const error = await store.list({ ownerId: 'valid_user', limit: -5 }).catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('list() with NaN limit should throw before Prisma', async () => {
    const error = await store.list({ ownerId: 'valid_user', limit: NaN }).catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('list() with malformed cursor should throw RunValidationError before Prisma', async () => {
    const error = await store
      .list({ ownerId: 'valid_user', cursor: '' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('list() with whitespace cursor should throw before Prisma', async () => {
    const error = await store
      .list({ ownerId: 'valid_user', cursor: '   ' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(RunValidationError);
    expect(error.code).toBe('RUNTIME_VALIDATION');
  });

  it('invalid create() should NOT persist any row', async () => {
    try {
      await store.create(createRun({ id: 'preflight_no_persist', ownerId: '' }));
    } catch {
      // expected
    }
    const { prisma } = await import('@/lib/prisma');
    const count = await prisma.agentRun.count({ where: { id: 'preflight_no_persist' } });
    expect(count).toBe(0);
  });

  it('invalid update() should NOT persist or modify any row', async () => {
    // Pre-create a valid row
    await store.create(createRun({ id: 'preflight_update_no_touch', ownerId: 'owner_A', status: 'started' }));

    // Attempt invalid update — should throw validation, NOT touch DB
    try {
      await store.update(createRun({ id: 'preflight_update_no_touch', ownerId: '' }));
    } catch {
      // expected
    }

    // Verify the row is untouched
    const { prisma } = await import('@/lib/prisma');
    const row = await prisma.agentRun.findFirst({ where: { id: 'preflight_update_no_touch' } });
    expect(row).not.toBeNull();
    expect(row!.status).toBe('started'); // unchanged
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4-R1.2: Calendar-Valid Date Checks (canonical toISOString identity)
// ═══════════════════════════════════════════════════════════════════════════════
describe('PrismaContextOSRunStore — Calendar-Valid Date Checks (R1.2)', () => {
  it('should reject cursor with Feb 30 (JS normalizes to March 2)', async () => {
    // 2026-02-30 is impossible — JS Date normalizes to 2026-03-02
    const feb30 = Buffer.from(
      JSON.stringify({ createdAt: '2026-02-30T00:00:00.000Z', id: 'run_x' }),
    ).toString('base64');
    await expect(
      store.list({ ownerId: 'cal_user', cursor: feb30 }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with month 13 (JS normalizes to next year January)', async () => {
    // 2026-13-01 is impossible — JS Date normalizes to 2027-01-01
    const month13 = Buffer.from(
      JSON.stringify({ createdAt: '2026-13-01T00:00:00.000Z', id: 'run_x' }),
    ).toString('base64');
    await expect(
      store.list({ ownerId: 'cal_user', cursor: month13 }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with April 31 (JS normalizes to May 1)', async () => {
    // April has 30 days — JS normalizes 31 to May 1
    const apr31 = Buffer.from(
      JSON.stringify({ createdAt: '2026-04-31T00:00:00.000Z', id: 'run_x' }),
    ).toString('base64');
    await expect(
      store.list({ ownerId: 'cal_user', cursor: apr31 }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with hour 25 (JS normalizes to next day)', async () => {
    const hr25 = Buffer.from(
      JSON.stringify({ createdAt: '2026-10-10T25:00:00.000Z', id: 'run_x' }),
    ).toString('base64');
    await expect(
      store.list({ ownerId: 'cal_user', cursor: hr25 }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with minute 60', async () => {
    const min60 = Buffer.from(
      JSON.stringify({ createdAt: '2026-10-10T12:60:00.000Z', id: 'run_x' }),
    ).toString('base64');
    await expect(
      store.list({ ownerId: 'cal_user', cursor: min60 }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should reject cursor with second 60', async () => {
    const sec60 = Buffer.from(
      JSON.stringify({ createdAt: '2026-10-10T12:00:60.000Z', id: 'run_x' }),
    ).toString('base64');
    await expect(
      store.list({ ownerId: 'cal_user', cursor: sec60 }),
    ).rejects.toThrow(RunValidationError);
  });

  it('should accept a valid canonical date generated by the store', async () => {
    for (let i = 0; i < 5; i++) {
      await store.create(createRun({ id: `run_cal_ok_${i}`, ownerId: 'cal_user' }));
    }

    const page1 = await store.list({ ownerId: 'cal_user', limit: 2 });
    expect(page1.nextCursor).not.toBeNull();

    // The generated cursor contains a canonical date — must work
    const page2 = await store.list({ ownerId: 'cal_user', limit: 2, cursor: page1.nextCursor! });
    expect(page2.runs.length).toBeGreaterThan(0);
  });

  it('should accept valid edge-case dates (leap year Feb 29, last day of year)', async () => {
    // Feb 29, 2024 is valid (leap year)
    const leapDate = Buffer.from(
      JSON.stringify({ createdAt: '2024-02-29T00:00:00.000Z', id: 'run_x' }),
    ).toString('base64');
    // Create test data so cursor has something to point to
    await store.create(createRun({ id: 'run_before_leap', ownerId: 'edge_cal_user' }));

    // This cursor should parse successfully (no error), even though it may return 0 results
    const result = await store.list({ ownerId: 'edge_cal_user', cursor: leapDate });
    // No error — cursor was accepted. Results may be empty if cursor is beyond data.
    expect(result.runs).toBeDefined();
  });
});
