/**
 * P0.6.3.3-R1 — Decision Memory Persistence Integration Tests (Strict)
 *
 * Real database integration tests covering the full pipeline:
 *
 *   createDecisionMemory()
 *         ↓
 *   PrismaMemoryStore.create()
 *         ↓
 *   DatabaseMemoryRetriever
 *         ↓
 *   retrieveDecisionMemories() / getActiveDecisions() / getDecisionHistory()
 *         ↓
 *   Decision Memory
 *         ↓
 *   Context Bridge (decisionMemoryToContext)
 *         ↓
 *   Decision Context
 *
 * STRICT MODE: Database initialization failure causes explicit test FAIL.
 * No silent skip. No console.warn + return. Tests prove real DB execution.
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
// THROWS on failure (no silent skip)

let tempDbPath: string;
let tempDir: string;

function setupTestDatabase(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'p0633-decision-'));
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
import { DecisionMemoryServiceImpl } from '../decision-memory-service';
import { createDecisionMemory } from '../decision-memory-factory';
import { retrieveDecisionMemories, getActiveDecisions, getDecisionHistory } from '../decision-memory-retrieval';
import { decisionMemoryToContext } from '../memory-utils';
import type { DecisionMemory } from '../decision-memory';

// ─── State ─────────────────────────────────────────────────────────────────

let store: PrismaMemoryStore;
let retriever: DatabaseMemoryRetriever;
let service: DecisionMemoryServiceImpl;

beforeAll(async () => {
  setupTestDatabase();

  // Verify DB is accessible — THROW if not
  const { prisma } = await import('@/lib/prisma');
  await prisma.memoryRecord.count();

  store = new PrismaMemoryStore();
  retriever = new DatabaseMemoryRetriever(store);
  service = new DecisionMemoryServiceImpl(store);
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
  const { prisma } = await import('@/lib/prisma');
  await prisma.memoryRecord.deleteMany({});
}

beforeEach(async () => {
  await resetDatabase();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Integration Tests — Full Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('Decision Memory Persistence Integration (P0.6.3.3-R1)', () => {
  it('INT-1: Create → Persist → Retrieve decision from real DB', async () => {
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

    const saved = await store.create(decision);
    expect(saved.id).toBe(decision.id);
    expect(saved.version).toBe(1);
    expect(saved.type).toBe('decision');

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

  it('INT-2: Full pipeline create→activate→retrieve', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Old strategy: focus on humor',
      ownerId: 'user_int_2',
      projectId: 'proj_int_2',
      decisionStatus: 'proposed',
    });
    await store.create(oldDecision);

    // Activate (proposed → active)
    const activated = await service.activateDecision(oldDecision.id, 'user_int_2', 1);
    expect(activated.payload.decisionStatus).toBe('active');
    expect(activated.version).toBe(2);

    const activeDecisions = await getActiveDecisions(retriever, {
      ownerId: 'user_int_2',
      projectId: 'proj_int_2',
    });

    expect(activeDecisions.length).toBe(1);
    expect(activeDecisions[0].payload.decision).toBe('Old strategy: focus on humor');
  });

  it('INT-3: History returns all decisions', async () => {
    const d1 = createDecisionMemory({
      decision: 'First decision',
      ownerId: 'user_int_3',
      decisionStatus: 'superseded',
      supersedes: undefined,
    });
    await store.create(d1);

    const d2 = createDecisionMemory({
      decision: 'Second decision',
      ownerId: 'user_int_3',
      decisionStatus: 'active',
    });
    await store.create(d2);

    const history = await getDecisionHistory(retriever, {
      ownerId: 'user_int_3',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(history.length).toBe(2);
  });

  it('INT-4: Context bridge produces Decision Context', async () => {
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

    const decisions = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_int_4',
      projectId: 'proj_int_4',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(decisions.length).toBeGreaterThanOrEqual(1);

    const context = decisionMemoryToContext(decisions[0] as DecisionMemory);
    expect(context.kind).toBe('decision');
    expect(context.provenance.ownerId).toBe('user_int_4');
    expect(context.provenance.projectId).toBe('proj_int_4');
  });

  it('INT-5: Validation prevents invalid decision', () => {
    expect(() => createDecisionMemory({
      decision: '',
      ownerId: 'user_int_5',
    })).toThrow();
  });

  it('INT-6: Authorization enforced on state transitions', async () => {
    const decision = createDecisionMemory({
      decision: 'Protected decision',
      ownerId: 'user_owner',
      decisionStatus: 'active',
    });
    await store.create(decision);

    await expect(
      service.reverseDecision(decision.id, 'user_intruder', 1)
    ).rejects.toThrow();
  });

  it('INT-7: Concurrency stale version fails', async () => {
    const decision = createDecisionMemory({
      decision: 'Concurrent decision',
      ownerId: 'user_int_7',
      decisionStatus: 'active',
    });
    await store.create(decision);

    await service.reverseDecision(decision.id, 'user_int_7', 1);

    await expect(
      service.reverseDecision(decision.id, 'user_int_7', 1)
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R1-S: Supersede Integration Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('R1-S: Supersede Full Lifecycle (DB)', () => {
  it('R1-S1: old active → superseded', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Strategy v1: formal tone',
      ownerId: 'user_s1',
      projectId: 'proj_s1',
      decisionStatus: 'active',
    });
    const saved = await store.create(oldDecision);
    // Decision is already active (created with status='active', version=1)

    const newDecision = createDecisionMemory({
      decision: 'Strategy v2: casual tone',
      ownerId: 'user_s1',
      projectId: 'proj_s1',
      decisionStatus: 'active',
    });

    await service.supersedeDecision(
      oldDecision.id,
      newDecision,
      'user_s1',
      saved.version,
    );

    // Verify old decision is now superseded
    const oldAfter = await store.getById(oldDecision.id, 'user_s1');
    expect(oldAfter).not.toBeNull();
    expect(oldAfter!.payload.decisionStatus).toBe('superseded');
  });

  it('R1-S2: new decision persisted to DB', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Old approach',
      ownerId: 'user_s2',
      decisionStatus: 'active',
    });
    const activated = await store.create(oldDecision);

    const newDecision = createDecisionMemory({
      decision: 'New approach',
      ownerId: 'user_s2',
      decisionStatus: 'proposed',
    });

    const result = await service.supersedeDecision(
      oldDecision.id,
      newDecision,
      'user_s2',
      activated.version,
    );

    // The new decision should be in the DB (freshly created with supersedes link)
    const newInDb = await store.getById(result.id, 'user_s2');
    expect(newInDb).not.toBeNull();
    expect(newInDb!.type).toBe('decision');
    expect(newInDb!.payload.decision).toBe('New approach');
  });

  it('R1-S3: newDecision.payload.supersedes === oldDecision.id', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Original strategy',
      ownerId: 'user_s3',
      decisionStatus: 'active',
    });
    const activated = await store.create(oldDecision);

    const newDecision = createDecisionMemory({
      decision: 'Updated strategy',
      ownerId: 'user_s3',
      decisionStatus: 'active',
    });

    const result = await service.supersedeDecision(
      oldDecision.id,
      newDecision,
      'user_s3',
      activated.version,
    );

    // The new decision's payload.supersedes must reference old decision
    const newInDb = await store.getById(result.id, 'user_s3');
    expect(newInDb).not.toBeNull();
    expect(newInDb!.payload.supersedes).toBe(oldDecision.id);
  });

  it('R1-S4: new decision owner must equal authenticated owner', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Decision by user_A',
      ownerId: 'user_A',
      decisionStatus: 'active',
    });
    const activated = await store.create(oldDecision);

    const maliciousDecision = createDecisionMemory({
      decision: 'Decision by user_B',
      ownerId: 'user_B', // WRONG owner
      decisionStatus: 'active',
    });

    await expect(
      service.supersedeDecision(oldDecision.id, maliciousDecision, 'user_A', activated.version),
    ).rejects.toThrow();

    // Old decision should remain active
    const oldAfter = await store.getById(oldDecision.id, 'user_A');
    expect(oldAfter).not.toBeNull();
    expect(oldAfter!.payload.decisionStatus).toBe('active');
  });

  it('R1-S5: old decision remains physically stored (no deletion)', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Permanent decision',
      ownerId: 'user_s5',
      decisionStatus: 'active',
    });
    const activated = await store.create(oldDecision);

    const newDecision = createDecisionMemory({
      decision: 'Replacement decision',
      ownerId: 'user_s5',
      decisionStatus: 'active',
    });

    await service.supersedeDecision(oldDecision.id, newDecision, 'user_s5', activated.version);

    // Both old and new must exist in DB
    const oldStillThere = await store.getById(oldDecision.id, 'user_s5');
    expect(oldStillThere).not.toBeNull();
    expect(oldStillThere!.payload.decisionStatus).toBe('superseded');
  });

  it('R1-S6: stale expectedVersion fails with OCC error', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Decision for OCC test',
      ownerId: 'user_s6',
      decisionStatus: 'active',
    });
    await store.create(oldDecision);
    // Decision version=1 after create

    const newDecision = createDecisionMemory({
      decision: 'New after OCC test',
      ownerId: 'user_s6',
      decisionStatus: 'active',
    });

    // Use stale version (0 instead of actual 1) — OCC must reject
    await expect(
      service.supersedeDecision(oldDecision.id, newDecision, 'user_s6', 0),
    ).rejects.toThrow();
  });

  it('R1-S7: cross-owner supersede fails', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Decision by owner_X',
      ownerId: 'owner_X',
      decisionStatus: 'active',
    });
    const activated = await store.create(oldDecision);

    const newDecision = createDecisionMemory({
      decision: 'Decision by owner_Y',
      ownerId: 'owner_Y',
      decisionStatus: 'active',
    });

    // owner_Y tries to supersede owner_X's decision (cross-owner attack)
    // This fails at Step 1: getById returns null for cross-owner lookup
    await expect(
      service.supersedeDecision(oldDecision.id, newDecision, 'owner_Y', activated.version),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R1-R: Reversed Decision Retrieval Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('R1-R: Reversed Decision Retrieval (DB)', () => {
  it('R1-R1: reversed decision persists and is retrievable', async () => {
    const decision = createDecisionMemory({
      decision: 'Decision to reverse',
      ownerId: 'user_r1',
      decisionStatus: 'active',
    });
    const saved = await store.create(decision);

    // Reverse it directly (already active)
    const reversed = await service.reverseDecision(decision.id, 'user_r1', saved.version);
    expect(reversed.payload.decisionStatus).toBe('reversed');
    expect(reversed.status).toBe('archived'); // reversed maps to archived in DB
  });

  it('R1-R2: default retrieval excludes reversed', async () => {
    const active = createDecisionMemory({
      decision: 'Active decision',
      ownerId: 'user_r2',
      decisionStatus: 'active',
    });
    await store.create(active);

    const reversed = createDecisionMemory({
      decision: 'Reversed decision',
      ownerId: 'user_r2',
      decisionStatus: 'active',
    });
    const reversedSaved = await store.create(reversed);
    await service.reverseDecision(reversed.id, 'user_r2', reversedSaved.version);

    // Default retrieval (no includeReversed) should exclude reversed
    const decisions = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_r2',
    });

    const reversedInResults = decisions.find(d => d.id === reversed.id);
    expect(reversedInResults).toBeUndefined();
  });

  it('R1-R3: includeReversed=true returns reversed decisions', async () => {
    const active = createDecisionMemory({
      decision: 'Active decision',
      ownerId: 'user_r3',
      decisionStatus: 'active',
    });
    await store.create(active);

    const reversed = createDecisionMemory({
      decision: 'Reversed decision',
      ownerId: 'user_r3',
      decisionStatus: 'active',
    });
    const reversedSaved = await store.create(reversed);
    await service.reverseDecision(reversed.id, 'user_r3', reversedSaved.version);

    // With includeReversed: true, reversed should appear
    const decisions = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_r3',
      includeReversed: true,
    });

    const reversedInResults = decisions.find(d => d.id === reversed.id);
    expect(reversedInResults).toBeDefined();
    expect(reversedInResults!.payload.decisionStatus).toBe('reversed');
  });

  it('R1-R4: getDecisionHistory returns reversed decisions', async () => {
    const d1 = createDecisionMemory({
      decision: 'Decision 1',
      ownerId: 'user_r4',
      decisionStatus: 'active',
    });
    await store.create(d1);

    const d2 = createDecisionMemory({
      decision: 'Decision 2 (reversed)',
      ownerId: 'user_r4',
      decisionStatus: 'active',
    });
    const d2Saved = await store.create(d2);
    await service.reverseDecision(d2.id, 'user_r4', d2Saved.version);

    const history = await getDecisionHistory(retriever, {
      ownerId: 'user_r4',
      includeSuperseded: true,
      includeReversed: true,
    });

    // Both should be in history
    expect(history.length).toBe(2);
    const reversedInHistory = history.find(d => d.id === d2.id);
    expect(reversedInHistory).toBeDefined();
    expect(reversedInHistory!.payload.decisionStatus).toBe('reversed');
  });

  it('R1-R5: cross-project isolation remains valid', async () => {
    const projectA = createDecisionMemory({
      decision: 'Project A decision',
      ownerId: 'user_r5',
      projectId: 'proj_A',
      decisionStatus: 'active',
    });
    await store.create(projectA);

    const projectB = createDecisionMemory({
      decision: 'Project B decision',
      ownerId: 'user_r5',
      projectId: 'proj_B',
      decisionStatus: 'active',
    });
    await store.create(projectB);

    // Query project A only
    const decisionsA = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_r5',
      projectId: 'proj_A',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(decisionsA.length).toBe(1);
    expect(decisionsA[0].projectId).toBe('proj_A');

    // Query project B only
    const decisionsB = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_r5',
      projectId: 'proj_B',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(decisionsB.length).toBe(1);
    expect(decisionsB[0].projectId).toBe('proj_B');
  });

  it('R1-R6: cross-topic isolation remains valid', async () => {
    const topicX = createDecisionMemory({
      decision: 'Topic X decision',
      ownerId: 'user_r6',
      projectId: 'proj_r6',
      topicId: 'topic_X',
      scope: 'topic',
      decisionStatus: 'active',
    });
    await store.create(topicX);

    const topicY = createDecisionMemory({
      decision: 'Topic Y decision',
      ownerId: 'user_r6',
      projectId: 'proj_r6',
      topicId: 'topic_Y',
      scope: 'topic',
      decisionStatus: 'active',
    });
    await store.create(topicY);

    // Query topic X only
    const decisionsX = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_r6',
      projectId: 'proj_r6',
      topicId: 'topic_X',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(decisionsX.length).toBe(1);
    expect(decisionsX[0].topicId).toBe('topic_X');

    // Query topic Y only
    const decisionsY = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_r6',
      projectId: 'proj_r6',
      topicId: 'topic_Y',
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(decisionsY.length).toBe(1);
    expect(decisionsY[0].topicId).toBe('topic_Y');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R2-A4: Transaction Rollback Integration Tests (Real DB)
// ═══════════════════════════════════════════════════════════════════════════════

describe('R2-A4: Supersede Atomicity (Real DB Transaction)', () => {
  it('R2-A4: successful supersede persists both records atomically', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Original strategy v1',
      ownerId: 'user_r2a4',
      projectId: 'proj_r2a4',
      decisionStatus: 'active',
    });
    const savedOld = await store.create(oldDecision);
    // Old decision: version=1, status=active

    const newDecision = createDecisionMemory({
      decision: 'Refined strategy v2',
      ownerId: 'user_r2a4',
      projectId: 'proj_r2a4',
      decisionStatus: 'active',
    });

    const result = await service.supersedeDecision(
      oldDecision.id,
      newDecision,
      'user_r2a4',
      savedOld.version,
    );

    // Atomic success: BOTH records must exist with correct state
    const oldInDb = await store.getById(oldDecision.id, 'user_r2a4');
    expect(oldInDb).not.toBeNull();
    expect(oldInDb!.payload.decisionStatus).toBe('superseded');
    expect(oldInDb!.status).toBe('superseded'); // DB status also superseded

    const newInDb = await store.getById(result.id, 'user_r2a4');
    expect(newInDb).not.toBeNull();
    expect(newInDb!.payload.decision).toBe('Refined strategy v2');
    expect(newInDb!.payload.supersedes).toBe(oldDecision.id);
  });

  it('R2-B1: stale version leaves no dirty data in DB (OCC real)', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Strategy for OCC test',
      ownerId: 'user_r2b1',
      decisionStatus: 'active',
    });
    await store.create(oldDecision); // version=1

    const newDecision = createDecisionMemory({
      decision: 'New strategy',
      ownerId: 'user_r2b1',
      decisionStatus: 'active',
    });

    // Use stale version — must fail
    await expect(
      service.supersedeDecision(oldDecision.id, newDecision, 'user_r2b1', 99),
    ).rejects.toThrow();

    // Verify old unchanged
    const oldAfter = await store.getById(oldDecision.id, 'user_r2b1');
    expect(oldAfter).not.toBeNull();
    expect(oldAfter!.payload.decisionStatus).toBe('active');
    expect(oldAfter!.version).toBe(1);

    // Verify new was NEVER persisted (clean rollback)
    const newInDb = await store.getById(newDecision.id, 'user_r2b1');
    expect(newInDb).toBeNull();

    // Verify total count for this owner is exactly 1 (only old exists)
    const count = await store.count('user_r2b1');
    expect(count).toBe(1);
  });

  it('R2-B2: supersede transaction linkage verified in DB', async () => {
    const oldDecision = createDecisionMemory({
      decision: 'Parent decision',
      ownerId: 'user_r2b2',
      decisionStatus: 'active',
    });
    const savedOld = await store.create(oldDecision);

    const newDecision = createDecisionMemory({
      decision: 'Child decision (supersedes parent)',
      ownerId: 'user_r2b2',
      decisionStatus: 'active',
    });

    const result = await service.supersedeDecision(
      oldDecision.id,
      newDecision,
      'user_r2b2',
      savedOld.version,
    );

    // Both records must exist
    const allRecords = await store.count('user_r2b2');
    expect(allRecords).toBe(2);

    // Verify the supersedes linkage is persisted with correct value
    const newInDb = await store.getById(result.id, 'user_r2b2');
    expect(newInDb!.payload.supersedes).toBe(oldDecision.id);

    // Verify old decision's supersedes field is NOT set (it's the root)
    const oldInDb = await store.getById(oldDecision.id, 'user_r2b2');
    expect(oldInDb!.payload.supersedes).toBeUndefined();

    // Verify status separation: old=superseded, new=active
    expect(oldInDb!.status).toBe('superseded');
    expect(newInDb!.status).toBe('active'); // mapped from decisionStatus='active' → MemoryStatus='active'
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full E2E Pipeline Test
// ═══════════════════════════════════════════════════════════════════════════════

describe('Full E2E Pipeline (P0.6.3.3-R1)', () => {
  it('INT-E2E: create→persist→retrieve→activate→supersede→history→reverse→retrieve reversed→context bridge', async () => {
    // Step 1: Create initial decision
    const v1 = createDecisionMemory({
      decision: 'Tone: Formal',
      rationale: 'Corporate brand',
      ownerId: 'user_e2e',
      projectId: 'proj_e2e',
      decisionStatus: 'proposed',
    });

    // Step 2: Persist
    const saved = await store.create(v1);
    expect(saved.version).toBe(1);

    // Step 3: Activate (proposed → active)
    const activated = await service.activateDecision(v1.id, 'user_e2e', 1);
    expect(activated.payload.decisionStatus).toBe('active');
    expect(activated.version).toBe(2);

    // Step 4: Retrieve active
    const activeDecisions = await getActiveDecisions(retriever, {
      ownerId: 'user_e2e',
      projectId: 'proj_e2e',
    });
    expect(activeDecisions.length).toBe(1);
    expect(activeDecisions[0].payload.decision).toBe('Tone: Formal');

    // Step 5: Supersede
    const v2 = createDecisionMemory({
      decision: 'Tone: Casual',
      rationale: 'Youth audience',
      ownerId: 'user_e2e',
      projectId: 'proj_e2e',
      decisionStatus: 'active',
    });

    const superseded = await service.supersedeDecision(v1.id, v2, 'user_e2e', activated.version);
    expect(superseded.payload.decision).toBe('Tone: Casual');
    expect(superseded.payload.supersedes).toBe(v1.id);

    // Step 6: Old decision is superseded
    const oldAfter = await store.getById(v1.id, 'user_e2e');
    expect(oldAfter).not.toBeNull();
    expect(oldAfter!.payload.decisionStatus).toBe('superseded');

    // Step 7: History includes both
    const history = await getDecisionHistory(retriever, {
      ownerId: 'user_e2e',
      projectId: 'proj_e2e',
      includeSuperseded: true,
      includeReversed: true,
    });
    expect(history.length).toBe(2);

    // Step 8: Reverse the v2 decision
    const v2InDb = await store.getById(superseded.id, 'user_e2e');
    expect(v2InDb).not.toBeNull();
    const reversed = await service.reverseDecision(superseded.id, 'user_e2e', v2InDb!.version);
    expect(reversed.payload.decisionStatus).toBe('reversed');

    // Step 9: Retrieve reversed (with includeReversed=true)
    const withReversed = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_e2e',
      projectId: 'proj_e2e',
      includeReversed: true,
    });
    const reversedRecord = withReversed.find(d => d.id === superseded.id);
    expect(reversedRecord).toBeDefined();
    expect(reversedRecord!.payload.decisionStatus).toBe('reversed');

    // Step 10: Context bridge
    const context = decisionMemoryToContext(reversedRecord!);
    expect(context.kind).toBe('decision');
    expect(context.provenance.ownerId).toBe('user_e2e');
    expect(context.provenance.projectId).toBe('proj_e2e');
    expect(context.payload.selected).toBe('Tone: Casual');
  });
});
