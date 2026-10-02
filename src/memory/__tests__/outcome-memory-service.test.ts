/**
 * P0.6.5.2 — Outcome Memory Service Unit Tests
 *
 * Unit tests for OutcomeMemoryServiceImpl using MockMemoryStore.
 * No database required.
 *
 * Test Matrix:
 *   S1  Archive: active → archived succeeds
 *   S2  Archive: payload unchanged after archive
 *   S3  Archive: version increments
 *   S4  Archive: owner isolation (wrong owner rejected)
 *   S5  Archive: wrong type rejected
 *   S6  Archive: already archived rejected
 *   S7  Archive: OCC version mismatch rejected
 *   S8  Restore: archived → active succeeds
 *   S9  Restore: payload unchanged after restore
 *   S10 Restore: version increments
 *   S11 Restore: owner isolation (wrong owner rejected)
 *   S12 Restore: wrong type rejected
 *   S13 Restore: already active rejected
 *   S14 Restore: OCC version mismatch rejected
 *   S15 Import: empty batch returns success
 *   S16 Import: single valid outcome
 *   S17 Import: multiple valid outcomes
 *   S18 Import: preserve input order in results
 *   S19 Import: owner mismatch rejected
 *   S20 Import: wrong type rejected
 *   S21 Import: invalid payload rejected
 *   S22 Import: duplicate ID handled (no overwrite)
 *   S23 Import: partial failure result is explicit
 *   S24 Import: existing outcomes never overwritten
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OutcomeMemoryServiceImpl,
  OutcomeTransitionError,
} from '../outcome-memory-service';
import {
  createOutcomeMemory,
} from '../outcome-memory-factory';
import type { OutcomeMemory } from '../outcome-memory';
import type { MemoryStore } from '../persistence/memory-store';
import type { MemoryRecord } from '../memory-record';
import {
  MemoryAuthorizationError,
  MemoryConcurrencyError,
  MemoryNotFoundError,
} from '../persistence/memory-persistence-types';
import { validateMemoryRecord } from '../persistence/memory-persistence-validation';

// ═══════════════════════════════════════════════════════════════════════════════
// Mock MemoryStore (same pattern as decision-memory.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

class MockMemoryStore implements MemoryStore {
  private _records: Map<string, MemoryRecord> = new Map();

  async create(record: MemoryRecord): Promise<MemoryRecord> {
    validateMemoryRecord(record);
    if (this._records.has(record.id)) {
      throw new MemoryConcurrencyError(record.id, 0);
    }
    this._records.set(record.id, { ...record });
    return { ...record };
  }

  async getById(id: string, ownerId: string): Promise<MemoryRecord | null> {
    const record = this._records.get(id);
    if (!record || record.ownerId !== ownerId) return null;
    return { ...record };
  }

  async update(
    record: MemoryRecord,
    ownerId: string,
    expectedVersion: number,
  ): Promise<MemoryRecord> {
    validateMemoryRecord(record);

    if (!ownerId || typeof ownerId !== 'string') {
      throw new MemoryAuthorizationError(record.id);
    }

    if (record.ownerId !== ownerId) {
      throw new MemoryAuthorizationError(record.id);
    }

    const existing = this._records.get(record.id);
    if (!existing || existing.ownerId !== ownerId) {
      throw new MemoryNotFoundError(record.id);
    }

    if (existing.version !== expectedVersion) {
      throw new MemoryConcurrencyError(record.id, expectedVersion, existing.version);
    }

    const updatedRecord = {
      ...record,
      version: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    };

    this._records.set(record.id, updatedRecord);
    return { ...updatedRecord };
  }

  async delete(id: string, ownerId: string): Promise<void> {
    const record = this._records.get(id);
    if (record && record.ownerId === ownerId) {
      this._records.delete(id);
    }
  }

  async count(ownerId: string): Promise<number> {
    let count = 0;
    for (const record of this._records.values()) {
      if (record.ownerId === ownerId) count++;
    }
    return count;
  }

  async findMany(): Promise<MemoryRecord[]> {
    return Array.from(this._records.values()).map(r => ({ ...r }));
  }

  async supersede(): Promise<MemoryRecord> {
    throw new Error('MockMemoryStore.supersede not implemented');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

const OWNER_A = 'user-owner-a';
const OWNER_B = 'user-owner-b';

function createPersistedOutcome(
  store: MockMemoryStore,
  ownerId: string,
  overrides?: Partial<Parameters<typeof createOutcomeMemory>[0]>,
): OutcomeMemory {
  const outcome = createOutcomeMemory({
    outcomeType: 'engagement',
    targetType: 'content',
    targetId: 'content-001',
    observedAt: '2026-09-30T10:00:00Z',
    ownerId,
    metrics: [{ key: 'likes', value: 100, unit: 'count' }],
    summary: 'Test outcome',
    ...overrides,
  });
  return outcome;
}

async function setupAndPersist(
  store: MockMemoryStore,
  ownerId: string,
  overrides?: Partial<Parameters<typeof createOutcomeMemory>[0]>,
): Promise<{ outcome: OutcomeMemory; service: OutcomeMemoryServiceImpl }> {
  const outcome = createPersistedOutcome(store, ownerId, overrides);
  await store.create(outcome);
  const service = new OutcomeMemoryServiceImpl(store);
  return { outcome, service };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Archive Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('OutcomeMemoryServiceImpl - Archive (S1-S7)', () => {
  let store: MockMemoryStore;

  beforeEach(() => {
    store = new MockMemoryStore();
  });

  it('S1: active → archived succeeds', async () => {
    const { outcome, service } = await setupAndPersist(store, OWNER_A);

    const result = await service.archiveOutcome(outcome.id, OWNER_A, 1);

    expect(result.status).toBe('archived');
    expect(result.id).toBe(outcome.id);
  });

  it('S2: payload remains unchanged after archive', async () => {
    const { outcome, service } = await setupAndPersist(store, OWNER_A, {
      outcomeType: 'performance',
      metrics: [
        { key: 'views', value: 500 },
        { key: 'ctr', value: 3.5, unit: 'percent' },
      ],
    });

    const originalPayload = { ...outcome.payload };
    const result = await service.archiveOutcome(outcome.id, OWNER_A, 1);

    expect(result.payload.outcomeType).toBe(originalPayload.outcomeType);
    expect(result.payload.targetType).toBe(originalPayload.targetType);
    expect(result.payload.targetId).toBe(originalPayload.targetId);
    expect(result.payload.metrics).toEqual(originalPayload.metrics);
    expect(result.payload.observedAt).toBe(originalPayload.observedAt);
    expect(result.payload.summary).toBe(originalPayload.summary);
  });

  it('S3: version increments after archive', async () => {
    const { outcome, service } = await setupAndPersist(store, OWNER_A);

    const result = await service.archiveOutcome(outcome.id, OWNER_A, 1);

    expect(result.version).toBe(2);
  });

  it('S4: owner isolation — wrong owner cannot archive', async () => {
    const { outcome, service } = await setupAndPersist(store, OWNER_A);

    await expect(
      service.archiveOutcome(outcome.id, OWNER_B, 1),
    ).rejects.toThrow(MemoryNotFoundError);
  });

  it('S5: wrong type — decision record cannot be archived as outcome', async () => {
    // Create a non-outcome record in the store to verify type guard
    const nonOutcome = createOutcomeMemory({
      outcomeType: 'engagement',
      targetType: 'content',
      targetId: 'content-002',
      observedAt: '2026-09-30T10:00:00Z',
      ownerId: OWNER_A,
    });

    // Manually create with wrong type (simulate a different memory type)
    const wrongTypeRecord = {
      ...nonOutcome,
      id: 'decision-fake-001',
      type: 'decision',
      kind: 'semantic',
    };
    await store.create(wrongTypeRecord);

    const service = new OutcomeMemoryServiceImpl(store);

    await expect(
      service.archiveOutcome('decision-fake-001', OWNER_A, 1),
    ).rejects.toThrow(OutcomeTransitionError);
  });

  it('S6: already archived — cannot archive again', async () => {
    const { outcome, service } = await setupAndPersist(store, OWNER_A);

    // First archive succeeds
    await service.archiveOutcome(outcome.id, OWNER_A, 1);

    // Second archive should fail
    await expect(
      service.archiveOutcome(outcome.id, OWNER_A, 2),
    ).rejects.toThrow(OutcomeTransitionError);
  });

  it('S7: OCC version mismatch rejected', async () => {
    const { outcome, service } = await setupAndPersist(store, OWNER_A);

    await expect(
      service.archiveOutcome(outcome.id, OWNER_A, 99),
    ).rejects.toThrow(MemoryConcurrencyError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Restore Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('OutcomeMemoryServiceImpl - Restore (S8-S14)', () => {
  let store: MockMemoryStore;

  beforeEach(() => {
    store = new MockMemoryStore();
  });

  async function setupArchivedOutcome(
    ownerId: string,
  ): Promise<{ outcome: OutcomeMemory; service: OutcomeMemoryServiceImpl }> {
    const { outcome, service } = await setupAndPersist(store, ownerId);
    await service.archiveOutcome(outcome.id, ownerId, 1);
    return { outcome, service };
  }

  it('S8: archived → active succeeds', async () => {
    const { outcome, service } = await setupArchivedOutcome(OWNER_A);

    const result = await service.restoreOutcome(outcome.id, OWNER_A, 2);

    expect(result.status).toBe('active');
    expect(result.id).toBe(outcome.id);
  });

  it('S9: payload remains unchanged after restore', async () => {
    const { outcome, service } = await setupArchivedOutcome(OWNER_A);

    const result = await service.restoreOutcome(outcome.id, OWNER_A, 2);

    expect(result.payload.outcomeType).toBe(outcome.payload.outcomeType);
    expect(result.payload.targetType).toBe(outcome.payload.targetType);
    expect(result.payload.targetId).toBe(outcome.payload.targetId);
    expect(result.payload.metrics).toEqual(outcome.payload.metrics);
    expect(result.payload.observedAt).toBe(outcome.payload.observedAt);
    // Verify deep immutability
    expect(result.payload).toEqual(outcome.payload);
    expect(result.payload).not.toBe(outcome.payload); // defensive copy
  });

  it('S10: version increments after restore', async () => {
    const { outcome, service } = await setupArchivedOutcome(OWNER_A);

    const result = await service.restoreOutcome(outcome.id, OWNER_A, 2);

    expect(result.version).toBe(3);
  });

  it('S11: owner isolation — wrong owner cannot restore', async () => {
    const { outcome, service } = await setupArchivedOutcome(OWNER_A);

    await expect(
      service.restoreOutcome(outcome.id, OWNER_B, 2),
    ).rejects.toThrow(MemoryNotFoundError);
  });

  it('S12: wrong type — decision record cannot be restored as outcome', async () => {
    const wrongTypeRecord = {
      ...createOutcomeMemory({
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'content-003',
        observedAt: '2026-09-30T10:00:00Z',
        ownerId: OWNER_A,
      }),
      id: 'decision-fake-002',
      type: 'decision',
      kind: 'semantic',
      status: 'archived',
    };
    await store.create(wrongTypeRecord);

    const service = new OutcomeMemoryServiceImpl(store);

    await expect(
      service.restoreOutcome('decision-fake-002', OWNER_A, 1),
    ).rejects.toThrow(OutcomeTransitionError);
  });

  it('S13: already active — cannot restore', async () => {
    const { outcome, service } = await setupAndPersist(store, OWNER_A);

    await expect(
      service.restoreOutcome(outcome.id, OWNER_A, 1),
    ).rejects.toThrow(OutcomeTransitionError);
  });

  it('S14: OCC version mismatch rejected', async () => {
    const { outcome, service } = await setupArchivedOutcome(OWNER_A);

    await expect(
      service.restoreOutcome(outcome.id, OWNER_A, 99),
    ).rejects.toThrow(MemoryConcurrencyError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Batch Import Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('OutcomeMemoryServiceImpl - Batch Import (S15-S24)', () => {
  let store: MockMemoryStore;

  beforeEach(() => {
    store = new MockMemoryStore();
  });

  it('S15: empty batch returns success', async () => {
    const service = new OutcomeMemoryServiceImpl(store);

    const result = await service.importOutcomes([], OWNER_A);

    expect(result.total).toBe(0);
    expect(result.imported).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('S16: single valid outcome imported successfully', async () => {
    const service = new OutcomeMemoryServiceImpl(store);
    const outcome = createPersistedOutcome(store, OWNER_A);
    // Don't pre-persist — import should create it
    const result = await service.importOutcomes([outcome], OWNER_A);

    expect(result.total).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].id).toBe(outcome.id);

    // Verify it's actually in the store
    const stored = await store.getById(outcome.id, OWNER_A);
    expect(stored).not.toBeNull();
  });

  it('S17: multiple valid outcomes imported', async () => {
    const service = new OutcomeMemoryServiceImpl(store);
    const outcomes = [
      createPersistedOutcome(store, OWNER_A, { targetId: 'multi-1', id: 'multi-1' }),
      createPersistedOutcome(store, OWNER_A, { targetId: 'multi-2', id: 'multi-2' }),
      createPersistedOutcome(store, OWNER_A, { targetId: 'multi-3', id: 'multi-3' }),
    ];

    const result = await service.importOutcomes(outcomes, OWNER_A);

    expect(result.total).toBe(3);
    expect(result.imported).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.results.every(r => r.success)).toBe(true);

    // Verify all in store
    for (const o of outcomes) {
      const stored = await store.getById(o.id, OWNER_A);
      expect(stored).not.toBeNull();
    }
  });

  it('S18: preserve input order in results', async () => {
    const service = new OutcomeMemoryServiceImpl(store);
    const outcomes = [
      createPersistedOutcome(store, OWNER_A, { id: 'order-a', targetId: 'order-a' }),
      createPersistedOutcome(store, OWNER_A, { id: 'order-b', targetId: 'order-b' }),
      createPersistedOutcome(store, OWNER_A, { id: 'order-c', targetId: 'order-c' }),
    ];

    const result = await service.importOutcomes(outcomes, OWNER_A);

    expect(result.results[0].id).toBe('order-a');
    expect(result.results[1].id).toBe('order-b');
    expect(result.results[2].id).toBe('order-c');
  });

  it('S19: owner mismatch rejected', async () => {
    const service = new OutcomeMemoryServiceImpl(store);
    const outcome = createPersistedOutcome(store, OWNER_B, { id: 'mismatch-1' });

    const result = await service.importOutcomes([outcome], OWNER_A);

    expect(result.total).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('ownerId mismatch');
  });

  it('S20: wrong type rejected', async () => {
    const service = new OutcomeMemoryServiceImpl(store);
    const outcome = createPersistedOutcome(store, OWNER_A, { id: 'wrong-type-1' });
    // Mutate type
    (outcome as { type: string }).type = 'decision';

    const result = await service.importOutcomes([outcome], OWNER_A);

    expect(result.total).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('type must be');
  });

  it('S21: invalid payload rejected', async () => {
    const service = new OutcomeMemoryServiceImpl(store);
    const outcome = createPersistedOutcome(store, OWNER_A, { id: 'bad-payload-1' });
    // Corrupt payload — invalid observedAt
    (outcome.payload as { observedAt: string }).observedAt = 'not-a-date';

    const result = await service.importOutcomes([outcome], OWNER_A);

    expect(result.total).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].success).toBe(false);
  });

  it('S22: duplicate ID handled — second import fails without overwriting', async () => {
    const service = new OutcomeMemoryServiceImpl(store);
    const original = createPersistedOutcome(store, OWNER_A, {
      id: 'dup-1',
      targetId: 'dup-target',
      summary: 'Original summary',
    });

    // First import succeeds
    const result1 = await service.importOutcomes([original], OWNER_A);
    expect(result1.imported).toBe(1);

    // Second import with same ID — should fail (duplicate)
    const duplicate = { ...original };
    const result2 = await service.importOutcomes([duplicate], OWNER_A);

    expect(result2.total).toBe(1);
    expect(result2.imported).toBe(0);
    expect(result2.failed).toBe(1);

    // Original data is preserved
    const stored = await store.getById('dup-1', OWNER_A);
    expect(stored).not.toBeNull();
  });

  it('S23: partial failure result is explicit', async () => {
    const service = new OutcomeMemoryServiceImpl(store);

    const good = createPersistedOutcome(store, OWNER_A, {
      id: 'partial-good',
      targetId: 'partial-good',
    });

    const bad = createPersistedOutcome(store, OWNER_A, {
      id: 'partial-bad',
      targetId: 'partial-bad',
    });
    (bad.payload as { observedAt: string }).observedAt = 'invalid';

    const result = await service.importOutcomes([good, bad], OWNER_A);

    expect(result.total).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toBeDefined();
  });

  it('S24: existing outcomes are never overwritten by import', async () => {
    const service = new OutcomeMemoryServiceImpl(store);

    // Pre-existing record in store
    const existing = createPersistedOutcome(store, OWNER_A, {
      id: 'existing-001',
      targetId: 'existing-target',
      observedAt: '2026-01-01T00:00:00Z',
      metrics: [{ key: 'old_metric', value: 42 }],
    });
    await store.create(existing);

    // Try to import a new outcome with the same ID and different data
    const importOutcome = createOutcomeMemory({
      id: 'existing-001',
      outcomeType: 'failure',
      targetType: 'topic',
      targetId: 'new-target-id',
      observedAt: '2026-12-31T00:00:00Z',
      ownerId: OWNER_A,
      metrics: [{ key: 'new_metric', value: 99 }],
    });

    const result = await service.importOutcomes([importOutcome], OWNER_A);

    // Import failed
    expect(result.failed).toBe(1);
    expect(result.imported).toBe(0);

    // Original record unchanged
    const stored = await store.getById('existing-001', OWNER_A);
    expect(stored).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OutcomeTransitionError Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('OutcomeTransitionError', () => {
  it('carries outcomeId, fromStatus, toStatus', () => {
    const err = new OutcomeTransitionError('out-123', 'active', 'active');
    expect(err.outcomeId).toBe('out-123');
    expect(err.fromStatus).toBe('active');
    expect(err.toStatus).toBe('active');
    expect(err.name).toBe('OutcomeTransitionError');
    expect(err.message).toContain('active');
    expect(err.message).toContain('out-123');
  });
});
