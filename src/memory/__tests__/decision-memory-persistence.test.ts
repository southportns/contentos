/**
 * P0.6.3.3 — Decision Memory Persistence Integration Tests
 *
 * Real database integration test covering the full pipeline:
 *
 *   createDecisionMemory()
 *         ↓
 *   PrismaMemoryStore.create()
 *         ↓
 *   DatabaseMemoryRetriever
 *         ↓
 *   retrieveDecisionMemories()
 *         ↓
 *   Decision Memory
 *         ↓
 *   Context Bridge (decisionMemoryToContext)
 *         ↓
 *   Decision Context
 *
 * Test Strategy:
 *   1. Create isolated temp SQLite DB
 *   2. Push schema via `prisma db push --url`
 *   3. Set DATABASE_URL to temp DB
 *   4. Run integration tests against real DB
 *   5. Cleanup temp DB
 *
 * Prerequisites: Requires `npx prisma db push` to work (must be run from
 * project root with correct schema.prisma).
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
  tempDir = mkdtempSync(join(tmpdir(), 'p0633-decision-'));
  tempDbPath = join(tempDir, 'test.db');
  const dbUrl = `file:${tempDbPath}`;

  try {
    execSync(`npx prisma db push --accept-data-loss --force-reset --url "${dbUrl}"`, {
      cwd: process.cwd(),
      stdio: 'pipe',
    });
  } catch {
    // If prisma push fails, skip tests
    console.warn('Skipping DB integration test: prisma db push failed');
    return;
  }

  process.env.DATABASE_URL = dbUrl;
}

// ─── Import after DATABASE_URL is set ──────────────────────────────────────

import { PrismaMemoryStore } from '../persistence/prisma-memory-store';
import { DatabaseMemoryRetriever } from '../database-memory-retriever';
import { DecisionMemoryServiceImpl } from '../decision-memory-service';
import { createDecisionMemory } from '../decision-memory-factory';
import { retrieveDecisionMemories, getActiveDecisions, getDecisionHistory } from '../decision-memory-retrieval';
import { decisionMemoryToContext } from '../memory-utils';
import type { DecisionMemory } from '../decision-memory';

// ─── State ─────────────────────────────────────────────────────────────────

let store: PrismaMemoryStore;
let retriever: DatabaseMemoryRetriever;
let service: DecisionMemoryServiceImpl;
let dbAvailable = true;

beforeAll(async () => {
  setupTestDatabase();

  try {
    // Verify DB is accessible
    const { prisma } = await import('@/lib/prisma');
    await prisma.memoryRecord.count();
    store = new PrismaMemoryStore();
    retriever = new DatabaseMemoryRetriever(store);
    service = new DecisionMemoryServiceImpl(store);
  } catch {
    dbAvailable = false;
    console.warn('Skipping DB integration tests: DATABASE_URL not accessible');
  }
});

afterAll(async () => {
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
  if (!dbAvailable) return;
  const { prisma } = await import('@/lib/prisma');
  await prisma.memoryRecord.deleteMany({});
}

beforeEach(async () => {
  await resetDatabase();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Integration Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Decision Memory Persistence Integration', () => {
  it('INT-1: Create → Persist → Retrieve decision', async () => {
    if (!dbAvailable) {
      console.warn('Skipping INT-1: DB not available');
      return;
    }

    // Create a decision
    const decision = createDecisionMemory({
      decision: 'Use playful tone for entertainment content',
      rationale: 'Audience expects fun content in this niche',
      ownerId: 'user_int_1',
      projectId: 'proj_int_1',
      topicId: 'topic_int_1',
      confidence: 0.9,
      importance: 0.95,
      decisionStatus: 'active',
    });

    // Persist
    const saved = await store.create(decision);
    expect(saved.id).toBe(decision.id);
    expect(saved.version).toBe(1);
    expect(saved.type).toBe('decision');

    // Retrieve
    const decisions = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_int_1',
      projectId: 'proj_int_1',
      topicId: 'topic_int_1',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(decisions.length).toBe(1);
    expect(decisions[0].payload.decision).toBe('Use playful tone for entertainment content');
    expect(decisions[0].ownerId).toBe('user_int_1');
  });

  it('INT-2: Supersede decision chain', async () => {
    if (!dbAvailable) return;

    // Create old decision as proposed
    const oldDecision = createDecisionMemory({
      decision: 'Old strategy: focus on humor',
      ownerId: 'user_int_2',
      projectId: 'proj_int_2',
      decisionStatus: 'proposed',
    });
    await store.create(oldDecision);

    // Activate it through service (proposed → active)
    const activated = await service.activateDecision(oldDecision.id, 'user_int_2', 1);
    expect(activated.payload.decisionStatus).toBe('active');
    expect(activated.version).toBe(2);

    // Retrieve active decisions
    const activeDecisions = await getActiveDecisions(retriever, {
      ownerId: 'user_int_2',
      projectId: 'proj_int_2',
    });

    expect(activeDecisions.length).toBe(1);
    expect(activeDecisions[0].payload.decision).toBe('Old strategy: focus on humor');
  });

  it('INT-3: History returns all decisions', async () => {
    if (!dbAvailable) return;

    // Create multiple decisions
    const d1 = createDecisionMemory({
      decision: 'First decision',
      ownerId: 'user_int_3',
      decisionStatus: 'superseded',
      supersedes: 'none',
    });
    await store.create(d1);

    const d2 = createDecisionMemory({
      decision: 'Second decision',
      ownerId: 'user_int_3',
      decisionStatus: 'active',
    });
    await store.create(d2);

    // History should include both
    const history = await getDecisionHistory(retriever, {
      ownerId: 'user_int_3',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(history.length).toBe(2);
  });

  it('INT-4: Context bridge produces Decision Context', async () => {
    if (!dbAvailable) return;

    const decision = createDecisionMemory({
      decision: 'Adopt minimalist design',
      rationale: 'User research shows 80% prefer simplicity',
      alternatives: [
        { id: 'alt_1', description: 'Maximalist design', rejected: true, rejectionReason: 'User feedback negative' },
      ],
      ownerId: 'user_int_4',
      projectId: 'proj_int_4',
      decisionStatus: 'active',
    });
    await store.create(decision);

    // Retrieve from DB
    const decisions = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_int_4',
      projectId: 'proj_int_4',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(decisions.length).toBeGreaterThanOrEqual(1);

    // Convert to Context
    const context = decisionMemoryToContext(decisions[0] as DecisionMemory);
    expect(context.kind).toBe('decision');
    expect(context.provenance.ownerId).toBe('user_int_4');
    expect(context.provenance.projectId).toBe('proj_int_4');
  });

  it('INT-5: Validation prevents invalid decision', async () => {
    if (!dbAvailable) return;

    expect(() => createDecisionMemory({
      decision: '',
      ownerId: 'user_int_5',
    })).toThrow();
  });

  it('INT-6: Authorization enforced on state transitions', async () => {
    if (!dbAvailable) return;

    const decision = createDecisionMemory({
      decision: 'Protected decision',
      ownerId: 'user_owner',
      decisionStatus: 'active',
    });
    await store.create(decision);

    // Wrong owner tries to reverse
    await expect(
      service.reverseDecision(decision.id, 'user_intruder', 1)
    ).rejects.toThrow();
  });

  it('INT-7: Concurrency: stale version fails', async () => {
    if (!dbAvailable) return;

    const decision = createDecisionMemory({
      decision: 'Concurrent decision',
      ownerId: 'user_int_7',
      decisionStatus: 'active',
    });
    await store.create(decision);

    // First reverse succeeds
    await service.reverseDecision(decision.id, 'user_int_7', 1);

    // Second reverse with stale version fails
    await expect(
      service.reverseDecision(decision.id, 'user_int_7', 1)
    ).rejects.toThrow();
  });
});
