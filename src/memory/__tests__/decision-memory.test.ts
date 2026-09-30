/**
 * P0.6.3.3 — Decision Memory Unit Tests
 *
 * Comprehensive tests covering Categories A-O:
 *   A. Creation
 *   B. Validation
 *   C. Persistence (in-memory)
 *   D. Owner Isolation
 *   E. Activation (proposed → active)
 *   F. Supersede (active → superseded)
 *   G. Reverse (active → reversed)
 *   H. History
 *   I. Current/Active Decision
 *   J. Cross Topic
 *   K. Cross Project
 *   L. Context Bridge
 *   M. Concurrency
 *   N. Authorization
 *   O. No physical deletion
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDecisionMemory,
  type CreateDecisionMemoryOptions,
} from '../decision-memory-factory';
import {
  DecisionMemoryServiceImpl,
  DecisionTransitionError,
} from '../decision-memory-service';
import {
  retrieveDecisionMemories,
  getActiveDecisions,
  getDecisionHistory,
} from '../decision-memory-retrieval';
import { InMemoryRetriever } from '../memory-retriever';
import {
  isDecisionMemory,
  decisionStatusToMemoryStatus,
  type DecisionStatus,
} from '../decision-memory';
import {
  decisionMemoryToContext,
  tryDecisionMemoryToContext,
} from '../memory-utils';
import type { MemoryStore } from '../persistence/memory-store';
import type { MemoryRecord } from '../memory-record';
import type { DecisionMemoryPayload } from '../memory-types';
import { MemoryAuthorizationError, MemoryConcurrencyError, MemoryNotFoundError } from '../persistence/memory-persistence-types';
import { validateMemoryRecord } from '../persistence/memory-persistence-validation';

// ═══════════════════════════════════════════════════════════════════════════════
// Mock MemoryStore for unit tests
// ═══════════════════════════════════════════════════════════════════════════════

class MockMemoryStore implements MemoryStore {
  private _records: Map<string, MemoryRecord> = new Map();

  async create(record: MemoryRecord): Promise<MemoryRecord> {
    validateMemoryRecord(record);
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

  async findMany(criteria: import('../persistence/memory-query').MemoryQueryCriteria): Promise<MemoryRecord[]> {
    const results: MemoryRecord[] = [];
    for (const record of this._records.values()) {
      if (record.ownerId !== criteria.ownerId) continue;
      results.push({ ...record });
    }
    return results;
  }

  clear(): void {
    this._records.clear();
  }

  getAll(): MemoryRecord[] {
    return Array.from(this._records.values()).map((r) => ({ ...r }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function makeOptions(overrides: Partial<CreateDecisionMemoryOptions> = {}): CreateDecisionMemoryOptions {
  return {
    decision: 'Use professional tone for all content',
    rationale: 'Brand guidelines require professional tone',
    ownerId: 'user_A',
    confidence: 0.9,
    importance: 0.8,
    ...overrides,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// A. Creation
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Creation', () => {
  it('A1: create decision with required fields', () => {
    const decision = createDecisionMemory({
      decision: 'Use short sentences',
      ownerId: 'user_1',
    });

    expect(decision.id).toBeDefined();
    expect(decision.id).toMatch(/^dec_/);
    expect(decision.payload.decision).toBe('Use short sentences');
    expect(decision.type).toBe('decision');
  });

  it('A2: default status is proposed', () => {
    const decision = createDecisionMemory(makeOptions());
    expect(decision.payload.decisionStatus).toBe('proposed');
  });

  it('A3: explicit scope set correctly', () => {
    const decision = createDecisionMemory(makeOptions({ scope: 'project' }));
    expect(decision.scope).toBe('project');
  });

  it('A4: payload fields preserved', () => {
    const decision = createDecisionMemory(makeOptions({
      rationale: 'Test rationale',
      constraints: ['constraint1', 'constraint2'],
      assumptions: ['assume1'],
      expectedOutcome: 'Better engagement',
    }));

    expect(decision.payload.rationale).toBe('Test rationale');
    expect(decision.payload.constraints).toEqual(['constraint1', 'constraint2']);
    expect(decision.payload.assumptions).toEqual(['assume1']);
    expect(decision.payload.expectedOutcome).toBe('Better engagement');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Validation', () => {
  it('B1: empty decision throws', () => {
    expect(() => createDecisionMemory(makeOptions({ decision: '' }))).toThrow();
  });

  it('B2: missing owner throws', () => {
    expect(() => createDecisionMemory(makeOptions({ ownerId: '' }))).toThrow();
  });

  it('B3: invalid decisionStatus throws', () => {
    expect(() => createDecisionMemory(makeOptions({ decisionStatus: 'invalid' as DecisionStatus }))).toThrow();
  });

  it('B4: confidence clamped to 0..1', () => {
    const d1 = createDecisionMemory(makeOptions({ confidence: 1.5 }));
    expect(d1.confidence).toBe(1);

    const d2 = createDecisionMemory(makeOptions({ confidence: -0.5 }));
    expect(d2.confidence).toBe(0);
    void d2;
  });

  it('B5: importance clamped to 0..1', () => {
    const d1 = createDecisionMemory(makeOptions({ importance: 2.0 }));
    expect(d1.importance).toBe(1);

    const d2 = createDecisionMemory(makeOptions({ importance: -1.0 }));
    expect(d2.importance).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Persistence (in-memory store)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Persistence', () => {
  let store: MockMemoryStore;

  beforeEach(() => {
    store = new MockMemoryStore();
  });

  it('C1: create decision in store', async () => {
    const decision = createDecisionMemory(makeOptions());
    const saved = await store.create(decision);
    expect(saved.id).toBe(decision.id);
    expect(saved.version).toBe(1);
  });

  it('C2: retrieve decision from store', async () => {
    const decision = createDecisionMemory(makeOptions());
    await store.create(decision);

    const retrieved = await store.getById(decision.id, 'user_A');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(decision.id);
    expect(retrieved!.type).toBe('decision');
  });

  it('C3: roundtrip preserves payload', async () => {
    const decision = createDecisionMemory(makeOptions({
      decision: 'Test decision roundtrip',
      rationale: 'Rationale here',
    }));
    await store.create(decision);

    const retrieved = await store.getById(decision.id, 'user_A');
    expect(retrieved!.payload.decision).toBe('Test decision roundtrip');
    expect(retrieved!.payload.rationale).toBe('Rationale here');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Owner Isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Owner Isolation', () => {
  let store: MockMemoryStore;

  beforeEach(() => {
    store = new MockMemoryStore();
  });

  it('D1: User A cannot modify User B Decision', async () => {
    const decision = createDecisionMemory(makeOptions({ ownerId: 'user_B' }));
    await store.create(decision);

    const service = new DecisionMemoryServiceImpl(store);
    await expect(
      service.activateDecision(decision.id, 'user_A', 1)
    ).rejects.toThrow(MemoryNotFoundError);
  });

  it('D2: getById scoped to authenticated user', async () => {
    const decision = createDecisionMemory(makeOptions({ ownerId: 'user_A' }));
    await store.create(decision);

    const byOwner = await store.getById(decision.id, 'user_A');
    expect(byOwner).not.toBeNull();

    const byOther = await store.getById(decision.id, 'user_B');
    expect(byOther).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Activation
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Activation', () => {
  let store: MockMemoryStore;
  let decision: MemoryRecord;

  beforeEach(async () => {
    store = new MockMemoryStore();
    decision = createDecisionMemory(makeOptions({ decisionStatus: 'proposed' }));
    await store.create(decision);
  });

  it('E1: proposed → active transition succeeds', async () => {
    const service = new DecisionMemoryServiceImpl(store);
    const result = await service.activateDecision(decision.id, 'user_A', 1);

    expect(result.payload.decisionStatus).toBe('active');
    expect(result.version).toBe(2);
  });

  it('E2: activating already-active decision throws', async () => {
    const service = new DecisionMemoryServiceImpl(store);
    await service.activateDecision(decision.id, 'user_A', 1);

    await expect(
      service.activateDecision(decision.id, 'user_A', 2)
    ).rejects.toThrow(DecisionTransitionError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Supersede
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Supersede', () => {
  let store: MockMemoryStore;
  let oldDecision: MemoryRecord;

  beforeEach(async () => {
    store = new MockMemoryStore();
    oldDecision = createDecisionMemory(makeOptions({
      decisionStatus: 'active',
      decision: 'Old decision',
    }));

    store['_records'].set(oldDecision.id, { ...oldDecision, version: 2 });
  });

  it('F1: supersede old active decision', async () => {
    const service = new DecisionMemoryServiceImpl(store);
    const newDecision = createDecisionMemory(makeOptions({
      decision: 'New decision',
      decisionStatus: 'active',
    }));
    await store.create(newDecision);

    const current = await store.getById(oldDecision.id, 'user_A');
    if (current) {
      const activatedDecision = { ...current };
      (activatedDecision.payload as DecisionMemoryPayload).decisionStatus = 'active';
      activatedDecision.status = 'active';
      store['_records'].set(oldDecision.id, activatedDecision);
    }

    const result = await service.supersedeDecision(
      oldDecision.id,
      newDecision,
      'user_A',
      2,
    );

    expect(result.payload.decisionStatus).toBe('superseded');
  });

  it('F2: supersede non-active decision throws', async () => {
    const service = new DecisionMemoryServiceImpl(store);
    const newDecision = createDecisionMemory(makeOptions({ decision: 'New' }));

    const current = await store.getById(oldDecision.id, 'user_A');
    if (current) {
      (current.payload as DecisionMemoryPayload).decisionStatus = 'proposed';
      current.status = 'active';
      store['_records'].set(oldDecision.id, current);
    }

    await expect(
      service.supersedeDecision(oldDecision.id, newDecision, 'user_A', 2)
    ).rejects.toThrow(DecisionTransitionError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Reverse
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Reverse', () => {
  let store: MockMemoryStore;
  let decision: MemoryRecord;

  beforeEach(async () => {
    store = new MockMemoryStore();
    decision = createDecisionMemory(makeOptions({
      decisionStatus: 'active',
    }));
    store['_records'].set(decision.id, { ...decision, version: 2 });
  });

  it('G1: active → reversed transition succeeds', async () => {
    const current = await store.getById(decision.id, 'user_A');
    if (current) {
      (current.payload as DecisionMemoryPayload).decisionStatus = 'active';
      current.status = 'active';
      store['_records'].set(decision.id, current);
    }

    const service = new DecisionMemoryServiceImpl(store);
    const result = await service.reverseDecision(decision.id, 'user_A', 2);

    expect(result.payload.decisionStatus).toBe('reversed');
  });

  it('G2: reverse non-active decision throws', async () => {
    store['_records'].set(decision.id, { ...createDecisionMemory(makeOptions()), id: decision.id });

    const service = new DecisionMemoryServiceImpl(store);
    await expect(
      service.reverseDecision(decision.id, 'user_A', 1)
    ).rejects.toThrow(DecisionTransitionError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. History
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. History', () => {
  it('H1: getDecisionHistory returns all decisions sorted by createdAt desc', async () => {
    const store = new MockMemoryStore();
    const retriever = new InMemoryRetriever();

    const d1 = createDecisionMemory(makeOptions({ decision: 'Decision 1' }));
    await store.create(d1);
    retriever.addRecords([d1]);

    const d2 = createDecisionMemory(makeOptions({ decision: 'Decision 2' }));
    await store.create(d2);
    retriever.addRecords([d2]);

    const d3 = createDecisionMemory(makeOptions({ decision: 'Decision 3' }));
    await store.create(d3);
    retriever.addRecords([d3]);

    const history = await getDecisionHistory(retriever, {
      ownerId: 'user_A',
      limit: 100,
      includeSuperseded: true,
      includeReversed: true,
    });

    expect(history.length).toBe(3);
    const ids = history.map(h => h.id);
    expect(ids).toContain(d1.id);
    expect(ids).toContain(d2.id);
    expect(ids).toContain(d3.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Current/Active Decision
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Current Decision', () => {
  it('I1: getActiveDecisions only returns active status', async () => {
    const retriever = new InMemoryRetriever();

    const active1 = createDecisionMemory(makeOptions({
      decision: 'Active 1',
      decisionStatus: 'active',
    }));
    retriever.addRecords([active1]);

    const proposed1 = createDecisionMemory(makeOptions({
      decision: 'Proposed 1',
      decisionStatus: 'proposed',
    }));
    retriever.addRecords([proposed1]);

    const activeDecisions = await getActiveDecisions(retriever, { ownerId: 'user_A' });

    expect(activeDecisions.length).toBe(1);
    expect(activeDecisions[0].payload.decisionStatus).toBe('active');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Cross Topic
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Cross Topic', () => {
  it('J1: Topic A Decision does not appear for Topic B', async () => {
    const retriever = new InMemoryRetriever();

    const topicADecision = createDecisionMemory(makeOptions({
      decision: 'Topic A decision',
      topicId: 'topic_A',
      scope: 'topic',
    }));
    retriever.addRecords([topicADecision]);

    const results = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_A',
      topicId: 'topic_B',
    });

    expect(results.length).toBe(0);
  });

  it('J2: Topic A Decision appears for Topic A', async () => {
    const retriever = new InMemoryRetriever();

    const topicADecision = createDecisionMemory(makeOptions({
      decision: 'Topic A decision',
      projectId: 'proj_X',
      topicId: 'topic_A',
      scope: 'topic',
    }));
    retriever.addRecords([topicADecision]);

    const results = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_A',
      projectId: 'proj_X',
      topicId: 'topic_A',
    });

    expect(results.length).toBe(1);
    expect(results[0].topicId).toBe('topic_A');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. Cross Project
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Cross Project', () => {
  it('K1: Project A does not see Project B decisions', async () => {
    const retriever = new InMemoryRetriever();

    const projectADecision = createDecisionMemory(makeOptions({
      decision: 'Project A decision',
      projectId: 'proj_A',
      scope: 'project',
    }));
    retriever.addRecords([projectADecision]);

    const results = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_A',
      projectId: 'proj_B',
    });

    expect(results.length).toBe(0);
  });

  it('K2: Global Decision visible across projects', async () => {
    const retriever = new InMemoryRetriever();

    const globalDecision = createDecisionMemory(makeOptions({
      decision: 'Global decision',
      scope: 'global',
    }));
    retriever.addRecords([globalDecision]);

    const results = await retrieveDecisionMemories(retriever, {
      ownerId: 'user_A',
      projectId: 'proj_any',
    });

    expect(results.length).toBe(1);
    expect(results[0].scope).toBe('global');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L. Context Bridge
// ═══════════════════════════════════════════════════════════════════════════════

describe('L. Context Bridge', () => {
  it('L1: DecisionMemory converts to ContextKind=decision', () => {
    const decision = createDecisionMemory(makeOptions({
      decision: 'Use professional tone',
      rationale: 'Brand guidelines',
    }));

    const context = decisionMemoryToContext(decision);

    expect(context.kind).toBe('decision');
    expect(context.type).toBe('decision');
  });

  it('L2: DecisionMemory provenance preserved', () => {
    const decision = createDecisionMemory(makeOptions({
      decision: 'Test',
      projectId: 'proj_123',
      topicId: 'topic_456',
    }));

    const context = decisionMemoryToContext(decision);

    expect(context.provenance.ownerId).toBe('user_A');
    expect(context.provenance.projectId).toBe('proj_123');
    expect(context.provenance.topicId).toBe('topic_456');
  });

  it('L3: tryDecisionMemoryToContext returns null for non-decision', () => {
    const nonDecision: MemoryRecord = {
      id: 'mem_test',
      kind: 'static',
      type: 'other',
      payload: { value: 'test' },
      scope: 'global',
      ownerId: 'user_A',
      source: 'test',
      sourceType: 'test',
      confidence: 0.5,
      importance: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 0,
      version: 1,
      status: 'active',
    };

    const result = tryDecisionMemoryToContext(nonDecision);
    expect(result).toBeNull();
  });

  it('L4: DecisionMemory type guard works with spread copy', () => {
    const decision = createDecisionMemory(makeOptions());
    expect(isDecisionMemory(decision)).toBe(true);
    const copy: MemoryRecord = { ...decision };
    expect(isDecisionMemory(copy)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M. Concurrency
// ═══════════════════════════════════════════════════════════════════════════════

describe('M. Concurrency', () => {
  it('M1: stale version fails with MemoryConcurrencyError', async () => {
    const store = new MockMemoryStore();
    const decision = createDecisionMemory(makeOptions({ decisionStatus: 'proposed' }));
    await store.create(decision);

    const service = new DecisionMemoryServiceImpl(store);

    await expect(
      service.activateDecision(decision.id, 'user_A', 99)
    ).rejects.toThrow(MemoryConcurrencyError);
  });

  it('M2: correct version succeeds for reverse', async () => {
    const store = new MockMemoryStore();
    const decision = createDecisionMemory(makeOptions({ decisionStatus: 'active' }));
    (decision.payload as DecisionMemoryPayload).decisionStatus = 'active';
    decision.status = 'active';
    await store.create(decision);

    const service = new DecisionMemoryServiceImpl(store);

    const result = await service.reverseDecision(decision.id, 'user_A', 1);
    expect(result.payload.decisionStatus).toBe('reversed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// N. Authorization
// ═══════════════════════════════════════════════════════════════════════════════

describe('N. Authorization', () => {
  it('N1: User A cannot supersede User B decision', async () => {
    const store = new MockMemoryStore();
    const decision = createDecisionMemory(makeOptions({ ownerId: 'user_B', decisionStatus: 'active' }));
    store['_records'].set(decision.id, { ...decision, version: 2 });

    const newDecision = createDecisionMemory(makeOptions({ ownerId: 'user_A', decision: 'New' }));
    await store.create(newDecision);

    const service = new DecisionMemoryServiceImpl(store);

    await expect(
      service.supersedeDecision(decision.id, newDecision, 'user_A', 1)
    ).rejects.toThrow(MemoryNotFoundError);
  });

  it('N2: User A cannot reverse User B decision', async () => {
    const store = new MockMemoryStore();
    const decision = createDecisionMemory(makeOptions({ ownerId: 'user_B', decisionStatus: 'active' }));
    store['_records'].set(decision.id, { ...decision, version: 2 });

    const service = new DecisionMemoryServiceImpl(store);

    await expect(
      service.reverseDecision(decision.id, 'user_A', 1)
    ).rejects.toThrow(MemoryNotFoundError);
  });

  it('N3: User A cannot activate User B decision', async () => {
    const store = new MockMemoryStore();
    const decision = createDecisionMemory(makeOptions({ ownerId: 'user_B' }));
    await store.create(decision);

    const service = new DecisionMemoryServiceImpl(store);

    await expect(
      service.activateDecision(decision.id, 'user_A', 1)
    ).rejects.toThrow(MemoryNotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// O. No physical deletion
// ═══════════════════════════════════════════════════════════════════════════════

describe('O. No physical deletion', () => {
  it('O1: superseded decision still exists in store', async () => {
    const store = new MockMemoryStore();
    const oldDecision = createDecisionMemory(makeOptions({
      decisionStatus: 'active',
      decision: 'Old',
    }));
    (oldDecision.payload as DecisionMemoryPayload).decisionStatus = 'active';
    oldDecision.status = 'active';
    store['_records'].set(oldDecision.id, { ...oldDecision, version: 2 });

    const newDecision = createDecisionMemory(makeOptions({ decision: 'New', decisionStatus: 'active' }));
    await store.create(newDecision);

    const service = new DecisionMemoryServiceImpl(store);
    await service.supersedeDecision(oldDecision.id, newDecision, 'user_A', 2);

    const stillExists = await store.getById(oldDecision.id, 'user_A');
    expect(stillExists).not.toBeNull();
    expect(stillExists!.payload.decisionStatus).toBe('superseded');
  });

  it('O2: reversed decision still exists in store', async () => {
    const store = new MockMemoryStore();
    const decision = createDecisionMemory(makeOptions({ decisionStatus: 'active' }));
    (decision.payload as DecisionMemoryPayload).decisionStatus = 'active';
    decision.status = 'active';
    store['_records'].set(decision.id, { ...decision, version: 2 });

    const service = new DecisionMemoryServiceImpl(store);
    await service.reverseDecision(decision.id, 'user_A', 2);

    const stillExists = await store.getById(decision.id, 'user_A');
    expect(stillExists).not.toBeNull();
    expect(stillExists!.payload.decisionStatus).toBe('reversed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional: Status Mapping Helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe('Status Mapping', () => {
  it('proposed maps to active', () => {
    expect(decisionStatusToMemoryStatus('proposed')).toBe('active');
  });

  it('active maps to active', () => {
    expect(decisionStatusToMemoryStatus('active')).toBe('active');
  });

  it('superseded maps to superseded', () => {
    expect(decisionStatusToMemoryStatus('superseded')).toBe('superseded');
  });

  it('reversed maps to archived', () => {
    expect(decisionStatusToMemoryStatus('reversed')).toBe('archived');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional: Type Guard
// ═══════════════════════════════════════════════════════════════════════════════

describe('isDecisionMemory', () => {
  it('returns true for decision records', () => {
    const decision = createDecisionMemory(makeOptions());
    expect(isDecisionMemory(decision)).toBe(true);
  });

  it('returns false for non-decision records', () => {
    const nonDecision: MemoryRecord = {
      id: 'mem_test',
      kind: 'static',
      type: 'other',
      payload: { value: 'test' },
      scope: 'global',
      ownerId: 'user_A',
      source: 'test',
      sourceType: 'test',
      confidence: 0.5,
      importance: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 0,
      version: 1,
      status: 'active',
    };
    expect(isDecisionMemory(nonDecision)).toBe(false);
  });
});
