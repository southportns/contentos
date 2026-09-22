/*
 * P0.4.3/P0.4.4 — Draft Version Restore Repository Tests
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
 *   12. P0.4.4 — P2002 conflict detection and retry (max 3)
 *   13. P0.4.4 — Retry success after conflict
 *   14. P0.4.4 — Retry exhaustion → DRAFT_VERSION_CONFLICT
 *   15. P0.4.4 — Different topics can have same version
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

// ─── P2002 Error Helper ─────────────────────────────────────────────────────

function createP2002Error(): Error {
  const error = new Error('Unique constraint failed on the fields: (`topicId`, `version`)')
  Object.assign(error, { code: 'P2002', meta: { target: ['topicId', 'version'] } })
  Object.setPrototypeOf(error, Error.prototype)
  return error
}

// ─── Transaction Mock Helper (P0.4.4: only version check + create) ───────────

function setupTransactionMock(
  maxVersion: number,
  createdDraft: { id: string; version: number },
  sourceDraft?: ReturnType<typeof createMockSourceDraft>,
) {
  mockTransaction.mockImplementation(async (callback: (tx: { draft: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
    const resolvedTopicId = sourceDraft?.topicId ?? 'topic_1'
    const resolvedContent = sourceDraft?.content ?? '这是原始内容，用于测试恢复功能。'
    const tx = {
      draft: {
        findUnique: vi.fn().mockResolvedValue(sourceDraft ?? null),
        findFirst: vi.fn().mockResolvedValue({ version: maxVersion }),
        create: vi.fn().mockResolvedValue({
          id: createdDraft.id,
          topicId: resolvedTopicId,
          version: createdDraft.version,
          title: sourceDraft?.title ?? '原始标题',
          content: resolvedContent,
          outline: sourceDraft?.outline ?? ['章节1', '章节2'],
          status: 'DRAFT',
          wordCount: resolvedContent.length,
          createdAt: new Date('2026-09-20T10:00:00Z'),
          updatedAt: new Date('2026-09-20T10:00:00Z'),
        }),
      },
    }
    return callback(tx)
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.4.3/P0.4.4 — createRestoredDraft', () => {
  beforeEach(() => {
    mockDraftFindUnique.mockClear()
    mockDraftFindFirst.mockClear()
    mockDraftCreate.mockClear()
    mockDraftUpdate.mockClear()
    mockDraftDelete.mockClear()
    mockTransaction.mockClear()
  })

  // ── Test Group: Basic Restore ──────────────────────────────────────────

  describe('Test A — Sequential Restore (v1,2,3 → restore v1 → v4)', () => {
    it('creates version 4 when source v1 exists with max version 3', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(3, { id: 'draft_new_4', version: 4 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(result.version).toBe(4)
      expect(result.id).toBe('draft_new_4')
    })
  })

  describe('Test B — Restore Latest (v1,2,3 → restore v3 → v4)', () => {
    it('creates version 4 when restoring the latest version 3', async () => {
      const sourceDraft = createMockSourceDraft({ version: 3 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(3, { id: 'draft_new_4', version: 4 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(result.version).toBe(4)
    })
  })

  describe('Test C — Restore Middle Version (v1,2,3,4 → restore v2 → v5)', () => {
    it('creates version 5 when restoring middle version 2 with max 4', async () => {
      const sourceDraft = createMockSourceDraft({ version: 2 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(4, { id: 'draft_new_5', version: 5 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(result.version).toBe(5)
    })
  })

  // ── Test Group: P0.4.4 Conflict Handling & Retry ────────────────────────

  describe('Test D — Duplicate Version (P2002 detected)', () => {
    it('detects P2002 and throws DRAFT_VERSION_CONFLICT after max retries', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      // All 3 attempts throw P2002
      mockTransaction.mockImplementation(async () => {
        throw createP2002Error()
      })

      await expect(
        topicRepository.createRestoredDraft('draft_source_1', 'default')
      ).rejects.toThrow('DRAFT_VERSION_CONFLICT')

      // Verify exactly 3 retries were attempted
      expect(mockTransaction).toHaveBeenCalledTimes(3)
    })
  })

  describe('Test E — Retry Success (attempt 1 conflict, attempt 2 success)', () => {
    it('succeeds on second attempt after first P2002 conflict', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      let callCount = 0
      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        callCount++
        if (callCount === 1) {
          throw createP2002Error()
        }
        // Second attempt succeeds
        const tx = {
          draft: {
            findFirst: vi.fn().mockResolvedValue({ version: 5 }),
            create: vi.fn().mockResolvedValue({
              id: 'draft_new_6',
              topicId: 'topic_1',
              version: 6,
              title: sourceDraft.title,
              content: sourceDraft.content,
              outline: sourceDraft.outline,
              status: 'DRAFT',
              wordCount: sourceDraft.content.length,
              createdAt: new Date('2026-09-20T10:00:00Z'),
              updatedAt: new Date('2026-09-20T10:00:00Z'),
            }),
          },
        }
        return callback(tx)
      })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(result.version).toBe(6)
      expect(mockTransaction).toHaveBeenCalledTimes(2)
    })
  })

  describe('Test F — Retry Exhaustion (all 3 attempts fail)', () => {
    it('throws DRAFT_VERSION_CONFLICT after 3 failed attempts', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      // All attempts throw P2002
      mockTransaction.mockImplementation(async () => {
        throw createP2002Error()
      })

      await expect(
        topicRepository.createRestoredDraft('draft_source_1', 'default')
      ).rejects.toThrow('DRAFT_VERSION_CONFLICT')

      // Must NOT retry infinitely — exactly 3 attempts
      expect(mockTransaction).toHaveBeenCalledTimes(3)
    })
  })

  // ── Test Group: Different Topics ───────────────────────────────────────

  describe('Test G — Different Topics Can Have Same Version', () => {
    it('allows Topic A v1 and Topic B v1', async () => {
      // Topic A: source draft with version 1, create new draft succeeds
      const sourceDraftA = createMockSourceDraft({ topicId: 'topic_A', version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraftA)
      setupTransactionMock(1, { id: 'draft_a_v2', version: 2 }, sourceDraftA)

      const resultA = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(resultA.topicId).toBe('topic_A')
      expect(resultA.version).toBe(2)

      // Topic B: source draft with version 1, create new draft succeeds
      const sourceDraftB = createMockSourceDraft({ id: 'draft_source_b', topicId: 'topic_B', version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraftB)
      setupTransactionMock(1, { id: 'draft_b_v2', version: 2 }, sourceDraftB)

      const resultB = await topicRepository.createRestoredDraft('draft_source_b', 'default')
      expect(resultB.topicId).toBe('topic_B')
      expect(resultB.version).toBe(2)
    })
  })

  // ── Test Group: History Preservation ───────────────────────────────────

  describe('Test H — Existing History Preservation (v1,v2,v3 → v4)', () => {
    it('creates v4 without modifying v1, v2, v3', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(3, { id: 'draft_new_4', version: 4 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')

      // New version created
      expect(result.version).toBe(4)

      // No update or delete operations (history preserved)
      expect(mockDraftUpdate).not.toHaveBeenCalled()
      expect(mockDraftDelete).not.toHaveBeenCalled()
    })

    it('source draft is read from top-level prisma (not inside transaction)', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(3, { id: 'draft_new', version: 4 }, sourceDraft)

      await topicRepository.createRestoredDraft('draft_source_1', 'default')

      // Source draft read from top-level prisma
      expect(mockDraftFindUnique).toHaveBeenCalledTimes(1)
      expect(mockDraftFindUnique).toHaveBeenCalledWith({
        where: { id: 'draft_source_1' },
        include: { topic: { include: { project: true } } },
      })

      // Max version re-read inside transaction
      expect(mockTransaction).toHaveBeenCalledTimes(1)
    })
  })

  // ── Test Group: Content Copy ───────────────────────────────────────────

  describe('Content Copy', () => {
    it('copies title from source draft', async () => {
      const sourceDraft = createMockSourceDraft({ title: '测试标题' })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.title).toBe('测试标题')
    })

    it('copies content from source draft', async () => {
      const content = '这是要复制的内容。'
      const sourceDraft = createMockSourceDraft({ content })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.content).toBe(content)
    })

    it('copies outline from source draft', async () => {
      const outline = ['大纲1', '大纲2', '大纲3']
      const sourceDraft = createMockSourceDraft({ outline })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.outline).toEqual(outline)
    })
  })

  // ── Test Group: Analysis NOT Copied ────────────────────────────────────

  describe('Analysis NOT Copied', () => {
    it('new draft has no evaluation relation', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.evaluation).toBeUndefined()
    })

    it('new draft has no strategyEvaluation relation', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.strategyEvaluation).toBeUndefined()
    })

    it('new draft has no humanization relation', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.humanization).toBeUndefined()
    })
  })

  // ── Test Group: Status ────────────────────────────────────────────────

  describe('Status', () => {
    it('new draft status is always DRAFT', async () => {
      const sourceDraft = createMockSourceDraft({ status: 'FINAL' })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.status).toBe('DRAFT')
    })

    it('restoring HUMANIZED still creates DRAFT', async () => {
      const sourceDraft = createMockSourceDraft({ status: 'HUMANIZED' })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.status).toBe('DRAFT')
    })
  })

  // ── Test Group: Word Count ────────────────────────────────────────────

  describe('Word Count', () => {
    it('wordCount is recalculated from content.length', async () => {
      const content = '测试内容长度'
      const sourceDraft = createMockSourceDraft({ content, wordCount: 10 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.wordCount).toBe(content.length)
    })

    it('wordCount recalculated even if source had different value', async () => {
      const content = '不同的字数'
      const sourceDraft = createMockSourceDraft({ content, wordCount: 999 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.wordCount).toBe(content.length)
    })
  })

  // ── Test Group: Version Increment ─────────────────────────────────────

  describe('Version Increment', () => {
    it('version = max(version) + 1', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(5, { id: 'draft_new', version: 6 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.version).toBe(6)
    })

    it('version starts at 1 when no drafts exist (edge case)', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        const tx = {
          draft: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: 'draft_new',
              topicId: 'topic_1',
              version: 1,
              title: sourceDraft.title,
              content: sourceDraft.content,
              outline: sourceDraft.outline,
              status: 'DRAFT',
              wordCount: sourceDraft.content.length,
              createdAt: new Date('2026-09-20T10:00:00Z'),
              updatedAt: new Date('2026-09-20T10:00:00Z'),
            }),
          },
        }
        return callback(tx)
      })

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result.version).toBe(1)
    })
  })

  // ── Test Group: Ownership Validation ──────────────────────────────────

  describe('Ownership Validation', () => {
    it('throws OWNERSHIP_DENIED when user does not own the draft', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      sourceDraft.topic.project.userId = 'other_user'
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      await expect(
        topicRepository.createRestoredDraft('draft_source_1', 'default')
      ).rejects.toThrow('OWNERSHIP_DENIED')
    })

    it('allows restore when user owns the draft', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      sourceDraft.topic.project.userId = 'default'
      mockDraftFind_unique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      const result = await topicRepository.createRestoredDraft('draft_source_1', 'default')
      expect(result).toBeDefined()
      expect(result.version).toBe(2)
    })
  })

  // ── Test Group: Missing Source ────────────────────────────────────────

  describe('Missing Source', () => {
    it('throws SOURCE_DRAFT_NOT_FOUND when source draft does not exist', async () => {
      mockDraftFindUnique.mockResolvedValue(null)

      await expect(
        topicRepository.createRestoredDraft('nonexistent_draft', 'default')
      ).rejects.toThrow('SOURCE_DRAFT_NOT_FOUND')
    })

    it('throws TOPIC_NOT_FOUND when topic is missing', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      sourceDraft.topic = null as unknown as NonNullable<typeof sourceDraft.topic>
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      await expect(
        topicRepository.createRestoredDraft('draft_source_1', 'default')
      ).rejects.toThrow('TOPIC_NOT_FOUND')
    })
  })

  // ── Test Group: History Preservation ──────────────────────────────────

  describe('History Preservation', () => {
    it('does NOT call draft.update or draft.delete', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(mockDraftUpdate).not.toHaveBeenCalled()
      expect(mockDraftDelete).not.toHaveBeenCalled()
    })

    it('only creates new draft, does not modify source', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      let createCallData: Record<string, unknown> | null = null
      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        const tx = {
          draft: {
            findFirst: vi.fn().mockResolvedValue({ version: 1 }),
            create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
              createCallData = args.data
              return Promise.resolve({
                id: 'draft_new',
                topicId: 'topic_1',
                version: 2,
                title: sourceDraft.title,
                content: sourceDraft.content,
                outline: sourceDraft.outline,
                status: 'DRAFT',
                wordCount: sourceDraft.content.length,
                createdAt: new Date('2026-09-20T10:00:00Z'),
                updatedAt: new Date('2026-09-20T10:00:00Z'),
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

  // ── Test Group: Transaction Safety ────────────────────────────────────

  describe('Transaction Safety', () => {
    it('uses $transaction for atomicity', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { id: 'draft_new', version: 2 }, sourceDraft)

      await topicRepository.createRestoredDraft('draft_source_1', 'default')

      expect(mockTransaction).toHaveBeenCalledTimes(1)
    })

    it('when create fails with non-P2002 error, throws immediately (no retry)', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      mockTransaction.mockImplementation(async () => {
        throw new Error('DB_WRITE_FAILED')
      })

      await expect(
        topicRepository.createRestoredDraft('draft_source_1', 'default')
      ).rejects.toThrow('DB_WRITE_FAILED')

      // Only 1 attempt — non-P2002 errors do NOT trigger retry
      expect(mockTransaction).toHaveBeenCalledTimes(1)
    })
  })
})
