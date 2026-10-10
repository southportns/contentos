/**
 * P0.7.4 — Run Store Contract Tests
 *
 * Tests the ContextOSRunStore interface contract using an in-memory mock.
 * Validates the semantics that ALL implementations must satisfy:
 *   - Create / Update / GetById / List
 *   - Owner isolation
 *   - Conflict rejection (no overwrite)
 *   - Deterministic pagination
 *   - Error semantics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ContextOSRun } from '../runtime-types';
import type {
  ContextOSRunStore,
  ContextOSRunQuery,
  ContextOSRunListResult,
} from '../run-store';
import {
  RunConflictError,
  RunNotFoundError,
  RunPersistenceError,
  DEFAULT_RUN_LIMIT,
  MAX_RUN_LIMIT,
} from '../run-store';

// ═══════════════════════════════════════════════════════════════════════════════
// In-Memory Mock Store (for contract testing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * In-memory implementation of ContextOSRunStore.
 * Used to test the contract independently of Prisma.
 */
class InMemoryRunStore implements ContextOSRunStore {
  private runs: Map<string, ContextOSRun> = new Map();
  private failNext: 'create' | 'update' | null = null;

  setFailure(mode: 'create' | 'update' | null): void {
    this.failNext = mode;
  }

  async create(run: ContextOSRun): Promise<ContextOSRun> {
    if (this.failNext === 'create') {
      this.failNext = null;
      throw new RunPersistenceError('Simulated persist failure', run.id);
    }
    if (this.runs.has(run.id)) {
      throw new RunConflictError(`Run "${run.id}" already exists`, run.id);
    }
    this.runs.set(run.id, { ...run });
    return { ...run };
  }

  async update(run: ContextOSRun): Promise<ContextOSRun> {
    if (this.failNext === 'update') {
      this.failNext = null;
      throw new RunPersistenceError('Simulated persist failure', run.id);
    }
    const existing = this.runs.get(run.id);
    if (!existing || existing.ownerId !== run.ownerId) {
      throw new RunNotFoundError(`Run "${run.id}" not found for owner "${run.ownerId}"`, run.id);
    }
    this.runs.set(run.id, { ...run });
    return { ...run };
  }

  async getById(ownerId: string, runId: string): Promise<ContextOSRun | null> {
    const run = this.runs.get(runId);
    if (!run || run.ownerId !== ownerId) return null;
    return { ...run };
  }

  async list(query: ContextOSRunQuery): Promise<ContextOSRunListResult> {
    const limit = Math.min(query.limit ?? DEFAULT_RUN_LIMIT, MAX_RUN_LIMIT);

    // Filter
    let results = Array.from(this.runs.values()).filter((r) => {
      if (r.ownerId !== query.ownerId) return false;
      if (query.projectId !== undefined && r.projectId !== query.projectId) return false;
      if (query.topicId !== undefined && r.topicId !== query.topicId) return false;
      if (query.status !== undefined && r.status !== query.status) return false;
      return true;
    });

    // Sort: startedAt ASC, id ASC (deterministic)
    results.sort((a, b) => {
      if (a.startedAt !== b.startedAt) return a.startedAt.localeCompare(b.startedAt);
      return a.id.localeCompare(b.id);
    });

    // Cursor-based pagination
    if (query.cursor) {
      const decoded = decodeCursorLocal(query.cursor);
      if (decoded) {
        results = results.filter((r) => {
          if (r.startedAt > decoded.startedAt) return true;
          if (r.startedAt === decoded.startedAt && r.id > decoded.id) return true;
          return false;
        });
      }
    }

    const hasMore = results.length > limit;
    const page = results.slice(0, limit);

    return {
      runs: page.map((r) => ({ ...r })),
      nextCursor: hasMore && page.length > 0
        ? encodeCursorLocal(page[page.length - 1].startedAt, page[page.length - 1].id)
        : null,
      totalCount: -1,
    };
  }

  /** Test helper: clear all runs */
  clear(): void {
    this.runs.clear();
  }
}

function encodeCursorLocal(startedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ startedAt, id })).toString('base64');
}

function decodeCursorLocal(cursor: string): { startedAt: string; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    if (typeof decoded.startedAt === 'string' && typeof decoded.id === 'string') {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function createRun(overrides: Partial<ContextOSRun> = {}): ContextOSRun {
  return {
    id: 'run_test_1',
    ownerId: 'user_1',
    projectId: undefined,
    topicId: undefined,
    purpose: 'test_purpose',
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

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('InMemoryRunStore — Store Contract', () => {
  let store: InMemoryRunStore;

  beforeEach(() => {
    store = new InMemoryRunStore();
  });

  describe('Create', () => {
    it('should persist a run and return it', async () => {
      const run = createRun();
      const result = await store.create(run);
      expect(result.id).toBe(run.id);
      expect(result.ownerId).toBe(run.ownerId);
      expect(result.status).toBe('started');
    });

    it('should reject duplicate IDs with RunConflictError', async () => {
      const run = createRun();
      await store.create(run);
      await expect(store.create(run)).rejects.toThrow(RunConflictError);
    });

    it('should throw RunPersistenceError on simulated failure', async () => {
      store.setFailure('create');
      const run = createRun();
      await expect(store.create(run)).rejects.toThrow(RunPersistenceError);
    });
  });

  describe('Update', () => {
    it('should update an existing run', async () => {
      const run = createRun();
      await store.create(run);

      const updated = { ...run, status: 'completed' as const, completedAt: '2026-10-10T00:01:00.000Z' };
      const result = await store.update(updated);
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe('2026-10-10T00:01:00.000Z');
    });

    it('should throw RunNotFoundError for non-existent run', async () => {
      const run = createRun({ id: 'nonexistent' });
      await expect(store.update(run)).rejects.toThrow(RunNotFoundError);
    });

    it('should throw RunNotFoundError when owner does not match', async () => {
      const run = createRun({ ownerId: 'user_A' });
      await store.create(run);

      const wrongOwner = { ...run, ownerId: 'user_B' };
      await expect(store.update(wrongOwner)).rejects.toThrow(RunNotFoundError);
    });

    it('should throw RunPersistenceError on simulated update failure', async () => {
      const run = createRun();
      await store.create(run);
      store.setFailure('update');
      await expect(store.update({ ...run, status: 'failed' as const })).rejects.toThrow(RunPersistenceError);
    });
  });

  describe('GetById', () => {
    it('should return a run when owner matches', async () => {
      const run = createRun();
      await store.create(run);
      const result = await store.getById('user_1', run.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(run.id);
    });

    it('should return null when owner does not match', async () => {
      const run = createRun({ ownerId: 'user_A' });
      await store.create(run);
      const result = await store.getById('user_B', run.id);
      expect(result).toBeNull();
    });

    it('should return null for non-existent run', async () => {
      const result = await store.getById('user_1', 'does_not_exist');
      expect(result).toBeNull();
    });
  });

  describe('List', () => {
    beforeEach(async () => {
      // Create 5 runs for user_1
      for (let i = 0; i < 5; i++) {
        await store.create(createRun({
          id: `run_u1_${i}`,
          ownerId: 'user_1',
          startedAt: `2026-10-10T00:0${i}:00.000Z`,
          projectId: i % 2 === 0 ? 'proj_A' : 'proj_B',
          status: i < 3 ? 'completed' : 'failed',
        }));
      }
      // Create 2 runs for user_2 (must NOT appear in user_1 queries)
      for (let i = 0; i < 2; i++) {
        await store.create(createRun({
          id: `run_u2_${i}`,
          ownerId: 'user_2',
          startedAt: `2026-10-10T00:0${i}:00.000Z`,
        }));
      }
    });

    it('should return only runs for the queried owner', async () => {
      const result = await store.list({ ownerId: 'user_1' });
      expect(result.runs).toHaveLength(5);
      expect(result.runs.every((r) => r.ownerId === 'user_1')).toBe(true);
    });

    it('should filter by projectId', async () => {
      const result = await store.list({ ownerId: 'user_1', projectId: 'proj_A' });
      expect(result.runs.every((r) => r.projectId === 'proj_A')).toBe(true);
      expect(result.runs).toHaveLength(3); // i=0,2,4
    });

    it('should filter by status', async () => {
      const result = await store.list({ ownerId: 'user_1', status: 'failed' });
      expect(result.runs.every((r) => r.status === 'failed')).toBe(true);
      expect(result.runs).toHaveLength(2); // i=3,4
    });

    it('should respect limit', async () => {
      const result = await store.list({ ownerId: 'user_1', limit: 2 });
      expect(result.runs).toHaveLength(2);
    });

    it('should enforce MAX_RUN_LIMIT', async () => {
      const result = await store.list({ ownerId: 'user_1', limit: 999 });
      expect(result.runs.length).toBeLessThanOrEqual(MAX_RUN_LIMIT);
    });

    it('should provide deterministic ordering (startedAt ASC)', async () => {
      const result = await store.list({ ownerId: 'user_1', limit: 100 });
      for (let i = 1; i < result.runs.length; i++) {
        expect(result.runs[i].startedAt >= result.runs[i - 1].startedAt).toBe(true);
      }
    });

    it('should return nextCursor when more results exist', async () => {
      const result = await store.list({ ownerId: 'user_1', limit: 2 });
      expect(result.nextCursor).not.toBeNull();
    });

    it('should return null nextCursor when no more results', async () => {
      const result = await store.list({ ownerId: 'user_1', limit: 100 });
      expect(result.nextCursor).toBeNull();
    });

    it('should paginate correctly with cursor', async () => {
      const page1 = await store.list({ ownerId: 'user_1', limit: 2 });
      expect(page1.runs).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await store.list({ ownerId: 'user_1', limit: 2, cursor: page1.nextCursor! });
      expect(page2.runs).toHaveLength(2);
      expect(page2.nextCursor).not.toBeNull();

      const page3 = await store.list({ ownerId: 'user_1', limit: 2, cursor: page2.nextCursor! });
      expect(page3.runs).toHaveLength(1); // 5 total - 4 paginated = 1 remaining
      expect(page3.nextCursor).toBeNull();

      // No overlap across pages
      const allIds = [...page1.runs, ...page2.runs, ...page3.runs].map((r) => r.id);
      expect(new Set(allIds).size).toBe(allIds.length);
    });
  });
});
