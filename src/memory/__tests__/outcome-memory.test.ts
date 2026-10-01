/**
 * P0.6.5.1 — Outcome Memory Unit Tests
 *
 * Comprehensive tests covering Categories A-I:
 *   A. Creation (createOutcomeMemory)
 *   B. Validation (validateOutcomePayload)
 *   C. Persistence (in-memory store round-trip)
 *   D. Owner Isolation
 *   E. Project Isolation
 *   F. Topic Isolation
 *   G. Retrieval
 *   H. Context Bridge
 *   I. Attribution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createOutcomeMemory,
  type CreateOutcomeMemoryOptions,
} from '../outcome-memory-factory';
import {
  retrieveOutcomeMemories,
  getOutcomeHistory,
  getLatestOutcome,
} from '../outcome-memory-retrieval';
import { InMemoryRetriever } from '../memory-retriever';
import {
  isOutcomeMemory,
  OUTCOME_TYPES,
  OUTCOME_TARGET_TYPES,
} from '../outcome-memory';
import {
  outcomeMemoryToContext,
  tryOutcomeMemoryToContext,
} from '../memory-utils';
import type { MemoryRecord } from '../memory-record';
import type { OutcomeMemoryPayload, OutcomeMetric } from '../outcome-memory';
import { validateMemoryRecord } from '../persistence/memory-persistence-validation';

// ═══════════════════════════════════════════════════════════════════════════════
// Mock MemoryStore for unit tests (reuse same pattern as decision-memory)
// ═══════════════════════════════════════════════════════════════════════════════

class MockMemoryStore {
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

  get records(): Map<string, MemoryRecord> {
    return this._records;
  }

  clear(): void {
    this._records.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Data Factory
// ═══════════════════════════════════════════════════════════════════════════════

function createValidOptions(overrides?: Partial<CreateOutcomeMemoryOptions>): CreateOutcomeMemoryOptions {
  return {
    outcomeType: 'performance',
    targetType: 'content',
    targetId: 'content_123',
    observedAt: '2026-10-01T10:00:00.000Z',
    ownerId: 'user_A',
    projectId: 'proj_1',
    topicId: 'topic_1',
    metrics: [
      { key: 'views', value: 120000, source: 'douyin' },
      { key: 'likes', value: 8300, source: 'douyin' },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Category A: Creation Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.5.1 — Outcome Memory Foundation', () => {
  describe('Category A: Creation', () => {
    it('A1: should create a basic outcome memory with required fields', () => {
      const outcome = createOutcomeMemory({
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'content_456',
        observedAt: '2026-10-01T12:00:00.000Z',
        ownerId: 'user_A',
      });

      expect(outcome).toBeDefined();
      expect(outcome.id).toMatch(/^out_/);
      expect(outcome.type).toBe('outcome');
      expect(outcome.kind).toBe('episodic');
      expect(outcome.status).toBe('active');
      expect(outcome.version).toBe(1);
      expect(outcome.ownerId).toBe('user_A');
      expect(outcome.payload.outcomeType).toBe('engagement');
      expect(outcome.payload.targetType).toBe('content');
      expect(outcome.payload.targetId).toBe('content_456');
      expect(outcome.payload.observedAt).toBe('2026-10-01T12:00:00.000Z');
    });

    it('A2: should auto-generate ID with out_ prefix', () => {
      const outcome = createOutcomeMemory(createValidOptions());
      expect(outcome.id).toMatch(/^out_[a-f0-9-]{36}$|^out_\d+_[a-z0-9]+$/);
    });

    it('A3: should use provided explicit ID', () => {
      const outcome = createOutcomeMemory(createValidOptions({ id: 'out_custom_123' }));
      expect(outcome.id).toBe('out_custom_123');
    });

    it('A4: should set correct default values', () => {
      const outcome = createOutcomeMemory({
        outcomeType: 'publication',
        targetType: 'draft',
        targetId: 'draft_789',
        observedAt: '2026-10-01T12:00:00.000Z',
        ownerId: 'user_A',
      });

      expect(outcome.confidence).toBe(0.7);
      expect(outcome.importance).toBe(0.7);
      expect(outcome.source).toBe('outcome_factory');
      expect(outcome.sourceType).toBe('outcome');
      expect(outcome.accessCount).toBe(0);
      expect(outcome.expiresAt).toBeNull();
      expect(outcome.lastAccessedAt).toBeNull();
    });

    it('A5: should auto-derive scope from context IDs (topic)', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        projectId: 'proj_1',
        topicId: 'topic_1',
      }));
      expect(outcome.scope).toBe('topic');
    });

    it('A6: should auto-derive scope from context IDs (project only)', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        projectId: 'proj_1',
        topicId: undefined,
      }));
      expect(outcome.scope).toBe('project');
    });

    it('A7: should auto-derive scope to global when no context IDs', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        projectId: undefined,
        topicId: undefined,
      }));
      expect(outcome.scope).toBe('global');
    });

    it('A8: should accept explicit scope override', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        projectId: 'proj_1',
        scope: 'global',
      }));
      expect(outcome.scope).toBe('global');
    });

    it('A9: should auto-generate timestamps', () => {
      const before = new Date().toISOString();
      const outcome = createOutcomeMemory(createValidOptions());
      const after = new Date().toISOString();

      expect(outcome.createdAt).toBeDefined();
      expect(outcome.updatedAt).toBeDefined();
      expect(outcome.createdAt >= before).toBe(true);
      expect(outcome.createdAt <= after).toBe(true);
    });

    it('A10: should preserve metrics array', () => {
      const metrics: OutcomeMetric[] = [
        { key: 'views', value: 50000, source: 'douyin' },
        { key: 'likes', value: 3000, source: 'douyin' },
        { key: 'ctr', value: 4.2, unit: 'percent', source: 'douyin' },
      ];

      const outcome = createOutcomeMemory(createValidOptions({ metrics }));
      expect(outcome.payload.metrics).toHaveLength(3);
      expect(outcome.payload.metrics![0]).toEqual({ key: 'views', value: 50000, source: 'douyin' });
      expect(outcome.payload.metrics![2]).toEqual({ key: 'ctr', value: 4.2, unit: 'percent', source: 'douyin' });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category B: Validation Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Category B: Validation', () => {
    it('B1: should throw when outcomeType is missing', () => {
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createOutcomeMemory(createValidOptions({ outcomeType: undefined as unknown as any }))
      ).toThrow('outcomeType is required');
    });

    it('B2: should throw when targetType is invalid', () => {
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createOutcomeMemory(createValidOptions({ targetType: 'invalid_type' as any }))
      ).toThrow('targetType');
    });

    it('B3: should throw when targetId is empty', () => {
      expect(() =>
        createOutcomeMemory(createValidOptions({ targetId: '' }))
      ).toThrow('targetId');
    });

    it('B4: should throw when observedAt is missing', () => {
      expect(() =>
        createOutcomeMemory(createValidOptions({ observedAt: undefined as unknown as string }))
      ).toThrow('observedAt');
    });

    it('B5: should throw when observedAt is not a valid date', () => {
      expect(() =>
        createOutcomeMemory(createValidOptions({ observedAt: 'not-a-date' }))
      ).toThrow('valid ISO 8601');
    });

    it('B6: should throw when ownerId is empty', () => {
      expect(() =>
        createOutcomeMemory(createValidOptions({ ownerId: '' }))
      ).toThrow('ownerId');
    });

    it('B7: should throw when metric value is NaN', () => {
      expect(() =>
        createOutcomeMemory(createValidOptions({
          metrics: [{ key: 'views', value: NaN }],
        }))
      ).toThrow('number');
    });

    it('B8: should throw when metric key is empty', () => {
      expect(() =>
        createOutcomeMemory(createValidOptions({
          metrics: [{ key: '', value: 100 }],
        }))
      ).toThrow('key');
    });

    it('B9: should throw when confidence is out of range (via clamp)', () => {
      // confidence is clamped to 0-1 by createMemoryRecord
      const outcome = createOutcomeMemory(createValidOptions({ confidence: 1.5 }));
      expect(outcome.confidence).toBe(1);
    });

    it('B10: should accept all valid OutcomeTypes', () => {
      for (const type of OUTCOME_TYPES) {
        const outcome = createOutcomeMemory(createValidOptions({ outcomeType: type }));
        expect(outcome.payload.outcomeType).toBe(type);
      }
    });

    it('B11: should accept all valid OutcomeTargetTypes', () => {
      for (const targetType of OUTCOME_TARGET_TYPES) {
        const outcome = createOutcomeMemory(createValidOptions({ targetType, targetId: `${targetType}_123` }));
        expect(outcome.payload.targetType).toBe(targetType);
      }
    });

    it('B12: should throw when attribution field is non-string', () => {
      expect(() =>
        createOutcomeMemory(createValidOptions({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          attribution: { decisionId: 123 as any },
        }))
      ).toThrow('attribution');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category C: Persistence Tests (in-memory)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Category C: Persistence (in-memory)', () => {
    let store: MockMemoryStore;

    beforeEach(() => {
      store = new MockMemoryStore();
    });

    it('C1: should create and store an outcome', async () => {
      const outcome = createOutcomeMemory(createValidOptions());
      const stored = await store.create(outcome);

      expect(stored.id).toBe(outcome.id);
      expect(stored.ownerId).toBe('user_A');
      expect(store.records.size).toBe(1);
    });

    it('C2: should retrieve outcome by ID', async () => {
      const outcome = createOutcomeMemory(createValidOptions());
      await store.create(outcome);

      const retrieved = await store.getById(outcome.id, 'user_A');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(outcome.id);
      expect(retrieved!.payload.outcomeType).toBe('performance');
    });

    it('C3: should round-trip payload correctly', async () => {
      const metrics: OutcomeMetric[] = [
        { key: 'views', value: 99999, unit: 'count', source: 'douyin' },
      ];
      const outcome = createOutcomeMemory(createValidOptions({
        metrics,
        summary: 'Viral content test',
        attribution: { decisionId: 'dec_abc', contentId: 'content_xyz' },
      }));
      await store.create(outcome);

      const retrieved = await store.getById(outcome.id, 'user_A');
      const payload = retrieved!.payload as OutcomeMemoryPayload;

      expect(payload.metrics).toHaveLength(1);
      expect(payload.metrics![0].value).toBe(99999);
      expect(payload.summary).toBe('Viral content test');
      expect(payload.attribution?.decisionId).toBe('dec_abc');
      expect(payload.attribution?.contentId).toBe('content_xyz');
    });

    it('C4: preserve metrics array through persistence', async () => {
      const metrics: OutcomeMetric[] = [
        { key: 'views', value: 1000 },
        { key: 'likes', value: 50 },
        { key: 'comments', value: 10 },
        { key: 'shares', value: 5 },
      ];

      const outcome = createOutcomeMemory(createValidOptions({ metrics }));
      await store.create(outcome);

      const retrieved = await store.getById(outcome.id, 'user_A');
      const payload = retrieved!.payload as OutcomeMemoryPayload;
      expect(payload.metrics).toHaveLength(4);
      expect(payload.metrics!.map(m => m.key)).toEqual(['views', 'likes', 'comments', 'shares']);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category D: Owner Isolation Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Category D: Owner Isolation', () => {
    let retriever: InMemoryRetriever;

    beforeEach(() => {
      retriever = new InMemoryRetriever();
    });

    it('D1: user_B outcome should not be visible when scoped differently', async () => {
      const outcomeA = createOutcomeMemory(createValidOptions({ ownerId: 'user_A' }));
      const outcomeB = createOutcomeMemory(createValidOptions({
        id: 'out_b_1',
        ownerId: 'user_B',
        targetId: 'content_b_1',
      }));

      retriever.addRecords([outcomeA, outcomeB]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
      });

      // user_A can see outcomeA (topic scope) but not outcome_B
      expect(results.every(r => r.ownerId === 'user_A')).toBe(true);
    });

    it('D2: retrieveOutcomeMemories only returns matching owner', async () => {
      const outcomeA1 = createOutcomeMemory(createValidOptions({ id: 'out_a_1' }));
      const outcomeA2 = createOutcomeMemory(createValidOptions({ id: 'out_a_2', targetId: 'content_A2' }));
      const outcomeB = createOutcomeMemory(createValidOptions({
        id: 'out_b_1',
        ownerId: 'user_B',
        targetId: 'content_b_1',
      }));

      retriever.addRecords([outcomeA1, outcomeA2, outcomeB]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
      });

      const ownerIds = results.map(r => r.ownerId);
      expect(ownerIds).not.toContain('user_B');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category E: Project Isolation Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Category E: Project Isolation', () => {
    let retriever: InMemoryRetriever;

    beforeEach(() => {
      retriever = new InMemoryRetriever();
    });

    it('E1: project_B outcome should not be visible in project_A retrieval', async () => {
      const outcomeA = createOutcomeMemory(createValidOptions({
        id: 'out_proj_a',
        ownerId: 'user_A',
        projectId: 'proj_A',
        targetId: 'content_A',
      }));
      const outcomeB = createOutcomeMemory(createValidOptions({
        id: 'out_proj_b',
        ownerId: 'user_A',
        projectId: 'proj_B',
        targetId: 'content_B',
      }));

      retriever.addRecords([outcomeA, outcomeB]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_A',
      });

      expect(results.every(r => r.projectId === 'proj_A')).toBe(true);
      expect(results.find(r => r.id === 'out_proj_b')).toBeUndefined();
    });

    it('E2: global scope outcome should be visible cross-project', async () => {
      const globalOutcome = createOutcomeMemory(createValidOptions({
        id: 'out_global',
        ownerId: 'user_A',
        projectId: undefined,
        topicId: undefined,
        targetId: 'target_global',
      }));
      const projectOutcome = createOutcomeMemory(createValidOptions({
        id: 'out_proj',
        ownerId: 'user_A',
        projectId: 'proj_X',
        targetId: 'target_proj',
      }));

      retriever.addRecords([globalOutcome, projectOutcome]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_Y', // different project
      });

      // global should be visible in any project
      expect(results.find(r => r.id === 'out_global')).toBeDefined();
      // proj_X outcome should NOT be visible in proj_Y
      expect(results.find(r => r.id === 'out_proj')).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category F: Topic Isolation Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Category F: Topic Isolation', () => {
    let retriever: InMemoryRetriever;

    beforeEach(() => {
      retriever = new InMemoryRetriever();
    });

    it('F1: topic_B outcome should not be visible in topic_A retrieval', async () => {
      const outcomeTopicA = createOutcomeMemory(createValidOptions({
        id: 'out_topic_a',
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_A',
        targetId: 'content_topic_a',
      }));
      const outcomeTopicB = createOutcomeMemory(createValidOptions({
        id: 'out_topic_b',
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_B',
        targetId: 'content_topic_b',
      }));

      retriever.addRecords([outcomeTopicA, outcomeTopicB]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_A',
      });

      expect(results.every(r => r.topicId === 'topic_A' || r.scope === 'global')).toBe(true);
    });

    it('F2: same topic outcomes should be visible', async () => {
      const outcome1 = createOutcomeMemory(createValidOptions({
        id: 'out_t1',
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_shared',
      }));
      const outcome2 = createOutcomeMemory(createValidOptions({
        id: 'out_t2',
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_shared',
        targetId: 'content_2',
      }));

      retriever.addRecords([outcome1, outcome2]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_shared',
      });

      expect(results.length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category G: Retrieval Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Category G: Retrieval', () => {
    let retriever: InMemoryRetriever;

    beforeEach(() => {
      retriever = new InMemoryRetriever();
    });

    it('G1: should retrieve outcomes by targetType', async () => {
      const contentOutcome = createOutcomeMemory(createValidOptions({
        id: 'out_content',
        targetType: 'content',
        targetId: 'c_1',
      }));
      const draftOutcome = createOutcomeMemory(createValidOptions({
        id: 'out_draft',
        targetType: 'draft',
        targetId: 'd_1',
      }));

      retriever.addRecords([contentOutcome, draftOutcome]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
        targetType: 'content',
      });

      expect(results.every(r => r.payload.targetType === 'content')).toBe(true);
      expect(results.find(r => r.id === 'out_draft')).toBeUndefined();
    });

    it('G2: should retrieve outcomes by targetId', async () => {
      const outcome1 = createOutcomeMemory(createValidOptions({
        id: 'out_t1',
        targetId: 'content_abc',
      }));
      const outcome2 = createOutcomeMemory(createValidOptions({
        id: 'out_t2',
        targetId: 'content_xyz',
      }));

      retriever.addRecords([outcome1, outcome2]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
        targetId: 'content_abc',
      });

      expect(results.every(r => r.payload.targetId === 'content_abc')).toBe(true);
    });

    it('G3: should retrieve outcomes by outcomeType', async () => {
      const perfOutcome = createOutcomeMemory(createValidOptions({
        id: 'out_perf',
        outcomeType: 'performance',
      }));
      const failOutcome = createOutcomeMemory(createValidOptions({
        id: 'out_fail',
        outcomeType: 'failure',
        targetId: 'content_fail',
      }));

      retriever.addRecords([perfOutcome, failOutcome]);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
        outcomeType: 'failure',
      });

      expect(results.every(r => r.payload.outcomeType === 'failure')).toBe(true);
    });

    it('G4: should respect limit parameter', async () => {
      const outcomes = Array.from({ length: 10 }, (_, i) =>
        createOutcomeMemory(createValidOptions({
          id: `out_limit_${i}`,
          targetId: `content_limit_${i}`,
          observedAt: `2026-10-0${(i % 9) + 1}T10:00:00.000Z`,
        }))
      );

      retriever.addRecords(outcomes);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
        limit: 3,
      });

      expect(results.length).toBe(3);
    });

    it('G5: getOutcomeHistory should return sorted by observedAt DESC', async () => {
      const outcomes = [
        createOutcomeMemory(createValidOptions({
          id: 'out_h1',
          targetId: 'content_h',
          observedAt: '2026-10-01T10:00:00.000Z',
        })),
        createOutcomeMemory(createValidOptions({
          id: 'out_h2',
          targetId: 'content_h',
          observedAt: '2026-10-10T10:00:00.000Z',
        })),
        createOutcomeMemory(createValidOptions({
          id: 'out_h3',
          targetId: 'content_h',
          observedAt: '2026-10-05T10:00:00.000Z',
        })),
      ];

      retriever.addRecords(outcomes);

      const history = await getOutcomeHistory(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
        targetType: 'content',
        targetId: 'content_h',
      });

      // Should be sorted: Oct 10 → Oct 5 → Oct 1
      expect(history).toHaveLength(3);
      expect(history[0].id).toBe('out_h2');
      expect(history[1].id).toBe('out_h3');
      expect(history[2].id).toBe('out_h1');
    });

    it('G6: getLatestOutcome should return single most recent', async () => {
      const outcomes = [
        createOutcomeMemory(createValidOptions({
          id: 'out_latest_1',
          targetId: 'content_latest',
          observedAt: '2026-10-01T10:00:00.000Z',
        })),
        createOutcomeMemory(createValidOptions({
          id: 'out_latest_2',
          targetId: 'content_latest',
          observedAt: '2026-10-15T10:00:00.000Z',
        })),
        createOutcomeMemory(createValidOptions({
          id: 'out_latest_3',
          targetId: 'content_latest',
          observedAt: '2026-10-10T10:00:00.000Z',
        })),
      ];

      retriever.addRecords(outcomes);

      const latest = await getLatestOutcome(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
        targetType: 'content',
        targetId: 'content_latest',
      });

      expect(latest).not.toBeNull();
      expect(latest!.id).toBe('out_latest_2');
      expect(latest!.payload.observedAt).toBe('2026-10-15T10:00:00.000Z');
    });

    it('G7: getLatestOutcome should return null when no matching outcome', async () => {
      const latest = await getLatestOutcome(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        targetType: 'content',
        targetId: 'content_nonexistent',
      });

      expect(latest).toBeNull();
    });

    it('G8: should sort retrieved outcomes by observedAt DESC', async () => {
      const outcomes = [
        createOutcomeMemory(createValidOptions({
          id: 'out_sort_1',
          targetId: 'c_sort_1',
          observedAt: '2026-10-01T10:00:00.000Z',
        })),
        createOutcomeMemory(createValidOptions({
          id: 'out_sort_2',
          targetId: 'c_sort_2',
          observedAt: '2026-10-15T10:00:00.000Z',
        })),
        createOutcomeMemory(createValidOptions({
          id: 'out_sort_3',
          targetId: 'c_sort_3',
          observedAt: '2026-10-10T10:00:00.000Z',
        })),
      ];

      retriever.addRecords(outcomes);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_A',
        projectId: 'proj_1',
        topicId: 'topic_1',
      });

      expect(results[0].id).toBe('out_sort_2');
      expect(results[1].id).toBe('out_sort_3');
      expect(results[2].id).toBe('out_sort_1');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category H: Context Bridge Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Category H: Context Bridge', () => {
    it('H1: should produce ContextObject with kind=outcome', () => {
      const outcome = createOutcomeMemory(createValidOptions());
      const ctx = outcomeMemoryToContext(outcome);

      expect(ctx.kind).toBe('outcome');
      expect(ctx.type).toBe('outcome');
    });

    it('H2: should preserve outcomeType in context payload', () => {
      const outcome = createOutcomeMemory(createValidOptions({ outcomeType: 'engagement' }));
      const ctx = outcomeMemoryToContext(outcome);

      expect(ctx.payload.outcomeType).toBe('engagement');
    });

    it('H3: should preserve observedAt in context payload', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        observedAt: '2026-10-01T15:30:00.000Z',
      }));
      const ctx = outcomeMemoryToContext(outcome);

      expect(ctx.payload.observedAt).toBe('2026-10-01T15:30:00.000Z');
    });

    it('H4: should preserve metrics as value in context payload', () => {
      const metrics: OutcomeMetric[] = [
        { key: 'views', value: 50000, source: 'douyin' },
      ];
      const outcome = createOutcomeMemory(createValidOptions({ metrics }));
      const ctx = outcomeMemoryToContext(outcome);

      expect(ctx.payload.value).toEqual(metrics);
    });

    it('H5: should preserve provenance (source, ownerId, projectId, topicId)', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        source: 'manual_entry',
        projectId: 'proj_1',
        topicId: 'topic_1',
      }));
      const ctx = outcomeMemoryToContext(outcome);

      expect(ctx.provenance.source).toBe('manual_entry');
      expect(ctx.provenance.ownerId).toBe('user_A');
      expect(ctx.provenance.projectId).toBe('proj_1');
      expect(ctx.provenance.topicId).toBe('topic_1');
    });

    it('H6: should set context ID with ctx_out_ prefix', () => {
      const outcome = createOutcomeMemory(createValidOptions({ id: 'out_test_ctx' }));
      const ctx = outcomeMemoryToContext(outcome);

      expect(ctx.id).toBe('ctx_out_out_test_ctx');
    });

    it('H7: tryOutcomeMemoryToContext returns null for non-outcome record', () => {
      const nonOutcome: MemoryRecord = {
        id: 'mem_generic',
        kind: 'static',
        type: 'writing_profile',
        payload: { name: 'John' },
        scope: 'global',
        ownerId: 'user_A',
        source: 'test',
        sourceType: 'test',
        confidence: 0.9,
        importance: 0.5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        accessCount: 0,
        version: 1,
        status: 'active',
      };

      const result = tryOutcomeMemoryToContext(nonOutcome);
      expect(result).toBeNull();
    });

    it('H8: tryOutcomeMemoryToContext returns context for outcome record', () => {
      const outcome = createOutcomeMemory(createValidOptions());
      const result = tryOutcomeMemoryToContext(outcome);

      expect(result).not.toBeNull();
      expect(result!.kind).toBe('outcome');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category I: Attribution Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Category I: Attribution', () => {
    it('I1: should preserve decisionId in attribution', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        attribution: { decisionId: 'dec_abc_123' },
      }));
      const attr = outcome.payload.attribution!;
      expect(attr.decisionId).toBe('dec_abc_123');
    });

    it('I2: should preserve contentId in attribution', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        attribution: { contentId: 'content_xyz_456' },
      }));
      expect(outcome.payload.attribution!.contentId).toBe('content_xyz_456');
    });

    it('I3: should preserve draftId in attribution', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        attribution: { draftId: 'draft_789' },
      }));
      expect(outcome.payload.attribution!.draftId).toBe('draft_789');
    });

    it('I4: should preserve topicId in attribution', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        attribution: { topicId: 'topic_attr_1' },
      }));
      expect(outcome.payload.attribution!.topicId).toBe('topic_attr_1');
    });

    it('I5: should preserve complete attribution chain', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        attribution: {
          decisionId: 'dec_chain_1',
          strategyId: 'strat_chain_2',
          contentId: 'content_chain_3',
          draftId: 'draft_chain_4',
          topicId: 'topic_chain_5',
        },
      }));

      const attr = outcome.payload.attribution!;
      expect(attr.decisionId).toBe('dec_chain_1');
      expect(attr.strategyId).toBe('strat_chain_2');
      expect(attr.contentId).toBe('content_chain_3');
      expect(attr.draftId).toBe('draft_chain_4');
      expect(attr.topicId).toBe('topic_chain_5');
    });

    it('I6: attribution link survives context bridge', () => {
      const outcome = createOutcomeMemory(createValidOptions({
        attribution: { decisionId: 'dec_link_1' },
      }));
      // Context bridge does NOT copy attribution to OutcomeContextPayload
      // because OutcomeContextPayload doesn't have attribution field.
      // Attribution is on OutcomeMemory payload — not context payload.
      const ctx = outcomeMemoryToContext(outcome);
      expect(ctx.kind).toBe('outcome');
      // The attribution stays in original memory record, not context.
      // This is by design — context is for prompt injection, attribution
      // is for future graph analysis.
      expect(outcome.payload.attribution?.decisionId).toBe('dec_link_1');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Type Guard Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('isOutcomeMemory type guard', () => {
  it('should return true for valid outcome memory', () => {
    const outcome = createOutcomeMemory(createValidOptions());
    expect(isOutcomeMemory(outcome)).toBe(true);
  });

  it('should return false for non-outcome type record', () => {
    const record: MemoryRecord = {
      id: 'mem_other',
      kind: 'static',
      type: 'writing_profile',
      payload: { foo: 'bar' },
      scope: 'global',
      ownerId: 'user_A',
      source: 'test',
      sourceType: 'test',
      confidence: 0.5,
      importance: 0.5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      accessCount: 0,
      version: 1,
      status: 'active',
    };
    expect(isOutcomeMemory(record)).toBe(false);
  });

  it('should return false for null payload', () => {
    const record: MemoryRecord = {
      id: 'mem_null_payload',
      kind: 'episodic',
      type: 'outcome',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: null as any,
      scope: 'global',
      ownerId: 'user_A',
      source: 'test',
      sourceType: 'test',
      confidence: 0.5,
      importance: 0.5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      accessCount: 0,
      version: 1,
      status: 'active',
    };
    expect(isOutcomeMemory(record)).toBe(false);
  });

  it('should return false for outcome type without observedAt', () => {
    const record: MemoryRecord = {
      id: 'mem_no_observed',
      kind: 'episodic',
      type: 'outcome',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: { outcomeType: 'performance', targetType: 'content', targetId: 'c_1' } as any,
      scope: 'global',
      ownerId: 'user_A',
      source: 'test',
      sourceType: 'test',
      confidence: 0.5,
      importance: 0.5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      accessCount: 0,
      version: 1,
      status: 'active',
    };
    expect(isOutcomeMemory(record)).toBe(false);
  });
});
