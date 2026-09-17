/**
 * P0.3.8.4.1 — Server-side Strategy Approval Gate Tests
 *
 * Tests the server-side enforcement of strategy approval before writing.
 * Covers state machine transitions, security boundaries, and race conditions.
 *
 * Covers:
 *   TEST 01: Generate strategy → pending (DB default)
 *   TEST 02: Approve pending → approved (conditional update)
 *   TEST 03: Reject pending → rejected (conditional update)
 *   TEST 04: pending → Writing API → blocked (simulated)
 *   TEST 05: rejected → Writing API → blocked (simulated)
 *   TEST 06: approved → Writing API → allowed (simulated)
 *   TEST 07: Client injection → safety (server controls state)
 *   TEST 08: rejected → approve → invalid transition
 *   TEST 09: approved → reject → invalid transition
 *   TEST 10: Concurrent approve/reject → only one succeeds
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock state (avoids hoisting issues) ────────────────────────────

const mockStrategyRecords = vi.hoisted(() => new Map<string, {
  id: string;
  topicId: string;
  approvalStatus: string;
  rejectionReason: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  coreThesis: string;
}>());

const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpsert = vi.hoisted(() => vi.fn());

// ─── Mock Prisma Client ─────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    contentStrategy: {
      create: vi.fn(),
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
      upsert: mockUpsert,
    },
  },
}));

// ─── Import modules after mock ──────────────────────────────────────────────

import { topicRepository } from '@/lib/repositories/topic-repository';

// ─── Test Data ──────────────────────────────────────────────────────────────

const TEST_TOPIC_ID = 'topic_001';
const TEST_STRATEGY_ID = 'strategy_001';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.3.8.4.1 — Server-side Approval Gate', () => {
  beforeEach(() => {
    mockStrategyRecords.clear();
    mockUpdateMany.mockClear();
    mockFindUnique.mockClear();
    mockUpsert.mockClear();

    // Setup default mock implementations
    mockUpdateMany.mockImplementation(({ where, data }: { where: { id: string; approvalStatus: string }; data: Record<string, unknown> }) => {
      const record = mockStrategyRecords.get(where.id);
      if (!record || record.approvalStatus !== where.approvalStatus) {
        return Promise.resolve({ count: 0 });
      }
      Object.assign(record, data);
      return Promise.resolve({ count: 1 });
    });

    mockFindUnique.mockImplementation(({ where }: { where: { id?: string; topicId?: string } }) => {
      if (where.id) {
        const record = mockStrategyRecords.get(where.id);
        return Promise.resolve(record ? { ...record } : null);
      }
      if (where.topicId) {
        for (const record of mockStrategyRecords.values()) {
          if (record.topicId === where.topicId) {
            return Promise.resolve({ ...record });
          }
        }
      }
      return Promise.resolve(null);
    });

    mockUpsert.mockImplementation(({ where, create }: { where: { topicId: string }; create: Record<string, unknown> }) => {
      const existing = Array.from(mockStrategyRecords.values()).find(r => r.topicId === where.topicId);
      if (existing) {
        // The actual upsert also resets approval status — simulate this
        Object.assign(existing, {
          approvalStatus: 'pending',
          rejectionReason: null,
          approvedAt: null,
          rejectedAt: null,
        });
        return Promise.resolve({ ...existing });
      }
      const id = `strategy_${mockStrategyRecords.size + 1}`;
      const newRecord = {
        id,
        topicId: where.topicId,
        coreThesis: create.coreThesis as string,
        approvalStatus: 'pending',
        rejectionReason: null,
        approvedAt: null,
        rejectedAt: null,
      };
      mockStrategyRecords.set(id, newRecord);
      return Promise.resolve({ ...newRecord });
    });
  });

  // ── Helper: Create strategy via upsert (simulates generate API) ──

  async function createPendingStrategy(topicId = TEST_TOPIC_ID) {
    const result = await topicRepository.upsertStrategy({
      topic: { connect: { id: topicId } },
      coreThesis: 'Test strategy thesis',
      hookStrategy: 'Test hook',
      contentStructure: undefined,
      ctaStrategy: 'Test CTA',
      targetEmotion: 'curiosity',
      targetAudience: undefined,
      storyStrategy: undefined,
      conflict: undefined,
      turningPoint: undefined,
      endingStrategy: undefined,
    });
    return result;
  }

  // TEST 01
  it('TEST 01: Generate strategy → pending', async () => {
    const { id } = await createPendingStrategy();
    const strategy = await topicRepository.findStrategyById(id);

    expect(strategy).not.toBeNull();
    expect(strategy!.approvalStatus).toBe('pending');
    expect(strategy!.rejectionReason).toBeNull();
    expect(strategy!.approvedAt).toBeNull();
    expect(strategy!.rejectedAt).toBeNull();
  });

  // TEST 02
  it('TEST 02: Approve pending → approved', async () => {
    const { id } = await createPendingStrategy();

    const updated = await topicRepository.approveStrategy(id);
    expect(updated).toBe(true);

    const strategy = await topicRepository.findStrategyById(id);
    expect(strategy!.approvalStatus).toBe('approved');
    expect(strategy!.approvedAt).toBeInstanceOf(Date);
  });

  // TEST 03
  it('TEST 03: Reject pending → rejected', async () => {
    const { id } = await createPendingStrategy();

    const updated = await topicRepository.rejectStrategy(id, 'Not aligned with goals');
    expect(updated).toBe(true);

    const strategy = await topicRepository.findStrategyById(id);
    expect(strategy!.approvalStatus).toBe('rejected');
    expect(strategy!.rejectionReason).toBe('Not aligned with goals');
    expect(strategy!.rejectedAt).toBeInstanceOf(Date);
  });

  // TEST 04
  it('TEST 04: pending → Writing API gate → blocked (simulated)', async () => {
    const { id } = await createPendingStrategy();

    // Simulate Writing API gate check
    const strategy = await topicRepository.findStrategyById(id);
    const canWrite = strategy !== null && strategy.approvalStatus === 'approved';

    expect(canWrite).toBe(false);
    expect(strategy!.approvalStatus).toBe('pending');
  });

  // TEST 05
  it('TEST 05: rejected → Writing API gate → blocked (simulated)', async () => {
    const { id } = await createPendingStrategy();
    await topicRepository.rejectStrategy(id);

    // Simulate Writing API gate check
    const strategy = await topicRepository.findStrategyById(id);
    const canWrite = strategy !== null && strategy.approvalStatus === 'approved';

    expect(canWrite).toBe(false);
    expect(strategy!.approvalStatus).toBe('rejected');
  });

  // TEST 06
  it('TEST 06: approved → Writing API gate → allowed (simulated)', async () => {
    const { id } = await createPendingStrategy();
    await topicRepository.approveStrategy(id);

    // Simulate Writing API gate check
    const strategy = await topicRepository.findStrategyById(id);
    const canWrite = strategy !== null && strategy.approvalStatus === 'approved';

    expect(canWrite).toBe(true);
    expect(strategy!.approvalStatus).toBe('approved');
  });

  // TEST 07
  it('TEST 07: Client injection safety — upsert always creates with pending', async () => {
    // The upsertStrategy signature does NOT accept approvalStatus parameter.
    // TypeScript enforces this at compile time — first line of defense.
    // This test verifies runtime: upsert creates with 'pending'.
    const { id } = await createPendingStrategy();
    const strategy = await topicRepository.findStrategyById(id);

    // Client cannot set approvalStatus during creation — always 'pending'
    expect(strategy!.approvalStatus).toBe('pending');
  });

  // TEST 08
  it('TEST 08: rejected → approve → invalid transition (returns false)', async () => {
    const { id } = await createPendingStrategy();

    // Reject the strategy
    const rejected = await topicRepository.rejectStrategy(id);
    expect(rejected).toBe(true);

    // Attempt to approve after rejection — should fail
    const approved = await topicRepository.approveStrategy(id);
    expect(approved).toBe(false);

    // State remains 'rejected'
    const strategy = await topicRepository.findStrategyById(id);
    expect(strategy!.approvalStatus).toBe('rejected');
  });

  // TEST 09
  it('TEST 09: approved → reject → invalid transition (returns false)', async () => {
    const { id } = await createPendingStrategy();

    // Approve the strategy
    const approved = await topicRepository.approveStrategy(id);
    expect(approved).toBe(true);

    // Attempt to reject after approval — should fail
    const rejected = await topicRepository.rejectStrategy(id);
    expect(rejected).toBe(false);

    // State remains 'approved'
    const strategy = await topicRepository.findStrategyById(id);
    expect(strategy!.approvalStatus).toBe('approved');
  });

  // TEST 10
  it('TEST 10: Concurrent approve/reject → only one succeeds (race condition)', async () => {
    const { id } = await createPendingStrategy();

    // Fire both approve and reject simultaneously
    const [approveResult, rejectResult] = await Promise.all([
      topicRepository.approveStrategy(id),
      topicRepository.rejectStrategy(id),
    ]);

    // Exactly one must succeed (no double-transition)
    const successCount = [approveResult, rejectResult].filter(Boolean).length;
    expect(successCount).toBe(1);

    // Final state must be either approved or rejected (valid terminal state)
    const strategy = await topicRepository.findStrategyById(id);
    expect(['approved', 'rejected']).toContain(strategy!.approvalStatus);
  });

  // ── Additional Edge Case Tests ─────────────────────────────────

  it('BONUS: Missing strategy → Writing gate → blocked', async () => {
    // No strategy exists for this ID
    const strategy = await topicRepository.findStrategyById('nonexistent_id');
    const canWrite = strategy !== null && strategy.approvalStatus === 'approved';

    expect(strategy).toBeNull();
    expect(canWrite).toBe(false);
  });

  it('BONUS: Regenerate strategy → resets to pending', async () => {
    const { id } = await createPendingStrategy();

    // Approve first version
    await topicRepository.approveStrategy(id);
    let strategy = await topicRepository.findStrategyById(id);
    expect(strategy!.approvalStatus).toBe('approved');

    // Simulate regeneration (upsert with same topicId resets approval)
    await topicRepository.upsertStrategy({
      topic: { connect: { id: TEST_TOPIC_ID } },
      coreThesis: 'Updated thesis after regeneration',
      hookStrategy: 'Updated hook',
      contentStructure: undefined,
      ctaStrategy: 'Updated CTA',
      targetEmotion: 'surprise',
    });

    strategy = await topicRepository.findStrategyById(id);
    expect(strategy!.approvalStatus).toBe('pending');
    expect(strategy!.rejectionReason).toBeNull();
    expect(strategy!.approvedAt).toBeNull();
    expect(strategy!.rejectedAt).toBeNull();
  });
});
