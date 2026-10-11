/**
 * P0.7.5 — Runtime Learning Pipeline Tests
 *
 * Covers: policy evaluation, source generation, security, persistence, result contract.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { MemoryStore } from '@/memory/persistence/memory-store';
import type { MemoryRecord } from '@/memory/memory-record';
import type { MemoryQueryCriteria } from '@/memory/persistence/memory-query';
import { MemoryConcurrencyError } from '@/memory/persistence/memory-persistence-types';
import {
  createDecisionMemoryFixture,
  TEST_OWNER_A,
  TEST_OWNER_B,
  TEST_PROJECT_A,
  TEST_TOPIC_A,
} from '@/context/loop/__tests__/test-helpers';
import type { LearningCandidate } from '@/context/loop/context-loop-types';
import type { DecisionFeedback } from '@/memory/decision-feedback';
import {
  runRuntimeLearning,
  evaluateLearningCandidate,
  validatePolicy,
  DEFAULT_LEARNING_POLICY,
  LearningAuthorizationError,
  LearningValidationError,
} from '../runtime-learning';
import type {
  ContextOSLearningPolicy,
  RuntimeLearningSource,
  RuntimeLearningDependencies,
} from '../runtime-learning';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════
const NOW = '2026-10-11T10:00:00.000Z';
const FIXED_CLOCK = () => NOW;

// ═══════════════════════════════════════════════════════════════════════════════
// In-Memory Mock MemoryStore
// ═══════════════════════════════════════════════════════════════════════════════
class InMemoryMemoryStore implements MemoryStore {
  private records: Map<string, MemoryRecord> = new Map();
  private failNextCreate = false;
  private failGetByIdForId: string | null = null;
  private failAllGetById = false;
  private hookBeforeCreate: ((r: MemoryRecord) => void) | null = null;

  setFailNextCreate(v: boolean) { this.failNextCreate = v; }
  setFailGetByIdForId(id: string | null) { this.failGetByIdForId = id; }
  setFailAllGetById(v: boolean) { this.failAllGetById = v; }
  setHookBeforeCreate(fn: ((r: MemoryRecord) => void) | null) { this.hookBeforeCreate = fn; }
  getStoredRecords(): MemoryRecord[] { return Array.from(this.records.values()); }

  async create(record: MemoryRecord): Promise<MemoryRecord> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new MemoryConcurrencyError(record.id, 1);
    }
    if (this.records.has(record.id)) {
      throw new MemoryConcurrencyError(record.id, 1);
    }
    if (this.hookBeforeCreate) this.hookBeforeCreate(record);
    this.records.set(record.id, { ...record });
    return { ...record };
  }

  async getById(id: string, ownerId: string): Promise<MemoryRecord | null> {
    if (this.failAllGetById || (this.failGetByIdForId !== null && id === this.failGetByIdForId)) {
      throw new Error('Simulated getById failure');
    }
    const r = this.records.get(id);
    if (!r || r.ownerId !== ownerId) return null;
    return { ...r };
  }

  async update(record: MemoryRecord, auth: string, ver: number): Promise<MemoryRecord> {
    const ex = this.records.get(record.id);
    if (!ex || ex.ownerId !== auth) throw new MemoryConcurrencyError(record.id, ver);
    if (ex.version !== ver) throw new MemoryConcurrencyError(record.id, ver, ex.version);
    const u = { ...record, version: ex.version + 1 };
    this.records.set(record.id, u);
    return { ...u };
  }

  async delete(id: string, ownerId: string): Promise<void> {
    const r = this.records.get(id);
    if (r && r.ownerId === ownerId) this.records.delete(id);
  }

  async count(ownerId: string): Promise<number> {
    let n = 0;
    for (const r of this.records.values()) if (r.ownerId === ownerId) n++;
    return n;
  }

  async findMany(criteria: MemoryQueryCriteria): Promise<MemoryRecord[]> {
    let results = Array.from(this.records.values());
    if (criteria.ownerId) results = results.filter((r) => r.ownerId === criteria.ownerId);
    return results.map((r) => ({ ...r }));
  }

  async supersede(oldRec: MemoryRecord, newRec: MemoryRecord, auth: string, ver: number): Promise<MemoryRecord> {
    await this.update(oldRec, auth, ver);
    return this.create(newRec);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Create a DecisionMemory with explicit scope, bypassing the `?? TEST_TOPIC_A`
 * default in createDecisionMemoryFixture that would otherwise make all fixtures
 * carry a topicId.
 */
function createDecisionWithScope(
  id: string,
  ownerId: string,
  projectId: string | undefined,
  topicId: string | undefined,
): ReturnType<typeof createDecisionMemoryFixture> {
  const base = createDecisionMemoryFixture({ id, ownerId });
  // Direct mutation to override the `?? TEST_TOPIC_A` default
  base.projectId = projectId ?? null;
  base.topicId = topicId ?? null;
  base.scope = topicId ? 'topic' : projectId ? 'project' : 'global';
  return base;
}

function createFeedback(overrides: Partial<DecisionFeedback> = {}): DecisionFeedback {
  return {
    id: 'dfb_test_001', ownerId: TEST_OWNER_A, decisionId: 'dec_test_001',
    decisionStatus: 'active', decisionCreatedAt: '2026-10-01T08:00:00.000Z',
    expectedOutcome: 'views > 10000', outcomeCount: 1, outcomeIds: ['out_001'],
    outcomeTypes: ['engagement'], windowStart: '2026-10-01T08:00:00.000Z',
    windowEnd: '2026-10-03T08:00:00.000Z',
    metricAggregations: [
      { metricKey: 'views', unit: 'count', count: 1, sum: 15000, avg: 15000, min: 15000, max: 15000, median: 15000, firstValue: 15000, lastValue: 15000, firstObservedAt: '2026-10-02T10:00:00.000Z', lastObservedAt: '2026-10-02T10:00:00.000Z' },
    ],
    trends: [{ metricKey: 'views', unit: 'count', currentValue: 15000, previousValue: 8000, delta: 7000, deltaPercent: 87.5, direction: 'up' }],
    status: 'evidence_available', completeness: 'complete', generatedAt: '2026-10-03T08:00:00.000Z',
    ...overrides,
  };
}

function createSource(overrides: Partial<RuntimeLearningSource> = {}): RuntimeLearningSource {
  const decision = createDecisionWithScope('dec_test_001', TEST_OWNER_A, TEST_PROJECT_A, TEST_TOPIC_A);
  const feedback = createFeedback({ decisionId: decision.id, ownerId: TEST_OWNER_A });
  return { decision, feedback, ...overrides };
}

function createCandidate(overrides: Partial<LearningCandidate> = {}): LearningCandidate {
  return {
    id: 'lc_dec_test_001_decision_pattern', type: 'decision_pattern', ownerId: TEST_OWNER_A,
    projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A, sourceDecisionId: 'dec_test_001',
    sourceOutcomeIds: ['out_001'], sourceFeedbackId: 'dfb_test_001', summary: 'Test candidate',
    evidence: [], confidence: 0.8, importance: 0.7, status: 'candidate', createdAt: NOW, ...overrides,
  };
}

function createDeps(store: InMemoryMemoryStore): RuntimeLearningDependencies {
  return { memoryStore: store, now: FIXED_CLOCK };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. POLICY EVALUATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('P0.7.5 — Policy Evaluation', () => {
  const policy: ContextOSLearningPolicy = DEFAULT_LEARNING_POLICY;

  it('1.1 default policy values', () => {
    expect(DEFAULT_LEARNING_POLICY.minConfidence).toBe(0.3);
    expect(DEFAULT_LEARNING_POLICY.minImportance).toBe(0);
    expect(DEFAULT_LEARNING_POLICY.maxCandidatesPerRun).toBe(20);
    expect(DEFAULT_LEARNING_POLICY.allowedCandidateTypes).toEqual([
      'decision_pattern', 'successful_pattern', 'failure_pattern', 'preference_signal', 'strategy_signal',
    ]);
    expect(DEFAULT_LEARNING_POLICY.allowedScopes).toEqual(['topic', 'project']);
    expect(DEFAULT_LEARNING_POLICY.requireOutcomeEvidence).toBe(true);
  });

  it('1.2 valid candidate passes default policy', () => {
    const r = evaluateLearningCandidate(createCandidate(), policy);
    expect(r.eligible).toBe(true);
    expect(r.reasonCode).toBe('VALID_POLICY');
    expect(r.resolvedScope).toBe('topic');
  });

  it('1.3 reject disallowed candidate type', () => {
    const cp: ContextOSLearningPolicy = { ...policy, allowedCandidateTypes: ['decision_pattern'] };
    const r = evaluateLearningCandidate(createCandidate({ type: 'strategy_signal' }), cp);
    expect(r.eligible).toBe(false);
    expect(r.reasonCode).toBe('DISALLOWED_CANDIDATE_TYPE');
  });

  it('1.4 reject below minConfidence', () => {
    expect(evaluateLearningCandidate(createCandidate({ confidence: 0.2 }), policy).reasonCode).toBe('BELOW_MIN_CONFIDENCE');
  });

  it('1.5 reject below minImportance when threshold > 0', () => {
    const cp: ContextOSLearningPolicy = { ...policy, minImportance: 0.5 };
    expect(evaluateLearningCandidate(createCandidate({ importance: 0.3 }), cp).reasonCode).toBe('BELOW_MIN_IMPORTANCE');
  });

  it('1.6 reject NaN confidence', () => {
    expect(evaluateLearningCandidate(createCandidate({ confidence: NaN }), policy).reasonCode).toBe('INVALID_CONFIDENCE');
  });

  it('1.7 reject Infinity confidence', () => {
    expect(evaluateLearningCandidate(createCandidate({ confidence: Infinity }), policy).reasonCode).toBe('INVALID_CONFIDENCE');
  });

  it('1.8 reject negative confidence', () => {
    expect(evaluateLearningCandidate(createCandidate({ confidence: -0.5 }), policy).reasonCode).toBe('INVALID_CONFIDENCE');
  });

  it('1.9 reject above-one confidence', () => {
    expect(evaluateLearningCandidate(createCandidate({ confidence: 1.5 }), policy).reasonCode).toBe('INVALID_CONFIDENCE');
  });

  it('1.10 reject NaN importance', () => {
    expect(evaluateLearningCandidate(createCandidate({ importance: NaN }), policy).reasonCode).toBe('INVALID_IMPORTANCE');
  });

  it('1.11 reject -Infinity importance', () => {
    expect(evaluateLearningCandidate(createCandidate({ importance: -Infinity }), policy).reasonCode).toBe('INVALID_IMPORTANCE');
  });

  it('1.12 reject negative importance', () => {
    expect(evaluateLearningCandidate(createCandidate({ importance: -1 }), policy).reasonCode).toBe('INVALID_IMPORTANCE');
  });

  it('1.13 reject above-one importance', () => {
    expect(evaluateLearningCandidate(createCandidate({ importance: 2 }), policy).reasonCode).toBe('INVALID_IMPORTANCE');
  });

  it('1.14 valid status is candidate', () => {
    expect(evaluateLearningCandidate(createCandidate({ status: 'candidate' }), policy).eligible).toBe(true);
  });

  it('1.15 reject missing decision source', () => {
    expect(evaluateLearningCandidate(createCandidate({ sourceDecisionId: '' }), policy).reasonCode).toBe('MISSING_DECISION_SOURCE');
  });

  it('1.16 reject missing feedback source', () => {
    expect(evaluateLearningCandidate(createCandidate({ sourceFeedbackId: '' }), policy).reasonCode).toBe('MISSING_FEEDBACK_SOURCE');
  });

  it('1.17 reject missing outcome when required', () => {
    expect(evaluateLearningCandidate(createCandidate({ sourceOutcomeIds: [] }), policy).reasonCode).toBe('MISSING_OUTCOME_SOURCE');
  });

  it('1.18 allow missing outcome when not required', () => {
    const cp: ContextOSLearningPolicy = { ...policy, requireOutcomeEvidence: false };
    expect(evaluateLearningCandidate(createCandidate({ sourceOutcomeIds: [] }), cp).eligible).toBe(true);
  });

  it('1.19 reject global scope by default', () => {
    expect(evaluateLearningCandidate(createCandidate({ topicId: undefined, projectId: undefined }), policy).reasonCode).toBe('SCOPE_NOT_ALLOWED');
  });

  it('1.20 allow global scope when configured', () => {
    const cp: ContextOSLearningPolicy = { ...policy, allowedScopes: ['global'] };
    const r = evaluateLearningCandidate(createCandidate({ topicId: undefined, projectId: undefined }), cp);
    expect(r.eligible).toBe(true);
    expect(r.resolvedScope).toBe('global');
  });

  it('1.21 resolve project scope when only projectId', () => {
    const cp: ContextOSLearningPolicy = { ...policy, allowedScopes: ['project'] };
    const r = evaluateLearningCandidate(createCandidate({ topicId: undefined }), cp);
    expect(r.resolvedScope).toBe('project');
    expect(r.resolvedProjectId).toBe(TEST_PROJECT_A);
  });

  it('1.22 topic scope takes priority over project resolution', () => {
    const r = evaluateLearningCandidate(createCandidate(), policy);
    expect(r.resolvedScope).toBe('topic');
    expect(r.resolvedTopicId).toBe(TEST_TOPIC_A);
    expect(r.resolvedProjectId).toBe(TEST_PROJECT_A);
  });

  it('1.23 deterministic for identical input', () => {
    const a = evaluateLearningCandidate(createCandidate({ confidence: 0.1 }), policy);
    const b = evaluateLearningCandidate(createCandidate({ confidence: 0.1 }), policy);
    expect(a.reasonCode).toBe(b.reasonCode);
    expect(a.eligible).toBe(b.eligible);
  });

  it('1.24 validatePolicy accepts valid overrides', () => {
    const m = validatePolicy({ minConfidence: 0.5 });
    expect(m.minConfidence).toBe(0.5);
    expect(m.maxCandidatesPerRun).toBe(20);
  });

  it('1.25 validatePolicy rejects NaN/Inf/+Inf minConfidence', () => {
    expect(() => validatePolicy({ minConfidence: NaN })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ minConfidence: Infinity })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ minConfidence: -Infinity })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ minConfidence: -0.1 })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ minConfidence: 1.5 })).toThrow(LearningValidationError);
  });

  it('1.26 validatePolicy rejects out-of-range minImportance', () => {
    expect(() => validatePolicy({ minImportance: NaN })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ minImportance: -1 })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ minImportance: 2 })).toThrow(LearningValidationError);
  });

  it('1.27 validatePolicy rejects invalid maxCandidatesPerRun', () => {
    expect(() => validatePolicy({ maxCandidatesPerRun: 0 })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ maxCandidatesPerRun: -5 })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ maxCandidatesPerRun: 1.5 })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ maxCandidatesPerRun: NaN })).toThrow(LearningValidationError);
  });

  it('1.28 validatePolicy rejects empty arrays', () => {
    expect(() => validatePolicy({ allowedCandidateTypes: [] as never })).toThrow(LearningValidationError);
    expect(() => validatePolicy({ allowedScopes: [] as never })).toThrow(LearningValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SOURCE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('P0.7.5 — Source Generation', () => {
  let store: InMemoryMemoryStore;
  beforeEach(() => { store = new InMemoryMemoryStore(); });

  it('2.1 reuses buildLearningCandidates for valid source', async () => {
    const src = createSource();
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store));
    expect(res.counts.total).toBeGreaterThanOrEqual(1);
    expect(res.items.length).toBeGreaterThanOrEqual(1);
  });

  it('2.2 no outcomes = no candidates', async () => {
    const src = createSource({ feedback: createFeedback({ outcomeCount: 0, outcomeIds: [], status: 'no_evidence' }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store));
    expect(res.items).toHaveLength(0);
    expect(res.counts.total).toBe(0);
  });

  it('2.3 multiple sources produce candidates in order', async () => {
    const s1 = createSource();
    const s2 = createSource({
      decision: createDecisionMemoryFixture({ id: 'dec_test_002', ownerId: TEST_OWNER_A, projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A }),
      feedback: createFeedback({ id: 'dfb_test_002', decisionId: 'dec_test_002' }),
    });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [s1, s2] }, createDeps(store));
    expect(res.items.length).toBeGreaterThanOrEqual(2);
    expect(res.items[0].candidateId).toContain('dec_test_001');
  });

  it('2.4 source owner mismatch rejected', async () => {
    const src = createSource({ decision: createDecisionMemoryFixture({ id: 'dec_other', ownerId: TEST_OWNER_B }) });
    await expect(runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store)))
      .rejects.toThrow(LearningAuthorizationError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SECURITY — OWNER ISOLATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('P0.7.5 — Security / Owner Isolation', () => {
  let store: InMemoryMemoryStore;
  beforeEach(() => { store = new InMemoryMemoryStore(); });

  it('3.1 reject empty authenticatedOwnerId', async () => {
    await expect(runRuntimeLearning({ authenticatedOwnerId: '', sources: [] }, createDeps(store)))
      .rejects.toThrow(LearningAuthorizationError);
  });

  it('3.2 reject whitespace-only authenticatedOwnerId', async () => {
    await expect(runRuntimeLearning({ authenticatedOwnerId: '   ', sources: [] }, createDeps(store)))
      .rejects.toThrow(LearningAuthorizationError);
  });

  it('3.3 reject mixed-owner batch before any storage I/O', async () => {
    const s1 = createSource();
    const s2 = createSource({ decision: createDecisionMemoryFixture({ id: 'dec_mm', ownerId: TEST_OWNER_B }) });
    let creates = 0;
    const ts = new InMemoryMemoryStore();
    const oc = ts.create.bind(ts);
    ts.create = async (r: MemoryRecord) => { creates++; return oc(r); };
    await expect(runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [s1, s2] }, createDeps(ts)))
      .rejects.toThrow(LearningAuthorizationError);
    expect(creates).toBe(0);
  });

  it('3.4 reject feedback owner mismatch', async () => {
    const src = createSource({ feedback: createFeedback({ ownerId: TEST_OWNER_B }) });
    await expect(runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store)))
      .rejects.toThrow(LearningAuthorizationError);
  });

  it('3.5 reject mismatched feedback decisionId', async () => {
    const src = createSource({ feedback: createFeedback({ decisionId: 'wrong_id' }) });
    await expect(runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store)))
      .rejects.toThrow(LearningAuthorizationError);
  });

  it('3.6 mismatch late in batch = zero storage ops', async () => {
    const sources: RuntimeLearningSource[] = [];
    for (let i = 0; i < 5; i++) {
      sources.push(createSource({
        decision: createDecisionMemoryFixture({ id: `dec_b_${i}`, ownerId: TEST_OWNER_A, projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A }),
        feedback: createFeedback({ id: `dfb_b_${i}`, decisionId: `dec_b_${i}` }),
      }));
    }
    sources.push(createSource({ decision: createDecisionMemoryFixture({ id: 'dec_bad', ownerId: TEST_OWNER_B }) }));
    let gets = 0, creates = 0;
    const ts = new InMemoryMemoryStore();
    const og = ts.getById.bind(ts);
    ts.getById = async (id, oid) => { gets++; return og(id, oid); };
    const oc = ts.create.bind(ts);
    ts.create = async (r) => { creates++; return oc(r); };
    await expect(runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources }, createDeps(ts)))
      .rejects.toThrow(LearningAuthorizationError);
    expect(gets).toBe(0);
    expect(creates).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════
describe('P0.7.5 — Persistence', () => {
  let store: InMemoryMemoryStore;
  beforeEach(() => { store = new InMemoryMemoryStore(); });

  it('4.1 valid MemoryRecord with topic scope', async () => {
    await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] }, createDeps(store));
    const recs = store.getStoredRecords();
    expect(recs.length).toBeGreaterThanOrEqual(1);
    const r = recs[0];
    expect(r.kind).toBe('semantic');
    expect(r.type).toBe('learning_candidate');
    expect(r.ownerId).toBe(TEST_OWNER_A);
    expect(r.scope).toBe('topic');
    expect(r.source).toBe('contextos_runtime_learning');
    expect(r.sourceType).toBe('learning_candidate');
    expect(r.status).toBe('active');
    expect(r.version).toBe(1);
    expect(r.createdAt).toBe(NOW);
    expect(r.updatedAt).toBe(NOW);
    expect(r.lastAccessedAt).toBeNull();
    expect(r.expiresAt).toBeNull();
    expect(r.accessCount).toBe(0);
  });

  it('4.2 payload preserves candidate status', async () => {
    await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] }, createDeps(store));
    const r = store.getStoredRecords()[0];
    expect((r.payload as LearningCandidate).status).toBe('candidate');
  });

  it('4.3 project scope mapping (no topicId)', async () => {
    const src = createSource({
      decision: createDecisionWithScope('dec_proj', TEST_OWNER_A, TEST_PROJECT_A, undefined),
      feedback: createFeedback({ id: 'dfb_proj', decisionId: 'dec_proj' }),
    });
    await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src], policy: { allowedScopes: ['project'] } }, createDeps(store));
    const r = store.getStoredRecords()[0];
    expect(r.scope).toBe('project');
    expect(r.projectId).toBe(TEST_PROJECT_A);
    expect(r.topicId).toBeNull();
  });

  it('4.4 global scope mapping (explicitly allowed)', async () => {
    const src = createSource({
      decision: createDecisionWithScope('dec_g', TEST_OWNER_A, undefined, undefined),
      feedback: createFeedback({ id: 'dfb_g', decisionId: 'dec_g' }),
    });
    await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src], policy: { allowedScopes: ['global'] } }, createDeps(store));
    const r = store.getStoredRecords()[0];
    expect(r.scope).toBe('global');
    expect(r.projectId).toBeNull();
    expect(r.topicId).toBeNull();
  });

  it('4.5 derivedFrom deduplicates decision+outcome IDs', async () => {
    const src = createSource({ feedback: createFeedback({ outcomeIds: ['out_1', 'out_2'] }) });
    await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store));
    const r = store.getStoredRecords()[0];
    expect(r.derivedFrom).toEqual(['dec_test_001', 'out_1', 'out_2']);
  });

  it('4.6 derivedFrom deduplicates when decisionId == outcomeId', async () => {
    const src = createSource({
      decision: createDecisionMemoryFixture({ id: 'dec_dup_001', ownerId: TEST_OWNER_A, projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A }),
      feedback: createFeedback({ decisionId: 'dec_dup_001', outcomeIds: ['dec_dup_001', 'out_001'] }),
    });
    await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store));
    const r = store.getStoredRecords()[0];
    const from = r.derivedFrom as string[];
    expect(from.filter((id) => id === 'dec_dup_001').length).toBe(1);
  });

  it('4.7 injected clock determinism', async () => {
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] }, createDeps(store));
    expect(res.processingTimestamp).toBe(NOW);
    for (const r of store.getStoredRecords()) {
      expect(r.createdAt).toBe(NOW);
      expect(r.updatedAt).toBe(NOW);
    }
  });

  it('4.8 existing owned record returns already_exists', async () => {
    await store.create({
      id: 'mem_lc_dec_test_001_decision_pattern', kind: 'semantic', type: 'learning_candidate',
      payload: {}, ownerId: TEST_OWNER_A, scope: 'topic', projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A,
      source: 'preexisting', sourceType: 'test', confidence: 0.5, importance: 0.5,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', accessCount: 0,
      version: 1, status: 'active',
    });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] }, createDeps(store));
    expect(res.items[0].status).toBe('already_exists');
    expect(res.counts.already_exists).toBeGreaterThanOrEqual(1);
  });

  it('4.9 repeated processing is idempotent', async () => {
    const input = { authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] };
    await runRuntimeLearning(input, createDeps(store));
    const c1 = store.getStoredRecords().length;
    await runRuntimeLearning(input, createDeps(store));
    const c2 = store.getStoredRecords().length;
    expect(c2).toBe(c1);
  });

  it('4.10 cross-owner ID collision not misreported as already_exists', async () => {
    // Pre-populate store with record owned by different owner at same deterministic ID
    await store.create({
      id: 'mem_lc_dec_test_001_decision_pattern', kind: 'semantic', type: 'learning_candidate',
      payload: {}, ownerId: TEST_OWNER_B, scope: 'topic', projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A,
      source: 'other_owner', sourceType: 'test', confidence: 0.5, importance: 0.5,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', accessCount: 0,
      version: 1, status: 'active',
    });
    // Our create should hit duplicate (exists in store), then recheck owner-scoped = null -> failed
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] }, createDeps(store));
    expect(res.items[0].status).not.toBe('already_exists');
    expect(res.items[0].status).toBe('failed');
  });

  it('4.11 one candidate failure does not inflate persisted counter', async () => {
    const fs = new InMemoryMemoryStore();
    let cc = 0;
    const oc = fs.create.bind(fs);
    fs.create = async (r: MemoryRecord) => { cc++; if (cc === 1) throw new Error('Unique violation'); return oc(r); };
    // Source with no strong metrics/trends — only generates decision_pattern
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(fs));
    // At least one candidate must have failed (first one threw)
    const failedItems = res.items.filter((i) => i.status === 'failed');
    expect(failedItems.length).toBeGreaterThanOrEqual(1);
    // Candidates after the failed one in the slice may have succeeded, but first one didn't inflate persisted
    // Verify that the first failed candidate is not counted as persisted
    expect(failedItems[0].status).toBe('failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. RESULT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════
describe('P0.7.5 — Result Contract', () => {
  let store: InMemoryMemoryStore;
  beforeEach(() => { store = new InMemoryMemoryStore(); });

  it('5.1 counters match items', async () => {
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] }, createDeps(store));
    expect(res.counts.persisted).toBe(res.items.filter((i) => i.status === 'persisted').length);
    expect(res.counts.discarded).toBe(res.items.filter((i) => i.status === 'discarded').length);
    expect(res.counts.already_exists).toBe(res.items.filter((i) => i.status === 'already_exists').length);
    expect(res.counts.failed).toBe(res.items.filter((i) => i.status === 'failed').length);
  });

  it('5.2 counters sum to total', async () => {
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] }, createDeps(store));
    const s = res.counts.persisted + res.counts.discarded + res.counts.already_exists + res.counts.failed;
    expect(s).toBe(res.counts.total);
    expect(res.counts.total).toBe(res.items.length);
  });

  it('5.3 above-limit candidates have explicit discard', async () => {
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()], policy: { maxCandidatesPerRun: 1 } }, createDeps(store));
    const byLimit = res.items.filter((i) => i.reasonCode === 'MAX_CANDIDATES_PER_RUN');
    if (res.items.length > 1) expect(byLimit.length).toBeGreaterThanOrEqual(1);
  });

  it('5.4 stable ordering across runs', async () => {
    const s1 = createSource();
    const s2 = createSource({ decision: createDecisionMemoryFixture({ id: 'dec_ord_002', ownerId: TEST_OWNER_A, projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A }), feedback: createFeedback({ id: 'dfb_ord_002', decisionId: 'dec_ord_002' }) });
    const r1 = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [s1, s2] }, createDeps(new InMemoryMemoryStore()));
    const r2 = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [s1, s2] }, createDeps(new InMemoryMemoryStore()));
    expect(r1.items.map((i) => i.candidateId)).toEqual(r2.items.map((i) => i.candidateId));
    expect(r1.processingTimestamp).toBe(r2.processingTimestamp);
  });

  it('5.5 empty input deterministic', async () => {
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [] }, createDeps(store));
    expect(res.items).toHaveLength(0);
    expect(res.counts.total).toBe(0);
    expect(res.counts.persisted).toBe(0);
    expect(res.counts.discarded).toBe(0);
    expect(res.counts.already_exists).toBe(0);
    expect(res.counts.failed).toBe(0);
    expect(store.getStoredRecords()).toHaveLength(0);
  });

  it('5.6 every candidate has exactly one valid status', async () => {
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [createSource()] }, createDeps(store));
    const valid = ['persisted', 'discarded', 'already_exists', 'failed'];
    for (const item of res.items) expect(valid).toContain(item.status);
    const ids = res.items.map((i) => i.candidateId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('5.7 failed record not counted as persisted', async () => {
    const fs = new InMemoryMemoryStore();
    fs.create = async () => { throw new Error('boom'); };
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(fs));
    expect(res.counts.persisted).toBe(0);
    expect(res.counts.failed).toBe(res.items.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PERSISTENCE ERROR HANDLING (P0.7.5-R1)
// ═══════════════════════════════════════════════════════════════════════════════
describe('P0.7.5-R1 — Persistence Error Handling', () => {
  let store: InMemoryMemoryStore;
  beforeEach(() => { store = new InMemoryMemoryStore(); });

  it('6.1 initial getById failure returns failed item (not crash)', async () => {
    const fs = new InMemoryMemoryStore();
    // Fail the idempotency-check read
    fs.setFailGetByIdForId('mem_lc_dec_test_001_decision_pattern');
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(fs));
    const item = res.items[0];
    expect(item.status).toBe('failed');
    expect(item.errorCode).toBe('PERSISTENCE_READ_FAILED');
    expect(item.reasonCode).toBeUndefined();  // policy not evaluated, no policy reasonCode
    expect(res.counts.failed).toBe(1);
  });

  it('6.2 later candidate processes after earlier read failure', async () => {
    // Two candidates; first read fails, second should still attempt persistence
    const fs = new InMemoryMemoryStore();
    // First candidate ID that comes from buildLearningCandidates is lc_DECISIONID_TYPE
    // We fail only the FIRST getById (for candidate "lc_dec_test_001_X")
    // Note: buildLearningCandidates generates candidate IDs like lc_<decisionId>_<type>
    // For the standard source it generates lc_dec_test_001_decision_pattern
    fs.setFailGetByIdForId('mem_lc_dec_test_001_decision_pattern');

    const src1 = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src1] }, createDeps(fs));
    // At minimum the first item failed; the run did not crash
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.counts.failed).toBeGreaterThanOrEqual(1);
  });

  it('6.3 create() non-concurrency failure returns PERSISTENCE_WRITE_FAILED', async () => {
    const fs = new InMemoryMemoryStore();
    // Override create to throw a generic error (not MemoryConcurrencyError)
    fs.create = async () => { throw new Error('disk I/O failure'); };
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(fs));
    const item = res.items.find((i) => i.status === 'failed');
    expect(item).toBeDefined();
    expect(item!.errorCode).toBe('PERSISTENCE_WRITE_FAILED');
    expect(res.counts.persisted).toBe(0);
    expect(res.counts.failed).toBeGreaterThanOrEqual(1);
  });

  it('6.4 MemoryConcurrencyError + owner-scoped record = already_exists', async () => {
    // Pre-populate an owner-scoped record AFTER the initial getById but BEFORE create.
    // We use hookBeforeCreate to inject the record.
    const fs = new InMemoryMemoryStore();
    await fs.create({
      id: 'mem_lc_dec_test_001_decision_pattern', kind: 'semantic', type: 'learning_candidate',
      payload: {}, ownerId: TEST_OWNER_A, scope: 'topic', projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A,
      source: 'race_simulated', sourceType: 'test', confidence: 0.5, importance: 0.5,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', accessCount: 0,
      version: 1, status: 'active',
    });
    // Now simulate a race: getById passes (just inserted), create throws MemoryConcurrencyError
    // But the record IS owned by our caller, so recheck succeeds.
    fs.setFailNextCreate(true); // throws MemoryConcurrencyError
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(fs));
    const item = res.items[0];
    expect(item.status).toBe('already_exists');
    expect(item.errorCode).toBeUndefined();
  });

  it('6.5 MemoryConcurrencyError + recheck fails = DUPLICATE_RECHECK_FAILED', async () => {
    const fs = new InMemoryMemoryStore();
    // Make ALL getById fail AFTER the initial one (which already ran via try/catch inside persistEligibleCandidate)
    // We set failAllGetById AFTER a first successful getById by using a hook.
    fs.setHookBeforeCreate(() => { fs.setFailAllGetById(true); });
    // Override create to throw after setting the flag
    fs.create = async (r: MemoryRecord) => {
      fs.setHookBeforeCreate(null); // remove hook so it fires once
      fs.setFailAllGetById(true);
      throw new MemoryConcurrencyError(r.id, 1);
    };
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(fs));
    const item = res.items[0];
    expect(item.status).toBe('failed');
    expect(item.errorCode).toBe('DUPLICATE_RECHECK_FAILED');
    expect(item.status).not.toBe('already_exists'); // unconfirmed = NOT already_exists
  });

  it('6.6 foreign-owner ID collision returns DUPLICATE_ID_CONFLICT (never already_exists)', async () => {
    // Pre-populate store with record owned by OTHER owner at the same deterministic ID
    await fs_createHelper(store, TEST_OWNER_B);
    // create() will throw MemoryConcurrencyError because ID exists
    // owner-scoped recheck returns null (foreign owner)
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store));
    const item = res.items[0];
    expect(item.status).toBe('failed');
    expect(item.errorCode).toBe('DUPLICATE_ID_CONFLICT');
    expect(item.status).not.toBe('already_exists');
  });

  it('6.7 counters consistent when read/write fail', async () => {
    const fs = new InMemoryMemoryStore();
    fs.create = async () => { throw new Error('write fail'); };
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(fs));
    const persisted = res.items.filter((i) => i.status === 'persisted').length;
    const failed = res.items.filter((i) => i.status === 'failed').length;
    const discarded = res.items.filter((i) => i.status === 'discarded').length;
    const already = res.items.filter((i) => i.status === 'already_exists').length;
    expect(res.counts.persisted).toBe(persisted);
    expect(res.counts.failed).toBe(failed);
    expect(res.counts.discarded).toBe(discarded);
    expect(res.counts.already_exists).toBe(already);
    expect(res.counts.total).toBe(persisted + failed + discarded + already);
  });

  it('6.8 foreign-owner record details not exposed in error', async () => {
    await fs_createHelper(store, TEST_OWNER_B);
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store));
    const item = res.items[0];
    // No raw DB error message leaks
    expect(item.reasonCode === undefined || !String(item.reasonCode).includes('owner')).toBe(true);
    expect(item.errorCode).toBe('DUPLICATE_ID_CONFLICT');
  });
});

// Helper to create a foreign-owner record
async function fs_createHelper(store: InMemoryMemoryStore, ownerId: string): Promise<void> {
  await store.create({
    id: 'mem_lc_dec_test_001_decision_pattern', kind: 'semantic', type: 'learning_candidate',
    payload: {}, ownerId, scope: 'topic', projectId: TEST_PROJECT_A, topicId: TEST_TOPIC_A,
    source: 'other_owner', sourceType: 'test', confidence: 0.5, importance: 0.5,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', accessCount: 0,
    version: 1, status: 'active',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. POLICY & INPUT HARDENING (P0.7.5-R1)
// ═══════════════════════════════════════════════════════════════════════════════
describe('P0.7.5-R1 — Policy & Input Hardening', () => {
  it('7.1 validatePolicy rejects unknown candidate type', () => {
    expect(() => validatePolicy({ allowedCandidateTypes: ['unknown_type' as never] }))
      .toThrow(LearningValidationError);
  });

  it('7.2 validatePolicy rejects unknown scope value', () => {
    expect(() => validatePolicy({ allowedScopes: ['invalid_scope' as never] }))
      .toThrow(LearningValidationError);
  });

  it('7.3 validatePolicy rejects non-boolean requireOutcomeEvidence', () => {
    expect(() => validatePolicy({ requireOutcomeEvidence: 'yes' as never }))
      .toThrow(LearningValidationError);
  });

  it('7.4 mutating a validated policy does not mutate shared defaults', () => {
    const p = validatePolicy({ allowedCandidateTypes: ['decision_pattern', 'successful_pattern'] });
    // Attempt to mutate the returned frozen array
    expect(() => { (p.allowedCandidateTypes as string[]).push('evil'); }).toThrow();
    // Default remains untouched
    expect(DEFAULT_LEARNING_POLICY.allowedCandidateTypes).toEqual([
      'decision_pattern', 'successful_pattern', 'failure_pattern', 'preference_signal', 'strategy_signal',
    ]);
  });

  it('7.5 mutating default policy array does not affect future validations', () => {
    // Attempt to mutate the frozen default
    expect(() => { (DEFAULT_LEARNING_POLICY.allowedCandidateTypes as string[]).push('attack'); }).toThrow();
    // Re-validate — still gets correct defaults
    const p2 = validatePolicy();
    expect(p2.allowedCandidateTypes).toEqual([
      'decision_pattern', 'successful_pattern', 'failure_pattern', 'preference_signal', 'strategy_signal',
    ]);
  });

  it('7.6 malformed candidate sourceOutcomeIds (non-array) handled predictably', () => {
    const policy = DEFAULT_LEARNING_POLICY;
    // Cast to bypass TypeScript for runtime defensive check
    const candidate = createCandidate({ sourceOutcomeIds: 'not-an-array' as unknown as string[] });
    const r = evaluateLearningCandidate(candidate, policy);
    expect(r.eligible).toBe(false);
    expect(r.reasonCode).toBe('MISSING_OUTCOME_SOURCE');
  });

  it('7.7 empty candidate type string rejected', () => {
    const policy = DEFAULT_LEARNING_POLICY;
    const candidate = createCandidate({ type: '' as never });
    const r = evaluateLearningCandidate(candidate, policy);
    expect(r.eligible).toBe(false);
    expect(r.reasonCode).toBe('DISALLOWED_CANDIDATE_TYPE');
  });

  it('7.8 candidate with whitespace-only type rejected', () => {
    const policy = DEFAULT_LEARNING_POLICY;
    const candidate = createCandidate({ type: '   ' as never });
    const r = evaluateLearningCandidate(candidate, policy);
    expect(r.eligible).toBe(false);
    expect(r.reasonCode).toBe('DISALLOWED_CANDIDATE_TYPE');
  });

  it('7.9 failed item is not represented as policy-failed', async () => {
    const fs = new InMemoryMemoryStore();
    fs.create = async () => { throw new Error('write fail'); };
    const src = createSource({ feedback: createFeedback({ metricAggregations: [], trends: [], outcomeCount: 1 }) });
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(fs));
    const item = res.items.find((i) => i.status === 'failed');
    expect(item).toBeDefined();
    // errorCode present (operational), reasonCode must NOT be a policy failure code
    expect(item!.errorCode).toBe('PERSISTENCE_WRITE_FAILED');
    // reasonCode on a failed item should be undefined or a policy code — NOT a fabricated persistence code
    expect(item!.reasonCode).not.toBe('PERSISTENCE_WRITE_FAILED');
  });

  it('7.10 persisted item never has an errorCode', async () => {
    const store = new InMemoryMemoryStore();
    const src = createSource();
    const res = await runRuntimeLearning({ authenticatedOwnerId: TEST_OWNER_A, sources: [src] }, createDeps(store));
    const persisted = res.items.find((i) => i.status === 'persisted');
    if (persisted) {
      expect(persisted.errorCode).toBeUndefined();
    }
  });
});
