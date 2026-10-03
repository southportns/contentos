/**
 * P0.6.5.5-R2.1 — Prisma Memory Store Exact-ID Integration Tests
 *
 * Real database integration tests that verify buildWhereClause() correctly
 * propagates criteria.id into the Prisma WHERE clause:
 *
 *   WHERE ownerId = ? AND id = ?
 *
 * Test Categories:
 *   P1. Exact ID propagation
 *   P2. Owner + ID isolation
 *   P3. Wrong owner → zero rows
 *   P4. Match → exactly one row
 *   P5. ID + type filter
 *   P6. ID + status filter
 *   P7. ID + project/topic scope
 *   R1. 1000+ record regression
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// ─── Setup Isolated Test DB ─────────────────────────────────────────────────
// Throws on failure (no silent skip)

let tempDbPath: string;
let tempDir: string;

function setupTestDatabase(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'p0655-r21-'));
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
import { createMemoryRecord } from '../memory-factory';
import type { MemoryRecord } from '../memory-record';
import type { MemoryStatus } from '../memory-record';
import type { MemoryScope } from '../memory-scope';

// ─── State ─────────────────────────────────────────────────────────────────

let store: PrismaMemoryStore;
let retriever: DatabaseMemoryRetriever;

beforeAll(async () => {
  setupTestDatabase();

  // Verify DB is accessible — throw if not
  const { prisma } = await import('@/lib/prisma');
  await prisma.memoryRecord.count();

  store = new PrismaMemoryStore();
  retriever = new DatabaseMemoryRetriever(store);
});

afterAll(() => {
  // Cleanup temp DB on best-effort basis (Windows may lock the file briefly)
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (file locks on Windows)
    }
  }
});

async function resetDatabase(): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.memoryRecord.deleteMany({});
}

beforeEach(async () => {
  await resetDatabase();
});

// ─── Helper: Create a generic memory record (non-decision) ─────────────────

function createGenericRecord(opts: {
  id: string;
  ownerId: string;
  type: string;
  scope?: string;
  projectId?: string;
  topicId?: string;
  status?: MemoryStatus;
  confidence?: number;
  importance?: number;
}): MemoryRecord {
  return createMemoryRecord({
    id: opts.id,
    kind: 'static',
    type: opts.type,
    payload: { content: `Record ${opts.id}` },
    ownerId: opts.ownerId,
    scope: (opts.scope ?? 'global') as MemoryScope,
    projectId: opts.projectId,
    topicId: opts.topicId,
    status: opts.status ?? 'active',
    confidence: opts.confidence ?? 0.5,
    importance: opts.importance ?? 0.5,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// P1. Exact ID Propagation
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRISMA-P1. Exact ID Propagation', () => {
  it('P1: criteria.id → WHERE id → returns matching record', async () => {
    const record = createGenericRecord({
      id: 'target-record',
      ownerId: 'user-A',
      type: 'generic',
    });
    await store.create(record);

    const results = await store.findMany({
      ownerId: 'user-A',
      id: 'target-record',
      take: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('target-record');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P2. Owner + ID Isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRISMA-P2. Owner + ID Isolation', () => {
  it('P2: record exists for user-B, query user-A → zero rows', async () => {
    const record = createGenericRecord({
      id: 'shared-id-record',
      ownerId: 'user-B',
      type: 'generic',
    });
    await store.create(record);

    // Query with user-A's ownership but an existing record's ID
    const results = await store.findMany({
      ownerId: 'user-A',
      id: 'shared-id-record',
      take: 10,
    });

    expect(results).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3. Wrong Owner → Zero Rows
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRISMA-P3. Wrong Owner → Zero Rows', () => {
  it('P3: ownerId mismatch with matching criteria.id → 0 records', async () => {
    const record = createGenericRecord({
      id: 'decision-B',
      ownerId: 'user-B',
      type: 'decision',
    });
    await store.create(record);

    const results = await store.findMany({
      ownerId: 'user-A',
      id: 'decision-B',
      take: 1,
    });

    // Critical: ownerId + id combo must NOT leak cross-user records
    expect(results).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P4. Match → Exactly One Row
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRISMA-P4. Match → Exactly One Row', () => {
  it('P4: matching owner + matching id → one row with correct data', async () => {
    const record = createGenericRecord({
      id: 'exactly-one',
      ownerId: 'user-C',
      type: 'generic',
      confidence: 0.99,
      importance: 0.99,
    });
    await store.create(record);

    const results = await store.findMany({
      ownerId: 'user-C',
      id: 'exactly-one',
      take: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].ownerId).toBe('user-C');
    expect(results[0].id).toBe('exactly-one');
    expect(results[0].confidence).toBe(0.99);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P5. ID + Type Filter
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRISMA-P5. ID + Type Filter', () => {
  it('P5: id matches but type filter excludes it → zero rows', async () => {
    const decision = createGenericRecord({
      id: 'type-mismatch',
      ownerId: 'user-D',
      type: 'decision',
    });
    await store.create(decision);

    // Request id + types:['outcome'] — decision is NOT an outcome
    const results = await store.findMany({
      ownerId: 'user-D',
      id: 'type-mismatch',
      types: ['outcome'],
      take: 10,
    });

    expect(results).toHaveLength(0);
  });

  it('P5b: id matches AND type includes decision → one row', async () => {
    const decision = createGenericRecord({
      id: 'type-match',
      ownerId: 'user-D',
      type: 'decision',
    });
    await store.create(decision);

    const results = await store.findMany({
      ownerId: 'user-D',
      id: 'type-match',
      types: ['outcome', 'decision'],
      take: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('type-match');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P6. ID + Status Filter
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRISMA-P6. ID + Status Filter', () => {
  it('P6: id matches but status filter excludes it → zero rows', async () => {
    const record = createGenericRecord({
      id: 'status-superseded',
      ownerId: 'user-E',
      type: 'generic',
      status: 'superseded',
    });
    await store.create(record);

    // Default status filter (active only from the store's perspective when
    // passed through retriever), but direct store call with status:['active']
    const results = await store.findMany({
      ownerId: 'user-E',
      id: 'status-superseded',
      status: ['active'],
      take: 10,
    });

    expect(results).toHaveLength(0);
  });

  it('P6b: id matches AND status includes superseded → one row', async () => {
    const record = createGenericRecord({
      id: 'status-included',
      ownerId: 'user-E',
      type: 'generic',
      status: 'superseded',
    });
    await store.create(record);

    const results = await store.findMany({
      ownerId: 'user-E',
      id: 'status-included',
      status: ['active', 'superseded'],
      take: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('status-included');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P7. ID + Project/Topic Scope
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRISMA-P7. ID + Project/Topic Scope', () => {
  it('P7: id + projectId → only records matching both conditions', async () => {
    const recordA = createGenericRecord({
      id: 'scope-record',
      ownerId: 'user-F',
      type: 'generic',
      scope: 'project',
      projectId: 'proj-X',
    });
    await store.create(recordA);

    // Match: owner + id + correct projectId
    const resultMatch = await store.findMany({
      ownerId: 'user-F',
      id: 'scope-record',
      allowedScopes: ['global', 'project', 'topic'],
      projectId: 'proj-X',
      take: 10,
    });
    expect(resultMatch).toHaveLength(1);

    // No match: owner + id + wrong projectId
    const resultMismatch = await store.findMany({
      ownerId: 'user-F',
      id: 'scope-record',
      allowedScopes: ['global', 'project', 'topic'],
      projectId: 'proj-Y',
      take: 10,
    });
    expect(resultMismatch).toHaveLength(0);
  });

  it('P7b: id + projectId + topicId → narrow scope correctly', async () => {
    const record = createGenericRecord({
      id: 'scope-topic-record',
      ownerId: 'user-G',
      type: 'generic',
      scope: 'topic',
      projectId: 'proj-A',
      topicId: 'topic-1',
    });
    await store.create(record);

    const results = await store.findMany({
      ownerId: 'user-G',
      id: 'scope-topic-record',
      allowedScopes: ['global', 'project', 'topic'],
      projectId: 'proj-A',
      topicId: 'topic-1',
      take: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].topicId).toBe('topic-1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R1. 1000+ Record Regression
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRISMA-R1. 1000+ Record Regression', { timeout: 60000 }, () => {
  it('R1: exact-id retrieval returns target among 1000+ noise records', async () => {
    // Create target
    const targetId = 'DECISION-TARGET_R1';
    const target = createGenericRecord({
      id: targetId,
      ownerId: 'regression-user',
      type: 'decision',
      confidence: 0.85,
      importance: 0.80,
    });
    await store.create(target);

    // Create 1000 noise records with the same owner
    for (let i = 0; i < 1000; i++) {
      const noise = createGenericRecord({
        id: `noise-${i}`,
        ownerId: 'regression-user',
        type: i % 2 === 0 ? 'outcome' : 'decision',
        confidence: Math.random() * 0.5,
        importance: Math.random() * 0.5,
      });
      await store.create(noise);
    }

    // Execute exact-ID query via retriever
    const results = await retriever.retrieve({
      ownerId: 'regression-user',
      id: targetId,
      policy: {
        maxResults: 1,
        types: ['decision'],
        includeSuperseded: true,
        includeArchived: true,
      },
    });

    // Assert exactly one record — no dependency on sorting/top-N
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(targetId);
    expect(results[0].ownerId).toBe('regression-user');
  });

  it('R1b: wrong owner + correct id amongst 1000 records → 0 rows', async () => {
    const targetId = 'WRONG-OWNER-TEST';
    const target = createGenericRecord({
      id: targetId,
      ownerId: 'real-owner',
      type: 'decision',
    });
    await store.create(target);

    // Add 1000 more records
    for (let i = 0; i < 1000; i++) {
      await store.create(createGenericRecord({
        id: `filler-${i}`,
        ownerId: 'real-owner',
        type: 'decision',
      }));
    }

    // Different owner queries the exact ID
    const results = await store.findMany({
      ownerId: 'intruder',
      id: targetId,
      take: 1,
    });

    expect(results).toHaveLength(0);
  });
});
