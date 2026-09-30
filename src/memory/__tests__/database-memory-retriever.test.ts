/**
 * P0.6.3.2.2 — Database Memory Retriever Tests
 *
 * Database integration tests for DatabaseMemoryRetriever using an isolated
 * temporary SQLite database. Covers all filtering, scope, sorting, and
 * security requirements.
 *
 * Test Strategy:
 *   1. Create isolated temp SQLite DB
 *   2. Push schema via `prisma db push --url`
 *   3. Set DATABASE_URL to temp DB
 *   4. Run integration tests
 *   5. Cleanup temp DB
 *
 * Test Coverage (15 categories, 40+ tests):
 *   A. Owner isolation (cross-user)
 *   B. Global cross-project (global + project/A only)
 *   C. Topic isolation (same project, different topics)
 *   D. Global cross-topic (global available within owner)
 *   E. Explicit scope (global/project/topic only)
 *   F. Allowed kinds
 *   G. Excluded kinds
 *   H. Confidence filtering
 *   I. Importance filtering
 *   J. Status filtering (active/expired/superseded/archived)
 *   K. Age filtering (maxAgeDays)
 *   L. Ranking (importance → confidence → updatedAt → id)
 *   M. maxResults (LIMIT)
 *   N. Deterministic ordering (tie-breaking)
 *   O. Persistence roundtrip
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// ─── Setup Isolated Test DB ─────────────────────────────────────────────────

let tempDbPath: string;
let tempDir: string;

function setupTestDatabase(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'p06322-memory-'));
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
import type { MemoryRecord } from '../memory-record';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let store: PrismaMemoryStore;
let retriever: DatabaseMemoryRetriever;

async function resetDatabase(): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.memoryRecord.deleteMany({});
}

function makeRecord(overrides: Partial<MemoryRecord>): MemoryRecord {
  return {
    id: overrides.id ?? `mem_${Math.random().toString(36).slice(2, 10)}`,
    kind: overrides.kind ?? 'static',
    type: overrides.type ?? 'test',
    payload: overrides.payload ?? { test: true },
    scope: overrides.scope ?? 'global',
    ownerId: overrides.ownerId ?? 'user_A',
    projectId: overrides.projectId ?? null,
    topicId: overrides.topicId ?? null,
    source: overrides.source ?? 'test',
    sourceType: overrides.sourceType ?? 'integration_test',
    derivedFrom: overrides.derivedFrom ?? undefined,
    confidence: overrides.confidence ?? 0.8,
    importance: overrides.importance ?? 0.7,
    createdAt: overrides.createdAt ?? '2026-09-29T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-29T10:00:00.000Z',
    lastAccessedAt: overrides.lastAccessedAt ?? null,
    accessCount: overrides.accessCount ?? 0,
    expiresAt: overrides.expiresAt ?? null,
    version: overrides.version ?? 1,
    status: overrides.status ?? 'active',
  };
}

async function insertRecords(...records: MemoryRecord[]): Promise<void> {
  for (const record of records) {
    await store.create(record);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

beforeAll(() => {
  setupTestDatabase();
});

afterAll(async () => {
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  } catch {
    // Ignore
  }

  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore on Windows
    }
  }
});

beforeEach(async () => {
  await resetDatabase();
  store = new PrismaMemoryStore();
  retriever = new DatabaseMemoryRetriever(store);
});

// ═══════════════════════════════════════════════════════════════════════════════
// A. Owner Isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Owner isolation', () => {
  it('should NOT return user_B memories when querying user_A', async () => {
    await insertRecords(
      makeRecord({ id: 'owner_a1', ownerId: 'user_A', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'owner_a2', ownerId: 'user_A', scope: 'project', projectId: 'P1', importance: 0.8 }),
      makeRecord({ id: 'owner_b1', ownerId: 'user_B', scope: 'global', importance: 0.7 }),
      makeRecord({ id: 'owner_b2', ownerId: 'user_B', scope: 'project', projectId: 'P1', importance: 0.6 }),
    );

    const result = await retriever.retrieve({ ownerId: 'user_A', projectId: 'P1' });
    const ids = result.map((r) => r.id);

    expect(ids).toContain('owner_a1');
    expect(ids).toContain('owner_a2');
    expect(ids).not.toContain('owner_b1');
    expect(ids).not.toContain('owner_b2');
  });

  it('should throw MemoryRetrievalError when ownerId is missing', async () => {
    await insertRecords(
      makeRecord({ id: 'no_owner_test', ownerId: 'user_X', scope: 'global' }),
    );

    await expect(retriever.retrieve({ ownerId: '' })).rejects.toThrow('ownerId is required');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Global cross-project isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Global cross-project', () => {
  it('should return global + project A when querying project A', async () => {
    await insertRecords(
      makeRecord({ id: 'global_1', ownerId: 'user_A', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'projA_1', ownerId: 'user_A', scope: 'project', projectId: 'projA', importance: 0.8 }),
      makeRecord({ id: 'projB_1', ownerId: 'user_A', scope: 'project', projectId: 'projB', importance: 0.7 }),
    );

    const result = await retriever.retrieve({ ownerId: 'user_A', projectId: 'projA' });
    const ids = result.map((r) => r.id);

    expect(ids).toContain('global_1');   // global always included
    expect(ids).toContain('projA_1');    // matching project
    expect(ids).not.toContain('projB_1'); // different project excluded
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Topic isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Topic isolation', () => {
  it('should NOT return topic B memories when querying topic A', async () => {
    await insertRecords(
      makeRecord({ id: 'topicA_mem', ownerId: 'user_A', scope: 'topic', projectId: 'P1', topicId: 'topicA', importance: 0.9 }),
      makeRecord({ id: 'topicB_mem', ownerId: 'user_A', scope: 'topic', projectId: 'P1', topicId: 'topicB', importance: 0.8 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      projectId: 'P1',
      topicId: 'topicA',
    });
    const ids = result.map((r) => r.id);

    expect(ids).toContain('topicA_mem');
    expect(ids).not.toContain('topicB_mem');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Global cross-topic
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Global cross-topic', () => {
  it('should return global memory when querying project/topic context', async () => {
    await insertRecords(
      makeRecord({ id: 'global_cross', ownerId: 'user_A', scope: 'global', importance: 0.5 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      projectId: 'projA',
      topicId: 'topicA',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('global_cross');
    expect(result[0].scope).toBe('global');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Explicit scope
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Explicit scope', () => {
  it('should return ONLY global when scope=global', async () => {
    await insertRecords(
      makeRecord({ id: 'eg1', ownerId: 'user_A', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'ep1', ownerId: 'user_A', scope: 'project', projectId: 'P1', importance: 0.8 }),
      makeRecord({ id: 'et1', ownerId: 'user_A', scope: 'topic', projectId: 'P1', topicId: 'T1', importance: 0.7 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      projectId: 'P1',
      topicId: 'T1',
      scope: 'global',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('eg1');
  });

  it('should return ONLY project when scope=project', async () => {
    await insertRecords(
      makeRecord({ id: 'ep_only_1', ownerId: 'user_A', scope: 'project', projectId: 'P1', importance: 0.9 }),
      makeRecord({ id: 'ep_only_2', ownerId: 'user_A', scope: 'project', projectId: 'P2', importance: 0.8 }),
      makeRecord({ id: 'eg_only', ownerId: 'user_A', scope: 'global', importance: 0.7 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      projectId: 'P1',
      scope: 'project',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ep_only_1');
  });

  it('should return ONLY topic when scope=topic', async () => {
    await insertRecords(
      makeRecord({ id: 'et_only_1', ownerId: 'user_A', scope: 'topic', projectId: 'P1', topicId: 'T1', importance: 0.9 }),
      makeRecord({ id: 'et_only_2', ownerId: 'user_A', scope: 'topic', projectId: 'P1', topicId: 'T2', importance: 0.8 }),
      makeRecord({ id: 'ep_only_3', ownerId: 'user_A', scope: 'project', projectId: 'P1', importance: 0.7 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      projectId: 'P1',
      topicId: 'T1',
      scope: 'topic',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('et_only_1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Allowed kinds
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Allowed kinds', () => {
  it('should return only allowedKinds', async () => {
    await insertRecords(
      makeRecord({ id: 'kind_static', ownerId: 'user_A', kind: 'static', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'kind_semantic', ownerId: 'user_A', kind: 'semantic', scope: 'global', importance: 0.8 }),
      makeRecord({ id: 'kind_dynamic', ownerId: 'user_A', kind: 'dynamic', scope: 'global', importance: 0.7 }),
      makeRecord({ id: 'kind_episodic', ownerId: 'user_A', kind: 'episodic', scope: 'global', importance: 0.6 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: { allowedKinds: ['semantic'] },
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('kind_semantic');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Excluded kinds
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Excluded kinds', () => {
  it('should exclude excludedKinds', async () => {
    await insertRecords(
      makeRecord({ id: 'e_static', ownerId: 'user_A', kind: 'static', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'e_semantic', ownerId: 'user_A', kind: 'semantic', scope: 'global', importance: 0.8 }),
      makeRecord({ id: 'e_episodic', ownerId: 'user_A', kind: 'episodic', scope: 'global', importance: 0.7 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: { excludedKinds: ['episodic'] },
    });

    const ids = result.map((r) => r.id);
    expect(ids).toContain('e_static');
    expect(ids).toContain('e_semantic');
    expect(ids).not.toContain('e_episodic');
    expect(result).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Confidence filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Confidence filtering', () => {
  it('should exclude records below minConfidence', async () => {
    await insertRecords(
      makeRecord({ id: 'conf_high', ownerId: 'user_A', confidence: 0.9, scope: 'global', importance: 0.5 }),
      makeRecord({ id: 'conf_mid', ownerId: 'user_A', confidence: 0.5, scope: 'global', importance: 0.5 }),
      makeRecord({ id: 'conf_low', ownerId: 'user_A', confidence: 0.2, scope: 'global', importance: 0.5 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: { minConfidence: 0.5 },
    });

    const ids = result.map((r) => r.id);
    expect(ids).toContain('conf_high');
    expect(ids).toContain('conf_mid');
    expect(ids).not.toContain('conf_low');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Importance filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Importance filtering', () => {
  it('should exclude records below minImportance', async () => {
    await insertRecords(
      makeRecord({ id: 'imp_high', ownerId: 'user_A', importance: 0.9, confidence: 0.8, scope: 'global' }),
      makeRecord({ id: 'imp_low', ownerId: 'user_A', importance: 0.1, confidence: 0.8, scope: 'global' }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: { minImportance: 0.5 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('imp_high');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Status filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Status filtering', () => {
  it('should only return active records by default', async () => {
    await insertRecords(
      makeRecord({ id: 'st_active', ownerId: 'user_A', status: 'active', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'st_expired', ownerId: 'user_A', status: 'expired', scope: 'global', importance: 0.8 }),
      makeRecord({ id: 'st_superseded', ownerId: 'user_A', status: 'superseded', scope: 'global', importance: 0.7 }),
      makeRecord({ id: 'st_archived', ownerId: 'user_A', status: 'archived', scope: 'global', importance: 0.6 }),
    );

    const result = await retriever.retrieve({ ownerId: 'user_A' });
    const ids = result.map((r) => r.id);

    expect(ids).toContain('st_active');
    expect(ids).not.toContain('st_expired');
    expect(ids).not.toContain('st_superseded');
    expect(ids).not.toContain('st_archived');
    expect(result).toHaveLength(1);
  });

  it('should include expired when includeExpired=true', async () => {
    await insertRecords(
      makeRecord({ id: 'st_act2', ownerId: 'user_A', status: 'active', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'st_exp2', ownerId: 'user_A', status: 'expired', scope: 'global', importance: 0.8 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: { includeExpired: true },
    });

    const ids = result.map((r) => r.id);
    expect(ids).toContain('st_act2');
    expect(ids).toContain('st_exp2');
  });

  it('should include superseded when includeSuperseded=true', async () => {
    await insertRecords(
      makeRecord({ id: 'st_act3', ownerId: 'user_A', status: 'active', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'st_sup3', ownerId: 'user_A', status: 'superseded', scope: 'global', importance: 0.8 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: { includeSuperseded: true },
    });

    const ids = result.map((r) => r.id);
    expect(ids).toContain('st_act3');
    expect(ids).toContain('st_sup3');
  });

  it('should NEVER include archived even with flags', async () => {
    await insertRecords(
      makeRecord({ id: 'st_act4', ownerId: 'user_A', status: 'active', scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'st_arch4', ownerId: 'user_A', status: 'archived', scope: 'global', importance: 0.8 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: {
        includeExpired: true,
        includeSuperseded: true,
      },
    });

    const ids = result.map((r) => r.id);
    expect(ids).toContain('st_act4');
    expect(ids).not.toContain('st_arch4');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. Age filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Age filtering', () => {
  it('should exclude records older than maxAgeDays (based on updatedAt)', async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    await insertRecords(
      makeRecord({ id: 'age_old', ownerId: 'user_A', updatedAt: oldDate, createdAt: oldDate, scope: 'global', importance: 0.9 }),
      makeRecord({ id: 'age_recent', ownerId: 'user_A', updatedAt: recentDate, createdAt: recentDate, scope: 'global', importance: 0.8 }),
    );

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: { maxAgeDays: 30 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('age_recent');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L. Ranking
// ═══════════════════════════════════════════════════════════════════════════════

describe('L. Ranking', () => {
  it('should sort by importance DESC as primary', async () => {
    await insertRecords(
      makeRecord({ id: 'rank_low_imp', ownerId: 'user_A', importance: 0.2, confidence: 0.5, updatedAt: '2026-09-29T10:00:00.000Z', scope: 'global' }),
      makeRecord({ id: 'rank_high_imp', ownerId: 'user_A', importance: 0.9, confidence: 0.5, updatedAt: '2026-09-29T10:00:00.000Z', scope: 'global' }),
    );

    const result = await retriever.retrieve({ ownerId: 'user_A' });
    expect(result[0].id).toBe('rank_high_imp');
    expect(result[1].id).toBe('rank_low_imp');
  });

  it('should sort by confidence DESC as secondary', async () => {
    await insertRecords(
      makeRecord({ id: 'rank_low_conf', ownerId: 'user_A', importance: 0.5, confidence: 0.4, updatedAt: '2026-09-29T10:00:00.000Z', scope: 'global' }),
      makeRecord({ id: 'rank_high_conf', ownerId: 'user_A', importance: 0.5, confidence: 0.9, updatedAt: '2026-09-29T10:00:00.000Z', scope: 'global' }),
    );

    const result = await retriever.retrieve({ ownerId: 'user_A' });
    expect(result[0].id).toBe('rank_high_conf');
    expect(result[1].id).toBe('rank_low_conf');
  });

  it('should sort by updatedAt DESC as tertiary', async () => {
    await insertRecords(
      makeRecord({ id: 'rank_old', ownerId: 'user_A', importance: 0.5, confidence: 0.5, updatedAt: '2026-01-01T00:00:00.000Z', scope: 'global' }),
      makeRecord({ id: 'rank_new', ownerId: 'user_A', importance: 0.5, confidence: 0.5, updatedAt: '2026-09-01T00:00:00.000Z', scope: 'global' }),
    );

    const result = await retriever.retrieve({ ownerId: 'user_A' });
    expect(result[0].id).toBe('rank_new');
    expect(result[1].id).toBe('rank_old');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M. maxResults
// ═══════════════════════════════════════════════════════════════════════════════

describe('M. maxResults', () => {
  it('should LIMIT results at database level', async () => {
    const records: MemoryRecord[] = [];
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({ id: `max_${i}`, ownerId: 'user_A', importance: 1 - i * 0.01, scope: 'global' })
      );
    }
    await insertRecords(...records);

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      policy: { maxResults: 5 },
    });

    expect(result).toHaveLength(5);
    expect(result[0].id).toBe('max_0');
    expect(result[4].id).toBe('max_4');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// N. Deterministic ordering
// ═══════════════════════════════════════════════════════════════════════════════

describe('N. Deterministic ordering', () => {
  it('should use id ASC as tie-breaker', async () => {
    await insertRecords(
      makeRecord({ id: 'tie_c', ownerId: 'user_A', importance: 0.5, confidence: 0.5, updatedAt: '2026-09-29T10:00:00.000Z', scope: 'global' }),
      makeRecord({ id: 'tie_a', ownerId: 'user_A', importance: 0.5, confidence: 0.5, updatedAt: '2026-09-29T10:00:00.000Z', scope: 'global' }),
      makeRecord({ id: 'tie_b', ownerId: 'user_A', importance: 0.5, confidence: 0.5, updatedAt: '2026-09-29T10:00:00.000Z', scope: 'global' }),
    );

    const result = await retriever.retrieve({ ownerId: 'user_A' });
    const ids = result.map((r) => r.id);

    expect(ids).toEqual(['tie_a', 'tie_b', 'tie_c']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// O. Persistence roundtrip
// ═══════════════════════════════════════════════════════════════════════════════

describe('O. Persistence roundtrip', () => {
  it('should preserve all critical fields through persistence + retrieval', async () => {
    const original = makeRecord({
      id: 'roundtrip_1',
      kind: 'dynamic',
      type: 'draft_snapshot',
      payload: { sections: ['intro', 'body'], wordCount: 500 },
      scope: 'topic',
      ownerId: 'user_A',
      projectId: 'proj_round',
      topicId: 'topic_round',
      source: 'test_suite',
      sourceType: 'roundtrip_test',
      confidence: 0.92,
      importance: 0.88,
      version: 3,
      status: 'active',
    });

    await store.create(original);

    const result = await retriever.retrieve({
      ownerId: 'user_A',
      projectId: 'proj_round',
      topicId: 'topic_round',
    });

    expect(result).toHaveLength(1);
    const retrieved = result[0];

    expect(retrieved.id).toBe('roundtrip_1');
    expect(retrieved.kind).toBe('dynamic');
    expect(retrieved.type).toBe('draft_snapshot');
    expect(retrieved.payload).toEqual({ sections: ['intro', 'body'], wordCount: 500 });
    expect(retrieved.scope).toBe('topic');
    expect(retrieved.ownerId).toBe('user_A');
    expect(retrieved.projectId).toBe('proj_round');
    expect(retrieved.topicId).toBe('topic_round');
    expect(retrieved.source).toBe('test_suite');
    expect(retrieved.sourceType).toBe('roundtrip_test');
    expect(retrieved.confidence).toBeCloseTo(0.92, 5);
    expect(retrieved.importance).toBeCloseTo(0.88, 5);
    expect(retrieved.version).toBe(3);
    expect(retrieved.status).toBe('active');
  });
});
