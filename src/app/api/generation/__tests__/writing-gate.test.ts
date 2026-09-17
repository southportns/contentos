/**
 * P0.3.8.4.1 — Writing API Gate Integration Tests
 *
 * Tests the Writing API route's approval gate behavior.
 * Verifies that the gate correctly blocks unapproved strategies
 * and allows approved ones to proceed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock state ─────────────────────────────────────────────────────

interface StrategyRecord {
  id: string;
  topicId: string;
  approvalStatus: string;
  rejectionReason: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
}

const mockStrategies = vi.hoisted(() => new Map<string, StrategyRecord>());

const findStrategyById = vi.hoisted(() => vi.fn());

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    contentStrategy: {
      findUnique: ({ where }: { where: { id?: string; topicId?: string } }) => {
        if (where.id) return findStrategyById(where.id);
        if (where.topicId) {
          for (const r of mockStrategies.values()) {
            if (r.topicId === where.topicId) return Promise.resolve({ ...r });
          }
        }
        return Promise.resolve(null);
      },
    },
  },
}));

// Mock db-safe to simulate DB configured
vi.mock('@/lib/utils/db-safe', () => ({
  isDatabaseConfigured: () => true,
  safeDb: <T>(operation: () => Promise<T>) => operation(),
}));

// ─── Import route after mocks ────────────────────────────────────────────────

import { POST as writingPOST } from '../writing/route';

// ─── Test Helpers ───────────────────────────────────────────────────────────

const VALID_WRITING_BODY = {
  topic: 'Test topic',
  strategyId: 'strategy_001',
  strategy: {
    title: 'Test strategy',
    hook: 'Test hook',
    structure: [
      { section: 'intro', purpose: 'hook', keyArguments: ['arg1'], estimatedWords: 100 },
    ],
    keyArguments: ['arg1'],
    emotionalArc: { start: 'curious', middle: 'engaged', end: 'convinced' },
    callToAction: 'Follow me',
    tone: 'casual',
    estimatedWordCount: 500,
  },
  selectedAngle: {
    title: 'Test angle',
    angle: 'Test perspective',
    targetEmotion: 'curiosity',
    keyPoints: ['point1'],
  },
};

// Mock runWriting (LLM generation)
vi.mock('@/skills/writing', () => ({
  runWriting: vi.fn().mockResolvedValue({
    title: 'Generated Title',
    content: 'Generated content here...',
    hook: 'Generated hook',
    wordCount: 300,
    sections: [{ section: 'intro', content: 'intro content' }],
  }),
}));

// Mock knowledge retrieval
vi.mock('@/knowledge/context', () => ({
  retrieveKnowledgeContextForGeneration: vi.fn().mockResolvedValue(null),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.3.8.4.1 — Writing API Gate', () => {
  beforeEach(() => {
    mockStrategies.clear();
    findStrategyById.mockClear();

    findStrategyById.mockImplementation((id: string) => {
      const record = mockStrategies.get(id);
      return Promise.resolve(record ? { ...record } : null);
    });
  });

  function createRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/generation/writing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // TEST A: Strategy not found → 403
  it('BLOCKS writing when strategy does not exist (missing = not approved)', async () => {
    const req = createRequest(VALID_WRITING_BODY);
    const res = await writingPOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toBe('STRATEGY_NOT_APPROVED');
  });

  // TEST B: Strategy pending → 403
  it('BLOCKS writing when strategy is pending', async () => {
    mockStrategies.set('strategy_001', {
      id: 'strategy_001',
      topicId: 'topic_001',
      approvalStatus: 'pending',
      rejectionReason: null,
      approvedAt: null,
      rejectedAt: null,
    });

    const req = createRequest(VALID_WRITING_BODY);
    const res = await writingPOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toBe('STRATEGY_NOT_APPROVED');
    expect(data.currentStatus).toBe('pending');
  });

  // TEST C: Strategy rejected → 403
  it('BLOCKS writing when strategy is rejected', async () => {
    mockStrategies.set('strategy_001', {
      id: 'strategy_001',
      topicId: 'topic_001',
      approvalStatus: 'rejected',
      rejectionReason: 'Not good enough',
      approvedAt: null,
      rejectedAt: new Date(),
    });

    const req = createRequest(VALID_WRITING_BODY);
    const res = await writingPOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toBe('STRATEGY_NOT_APPROVED');
    expect(data.currentStatus).toBe('rejected');
  });

  // TEST D: Strategy approved → passes gate (not 403)
  it('ALLOWS writing when strategy is approved (gate passes)', async () => {
    mockStrategies.set('strategy_001', {
      id: 'strategy_001',
      topicId: 'topic_001',
      approvalStatus: 'approved',
      rejectionReason: null,
      approvedAt: new Date(),
      rejectedAt: null,
    });

    const req = createRequest(VALID_WRITING_BODY);
    const res = await writingPOST(req as any);
    const data = await res.json();

    // Should pass the gate — NOT 403
    expect(res.status).not.toBe(403);
    if (res.status === 200) {
      expect(data.success).toBe(true);
    }
  });

  // TEST E: Missing strategyId in request → 400 validation error
  it('REJECTS request with missing strategyId (400)', async () => {
    const body = { ...VALID_WRITING_BODY };
    delete (body as any).strategyId;

    const req = createRequest(body);
    const res = await writingPOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });
});
