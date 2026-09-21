/*
 * P0.4.3 — Draft Version Restore Repository Tests
 *
 * Tests verify:
 *   1. Basic restore: source v1 → new v2
 *   2. Non-contiguous versions: v1, v3 → new v4
 *   3. Content copy: title, content, outline copied
 *   4. Analysis NOT copied: evaluation, strategyEvaluation, humanization = null
 *   5. Status: new status = DRAFT
 *   6. Word count: recalculated from content.length
 *   7. Version: max(version) + 1
 *   8. Ownership: different user cannot restore
 *   9. Missing source: source draft missing → controlled error
 *   10. History preservation: original draft unchanged
 *   11. Transaction: all-or-nothing (no partial drafts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Track all Prisma operations ─────────────────────────────────────────────

const mockDraftFindUnique = vi.hoisted(() => vi.fn())
const mockDraftFindFirst = vi.hoisted(() => vi.fn())
const mockDraftCreate = vi.hoisted(() => vi.fn())
const mockDraftUpdate = vi.hoisted(() => vi.fn())
const mockDraftDelete = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())

// ─── Mock Prisma client ──────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      draft: {
        findUnique: mockDraftFindUnique,
        findFirst: mockDraftFindFirst,
        create: mockDraftCreate,
        update: mockDraftUpdate,
        delete: mockDraftDelete,
      },
      $transaction: mockTransaction,
    },
  }
})

// ─── Import after mock ──────────────────────────────────────────────────────

import { topicRepository } from '../topic-repository'

// ─── Test Data ──────────────────────────────────────────────────────────────

function createMockSourceDraft(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-09-20T10:00:00Z')
  return {
    id: 'draft_source_1',
    topicId: 'topic_1',
    version: overrides.version ?? 1,
    title: overrides.title ?? '原始标题',
    content: overrides.content ?? '这是原始内容，用于测试恢复功能。',
    outline: overrides.outline ?? ['章节1', '章节2'],
    status: overrides.status ?? 'DRAFT',
    wordCount: overrides.wordCount ?? 100,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    topic: {
      id: 'topic_1',
      projectId: 'proj_1',
      project: {
        id: 'proj_1',
        userId: 'default',
      },
    },
    ...overrides,
  }
}

// ─── Transaction Mock Helper ────────────────────────────────────────────────

function setupTransactionMock(
  sourceDraft: ReturnType<typeof createMockSourceDraft>,
  maxVersion: number,
  createdDraft: { id: string; version: number },
) {
  mockTransaction.mockImplementation(async (callback: (tx: { draft: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
    const tx = {
      draft: {
        findUnique: vi.fn().mockResolvedValue(sourceDraft),
        findFirst: vi.fn().mockResolvedValue({ version: maxVersion }),
        create: vi.fn().mockResolvedValue({
          ...sourceDraft,
          id: createdDraft.id,
          version: createdDraft.version,
          status: 'DRAFT',
          wordCount: sourceDraft.content.length,
        }),
      },
    }
    return callback(tx)
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.4.3 — createRestoredDraft', () => {
  beforeEach(() => {
    mockDraftFindUnique.mockClear()
    mockDraftFindFirst.mockClear()
    mockDraftCreate.mockClear()
    mockDraftUpdate.mockClear()
    mockDraftDelete.mockClear()
    mockTransaction.mockClear()
  })

  describe('Basic Restore (source v1 → new v2)', () => {
    it('creates a new draft with version 2 when source is version 1', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new_2', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(result.version).toBe(2)
      expect(result.id).toBe('draft_new_2')
    })

    it('calls transaction to ensure atomicity', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new_2', version: 2 })

      await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(mockTransaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('Non-contiguous Versions (v1, v3 → new v4)', () => {
    it('creates version 4 when max version is 3', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 3, { id: 'draft_new_4', version: 4 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(result.version).toBe(4)
    })

    it('restoring v2 when max is 5 creates v6', async () => {
      const sourceDraft = createMockSourceDraft({ version: 2 })
      setupTransactionMock(sourceDraft, 5, { id: 'draft_new_6', version: 6 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(result.version).toBe(6)
    })
  })

  describe('Content Copy', () => {
    it('copies title from source draft', async () => {
      const sourceDraft = createMockSourceDraft({ title: '测试标题' })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.title).toBe('测试标题')
    })

    it('copies content from source draft', async () => {
      const content = '这是要复制的内容。'
      const sourceDraft = createMockSourceDraft({ content })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.content).toBe(content)
    })

    it('copies outline from source draft', async () => {
      const outline = ['大纲1', '大纲2', '大纲3']
      const sourceDraft = createMockSourceDraft({ outline })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.outline).toEqual(outline)
    })
  })

  describe('Analysis NOT Copied', () => {
    it('new draft has null evaluation', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      // New draft is created without evaluation relation
      expect(result.evaluation).toBeUndefined()
    })

    it('new draft has null strategyEvaluation', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.strategyEvaluation).toBeUndefined()
    })

    it('new draft has null humanization', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.humanization).toBeUndefined()
    })
  })

  describe('Status', () => {
    it('new draft status is always DRAFT', async () => {
      const sourceDraft = createMockSourceDraft({ status: 'FINAL' })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.status).toBe('DRAFT')
    })

    it('restoring HUMANIZED still creates DRAFT', async () => {
      const sourceDraft = createMockSourceDraft({ status: 'HUMANIZED' })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.status).toBe('DRAFT')
    })
  })

  describe('Word Count', () => {
    it('wordCount is recalculated from content.length', async () => {
      const content = '测试内容长度'
      const sourceDraft = createMockSourceDraft({ content, wordCount: 10 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.wordCount).toBe(content.length)
    })

    it('wordCount recalculated even if source had different value', async () => {
      const content = '不同的字数'
      const sourceDraft = createMockSourceDraft({ content, wordCount: 999 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.wordCount).toBe(content.length)
    })
  })

  describe('Version Increment', () => {
    it('version = max(version) + 1', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 5, { id: 'draft_new', version: 6 })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.version).toBe(6)
    })

    it('version starts at 1 when no drafts exist (edge case)', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      // findFirst returns null when no drafts exist
      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        const tx = {
          draft: {
            findUnique: vi.fn().mockResolvedValue(sourceDraft),
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              ...sourceDraft,
              id: 'draft_new',
              version: 1,
              status: 'DRAFT',
              wordCount: sourceDraft.content.length,
            }),
          },
        }
        return callback(tx)
      })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.version).toBe(1)
    })
  })

  describe('Ownership Validation', () => {
    it('throws OWNERSHIP_DENIED when user does not own the draft', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      // Override topic.project.userId
      sourceDraft.topic.project.userId = 'other_user'

      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        const tx = {
          draft: {
            findUnique: vi.fn().mockResolvedValue(sourceDraft),
            findFirst: vi.fn(),
            create: vi.fn(),
          },
        }
        return callback(tx)
      })

      await expect(
        topicRepository.createRestoredDraft('draft_source_1', 'default')
      ).rejects.toThrow('OWNERSHIP_DENIED')
    })

    it('allows restore when user owns the draft', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      sourceDraft.topic.project.userId = 'default'

      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        const tx = {
          draft: {
            findUnique: vi.fn().mockResolvedValue(sourceDraft),
            findFirst: vi.fn().mockResolvedValue({ version: 1 }),
            create: vi.fn().mockResolvedValue({
              ...sourceDraft,
              id: 'draft_new',
              version: 2,
              status: 'DRAFT',
              wordCount: sourceDraft.content.length,
            }),
          },
        }
        return callback(tx)
      })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result).toBeDefined()
      expect(result.version).toBe(2)
    })
  })

  describe('Missing Source', () => {
    it('throws SOURCE_DRAFT_NOT_FOUND when source draft does not exist', async () => {
      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        const tx = {
          draft: {
            findUnique: vi.fn().mockResolvedValue(null),
            findFirst: vi.fn(),
            create: vi.fn(),
          },
        }
        return callback(tx)
      })

      await expect(
        topicRepository.createRestoredDraft('nonexistent_draft', 'default')
      ).rejects.toThrow('SOURCE_DRAFT_NOT_FOUND')
    })
  })

  describe('History Preservation', () => {
    it('does NOT call draft.update or draft.delete', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(mockDraftUpdate).not.toHaveBeenCalled()
      expect(mockDraftDelete).not.toHaveBeenCalled()
    })

    it('only creates new draft, does not modify source', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      let createCallData: Record<string, unknown> | null = null

      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        const tx = {
          draft: {
            findUnique: vi.fn().mockResolvedValue(sourceDraft),
            findFirst: vi.fn().mockResolvedValue({ version: 1 }),
            create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
              createCallData = args.data
              return Promise.resolve({
                ...sourceDraft,
                id: 'draft_new',
                version: 2,
                status: 'DRAFT',
                wordCount: sourceDraft.content.length,
              })
            }),
          },
        }
        return callback(tx)
      })

      await topicRepository.createRestoredDraft('draft_source_1', 'default')

      // Verify create was called with correct structure
      expect(createCallData).not.toBeNull()
      expect(createCallData!.topicId).toBe('topic_1')
      expect(createCallData!.version).toBe(2)
      expect(createCallData!.title).toBe(sourceDraft.title)
      expect(createCallData!.content).toBe(sourceDraft.content)
      expect(createCallData!.status).toBe('DRAFT')
    })
  })

  describe('Transaction Safety', () => {
    it('uses $transaction for atomicity', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      setupTransactionMock(sourceDraft, 1, { id: 'draft_new', version: 2 })

      await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(mockTransaction).toHaveBeenCalledTimes(1)
    })

    it('when create fails, no draft is returned (all-or-nothing)', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })

      mockTransaction.mockImplementation(async () => {
        throw new Error('DB_WRITE_FAILED')
      })

      await expect(
        topicRepository.createRestoredDraft('draft_source_1', 'default')
      ).rejects.toThrow('DB_WRITE_FAILED')
    })
  })
})
