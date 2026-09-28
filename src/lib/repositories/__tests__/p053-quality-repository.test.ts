/**
 * P0.5.3 — Repository Layer Tests
 *
 * Tests for:
 * - upsertDraftEvaluation (Evaluation persistence)
 * - createRefinedDraft (Refine → New Draft)
 * - createHumanizedDraft (Humanization Adopt → New Draft)
 *
 * These are unit tests against the repository functions with mocked Prisma.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Prisma, Draft } from '@/generated/prisma'

// ── Mock Prisma ──────────────────────────────────────────────────────────

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

    mockTransaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 5 }),
          create: vi.fn().mockResolvedValue({
            id: 'draft-v6',
            topicId: 'topic-1',
            version: 6,
            changeType: 'REFINE',
          }),
        },
        topic: {
          update: vi.fn().mockResolvedValue({ id: 'topic-1', activeDraftId: 'draft-v6' }),
        },
      })
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

    mockTransaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 3 }),
          create: vi.fn().mockImplementation((args) => {
            // Verify parentDraftId is set correctly
            expect(args.data.parentDraftId).toBe('draft-src')
            return Promise.resolve({
              id: 'draft-child',
              ...args.data,
            })
          }),
        },
        topic: {
          update: vi.fn().mockResolvedValue({ id: 'topic-1' }),
        },
      })
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

    mockTransaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 1 }),
          create: vi.fn().mockImplementation((args) => {
            expect(args.data.changeType).toBe('REFINE')
            return Promise.resolve({ id: 'draft-v2', ...args.data })
          }),
        },
        topic: {
          update: vi.fn().mockResolvedValue({ id: 'topic-1' }),
        },
      })
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
    mockTransaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 2 }),
          create: vi.fn().mockResolvedValue({
            id: 'draft-new',
            version: 3,
          }),
        },
        topic: {
          update: vi.fn().mockImplementation((args) => {
            topicUpdateCalled = true
            expect(args.data.activeDraftId).toBe('draft-new')
            return Promise.resolve({ id: 'topic-1', activeDraftId: 'draft-new' })
          }),
        },
      })
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

    mockTransaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 6 }),
          create: vi.fn().mockImplementation((args) => {
            expect(args.data.parentDraftId).toBe('draft-v6')
            return Promise.resolve({ id: 'draft-v7', ...args.data })
          }),
        },
        topic: {
          update: vi.fn().mockResolvedValue({ id: 'topic-1', activeDraftId: 'draft-v7' }),
        },
        humanization: {
          create: vi.fn().mockResolvedValue({ id: 'human-1' }),
        },
      })
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

    mockTransaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 6 }),
          create: vi.fn().mockImplementation((args) => {
            expect(args.data.changeType).toBe('HUMANIZATION')
            return Promise.resolve({ id: 'draft-v7', ...args.data })
          }),
        },
        topic: {
          update: vi.fn().mockResolvedValue({ id: 'topic-1' }),
        },
        humanization: {
          create: vi.fn().mockResolvedValue({ id: 'human-1' }),
        },
      })
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

    mockTransaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback({
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 6 }),
          create: vi.fn().mockResolvedValue({
            id: 'draft-v7',
            version: 7,
            changeType: 'HUMANIZATION',
          }),
        },
        topic: {
          update: vi.fn().mockResolvedValue({ id: 'topic-1' }),
        },
        humanization: {
          create: txHumanizationCreate,
        },
      })
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

  it('Test 12: ACTIVE_DRAFT_CONFLICT when source is not active', async () => {
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

    const { topicRepository } = await import('@/lib/repositories/topic-repository')

    await expect(
      topicRepository.createRefinedDraft({
        sourceDraftId: 'draft-old',
        content: 'new content',
        userId: 'user-1',
      }),
    ).rejects.toThrow('ACTIVE_DRAFT_CONFLICT')
  })

  it('Test 13: createHumanizedDraft also checks OCC', async () => {
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

    const { topicRepository } = await import('@/lib/repositories/topic-repository')

    await expect(
      topicRepository.createHumanizedDraft({
        sourceDraftId: 'draft-stale',
        content: 'humanized',
        userId: 'user-1',
      }),
    ).rejects.toThrow('ACTIVE_DRAFT_CONFLICT')
  })
})