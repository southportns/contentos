/**
 * P0.6.3.2.1 — PrismaMemoryStore Integration Tests
 *
 * Real database integration tests using an isolated temporary SQLite database.
 * Verifies all CRUD operations, cross-user isolation, scope persistence,
 * payload integrity, and optimistic concurrency control.
 *
 * Test Strategy:
 *   1. Create isolated temp SQLite DB
 *   2. Push schema via `prisma db push --url`
 *   3. Set DATABASE_URL to temp DB
 *   4. Run integration tests
 *   5. Cleanup temp DB
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// ─── Setup Isolated Test DB ─────────────────────────────────────────────────

let tempDbPath: string;
let tempDir: string;

// Set DATABASE_URL BEFORE importing prisma (lazy singleton pattern)
function setupTestDatabase(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'p06321-memory-'));
  tempDbPath = join(tempDir, 'test.db');
  const dbUrl = `file:${tempDbPath}`;

  // Push schema to temp DB
  execSync(`npx prisma db push --accept-data-loss --force-reset --url "${dbUrl}"`, {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  // Set DATABASE_URL BEFORE importing prisma
  process.env.DATABASE_URL = dbUrl;
}

// ─── Import after DATABASE_URL is set ──────────────────────────────────────

import { PrismaMemoryStore } from '../prisma-memory-store';
import { MemoryConcurrencyError, MemoryNotFoundError } from '../memory-persistence-types';
import type { MemoryRecord } from '../../memory-record';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Reset prisma singleton reference between tests
let store: PrismaMemoryStore;

async function resetDatabase(): Promise<void> {
  // Dynamically import prisma after DATABASE_URL is set
  const { prisma } = await import('@/lib/prisma');
  // Clear all memory records
  await prisma.memoryRecord.deleteMany({});
}

function createTestRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: `mem_test_${Math.random().toString(36).slice(2, 10)}`,
    kind: 'static',
    type: 'writing_profile',
    payload: { test: true },
    scope: 'global',
    ownerId: 'user_A',
    projectId: null,
    topicId: null,
    source: 'test',
    sourceType: 'integration_test',
    derivedFrom: undefined,
    confidence: 0.8,
    importance: 0.7,
    createdAt: '2026-09-29T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
    lastAccessedAt: null,
    accessCount: 0,
    expiresAt: null,
    version: 1,
    status: 'active',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

beforeAll(() => {
  setupTestDatabase();
});

afterAll(async () => {
  // Disconnect Prisma first, then cleanup temp DB
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  } catch {
    // Ignore disconnect errors
  }

  // Retry cleanup (file may be briefly locked)
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows (locked file)
    }
  }
});

beforeEach(async () => {
  await resetDatabase();
  store = new PrismaMemoryStore();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Create
// ═══════════════════════════════════════════════════════════════════════════════

describe('create', () => {
  it('should create a basic memory record', async () => {
    const record = createTestRecord({ id: 'mem_create_1' });
    const created = await store.create(record);

    expect(created.id).toBe('mem_create_1');
    expect(created.ownerId).toBe('user_A');
    expect(created.kind).toBe('static');
    expect(created.version).toBe(1);
    expect(created.status).toBe('active');
  });

  it('should preserve all fields on create', async () => {
    const record = createTestRecord({
      id: 'mem_create_2',
      kind: 'dynamic',
      type: 'draft',
      scope: 'topic',
      ownerId: 'user_B',
      projectId: 'proj_1',
      topicId: 'topic_1',
      source: 'writing_skill',
      sourceType: 'adapter',
      derivedFrom: ['mem_parent_1'],
      confidence: 0.9,
      importance: 0.85,
      accessCount: 3,
      version: 1,
      status: 'active',
    });

    const created = await store.create(record);
    expect(created.id).toBe('mem_create_2');
    expect(created.scope).toBe('topic');
    expect(created.projectId).toBe('proj_1');
    expect(created.topicId).toBe('topic_1');
    expect(created.derivedFrom).toEqual(['mem_parent_1']);
    expect(created.confidence).toBe(0.9);
    expect(created.importance).toBe(0.85);
    expect(created.accessCount).toBe(3);
  });

  it('should reject create without ownerId', async () => {
    const record = createTestRecord({ id: 'mem_no_owner' });
    record.ownerId = undefined;
    await expect(store.create(record)).rejects.toThrow();
  });

  it('should preserve complex payload', async () => {
    const record = createTestRecord({
      id: 'mem_payload_test',
      payload: {
        title: '测试',
        preferences: ['短句', '直接'],
        nested: { score: 0.92, deep: { value: true } },
      },
    });

    const created = await store.create(record);
    expect(created.payload).toEqual({
      title: '测试',
      preferences: ['短句', '直接'],
      nested: { score: 0.92, deep: { value: true } },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Read (getById)
// ═══════════════════════════════════════════════════════════════════════════════

describe('getById', () => {
  it('should retrieve a record by ID for the owner', async () => {
    const record = createTestRecord({ id: 'mem_read_1', ownerId: 'user_A' });
    await store.create(record);

    const retrieved = await store.getById('mem_read_1', 'user_A');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('mem_read_1');
    expect(retrieved!.ownerId).toBe('user_A');
  });

  it('should return null for non-existent ID', async () => {
    const retrieved = await store.getById('non_existent', 'user_A');
    expect(retrieved).toBeNull();
  });

  it('should return null when querying with wrong ownerId', async () => {
    const record = createTestRecord({ id: 'mem_read_2', ownerId: 'user_A' });
    await store.create(record);

    // User B tries to read User A's memory
    const retrieved = await store.getById('mem_read_2', 'user_B');
    expect(retrieved).toBeNull();
  });

  it('should preserve scope after retrieval', async () => {
    const record = createTestRecord({
      id: 'mem_scope_test',
      scope: 'topic',
      projectId: 'proj_1',
      topicId: 'topic_1',
    });
    await store.create(record);

    const retrieved = await store.getById('mem_scope_test', 'user_A');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.scope).toBe('topic');
    expect(retrieved!.projectId).toBe('proj_1');
    expect(retrieved!.topicId).toBe('topic_1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Update + Optimistic Concurrency
// ═══════════════════════════════════════════════════════════════════════════════

describe('update', () => {
  it('should update a record and increment version', async () => {
    const record = createTestRecord({ id: 'mem_update_1', version: 1 });
    await store.create(record);

    const updated = await store.update(
      { ...record, type: 'updated_type', confidence: 0.95 },
      1,
    );

    expect(updated.type).toBe('updated_type');
    expect(updated.confidence).toBe(0.95);
    expect(updated.version).toBe(2);
  });

  it('should reject update with stale version (concurrency conflict)', async () => {
    const record = createTestRecord({ id: 'mem_update_2', version: 1 });
    await store.create(record);

    // First update succeeds (version 1 → 2)
    await store.update({ ...record, type: 'first_update' }, 1);

    // Second update with same expectedVersion should fail
    await expect(
      store.update({ ...record, type: 'second_update' }, 1),
    ).rejects.toThrow(MemoryConcurrencyError);
  });

  it('should reject update for non-existent record', async () => {
    const record = createTestRecord({ id: 'mem_nonexistent', version: 1 });
    await expect(store.update(record, 1)).rejects.toThrow(MemoryNotFoundError);
  });

  it('should preserve ownerId during update', async () => {
    const record = createTestRecord({
      id: 'mem_update_3',
      ownerId: 'user_A',
      version: 1,
    });
    await store.create(record);

    const updated = await store.update(
      { ...record, ownerId: 'user_A', source: 'updated_source' },
      1,
    );

    expect(updated.ownerId).toBe('user_A');
    expect(updated.source).toBe('updated_source');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Delete
// ═══════════════════════════════════════════════════════════════════════════════

describe('delete', () => {
  it('should delete a record by ID and ownerId', async () => {
    const record = createTestRecord({ id: 'mem_delete_1' });
    await store.create(record);

    await store.delete('mem_delete_1', 'user_A');

    const retrieved = await store.getById('mem_delete_1', 'user_A');
    expect(retrieved).toBeNull();
  });

  it('should be idempotent (no error if record not found)', async () => {
    await expect(store.delete('non_existent', 'user_A')).resolves.not.toThrow();
  });

  it('should NOT delete another users record', async () => {
    const record = createTestRecord({ id: 'mem_delete_2', ownerId: 'user_A' });
    await store.create(record);

    // User B tries to delete User A's memory
    await store.delete('mem_delete_2', 'user_B');

    // Record should still exist for user A
    const retrieved = await store.getById('mem_delete_2', 'user_A');
    expect(retrieved).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Count
// ═══════════════════════════════════════════════════════════════════════════════

describe('count', () => {
  it('should return 0 for user with no memories', async () => {
    const count = await store.count('user_empty');
    expect(count).toBe(0);
  });

  it('should count only the owners memories', async () => {
    await store.create(createTestRecord({ id: 'mem_count_1', ownerId: 'user_A' }));
    await store.create(createTestRecord({ id: 'mem_count_2', ownerId: 'user_A' }));
    await store.create(createTestRecord({ id: 'mem_count_3', ownerId: 'user_B' }));

    expect(await store.count('user_A')).toBe(2);
    expect(await store.count('user_B')).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-User Isolation (P0 Security)
// ═══════════════════════════════════════════════════════════════════════════════

describe('cross-user isolation', () => {
  it('global memory: user A cannot read user B', async () => {
    const record = createTestRecord({
      id: 'mem_iso_global',
      scope: 'global',
      ownerId: 'user_B',
    });
    await store.create(record);

    const result = await store.getById('mem_iso_global', 'user_A');
    expect(result).toBeNull();
  });

  it('project memory: user A cannot read user B', async () => {
    const record = createTestRecord({
      id: 'mem_iso_project',
      scope: 'project',
      projectId: 'proj_1',
      ownerId: 'user_B',
    });
    await store.create(record);

    const result = await store.getById('mem_iso_project', 'user_A');
    expect(result).toBeNull();
  });

  it('topic memory: user A cannot read user B', async () => {
    const record = createTestRecord({
      id: 'mem_iso_topic',
      scope: 'topic',
      projectId: 'proj_1',
      topicId: 'topic_1',
      ownerId: 'user_B',
    });
    await store.create(record);

    const result = await store.getById('mem_iso_topic', 'user_A');
    expect(result).toBeNull();
  });

  it('user A count does not include user B memories', async () => {
    await store.create(createTestRecord({ id: 'mem_iso_a1', ownerId: 'user_A' }));
    await store.create(createTestRecord({ id: 'mem_iso_a2', ownerId: 'user_A' }));
    await store.create(createTestRecord({ id: 'mem_iso_b1', ownerId: 'user_B' }));
    await store.create(createTestRecord({ id: 'mem_iso_b2', ownerId: 'user_B' }));
    await store.create(createTestRecord({ id: 'mem_iso_b3', ownerId: 'user_B' }));

    expect(await store.count('user_A')).toBe(2);
    expect(await store.count('user_B')).toBe(3);
  });

  it('user A cannot update user B memory', async () => {
    const record = createTestRecord({
      id: 'mem_iso_update',
      ownerId: 'user_B',
      version: 1,
    });
    await store.create(record);

    // User A tries to update with wrong ownerId
    await expect(
      store.update({ ...record, ownerId: 'user_A' }, 1),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scope Persistence
// ═══════════════════════════════════════════════════════════════════════════════

describe('scope persistence', () => {
  it('should preserve global scope after save/load', async () => {
    const record = createTestRecord({
      id: 'mem_scope_global',
      scope: 'global',
      projectId: null,
      topicId: null,
    });
    await store.create(record);

    const retrieved = await store.getById('mem_scope_global', 'user_A');
    expect(retrieved!.scope).toBe('global');
    expect(retrieved!.projectId).toBeNull();
    expect(retrieved!.topicId).toBeNull();
  });

  it('should preserve project scope after save/load', async () => {
    const record = createTestRecord({
      id: 'mem_scope_project',
      scope: 'project',
      projectId: 'proj_P1',
      topicId: null,
    });
    await store.create(record);

    const retrieved = await store.getById('mem_scope_project', 'user_A');
    expect(retrieved!.scope).toBe('project');
    expect(retrieved!.projectId).toBe('proj_P1');
  });

  it('should preserve topic scope after save/load', async () => {
    const record = createTestRecord({
      id: 'mem_scope_topic',
      scope: 'topic',
      projectId: 'proj_P1',
      topicId: 'topic_T1',
    });
    await store.create(record);

    const retrieved = await store.getById('mem_scope_topic', 'user_A');
    expect(retrieved!.scope).toBe('topic');
    expect(retrieved!.projectId).toBe('proj_P1');
    expect(retrieved!.topicId).toBe('topic_T1');
  });

  it('should preserve session scope after save/load', async () => {
    const record = createTestRecord({
      id: 'mem_scope_session',
      scope: 'session',
    });
    await store.create(record);

    const retrieved = await store.getById('mem_scope_session', 'user_A');
    expect(retrieved!.scope).toBe('session');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Payload / derivedFrom Persistence
// ═══════════════════════════════════════════════════════════════════════════════

describe('payload / derivedFrom persistence', () => {
  it('should preserve complex nested payload', async () => {
    const record = createTestRecord({
      id: 'mem_payload_1',
      payload: {
        title: '测试',
        preferences: ['短句', '直接'],
        nested: { score: 0.92 },
      },
    });
    await store.create(record);

    const retrieved = await store.getById('mem_payload_1', 'user_A');
    expect(retrieved!.payload).toEqual({
      title: '测试',
      preferences: ['短句', '直接'],
      nested: { score: 0.92 },
    });
  });

  it('should preserve derivedFrom array', async () => {
    const record = createTestRecord({
      id: 'mem_derived_1',
      derivedFrom: ['mem_ancestor_1', 'mem_ancestor_2', 'mem_ancestor_3'],
    });
    await store.create(record);

    const retrieved = await store.getById('mem_derived_1', 'user_A');
    expect(retrieved!.derivedFrom).toEqual([
      'mem_ancestor_1',
      'mem_ancestor_2',
      'mem_ancestor_3',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DateTime Persistence
// ═══════════════════════════════════════════════════════════════════════════════

describe('datetime persistence', () => {
  it('should preserve createdAt timestamp semantically', async () => {
    const record = createTestRecord({
      id: 'mem_dt_1',
      createdAt: '2026-09-29T08:30:00.000Z',
    });
    await store.create(record);

    const retrieved = await store.getById('mem_dt_1', 'user_A');
    expect(retrieved!.createdAt).toBe('2026-09-29T08:30:00.000Z');
  });

  it('should preserve updatedAt timestamp semantically', async () => {
    const record = createTestRecord({
      id: 'mem_dt_2',
      updatedAt: '2026-09-29T09:45:00.000Z',
    });
    await store.create(record);

    const retrieved = await store.getById('mem_dt_2', 'user_A');
    expect(retrieved!.updatedAt).toBe('2026-09-29T09:45:00.000Z');
  });

  it('should preserve lastAccessedAt timestamp', async () => {
    const record = createTestRecord({
      id: 'mem_dt_3',
      lastAccessedAt: '2026-09-29T12:00:00.000Z',
    });
    await store.create(record);

    const retrieved = await store.getById('mem_dt_3', 'user_A');
    expect(retrieved!.lastAccessedAt).toBe('2026-09-29T12:00:00.000Z');
  });

  it('should preserve expiresAt timestamp', async () => {
    const record = createTestRecord({
      id: 'mem_dt_4',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    await store.create(record);

    const retrieved = await store.getById('mem_dt_4', 'user_A');
    expect(retrieved!.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });

  it('should preserve null timestamps', async () => {
    const record = createTestRecord({
      id: 'mem_dt_5',
      lastAccessedAt: null,
      expiresAt: null,
    });
    await store.create(record);

    const retrieved = await store.getById('mem_dt_5', 'user_A');
    expect(retrieved!.lastAccessedAt).toBeNull();
    expect(retrieved!.expiresAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Version / OCC
// ═══════════════════════════════════════════════════════════════════════════════

describe('version and optimistic concurrency', () => {
  it('should start with version 1 on create', async () => {
    const record = createTestRecord({ id: 'mem_ver_1', version: 1 });
    const created = await store.create(record);
    expect(created.version).toBe(1);
  });

  it('should increment version on each update', async () => {
    const record = createTestRecord({ id: 'mem_ver_2', version: 1 });
    await store.create(record);

    const v2 = await store.update(record, 1);
    expect(v2.version).toBe(2);

    const v3 = await store.update(v2, 2);
    expect(v3.version).toBe(3);
  });

  it('should reject concurrent update (same expectedVersion)', async () => {
    const record = createTestRecord({ id: 'mem_ver_3', version: 1 });
    await store.create(record);

    // Both try to update from version 1
    const p1 = store.update({ ...record, source: 'update_1' }, 1);
    const p2 = store.update({ ...record, source: 'update_2' }, 1);

    const results = await Promise.allSettled([p1, p2]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Exactly one should succeed, one should fail
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      MemoryConcurrencyError,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Status Persistence
// ═══════════════════════════════════════════════════════════════════════════════

describe('status persistence', () => {
  it('should default to active status', async () => {
    const record = createTestRecord({ id: 'mem_status_1' });
    const created = await store.create(record);
    expect(created.status).toBe('active');
  });

  it('should persist non-active status', async () => {
    for (const status of ['superseded', 'expired', 'archived'] as const) {
      const record = createTestRecord({
        id: `mem_status_${status}`,
        status,
      });
      await store.create(record);

      const retrieved = await store.getById(`mem_status_${status}`, 'user_A');
      expect(retrieved!.status).toBe(status);
    }
  });
});
