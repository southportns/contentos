/**
 * P0.3.8.4.1 — Approve/Reject API Route Tests
 *
 * Tests the Approve and Reject API routes directly.
 * Verifies state transition enforcement, input validation,
 * and security against client injection.
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

// Mock contentService (higher-level mock for API route testing)
vi.mock('@/lib/services/content-service', () => ({
  contentService: {
    getStrategyById: vi.fn((id: string) => {
      const record = mockStrategies.get(id);
      return Promise.resolve(record ? { ...record } : null);
    }),
    approveStrategy: vi.fn((id: string) => {
      const record = mockStrategies.get(id);
      if (!record || record.approvalStatus !== 'pending') {
        return Promise.resolve(false);
      }
      record.approvalStatus = 'approved';
      record.approvedAt = new Date();
      return Promise.resolve(true);
    }),
    rejectStrategy: vi.fn((id: string, reason?: string) => {
      const record = mockStrategies.get(id);
      if (!record || record.approvalStatus !== 'pending') {
        return Promise.resolve(false);
      }
      record.approvalStatus = 'rejected';
      record.rejectionReason = reason ?? null;
      record.rejectedAt = new Date();
      return Promise.resolve(true);
    }),
  },
}));

vi.mock('@/lib/utils/db-safe', () => ({
  isDatabaseConfigured: () => true,
}));

// ─── Import routes after mocks ──────────────────────────────────────────────

import { POST as approvePOST } from '../approve/route';
import { POST as rejectPOST } from '../reject/route';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createApproveRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/generation/strategy/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createRejectRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/generation/strategy/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.3.8.4.1 — Approve API', () => {
  beforeEach(() => {
    mockStrategies.clear();
  });

  it('approves pending strategy (200)', async () => {
    mockStrategies.set('strat_001', {
      id: 'strat_001',
      topicId: 'topic_001',
      approvalStatus: 'pending',
      rejectionReason: null,
      approvedAt: null,
      rejectedAt: null,
    });

    const req = createApproveRequest({ strategyId: 'strat_001' });
    const res = await approvePOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.approvalStatus).toBe('approved');
  });

  it('rejects approval of already-approved strategy (409)', async () => {
    mockStrategies.set('strat_001', {
      id: 'strat_001',
      topicId: 'topic_001',
      approvalStatus: 'approved',
      rejectionReason: null,
      approvedAt: new Date(),
      rejectedAt: null,
    });

    const req = createApproveRequest({ strategyId: 'strat_001' });
    const res = await approvePOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_TRANSITION');
  });

  it('rejects approval of rejected strategy (409)', async () => {
    mockStrategies.set('strat_001', {
      id: 'strat_001',
      topicId: 'topic_001',
      approvalStatus: 'rejected',
      rejectionReason: 'Bad',
      approvedAt: null,
      rejectedAt: new Date(),
    });

    const req = createApproveRequest({ strategyId: 'strat_001' });
    const res = await approvePOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
  });

  it('returns 404 for non-existent strategy', async () => {
    const req = createApproveRequest({ strategyId: 'nonexistent' });
    const res = await approvePOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('STRATEGY_NOT_FOUND');
  });

  it('returns 400 for missing strategyId', async () => {
    const req = createApproveRequest({});
    const res = await approvePOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_INPUT');
  });

  it('STRIPS client-injected approvalStatus from input', async () => {
    mockStrategies.set('strat_001', {
      id: 'strat_001',
      topicId: 'topic_001',
      approvalStatus: 'pending',
      rejectionReason: null,
      approvedAt: null,
      rejectedAt: null,
    });

    // Client tries to inject approvalStatus — should be stripped
    const req = createApproveRequest({ strategyId: 'strat_001', approvalStatus: 'approved' });
    const res = await approvePOST(req as any);
    const data = await res.json();

    // The sanitizeInput strips approvalStatus, so the request proceeds normally
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe('P0.3.8.4.1 — Reject API', () => {
  beforeEach(() => {
    mockStrategies.clear();
  });

  it('rejects pending strategy (200)', async () => {
    mockStrategies.set('strat_001', {
      id: 'strat_001',
      topicId: 'topic_001',
      approvalStatus: 'pending',
      rejectionReason: null,
      approvedAt: null,
      rejectedAt: null,
    });

    const req = createRejectRequest({ strategyId: 'strat_001', reason: 'Not aligned' });
    const res = await rejectPOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.approvalStatus).toBe('rejected');
    expect(data.data.reason).toBe('Not aligned');
  });

  it('rejects rejection of already-rejected strategy (409)', async () => {
    mockStrategies.set('strat_001', {
      id: 'strat_001',
      topicId: 'topic_001',
      approvalStatus: 'rejected',
      rejectionReason: 'Bad',
      approvedAt: null,
      rejectedAt: new Date(),
    });

    const req = createRejectRequest({ strategyId: 'strat_001' });
    const res = await rejectPOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_TRANSITION');
  });

  it('rejects rejection of approved strategy (409)', async () => {
    mockStrategies.set('strat_001', {
      id: 'strat_001',
      topicId: 'topic_001',
      approvalStatus: 'approved',
      rejectionReason: null,
      approvedAt: new Date(),
      rejectedAt: null,
    });

    const req = createRejectRequest({ strategyId: 'strat_001' });
    const res = await rejectPOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
  });

  it('returns 404 for non-existent strategy', async () => {
    const req = createRejectRequest({ strategyId: 'nonexistent' });
    const res = await rejectPOST(req as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('STRATEGY_NOT_FOUND');
  });
});
