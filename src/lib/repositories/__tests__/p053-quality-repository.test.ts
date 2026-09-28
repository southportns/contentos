/**
 * P0.5.3 — Repository Layer Tests
 *
 * Tests for:
 * - upsertDraftEvaluation (Evaluation persistence)
 * - createRefinedDraft (Refine → New Draft)
 * - createHumanizedDraft (Humanization Adopt → New Draft)
 * - OCC protection inside transaction (P0.5.3 Hardening Fix 3)
 *
 * These are unit tests against the repository functions with mocked Prisma.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Prisma ──────────────────────────────────────────────────────────

/** Transaction callback parameter type for mock transactions */
type TxMock = {
  draft: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  topic: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  humanization: {
    create: ReturnType<typeof vi.fn>
  }
}

const mockEvaluation = {
  upsert: vi.fn(),
}

const mockHumanization = {
  create: vi.fn(),
}

const mockDraft = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}

const mockTopic = {
  update: vi.fn(),
}

const mockTransaction = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    evaluation: mockEvaluation,
    humanization: mockHumanization,
    draft: mockDraft,
    topic: mockTopic,
    $transaction: mockTransaction,
  },
}))

type TxCallback = (tx: TxMock) => Promise<unknown>

const createTxMock = (sourceDraftId: string, currentMaxVersion: number): TxMock => {
  return {
    draft: {
      findFirst: vi.fn().mockResolvedValue({ version: currentMaxVersion }),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: `draft-v${currentMaxVersion + 1}`, ...args.data })
      ),
    },
    topic: {
      // P0.5.3 Hardening: OCC check reads activeDraftId inside transaction
      findUnique: vi.fn().mockResolvedValue({ activeDraftId: sourceDraftId }),
      update: vi.fn().mockResolvedValue({ id: 'topic-1', activeDraftId: `draft-v${currentMaxVersion + 1}` }),
    },
    humanization: {
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'human-1', ...args.data })
      ),
    },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('P0.5.3 — upsertDraftEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 1: upsert creates new evaluation when none exists', async () => {
    mockEvaluation.upsert.mockResolvedValue({
      id: 'eval-1',
      draftId: 'draft-1',
      topicId: 'topic-1',
      overallScore: 82,
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const result = await topicRepository.upsertDraftEvaluation({
      draftId: 'draft-1',
      topicId: 'topic-1',
      overallScore: 82,
      emotionalImpactScore: 86,
      logicalClarityScore: 80,
      noveltyScore: 78,
      readabilityScore: 84,
      utilityScore: 82,
      platformFitScore: 81,
      strengths: ['hook strong'],
      issues: ['CTA weak'],
      suggestions: [{ section: 'intro', issue: 'weak', suggestion: 'improve', priority: 'high' }],
      conclusion: 'good',
    })

    expect(mockEvaluation.upsert).toHaveBeenCalledTimes(1)
    expect(mockEvaluation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { draftId: 'draft-1' },
        create: expect.objectContaining({
          overallScore: 82,
          emotionalImpactScore: 86,
        }),
        update: expect.objectContaining({
          overallScore: 82,
        }),
      }),
    )
    expect(result.overallScore).toBe(82)
  })

  it('Test 2: upsert binds evaluation to the correct draftId', async () => {
    mockEvaluation.upsert.mockResolvedValue({
      id: 'eval-2',
      draftId: 'target-draft',
      topicId: 'topic-1',
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    await topicRepository.upsertDraftEvaluation({
      draftId: 'target-draft',
      topicId: 'topic-1',
      strengths: [],
      issues: [],
    })

    // Verify the where clause targets the correct draftId
    const callArgs = mockEvaluation.upsert.mock.calls[0][0]
    expect(callArgs.where).toEqual({ draftId: 'target-draft' })
    // Verify create data connects to the correct draft
    expect(callArgs.create.draft).toEqual({ connect: { id: 'target-draft' } })
  })

  it('Test 3: re-evaluation updates existing Evaluation (upsert)', async () => {
    // First call: create
    mockEvaluation.upsert.mockResolvedValueOnce({
      id: 'eval-1',
      draftId: 'draft-1',
      overallScore: 75,
    })
    // Second call: update
    mockEvaluation.upsert.mockResolvedValueOnce({
      id: 'eval-1',
      draftId: 'draft-1',
      overallScore: 88,
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')

    // First evaluation
    await topicRepository.upsertDraftEvaluation({
      draftId: 'draft-1',
      topicId: 'topic-1',
      overallScore: 75,
      strengths: [],
      issues: [],
    })

    // Second evaluation (re-evaluate)
    const result = await topicRepository.upsertDraftEvaluation({
      draftId: 'draft-1',
      topicId: 'topic-1',
      overallScore: 88,
      strengths: [],
      issues: [],
    })

    expect(mockEvaluation.upsert).toHaveBeenCalledTimes(2)
    // Both calls use the same where clause → updates existing record
    expect(result.overallScore).toBe(88)
  })
})

describe('P0.5.3 — createRefinedDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 4: Refine creates new Draft version', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-v5',
      topicId: 'topic-1',
      version: 5,
      title: 'Original Title',
      content: 'Original content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-v5',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      return callback(createTxMock('draft-v5', 5))
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const result = await topicRepository.createRefinedDraft({
      sourceDraftId: 'draft-v5',
      content: 'Refined content here',
      title: 'Refined Title',
      userId: 'user-1',
    })

    expect(result.draft.version).toBe(6)
  })

  it('Test 5: parentDraftId points to source Draft', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-src',
      topicId: 'topic-1',
      version: 3,
      content: 'source content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-src',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      const tx = createTxMock('draft-src', 3)
      const originalCreate = tx.draft.create
      tx.draft.create = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        // Verify parentDraftId is set correctly
        expect(args.data.parentDraftId).toBe('draft-src')
        return originalCreate(args)
      })
      return callback(tx)
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const result = await topicRepository.createRefinedDraft({
      sourceDraftId: 'draft-src',
      content: 'Refined content',
      userId: 'user-1',
    })

    expect(result.draft.parentDraftId).toBe('draft-src')
  })

  it('Test 6: changeType = REFINE', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-v1',
      topicId: 'topic-1',
      version: 1,
      content: 'content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-v1',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      return callback(createTxMock('draft-v1', 1))
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const result = await topicRepository.createRefinedDraft({
      sourceDraftId: 'draft-v1',
      content: 'refined',
      userId: 'user-1',
    })

    expect(result.draft.changeType).toBe('REFINE')
  })

  it('Test 7: activeDraftId switches atomically', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-old',
      topicId: 'topic-1',
      version: 2,
      content: 'old content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-old',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    let topicUpdateCalled = false
    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      const tx = createTxMock('draft-old', 2)
      tx.topic.update = vi.fn().mockImplementation((args: { data: { activeDraftId: string } }) => {
        topicUpdateCalled = true
        expect(args.data.activeDraftId).toBe('draft-new')
        return Promise.resolve({ id: 'topic-1', activeDraftId: 'draft-new' })
      })
      tx.draft.create = vi.fn().mockResolvedValue({
        id: 'draft-new',
        version: 3,
      })
      return callback(tx)
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const result = await topicRepository.createRefinedDraft({
      sourceDraftId: 'draft-old',
      content: 'new content',
      userId: 'user-1',
    })

    expect(topicUpdateCalled).toBe(true)
    expect(result.topic.activeDraftId).toBe('draft-new')
  })
})

describe('P0.5.3 — createHumanizedDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 8: adopt creates new Draft with correct parentDraftId', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-v6',
      topicId: 'topic-1',
      version: 6,
      content: 'refined content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-v6',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      const tx = createTxMock('draft-v6', 6)
      const originalCreate = tx.draft.create
      tx.draft.create = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        expect(args.data.parentDraftId).toBe('draft-v6')
        return originalCreate(args)
      })
      return callback(tx)
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const result = await topicRepository.createHumanizedDraft({
      sourceDraftId: 'draft-v6',
      content: 'humanized content',
      userId: 'user-1',
      aiStyleScore: 30,
      humanizedScore: 85,
    })

    expect(result.draft.parentDraftId).toBe('draft-v6')
  })

  it('Test 9: changeType = HUMANIZATION', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-v6',
      topicId: 'topic-1',
      version: 6,
      content: 'refined content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-v6',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      return callback(createTxMock('draft-v6', 6))
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const result = await topicRepository.createHumanizedDraft({
      sourceDraftId: 'draft-v6',
      content: 'humanized content',
      userId: 'user-1',
    })

    expect(result.draft.changeType).toBe('HUMANIZATION')
  })

  it('Test 10: Humanization persisted against new draft', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-v6',
      topicId: 'topic-1',
      version: 6,
      content: 'refined content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-v6',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    const txHumanizationCreate = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      // Verify Humanization is bound to the NEW draft
      expect((args.data.draft as { connect: { id: string } }).connect.id).toBe('draft-v7')
      expect(args.data.adopted).toBe(true)
      return Promise.resolve({ id: 'human-1', ...args.data })
    })

    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      const tx = createTxMock('draft-v6', 6)
      tx.humanization.create = txHumanizationCreate
      // Override create to return draft-v7
      tx.draft.create = vi.fn().mockResolvedValue({
        id: 'draft-v7',
        version: 7,
        changeType: 'HUMANIZATION',
      })
      return callback(tx)
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const result = await topicRepository.createHumanizedDraft({
      sourceDraftId: 'draft-v6',
      content: 'humanized content',
      userId: 'user-1',
      aiStyleScore: 25,
      humanizedScore: 90,
      changes: [{ original: 'template', revised: 'natural', type: 'template' }],
      issues: [],
    })

    // Humanization was created (called inside transaction)
    expect(txHumanizationCreate).toHaveBeenCalledTimes(1)
    // Result contains humanization
    expect(result.humanization).toBeDefined()
  })

  it('Test 11: preview does NOT create Draft (no-op test: unit level)', async () => {
    // At repository level, preview has no method — it's purely a skill call.
    // This test verifies no draft creation happens for preview.
    // The actual test is in server-actions level.
    const { topicRepository } = await import('@/lib/repositories/topic-repository')

    // Verify topicRepository has no 'previewHumanization' method
    expect((topicRepository as any).previewHumanization).toBeUndefined()
  })
})

describe('P0.5.3 — OCC Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 12: ACTIVE_DRAFT_CONFLICT when source is not active (createRefinedDraft)', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-old',
      topicId: 'topic-1',
      version: 3,
      content: 'old content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-new', // Different from source!
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    // P0.5.3 Hardening Fix 3: OCC check now happens INSIDE the transaction
    // via tx.topic.findUnique. Mock that to return stale activeDraftId.
    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 3 }),
          create: vi.fn(),
        },
        topic: {
          findUnique: vi.fn().mockResolvedValue({ activeDraftId: 'draft-new' }), // Stale!
          update: vi.fn(),
        },
      })
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')

    await expect(
      topicRepository.createRefinedDraft({
        sourceDraftId: 'draft-old',
        content: 'new content',
        userId: 'user-1',
      }),
    ).rejects.toThrow('ACTIVE_DRAFT_CONFLICT')
  })

  it('Test 13: createHumanizedDraft also checks OCC (in-transaction)', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-stale',
      topicId: 'topic-1',
      version: 2,
      content: 'stale content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-current',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 2 }),
          create: vi.fn(),
        },
        topic: {
          findUnique: vi.fn().mockResolvedValue({ activeDraftId: 'draft-current' }), // Stale!
          update: vi.fn(),
        },
        humanization: {
          create: vi.fn(),
        },
      })
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')

    await expect(
      topicRepository.createHumanizedDraft({
        sourceDraftId: 'draft-stale',
        content: 'humanized',
        userId: 'user-1',
      }),
    ).rejects.toThrow('ACTIVE_DRAFT_CONFLICT')
  })

  // ── P0.5.3 Hardening: In-transaction OCC Tests ──────────────────────

  it('Test 14: createRefinedDraft calls tx.topic.findUnique inside transaction', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-v1',
      topicId: 'topic-1',
      version: 1,
      content: 'content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-v1',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    let txTopicFindUniqueCalled = false
    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      const tx = createTxMock('draft-v1', 1)
      const originalFindUnique = tx.topic.findUnique
      tx.topic.findUnique = vi.fn().mockImplementation((args: { where: { id: string } }) => {
        txTopicFindUniqueCalled = true
        // Verify it queries the correct topic
        expect(args.where.id).toBe('topic-1')
        return originalFindUnique(args)
      })
      return callback(tx)
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    await topicRepository.createRefinedDraft({
      sourceDraftId: 'draft-v1',
      content: 'refined',
      userId: 'user-1',
    })

    // P0.5.3 Hardening Fix 3: OCC check must be called INSIDE the transaction
    expect(txTopicFindUniqueCalled).toBe(true)
    // mockTransaction should have been called (the OCC check is inside it)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('Test 15: createHumanizedDraft calls tx.topic.findUnique inside transaction', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-v2',
      topicId: 'topic-1',
      version: 2,
      content: 'content',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-v2',
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    let txTopicFindUniqueCalled = false
    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      const tx = createTxMock('draft-v2', 2)
      const originalFindUnique = tx.topic.findUnique
      tx.topic.findUnique = vi.fn().mockImplementation((args: { where: { id: string } }) => {
        txTopicFindUniqueCalled = true
        expect(args.where.id).toBe('topic-1')
        return originalFindUnique(args)
      })
      return callback(tx)
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    await topicRepository.createHumanizedDraft({
      sourceDraftId: 'draft-v2',
      content: 'humanized',
      userId: 'user-1',
    })

    expect(txTopicFindUniqueCalled).toBe(true)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('Test 16: ACTIVE_DRAFT_CONFLICT is fatal — no retry (createRefinedDraft)', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-old',
      topicId: 'topic-1',
      version: 1,
      content: 'old',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-new', // stale
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    let transactionCallCount = 0
    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      transactionCallCount++
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 1 }),
          create: vi.fn(),
        },
        topic: {
          findUnique: vi.fn().mockResolvedValue({ activeDraftId: 'draft-new' }), // stale
          update: vi.fn(),
        },
      })
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')

    await expect(
      topicRepository.createRefinedDraft({
        sourceDraftId: 'draft-old',
        content: 'new',
        userId: 'user-1',
      }),
    ).rejects.toThrow('ACTIVE_DRAFT_CONFLICT')

    // P0.5.3 Hardening: ACTIVE_DRAFT_CONFLICT must NOT retry — only 1 transaction call
    expect(transactionCallCount).toBe(1)
  })

  it('Test 17: ACTIVE_DRAFT_CONFLICT is fatal — no retry (createHumanizedDraft)', async () => {
    mockDraft.findUnique.mockResolvedValue({
      id: 'draft-stale',
      topicId: 'topic-1',
      version: 2,
      content: 'stale',
      outline: null,
      topic: {
        id: 'topic-1',
        activeDraftId: 'draft-active', // stale
        project: { id: 'proj-1', userId: 'user-1' },
      },
    })

    let transactionCallCount = 0
    mockTransaction.mockImplementation(async (callback: TxCallback) => {
      transactionCallCount++
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 2 }),
          create: vi.fn(),
        },
        topic: {
          findUnique: vi.fn().mockResolvedValue({ activeDraftId: 'draft-active' }), // stale
          update: vi.fn(),
        },
        humanization: {
          create: vi.fn(),
        },
      })
    })

    const { topicRepository } = await import('@/lib/repositories/topic-repository')

    await expect(
      topicRepository.createHumanizedDraft({
        sourceDraftId: 'draft-stale',
        content: 'humanized',
        userId: 'user-1',
      }),
    ).rejects.toThrow('ACTIVE_DRAFT_CONFLICT')

    // P0.5.3 Hardening: ACTIVE_DRAFT_CONFLICT must NOT retry
    expect(transactionCallCount).toBe(1)
  })
})
