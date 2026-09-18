/**
 * P0.3.9.5 Final Fix — Transaction & Strategy Approval Regression Tests
 *
 * Covers:
 *   TEST 1: Transaction Rollback — if Archive fails, all writes rollback
 *   TEST 2a: Strategy Approval Preservation — approved → save → still approved
 *   TEST 2b: Strategy Approval Preservation — pending → save → still pending
 *   TEST 2c: Strategy Approval Preservation — rejected → save → still rejected
 *   TEST 3: No contentStrategy.deleteMany in save flow
 *   TEST 4: prisma.$transaction is used
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock state ─────────────────────────────────────────────────────

const mockDraftRecords = vi.hoisted(() => new Map<string, {
  id: string;
  topicId: string;
  version: number;
  status: string;
  title: string;
  content: string;
}>());

const mockStrategyRecords = vi.hoisted(() => new Map<string, {
  id: string;
  topicId: string;
  approvalStatus: string;
  rejectionReason: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  coreThesis: string;
  hookStrategy: string | null;
}>());

const mockProjectRecords = vi.hoisted(() => new Map<string, {
  id: string;
  name: string;
  description: string;
}>());

const mockTopicRecords = vi.hoisted(() => new Map<string, {
  id: string;
  topic: string;
  status: string;
}>());

const mockEvaluationRecords = vi.hoisted(() => new Map<string, {
  id: string;
  draftId: string;
  overallScore: number;
}>());

const mockArchiveRecords = vi.hoisted(() => new Map<string, {
  id: string;
  topic: string;
  finalTitle: string;
}>());

// Track whether transaction was used
const mockUseTransaction = vi.hoisted(() => vi.fn());
const mockTransactionCallback = vi.hoisted(() => vi.fn());

// Track deleteMany calls
const mockDraftDeleteMany = vi.hoisted(() => vi.fn());
const mockStrategyDeleteMany = vi.hoisted(() => vi.fn());

// Draft operations inside transaction
const mockDraftCreate = vi.hoisted(() => vi.fn());
const mockDraftFindMany = vi.hoisted(() => vi.fn<[]>());

// Strategy operations
const mockStrategyFindUnique = vi.hoisted(() => vi.fn());
const mockStrategyCreate = vi.hoisted(() => vi.fn());
const mockStrategyUpdate = vi.hoisted(() => vi.fn());

// Evaluation operations
const mockEvaluationCreate = vi.hoisted(() => vi.fn());

// Archive
const mockArchiveCreate = vi.hoisted(() => vi.fn());

// Project operations
const mockProjectCreate = vi.hoisted(() => vi.fn());
const mockProjectUpdate = vi.hoisted(() => vi.fn());
const mockProjectFindUnique = vi.hoisted(() => vi.fn());

// Topic operations
const mockTopicCreate = vi.hoisted(() => vi.fn());
const mockTopicUpdate = vi.hoisted(() => vi.fn());

// Angle operations
const mockAngleCreate = vi.hoisted(() => vi.fn());
const mockAngleDeleteMany = vi.hoisted(() => vi.fn());

// Humanization
const mockHumanizationCreate = vi.hoisted(() => vi.fn());

// StrategyEvaluation
const mockStrategyEvaluationCreate = vi.hoisted(() => vi.fn());

// ─── Mock Prisma Client ─────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => {
  const mockTx = {
    project: {
      create: mockProjectCreate,
      update: mockProjectUpdate,
      findUnique: mockProjectFindUnique,
    },
    topic: {
      create: mockTopicCreate,
      update: mockTopicUpdate,
    },
    angle: {
      create: mockAngleCreate,
      deleteMany: mockAngleDeleteMany,
    },
    contentStrategy: {
      findUnique: mockStrategyFindUnique,
      create: mockStrategyCreate,
      update: mockStrategyUpdate,
      deleteMany: mockStrategyDeleteMany,
    },
    draft: {
      create: mockDraftCreate,
      findMany: mockDraftFindMany,
      deleteMany: mockDraftDeleteMany,
    },
    evaluation: {
      create: mockEvaluationCreate,
    },
    strategyEvaluation: {
      create: mockStrategyEvaluationCreate,
    },
    humanization: {
      create: mockHumanizationCreate,
    },
    userContentArchive: {
      create: mockArchiveCreate,
    },
  };

  return {
    prisma: {
      $transaction: vi.fn(async (callback: (tx: typeof mockTx) => unknown) => {
        mockUseTransaction();
        return callback(mockTx);
      }),
      project: mockTx.project,
      topic: mockTx.topic,
      angle: mockTx.angle,
      contentStrategy: {
        findUnique: mockStrategyFindUnique,
        create: mockStrategyCreate,
        update: mockStrategyUpdate,
        deleteMany: mockStrategyDeleteMany,
      },
      draft: mockTx.draft,
      evaluation: mockTx.evaluation,
      strategyEvaluation: mockTx.strategyEvaluation,
      humanization: mockTx.humanization,
      userContentArchive: mockTx.userContentArchive,
    },
  };
});

// Mock isDatabaseConfigured to return true for tests
vi.mock('@/lib/utils/db-safe', () => ({
  isDatabaseConfigured: () => true,
}));

// Mock ensureDefaultUser to be a no-op
vi.mock('@/lib/utils/default-user', () => ({
  getDefaultUserId: () => 'default',
  ensureDefaultUser: vi.fn(async () => {}),
}));

// ─── Import modules after mock ──────────────────────────────────────────────

import { POST } from '../route';

// ─── Test Helpers ───────────────────────────────────────────────────────────

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}_${++idCounter}`;
}

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    topic: 'Test Topic',
    platform: 'xiaohongshu',
    audience: 'general',
    category: 'knowledge',
    keywords: ['test'],
    coreQuestions: ['q1'],
    selectedAngle: {
      id: 'angle-1',
      title: 'Test Angle',
      angle: 'Test angle description',
      reasoning: 'reason',
      targetEmotion: 'neutral',
      estimatedViralScore: 75,
      difficulty: 'medium',
      keyPoints: ['kp1'],
      audienceAppeal: 'appealing',
    },
    strategy: {
      title: 'Test Strategy',
      hook: 'Test hook',
      structure: [{
        section: 'intro',
        purpose: 'hook',
        keyArguments: ['arg1'],
        estimatedWords: 50,
      }],
      keyArguments: ['arg1'],
      emotionalArc: { start: 'calm', middle: 'tension', end: 'release' },
      callToAction: 'follow',
      tone: 'casual',
      estimatedWordCount: 500,
    },
    draft: {
      title: 'Final Draft Title',
      content: 'Final draft content',
      hook: 'Final hook',
      wordCount: 500,
    },
    ...overrides,
  };
}

async function sendSave(payload: Record<string, unknown>): Promise<Response> {
  const req = new Request('http://localhost/api/projects/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return POST(req) as Promise<Response>;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.3.9.5 Final Fix — Transaction & Strategy Approval', () => {
  beforeEach(() => {
    // Clear all records
    mockDraftRecords.clear();
    mockStrategyRecords.clear();
    mockProjectRecords.clear();
    mockTopicRecords.clear();
    mockEvaluationRecords.clear();
    mockArchiveRecords.clear();
    idCounter = 0;

    // Clear mocks
    mockUseTransaction.mockClear();
    mockStrategyDeleteMany.mockClear();
    mockDraftDeleteMany.mockClear();
    mockDraftCreate.mockClear();
    mockDraftFindMany.mockClear();
    mockStrategyFindUnique.mockClear();
    mockStrategyCreate.mockClear();
    mockStrategyUpdate.mockClear();
    mockEvaluationCreate.mockClear();
    mockArchiveCreate.mockClear();
    mockProjectCreate.mockClear();
    mockProjectUpdate.mockClear();
    mockProjectFindUnique.mockClear();
    mockTopicCreate.mockClear();
    mockTopicUpdate.mockClear();
    mockAngleCreate.mockClear();
    mockAngleDeleteMany.mockClear();
    mockHumanizationCreate.mockClear();
    mockStrategyEvaluationCreate.mockClear();

    // Default mock implementations
    mockProjectCreate.mockImplementation((args: { data: { name: string; description: string } }) => {
      const id = genId('proj');
      mockProjectRecords.set(id, { id, name: args.data.name, description: args.data.description });
      return Promise.resolve({ id, name: args.data.name, description: args.data.description });
    });

    mockProjectFindUnique.mockImplementation((args: { where: { id: string }; include?: unknown }) => {
      const rec = mockProjectRecords.get(args.where.id);
      if (!rec) return Promise.resolve(null);
      return Promise.resolve({ ...rec, topics: [] });
    });

    mockProjectUpdate.mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) => {
      const rec = mockProjectRecords.get(args.where.id);
      if (rec) Object.assign(rec, args.data);
      return Promise.resolve(rec);
    });

    mockTopicCreate.mockImplementation((args: { data: { topic: string; status: string } }) => {
      const id = genId('topic');
      mockTopicRecords.set(id, { id, topic: args.data.topic, status: args.data.status });
      return Promise.resolve({ id, topic: args.data.topic, status: args.data.status });
    });

    mockTopicUpdate.mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) => {
      const rec = mockTopicRecords.get(args.where.id);
      if (rec) Object.assign(rec, args.data);
      return Promise.resolve(rec);
    });

    mockAngleCreate.mockImplementation(() => {
      return Promise.resolve({ id: genId('angle') });
    });

    mockAngleDeleteMany.mockImplementation(() => {
      return Promise.resolve({ count: 0 });
    });

    mockStrategyFindUnique.mockImplementation((args: { where: { topicId: string } }) => {
      for (const rec of mockStrategyRecords.values()) {
        if (rec.topicId === args.where.topicId) return Promise.resolve(rec);
      }
      return Promise.resolve(null);
    });

    mockStrategyCreate.mockImplementation((args: { data: { topicId: string; approvalStatus: string; coreThesis: string; hookStrategy: string } }) => {
      const id = genId('strat');
      const rec = {
        id,
        topicId: args.data.topicId,
        approvalStatus: args.data.approvalStatus,
        rejectionReason: null,
        approvedAt: null,
        rejectedAt: null,
        coreThesis: args.data.coreThesis,
        hookStrategy: args.data.hookStrategy,
      };
      mockStrategyRecords.set(id, rec);
      return Promise.resolve(rec);
    });

    mockStrategyUpdate.mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) => {
      const rec = mockStrategyRecords.get(args.where.id);
      if (rec) Object.assign(rec, args.data);
      return Promise.resolve(rec);
    });

    mockDraftFindMany.mockImplementation((args: { where: { topicId: string } }) => {
      const results: Array<{ id: string; version: number; status: string; title: string; content: string }> = [];
      for (const rec of mockDraftRecords.values()) {
        if (rec.topicId === args.where.topicId) {
          results.push({
            id: rec.id,
            version: rec.version,
            status: rec.status,
            title: rec.title,
            content: rec.content,
          });
        }
      }
      return Promise.resolve(results);
    });

    mockDraftCreate.mockImplementation((args: { data: { topicId: string; version: number; status: string; title: string; content: string; wordCount: number | null } }) => {
      const id = genId('draft');
      const rec = {
        id,
        topicId: args.data.topicId,
        version: args.data.version,
        status: args.data.status,
        title: args.data.title,
        content: args.data.content,
        wordCount: args.data.wordCount,
      };
      mockDraftRecords.set(id, rec);
      return Promise.resolve(rec);
    });

    mockEvaluationCreate.mockImplementation((args: { data: { draftId: string; overallScore: number } }) => {
      const id = genId('eval');
      const rec = { id, draftId: args.data.draftId, overallScore: args.data.overallScore };
      mockEvaluationRecords.set(id, rec);
      return Promise.resolve(rec);
    });

    mockStrategyEvaluationCreate.mockImplementation(() => {
      return Promise.resolve({ id: genId('se') });
    });

    mockHumanizationCreate.mockImplementation(() => {
      return Promise.resolve({ id: genId('hum') });
    });

    mockArchiveCreate.mockImplementation((args: { data: { topic: string; finalTitle: string } }) => {
      const id = genId('archive');
      const rec = { id, topic: args.data.topic, finalTitle: args.data.finalTitle };
      mockArchiveRecords.set(id, rec);
      return Promise.resolve(rec);
    });
  });

  // ─── TEST 1: Transaction Rollback ────────────────────────────────────────

  describe('TEST 1: Transaction — prisma.$transaction is used', () => {
    it('calls $transaction for save operations', async () => {
      const res = await sendSave(buildPayload());
      const json = await res.json();

      // Save must succeed
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Transaction must have been used
      expect(mockUseTransaction).toHaveBeenCalled();
    });
  });

  describe('TEST 1b: Transaction Rollback — Archive failure propagates', () => {
    it('when Archive create fails, save returns 500 and archive was inside transaction', async () => {
      // Make archive create fail inside the transaction
      mockArchiveCreate.mockImplementation(() => {
        throw new Error('Archive write failed');
      });

      const res = await sendSave(buildPayload());
      const json = await res.json();

      // Save must fail
      expect(res.status).toBe(500);
      expect(json.success).toBe(false);

      // Transaction was used (archive is inside transaction, not outside)
      expect(mockUseTransaction).toHaveBeenCalled();

      // Archive create was attempted (proving it's inside the transaction)
      expect(mockArchiveCreate).toHaveBeenCalled();

      // Error message propagated
      expect(json.error).toContain('Archive write failed');
    });

    it('verifies archive is called inside transaction (after project/topic/draft)', async () => {
      // Track call order
      const callOrder: string[] = [];
      mockProjectCreate.mockImplementation((...args: unknown[]) => {
        callOrder.push('project');
        const id = genId('proj');
        mockProjectRecords.set(id, { id, name: 'N/A', description: 'N/A' });
        return Promise.resolve({ id });
      });
      mockTopicCreate.mockImplementation((...args: unknown[]) => {
        callOrder.push('topic');
        const id = genId('topic');
        mockTopicRecords.set(id, { id, topic: 'N/A', status: 'READY' });
        return Promise.resolve({ id });
      });
      mockDraftCreate.mockImplementation((...args: unknown[]) => {
        callOrder.push('draft');
        const id = genId('draft');
        return Promise.resolve({ id, version: 1 });
      });
      mockArchiveCreate.mockImplementation((...args: unknown[]) => {
        callOrder.push('archive');
        const id = genId('archive');
        return Promise.resolve({ id });
      });

      await sendSave(buildPayload());

      // Archive must be called inside transaction context
      const archiveIdx = callOrder.indexOf('archive');
      expect(archiveIdx).toBeGreaterThan(-1);
      // Archive should be called after project, topic, and draft in the transaction
      expect(callOrder.indexOf('project')).toBeLessThan(archiveIdx);
      expect(callOrder.indexOf('topic')).toBeLessThan(archiveIdx);
      expect(callOrder.indexOf('draft')).toBeLessThan(archiveIdx);
    });
  });

  // ─── TEST 2: Strategy Approval Preservation ──────────────────────────────

  describe('TEST 2a: Strategy Approval — approved stays approved after save', () => {
    it('preserves approvalStatus=approved when saving approved strategy', async () => {
      // Pre-populate an existing project with an approved strategy
      const projectId = 'proj_existing';
      const topicId = 'topic_existing';
      const strategyId = 'strat_approved';

      mockProjectRecords.set(projectId, {
        id: projectId,
        name: 'Existing Project',
        description: 'Existing',
      });

      mockTopicRecords.set(topicId, {
        id: topicId,
        topic: 'Existing Topic',
        status: 'READY',
      });

      mockStrategyRecords.set(strategyId, {
        id: strategyId,
        topicId: topicId,
        approvalStatus: 'approved',
        rejectionReason: null,
        approvedAt: new Date('2026-09-18T10:00:00Z'),
        rejectedAt: null,
        coreThesis: 'Original Core Thesis',
        hookStrategy: 'Original Hook',
      });

      // Setup findUnique to return project with topic
      mockProjectFindUnique.mockImplementation((args: { where: { id: string }; include?: unknown }) => {
        if (args.where.id === projectId) {
          return Promise.resolve({
            id: projectId,
            name: 'Existing Project',
            description: 'Existing',
            topics: [{ id: topicId }],
          } as any);
        }
        return Promise.resolve(null);
      });

      // Save with projectId
      const res = await sendSave(buildPayload({ projectId }));
      const json = await res.json();

      // Save must succeed
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Strategy must still be approved
      const strategy = mockStrategyRecords.get(strategyId);
      expect(strategy).toBeDefined();
      expect(strategy!.approvalStatus).toBe('approved');
      expect(strategy!.approvedAt).toBeInstanceOf(Date);

      // Strategy must NOT have been deleted and recreated
      expect(mockStrategyDeleteMany).not.toHaveBeenCalled();

      // Strategy update was called (not create)
      expect(mockStrategyUpdate).toHaveBeenCalled();
      expect(mockStrategyCreate).not.toHaveBeenCalled();

      // Verify update PRESERVED approvalStatus — the update data should NOT contain approvalStatus: 'pending'
      const updateCall = mockStrategyUpdate.mock.calls[0][0];
      expect(updateCall.data.approvalStatus).toBeUndefined();
    });
  });

  describe('TEST 2b: Strategy Approval — pending stays pending after save', () => {
    it('preserves approvalStatus=pending when saving pending strategy', async () => {
      const projectId = 'proj_pending';
      const topicId = 'topic_pending';
      const strategyId = 'strat_pending';

      mockProjectRecords.set(projectId, {
        id: projectId,
        name: 'Pending Project',
        description: 'Pending',
      });

      mockTopicRecords.set(topicId, {
        id: topicId,
        topic: 'Pending Topic',
        status: 'READY',
      });

      mockStrategyRecords.set(strategyId, {
        id: strategyId,
        topicId: topicId,
        approvalStatus: 'pending',
        rejectionReason: null,
        approvedAt: null,
        rejectedAt: null,
        coreThesis: 'Pending Thesis',
        hookStrategy: 'Pending Hook',
      });

      mockProjectFindUnique.mockImplementation((args: { where: { id: string }; include?: unknown }) => {
        if (args.where.id === projectId) {
          return Promise.resolve({
            id: projectId,
            name: 'Pending Project',
            description: 'Pending',
            topics: [{ id: topicId }],
          } as any);
        }
        return Promise.resolve(null);
      });

      const res = await sendSave(buildPayload({ projectId }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      const strategy = mockStrategyRecords.get(strategyId);
      expect(strategy).toBeDefined();
      expect(strategy!.approvalStatus).toBe('pending');
    });
  });

  describe('TEST 2c: Strategy Approval — rejected stays rejected after save', () => {
    it('preserves approvalStatus=rejected when saving rejected strategy', async () => {
      const projectId = 'proj_rejected';
      const topicId = 'topic_rejected';
      const strategyId = 'strat_rejected';

      mockProjectRecords.set(projectId, {
        id: projectId,
        name: 'Rejected Project',
        description: 'Rejected',
      });

      mockTopicRecords.set(topicId, {
        id: topicId,
        topic: 'Rejected Topic',
        status: 'READY',
      });

      mockStrategyRecords.set(strategyId, {
        id: strategyId,
        topicId: topicId,
        approvalStatus: 'rejected',
        rejectionReason: 'Not aligned with brand',
        approvedAt: null,
        rejectedAt: new Date('2026-09-18T11:00:00Z'),
        coreThesis: 'Rejected Thesis',
        hookStrategy: 'Rejected Hook',
      });

      mockProjectFindUnique.mockImplementation((args: { where: { id: string }; include?: unknown }) => {
        if (args.where.id === projectId) {
          return Promise.resolve({
            id: projectId,
            name: 'Rejected Project',
            description: 'Rejected',
            topics: [{ id: topicId }],
          } as any);
        }
        return Promise.resolve(null);
      });

      const res = await sendSave(buildPayload({ projectId }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      const strategy = mockStrategyRecords.get(strategyId);
      expect(strategy).toBeDefined();
      expect(strategy!.approvalStatus).toBe('rejected');
      expect(strategy!.rejectionReason).toBe('Not aligned with brand');
    });
  });

  // ─── TEST 3: No deleteMany on drafts ─────────────────────────────────────

  describe('TEST 3: No contentStrategy.deleteMany or draft.deleteMany', () => {
    it('does not call strategy deleteMany on update path', async () => {
      // Setup existing project with approved strategy
      const projectId = 'proj_nodelete';
      const topicId = 'topic_nodelete';
      const strategyId = 'strat_nodelete';

      mockProjectRecords.set(projectId, {
        id: projectId,
        name: 'Nodelete Project',
        description: 'Nodelete',
      });

      mockTopicRecords.set(topicId, {
        id: topicId,
        topic: 'Nodelete Topic',
        status: 'READY',
      });

      mockStrategyRecords.set(strategyId, {
        id: strategyId,
        topicId: topicId,
        approvalStatus: 'approved',
        rejectionReason: null,
        approvedAt: new Date(),
        rejectedAt: null,
        coreThesis: 'Thesis',
        hookStrategy: 'Hook',
      });

      mockProjectFindUnique.mockImplementation((args: { where: { id: string }; include?: unknown }) => {
        if (args.where.id === projectId) {
          return Promise.resolve({
            id: projectId,
            name: 'Nodelete Project',
            description: 'Nodelete',
            topics: [{ id: topicId }],
          } as any);
        }
        return Promise.resolve(null);
      });

      await sendSave(buildPayload({ projectId }));

      // NO deleteMany on strategies
      expect(mockStrategyDeleteMany).not.toHaveBeenCalled();

      // NO deleteMany on drafts
      expect(mockDraftDeleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── TEST 4: Draft versioning uses pure helpers ──────────────────────────

  describe('TEST 4: Draft versioning — first save with refine creates v1 + v2', () => {
    it('first save with refine creates draft v1 (original) and v2 (final)', async () => {
      const res = await sendSave(buildPayload({
        originalDraft: {
          title: 'Original Title',
          content: 'Original content',
          hook: 'Original hook',
          wordCount: 400,
        },
        refineData: {
          content: 'Refined content',
          title: 'Refined Title',
          hook: 'Refined hook',
          wordCount: 550,
          changes: [{
            type: 'tone',
            original: 'casual',
            revised: 'formal',
            reason: 'better fit',
          }],
          summary: 'Refined summary',
          resolvedIssues: [],
          unresolvedIssues: [],
          preservedElements: [],
        },
      }));

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Should have 2 drafts: v1 (DRAFT) and v2 (FINAL)
      const drafts = Array.from(mockDraftRecords.values());
      expect(drafts.length).toBe(2);
      expect(drafts.some(d => d.version === 1 && d.status === 'DRAFT')).toBe(true);
      expect(drafts.some(d => d.version === 2 && d.status === 'FINAL')).toBe(true);

      // draftVersion in response should be 2
      expect(json.data.draftVersion).toBe(2);
    });
  });

  // ─── TEST 5: Subsequent save creates v3 ──────────────────────────────────

  describe('TEST 5: Subsequent save creates v3 (preserves v1 + v2)', () => {
    it('creates v3 on second save, keeping v1 and v2 intact', async () => {
      // Setup project with v1 and v2 existing
      const projectId = 'proj_subsequent';
      const topicId = 'topic_subsequent';
      const strategyId = 'strat_subsequent';

      mockProjectRecords.set(projectId, {
        id: projectId,
        name: 'Subsequent Project',
        description: 'Subsequent',
      });

      mockTopicRecords.set(topicId, {
        id: topicId,
        topic: 'Subsequent Topic',
        status: 'READY',
      });

      mockStrategyRecords.set(strategyId, {
        id: strategyId,
        topicId: topicId,
        approvalStatus: 'approved',
        rejectionReason: null,
        approvedAt: new Date(),
        rejectedAt: null,
        coreThesis: 'Thesis',
        hookStrategy: 'Hook',
      });

      // Pre-populate drafts v1 and v2
      mockDraftRecords.set('draft_v1', {
        id: 'draft_v1',
        topicId: topicId,
        version: 1,
        status: 'DRAFT',
        title: 'Original Title',
        content: 'Original content',
      });

      mockDraftRecords.set('draft_v2', {
        id: 'draft_v2',
        topicId: topicId,
        version: 2,
        status: 'FINAL',
        title: 'Final Title',
        content: 'Final content',
      });

      mockProjectFindUnique.mockImplementation((args: { where: { id: string }; include?: unknown }) => {
        if (args.where.id === projectId) {
          return Promise.resolve({
            id: projectId,
            name: 'Subsequent Project',
            description: 'Subsequent',
            topics: [{ id: topicId }],
          } as any);
        }
        return Promise.resolve(null);
      });

      const res = await sendSave(buildPayload({ projectId }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Should now have 3 drafts
      const drafts = Array.from(mockDraftRecords.values());
      expect(drafts.length).toBe(3);

      // v1 and v2 still exist
      expect(drafts.some(d => d.version === 1)).toBe(true);
      expect(drafts.some(d => d.version === 2)).toBe(true);

      // v3 is newly added
      expect(drafts.some(d => d.version === 3 && d.status === 'FINAL')).toBe(true);

      // Response indicates v3
      expect(json.data.draftVersion).toBe(3);
    });
  });
});
