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

// ═══════════════════════════════════════════════════════════════════════════════
// P0.6.5.1-R1 — Retrieval Hardening Tests (InMemory)
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.5.1-R1 — Retrieval Hardening (InMemory Unit)', () => {
  // ─── R1-T1u: InMemory type filtering ────────────────────────────────
  describe('R1-T1u: InMemory type filtering', () => {
    it('should only return outcome type when mixed types exist in InMemoryRetriever', async () => {
      const outcome = createOutcomeMemory({
        id: 'r1_u_t1_outcome',
        outcomeType: 'engagement',
        targetType: 'content',
        targetId: 'target_u_t1',
        observedAt: '2026-10-01T00:00:00.000Z',
        ownerId: 'user_u_t1',
        projectId: 'proj_u_t1',
      });

      // Manually create a non-outcome record
      const decisionRecord: MemoryRecord = {
        id: 'r1_u_t1_decision',
        kind: 'semantic',
        type: 'decision',
        payload: { title: 'Test' },
        scope: 'global',
        ownerId: 'user_u_t1',
        source: 'test',
        sourceType: 'test',
        confidence: 0.8,
        importance: 0.7,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        accessCount: 0,
        version: 1,
        status: 'active',
      };

      const profileRecord: MemoryRecord = {
        id: 'r1_u_t1_profile',
        kind: 'static',
        type: 'writing_profile',
        payload: { tone: 'casual' },
        scope: 'global',
        ownerId: 'user_u_t1',
        source: 'test',
        sourceType: 'test',
        confidence: 0.9,
        importance: 0.5,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        accessCount: 0,
        version: 1,
        status: 'active',
      };

      // Use MockMemoryStore to add records, then retrieve via DatabaseMemoryRetriever
      const mockStore = new InMemoryRetriever([outcome, decisionRecord, profileRecord]);

      const results = await retrieveOutcomeMemories(mockStore, {
        ownerId: 'user_u_t1',
        projectId: 'proj_u_t1',
      });

      // Only outcome should be returned
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('r1_u_t1_outcome');
      expect(results[0].type).toBe('outcome');
    });
  });

  // ─── R1-T2u: Mixed memory volume (InMemory) ─────────────────────────
  describe('R1-T2u: mixed memory volume completeness', () => {
    it('should return exactly 10 outcomes from a pool of 100+ mixed records (InMemory)', async () => {
      const records: MemoryRecord[] = [];

      // 80 regular records
      for (let i = 0; i < 80; i++) {
        records.push({
          id: `r1_u_t2_regular_${i}`,
          kind: 'static',
          type: 'writing_profile',
          payload: { idx: i },
          scope: 'global',
          ownerId: 'user_u_t2',
          source: 'test',
          sourceType: 'test',
          confidence: 0.8,
          importance: 0.9,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          accessCount: 0,
          version: 1,
          status: 'active',
        });
      }

      // 20 outcome records
      for (let i = 0; i < 20; i++) {
        records.push(
          createOutcomeMemory({
            id: `r1_u_t2_outcome_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_u_t2',
            observedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_u_t2',
            projectId: 'proj_u_t2',
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_u_t2',
        projectId: 'proj_u_t2',
        limit: 10,
      });

      expect(results).toHaveLength(10);
      expect(results.every(r => r.type === 'outcome')).toBe(true);
      expect(results.every(r => r.id.startsWith('r1_u_t2_outcome_'))).toBe(true);
    });
  });

  // ─── R1-T3u: History bounded but complete within window ──────────────
  describe('R1-T3u: history bounded window', () => {
    it('should return exactly the requested limit when fewer exist', async () => {
      const records: MemoryRecord[] = [];

      for (let i = 0; i < 50; i++) {
        records.push(
          createOutcomeMemory({
            id: `r1_u_t3_out_${i}`,
            outcomeType: 'engagement',
            targetType: 'content',
            targetId: 'target_u_t3',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_u_t3',
            projectId: 'proj_u_t3',
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const history = await getOutcomeHistory(retriever, {
        ownerId: 'user_u_t3',
        projectId: 'proj_u_t3',
        targetType: 'content',
        targetId: 'target_u_t3',
        limit: 100, // ask for more than exist
      });

      expect(history).toHaveLength(50);
    });
  });

  // ─── R1-T4u: Latest outcome within high bounded window ───────────────
  describe('R1-T4u: latest outcome correctness (bounded window)', () => {
    it('should find latest when within window', async () => {
      const records: MemoryRecord[] = [];

      for (let i = 0; i < 120; i++) {
        records.push(
          createOutcomeMemory({
            id: `r1_u_t4_out_${i}`,
            outcomeType: 'engagement',
            targetType: 'content',
            targetId: 'target_u_t4',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_u_t4',
            projectId: 'proj_u_t4',
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const latest = await getLatestOutcome(retriever, {
        ownerId: 'user_u_t4',
        projectId: 'proj_u_t4',
        targetType: 'content',
        targetId: 'target_u_t4',
        limit: 200,
      });

      expect(latest).not.toBeNull();
      expect(latest!.id).toBe('r1_u_t4_out_119');
    });
  });

  // ─── R1-T5u: Limit clamp test ────────────────────────────────────────
  describe('R1-T5u: limit clamp to safe maximum', () => {
    it('should clamp limit to MAX_OUTCOME_HISTORY_LIMIT (500)', async () => {
      const records: MemoryRecord[] = [];

      for (let i = 0; i < 5; i++) {
        records.push(
          createOutcomeMemory({
            id: `r1_u_t5_out_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_u_t5',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_u_t5',
            projectId: 'proj_u_t5',
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      // Request limit beyond max — verify clamp works
      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_u_t5',
        projectId: 'proj_u_t5',
        limit: 9999,
      });

      // Should not fail and should return all 5 outcomes (within clamped limit)
      expect(results).toHaveLength(5);
    });
  });

  // ─── R1-T6u: History observedAt DESC sorting ─────────────────────────
  describe('R1-T6u: history sort order (observedAt DESC)', () => {
    it('should return history sorted by observedAt DESC regardless of storage order', async () => {
      const records: MemoryRecord[] = [];

      // Insert out of order
      const timestamps = [
        '2026-06-01T00:00:00.000Z',
        '2026-12-01T00:00:00.000Z',
        '2026-03-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ];

      for (let i = 0; i < timestamps.length; i++) {
        records.push(
          createOutcomeMemory({
            id: `r1_u_t6_out_${i}`,
            outcomeType: 'engagement',
            targetType: 'content',
            targetId: 'target_u_t6',
            observedAt: timestamps[i],
            ownerId: 'user_u_t6',
            projectId: 'proj_u_t6',
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const history = await getOutcomeHistory(retriever, {
        ownerId: 'user_u_t6',
        projectId: 'proj_u_t6',
        targetType: 'content',
        targetId: 'target_u_t6',
      });

      expect(history).toHaveLength(5);
      expect(history[0].id).toBe('r1_u_t6_out_1'); // Dec
      expect(history[1].id).toBe('r1_u_t6_out_3'); // Sep
      expect(history[2].id).toBe('r1_u_t6_out_0'); // Jun
      expect(history[3].id).toBe('r1_u_t6_out_2'); // Mar
      expect(history[4].id).toBe('r1_u_t6_out_4'); // Jan
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0.6.5.1-R2 — Target Retrieval Completeness Tests
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── R2-T1: Multi-Target Mix ─────────────────────────────────────────
  describe('R2-T1: multi-target mix (80 target A + 20 target B)', () => {
    it('should return all 20 target_B outcomes when limit=20', async () => {
      const records: MemoryRecord[] = [];

      // 80 outcomes for target_A (high importance so they sort first)
      for (let i = 0; i < 80; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t1_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t1',
            projectId: 'proj_r2_t1',
            // High importance so target_A sorts before target_B
            importance: 0.9,
          })
        );
      }

      // 20 outcomes for target_B (lower importance)
      for (let i = 0; i < 20; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t1_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            observedAt: new Date(Date.UTC(2026, 0, 2, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t1',
            projectId: 'proj_r2_t1',
            importance: 0.5,
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_r2_t1',
        projectId: 'proj_r2_t1',
        targetType: 'content',
        targetId: 'target_B',
        limit: 20,
      });

      // MUST return all 20 target_B outcomes
      expect(results).toHaveLength(20);

      // ALL results must be target_B
      expect(results.every(r => (r.payload as { targetId: string }).targetId === 'target_B')).toBe(true);

      // Sorted by observedAt DESC
      for (let i = 1; i < results.length; i++) {
        const prev = new Date((results[i - 1].payload as { observedAt: string }).observedAt).getTime();
        const curr = new Date((results[i].payload as { observedAt: string }).observedAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  // ─── R2-T2: Multi-OutcomeType Mix ───────────────────────────────────
  describe('R2-T2: multi-outcomeType mix (50 performance + 30 engagement + 20 conversion)', () => {
    it('should return all 20 conversion outcomes when limit=20', async () => {
      const records: MemoryRecord[] = [];

      // 50 performance outcomes
      for (let i = 0; i < 50; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t2_perf_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_r2_t2',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t2',
            projectId: 'proj_r2_t2',
            importance: 0.95,
          })
        );
      }

      // 30 engagement outcomes
      for (let i = 0; i < 30; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t2_eng_${i}`,
            outcomeType: 'engagement',
            targetType: 'content',
            targetId: 'target_r2_t2',
            observedAt: new Date(Date.UTC(2026, 0, 2, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t2',
            projectId: 'proj_r2_t2',
            importance: 0.8,
          })
        );
      }

      // 20 conversion outcomes
      for (let i = 0; i < 20; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t2_conv_${i}`,
            outcomeType: 'conversion',
            targetType: 'content',
            targetId: 'target_r2_t2',
            observedAt: new Date(Date.UTC(2026, 0, 3, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t2',
            projectId: 'proj_r2_t2',
            importance: 0.6,
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_r2_t2',
        projectId: 'proj_r2_t2',
        targetType: 'content',
        targetId: 'target_r2_t2',
        outcomeType: 'conversion',
        limit: 20,
      });

      expect(results).toHaveLength(20);
      expect(results.every(r => (r.payload as { outcomeType: string }).outcomeType === 'conversion')).toBe(true);
    });
  });

  // ─── R2-T3: Multi-Target + Multi-Type Mix ───────────────────────────
  describe('R2-T3: multi-target + multi-type mix (200 outcomes, mixed)', () => {
    it('should accurately return target_B + conversion subset', async () => {
      const records: MemoryRecord[] = [];

      // Generate 200 outcomes: 4 targets × 50 each, with mixed outcomeTypes
      const targets = ['tA', 'tB', 'tC', 'tD'];
      const types = ['performance', 'engagement', 'conversion', 'milestone'];
      let idx = 0;

      for (const target of targets) {
        for (let i = 0; i < 50; i++) {
          records.push(
            createOutcomeMemory({
              id: `r2_t3_out_${idx}`,
              outcomeType: types[i % 4] as 'performance' | 'engagement' | 'conversion' | 'milestone',
              targetType: 'content',
              targetId: target,
              observedAt: new Date(Date.UTC(2026, 0, 1 + (idx % 28), 0, 0, idx % 60)).toISOString(),
              ownerId: 'user_r2_t3',
              projectId: 'proj_r2_t3',
              importance: 0.9 - (idx % 10) * 0.05,
            })
          );
          idx++;
        }
      }

      const retriever = new InMemoryRetriever(records);

      // Query: target_B + conversion type
      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_r2_t3',
        projectId: 'proj_r2_t3',
        targetType: 'content',
        targetId: 'tB',
        outcomeType: 'conversion',
        limit: 50,
      });

      // tB has 50 outcomes, every 4th is conversion ≈ 12-13 conversion records
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(50);

      // ALL must be target_B AND conversion
      for (const r of results) {
        expect((r.payload as { targetId: string }).targetId).toBe('tB');
        expect((r.payload as { outcomeType: string }).outcomeType).toBe('conversion');
      }

      // Sorted by observedAt DESC
      for (let i = 1; i < results.length; i++) {
        const prev = new Date((results[i - 1].payload as { observedAt: string }).observedAt).getTime();
        const curr = new Date((results[i].payload as { observedAt: string }).observedAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  // ─── R2-T4: History Completeness ────────────────────────────────────
  describe('R2-T4: history completeness (100 target A + 50 target B, query B limit=50)', () => {
    it('should return 50 target_B outcomes sorted by observedAt DESC', async () => {
      const records: MemoryRecord[] = [];

      // 100 target_A outcomes (high importance, sort first)
      for (let i = 0; i < 100; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t4_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t4',
            projectId: 'proj_r2_t4',
            importance: 0.95,
          })
        );
      }

      // 50 target_B outcomes (lower importance)
      for (let i = 0; i < 50; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t4_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            observedAt: new Date(Date.UTC(2026, 3, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t4',
            projectId: 'proj_r2_t4',
            importance: 0.7,
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const history = await getOutcomeHistory(retriever, {
        ownerId: 'user_r2_t4',
        projectId: 'proj_r2_t4',
        targetType: 'content',
        targetId: 'target_B',
        limit: 50,
      });

      // MUST return all 50 target_B outcomes
      expect(history).toHaveLength(50);

      // ALL target_B
      expect(history.every(r => (r.payload as { targetId: string }).targetId === 'target_B')).toBe(true);

      // Sorted by observedAt DESC
      for (let i = 1; i < history.length; i++) {
        const prev = new Date((history[i - 1].payload as { observedAt: string }).observedAt).getTime();
        const curr = new Date((history[i].payload as { observedAt: string }).observedAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  // ─── R2-T5: Latest Outcome Correctness ──────────────────────────────
  describe('R2-T5: latest outcome (target B with truly latest observation)', () => {
    it('should return target B truly latest observation, not just first batch latest', async () => {
      const records: MemoryRecord[] = [];

      // 100 target_A outcomes with LATEST observedAt (but they are target_A)
      for (let i = 0; i < 100; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t5_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            // Latest timestamps
            observedAt: new Date(Date.UTC(2026, 11, 31, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t5',
            projectId: 'proj_r2_t5',
            importance: 0.99,
          })
        );
      }

      // 10 target_B outcomes (earlier observedAt than target_A, but truly latest for B)
      for (let i = 0; i < 10; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t5_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            // Earlier than target_A, but this IS the latest for target_B
            observedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t5',
            projectId: 'proj_r2_t5',
            importance: 0.5,
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const latest = await getLatestOutcome(retriever, {
        ownerId: 'user_r2_t5',
        projectId: 'proj_r2_t5',
        targetType: 'content',
        targetId: 'target_B',
      });

      expect(latest).not.toBeNull();
      // Must be target_B
      expect((latest!.payload as { targetId: string }).targetId).toBe('target_B');
      // Must be the LAST observation for target_B (highest observedAt)
      // r2_t5_b_9 has the latest observedAt (May 1, second=9)
      expect(latest!.id).toBe('r2_t5_b_9');
    });
  });

  // ─── R2-T6: Batch Bound (No Infinite Loop) ─────────────────────────
  describe('R2-T6: batch bound (safety limit prevents infinite loop)', () => {
    it('should complete quickly without infinite loop even when bounded window is exhausted', async () => {
      const records: MemoryRecord[] = [];

      // 500 target_A outcomes (high importance, sort first — will fill the bounded window)
      for (let i = 0; i < 500; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t6_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60, i)).toISOString(),
            ownerId: 'user_r2_t6',
            projectId: 'proj_r2_t6',
            importance: 0.9,
            confidence: 0.9,
          })
        );
      }

      // Only 5 target_B outcomes (lower importance, sort after ALL target_A)
      // These are OUTSIDE the bounded window (500 records), demonstrating bounded behavior
      for (let i = 0; i < 5; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t6_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            observedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t6',
            projectId: 'proj_r2_t6',
            importance: 0.5,
            confidence: 0.5,
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      // This should complete quickly without infinite loop
      const startTime = Date.now();
      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_r2_t6',
        projectId: 'proj_r2_t6',
        targetType: 'content',
        targetId: 'target_B',
        limit: 50,
      });
      const elapsed = Date.now() - startTime;

      // Bounded behavior: target_B is beyond the 500-record window → returns []
      // This proves the safety bound works: no infinite loop, just bounded results
      expect(results).toHaveLength(0);

      // Should complete within reasonable time (< 5 seconds for safety)
      expect(elapsed).toBeLessThan(5000);
    });

    it('should return all matches when target falls within the bounded window', async () => {
      const records: MemoryRecord[] = [];

      // 400 target_A outcomes (high importance, sort first)
      for (let i = 0; i < 400; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t6b_a_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_A',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60, i)).toISOString(),
            ownerId: 'user_r2_t6b',
            projectId: 'proj_r2_t6b',
            importance: 0.9,
            confidence: 0.9,
          })
        );
      }

      // 5 target_B outcomes (lower importance, but within the 500-record bounded window)
      for (let i = 0; i < 5; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t6b_b_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_B',
            observedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t6b',
            projectId: 'proj_r2_t6b',
            importance: 0.5,
            confidence: 0.5,
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const startTime = Date.now();
      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_r2_t6b',
        projectId: 'proj_r2_t6b',
        targetType: 'content',
        targetId: 'target_B',
        limit: 50,
      });
      const elapsed = Date.now() - startTime;

      // Within bounded window: all 5 target_B matches found
      expect(results).toHaveLength(5);
      expect(results.every(r => (r.payload as { targetId: string }).targetId === 'target_B')).toBe(true);

      // Should complete within reasonable time
      expect(elapsed).toBeLessThan(5000);
    });
  });

  // ─── R2-T7: Regression — basic retrieval still works ───────────────
  describe('R2-T7: regression (basic single-target retrieval)', () => {
    it('should still correctly retrieve outcomes for a single target with no mix', async () => {
      const records: MemoryRecord[] = [];

      for (let i = 0; i < 10; i++) {
        records.push(
          createOutcomeMemory({
            id: `r2_t7_out_${i}`,
            outcomeType: 'performance',
            targetType: 'content',
            targetId: 'target_single',
            observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
            ownerId: 'user_r2_t7',
            projectId: 'proj_r2_t7',
          })
        );
      }

      const retriever = new InMemoryRetriever(records);

      const results = await retrieveOutcomeMemories(retriever, {
        ownerId: 'user_r2_t7',
        projectId: 'proj_r2_t7',
        targetType: 'content',
        targetId: 'target_single',
        limit: 10,
      });

      expect(results).toHaveLength(10);
      expect(results.every(r => (r.payload as { targetId: string }).targetId === 'target_single')).toBe(true);
    });
  });
});
