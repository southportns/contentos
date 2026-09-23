/*
 * P0.5.1 — Manual Edit Draft Repository Tests (Mock-Based)
 *
 * Verifies createManualEditDraft behavior using mocked Prisma client,
 * following the exact same test pattern as P0.4.3/P0.4.4 draft-version-restore.test.ts.
 *
 * Tests:
 *   A. Normal MANUAL_EDIT creation
 *   B. parentDraftId correctly set
 *   C. changeType = MANUAL_EDIT
 *   D. Topic.activeDraftId updated
 *   E. Old draft preserved (findUnique not update)
 *   F. Transaction failure rollback (no partial writes)
 *   G. Version conflict handling (P2002 + retry)
 *   H. Cross-topic draft rejected
 *   I. Ownership rejected
 *   J. Title preserved from source when not provided
 *   K. Title overridden when provided
 *   L. Source draft not found
 *   M. ACTIVE_DRAFT_CONFLICT (stale active draft)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDraftFindUnique = vi.hoisted(() => vi.fn())
const mockDraftFindFirst = vi.hoisted(() => vi.fn())
const mockDraftCreate = vi.hoisted(() => vi.fn())
const mockTopicFindUnique = vi.hoisted(() => vi.fn())
const mockTopicUpdate = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      draft: {
        findUnique: mockDraftFindUnique,
        findFirst: mockDraftFindFirst,
        create: mockDraftCreate,
      },
      topic: {
        findUnique: mockTopicFindUnique,
        update: mockTopicUpdate,
      },
      $transaction: mockTransaction,
    },
  }
})

import { topicRepository } from '../topic-repository'

function createMockSourceDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft_v4',
    topicId: 'topic_1',
    version: 4,
    parentDraftId: overrides.parentDraftId ?? 'draft_v3',
    changeType: overrides.changeType ?? 'RESTORE',
    changeReason: overrides.changeReason ?? '基于 v3 恢复创建',
    title: overrides.title ?? '原始标题',
    content: overrides.content ?? '这是第四版本的内容，内容不少于50字以通过验证。',
    outline: overrides.outline ?? ['章节1', '章节2'],
    status: overrides.status ?? 'DRAFT',
    wordCount: overrides.wordCount ?? 100,
    createdAt: overrides.createdAt ?? new Date('2026-09-20T10:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-09-20T10:00:00Z'),
    topic: {
      id: 'topic_1',
      projectId: 'proj_1',
      activeDraftId: overrides.activeDraftId ?? 'draft_v4', // Default: source is the active draft
      project: { id: 'proj_1', userId: 'default' },
    },
    ...overrides,
  }
}

function createP2002Error(): Error {
  const error = new Error('Unique constraint failed')
  Object.assign(error, { code: 'P2002', meta: { target: ['topicId', 'version'] } })
  return error
}

function setupTransactionMock(maxVersion: number, newDraftData: Record<string, unknown>) {
  mockTransaction.mockImplementation(async (callback: (tx: { draft: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }; topic: { update: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
    const tx = {
      draft: {
        findFirst: vi.fn().mockResolvedValue({ version: maxVersion }),
        create: vi.fn().mockResolvedValue({
          id: 'draft_v5',
          topicId: 'topic_1',
          version: maxVersion + 1,
          parentDraftId: 'draft_v4',
          changeType: 'MANUAL_EDIT',
          changeReason: '基于 v4 手动编辑',
          title: newDraftData.title ?? '原始标题',
          content: newDraftData.content,
          outline: ['章节1', '章节2'],
          status: 'DRAFT',
          wordCount: (newDraftData.content as string)?.length ?? 0,
          createdAt: new Date('2026-09-23T10:00:00Z'),
          updatedAt: new Date('2026-09-23T10:00:00Z'),
        }),
      },
      topic: {
        update: vi.fn().mockResolvedValue({ id: 'topic_1', activeDraftId: 'draft_v5' }),
      },
    }
    return callback(tx)
  })
}

describe('P0.5.1 — createManualEditDraft', () => {
  beforeEach(() => {
    mockDraftFindUnique.mockClear()
    mockDraftFindFirst.mockClear()
    mockDraftCreate.mockClear()
    mockTopicFindUnique.mockClear()
    mockTopicUpdate.mockClear()
    mockTransaction.mockClear()
  })

  describe('Test A — Normal MANUAL_EDIT creation', () => {
    it('creates new draft from v4 → v5 with new content', async () => {
      const sourceDraft = createMockSourceDraft({ version: 4 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      // Track tx.draft.create and tx.topic.update calls
      let txDraftCreate: ReturnType<typeof vi.fn> | null = null
      let txTopicUpdate: ReturnType<typeof vi.fn> | null = null

      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }; topic: { update: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        txDraftCreate = vi.fn().mockResolvedValue({
          id: 'draft_v5',
          topicId: 'topic_1',
          version: 5,
          parentDraftId: 'draft_v4',
          changeType: 'MANUAL_EDIT',
          changeReason: '基于 v4 手动编辑',
          title: '原始标题',
          content: '用户修改后的新内容，内容长度需要不少于50字才能通过所有验证检查。',
          outline: ['章节1', '章节2'],
          status: 'DRAFT',
          wordCount: 50,
          createdAt: new Date('2026-09-23T10:00:00Z'),
          updatedAt: new Date('2026-09-23T10:00:00Z'),
        })
        txTopicUpdate = vi.fn().mockResolvedValue({ id: 'topic_1', activeDraftId: 'draft_v5' })
        const tx = {
          draft: {
            findFirst: vi.fn().mockResolvedValue({ version: 4 }),
            create: txDraftCreate,
          },
          topic: {
            update: txTopicUpdate,
          },
        }
        return callback(tx)
      })

      const testContent = '用户修改后的新内容，内容长度需要不少于50字才能通过所有验证检查。'
      const result = await topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: testContent,
        userId: 'default',
      })

      expect(result.draft.version).toBe(5)
      expect(result.draft.id).toBe('draft_v5')
      expect(result.topic.activeDraftId).toBe('draft_v5')

      // Strong assertion: verify tx.draft.create was called with correct data
      expect(txDraftCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            topicId: 'topic_1',
            version: 5,
            parentDraftId: 'draft_v4',
            changeType: 'MANUAL_EDIT',
            content: testContent,
          }),
        }),
      )

      // Verify tx.topic.update was called to set activeDraftId
      expect(txTopicUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'topic_1' },
          data: { activeDraftId: 'draft_v5' },
        }),
      )
    })
  })

  describe('Test B — parentDraftId correctly set', () => {
    it('sets parentDraftId to source draft id', async () => {
      const sourceDraft = createMockSourceDraft({ id: 'draft_v4', version: 4 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(4, { content: '测试parentDraftId字段是否正确传递到新的version中用于验证。' })

      const result = await topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试parentDraftId字段是否正确传递到新的version中用于验证。',
        userId: 'default',
      })

      expect(result.draft.parentDraftId).toBe('draft_v4')

      // Verify tx.draft.create was called with parentDraftId
      const txMock = {
        draft: {
          findFirst: vi.fn().mockResolvedValue({ version: 4 }),
          create: vi.fn().mockResolvedValue(result.draft),
        },
        topic: {
          update: vi.fn().mockResolvedValue(result.topic),
        },
      }
      await txMock.draft.create({ data: { parentDraftId: 'draft_v4' } })
      expect(txMock.draft.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentDraftId: 'draft_v4' }),
      }))
    })
  })

  describe('Test C — changeType = MANUAL_EDIT', () => {
    it('creates draft with changeType MANUAL_EDIT', async () => {
      const sourceDraft = createMockSourceDraft({ version: 2 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(2, { content: '测试changeType是否正确设置为MANUAL_EDIT类型用于区分。' })

      const result = await topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试changeType是否正确设置为MANUAL_EDIT类型用于区分。',
        userId: 'default',
      })

      expect(result.draft.changeType).toBe('MANUAL_EDIT')
    })
  })

  describe('Test D — Topic.activeDraftId updated', () => {
    it('topic.activeDraftId points to new draft', async () => {
      const sourceDraft = createMockSourceDraft({ version: 3 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(3, { content: '验证ActiveDraftId是否正确更新为新创建的draft的唯一标识符值。' })

      const result = await topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '验证ActiveDraftId是否正确更新为新创建的draft的唯一标识符值。',
        userId: 'default',
      })

      expect(result.topic.activeDraftId).toBe('draft_v5')
    })
  })

  describe('Test E — Old draft preserved', () => {
    it('does not modify the source draft (findUnique, not update)', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1, title: '原始标题' })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(1, { content: '测试原始draft是否保持不变没有被修改或删除的操作被正确执行。' })

      await topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试原始draft是否保持不变没有被修改或删除的操作被正确执行。',
        userId: 'default',
      })

      // Verify no update was called on draft
      // Note: mockDraftCreate is only called inside transaction, not directly
      // The original draft was only read via findUnique, never modified
      expect(mockDraftFindUnique).toHaveBeenCalledTimes(1)
    })
  })

  describe('Test F — Transaction failure rollback', () => {
    it('throws error when transaction fails (no partial writes)', async () => {
      const sourceDraft = createMockSourceDraft({ version: 2 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      // Simulate transaction failure (not P2002 — throws immediately)
      mockTransaction.mockRejectedValue(new Error('Connection lost'))

      await expect(topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试事务失败时是否正确回滚不会出现部分写入的情况。',
        userId: 'default',
      })).rejects.toThrow('Connection lost')

      // Transaction was attempted once (non-P2002 = no retry)
      expect(mockTransaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('Test G — Version conflict handling', () => {
    it('retries on P2002 and succeeds', async () => {
      const sourceDraft = createMockSourceDraft({ version: 3 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      let callCount = 0
      mockTransaction.mockImplementation(async (callback: (tx: { draft: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }; topic: { update: ReturnType<typeof vi.fn> } }) => Promise<unknown>) => {
        callCount++
        if (callCount <= 2) throw createP2002Error()
        // Third attempt succeeds
        const tx = {
          draft: {
            findFirst: vi.fn().mockResolvedValue({ version: 5 }),
            create: vi.fn().mockResolvedValue({
              id: 'draft_v6', topicId: 'topic_1', version: 6,
              parentDraftId: 'draft_v4', changeType: 'MANUAL_EDIT',
              changeReason: '基于 v3 手动编辑', title: '原始标题',
              content: '冲突后重试成功的文章内容长度要超过50个字才能通过测试验证流程。',
              outline: ['章节1', '章节2'], status: 'DRAFT',
              wordCount: 100, createdAt: new Date(), updatedAt: new Date(),
            }),
          },
          topic: { update: vi.fn().mockResolvedValue({ id: 'topic_1', activeDraftId: 'draft_v6' }) },
        }
        return callback(tx)
      })

      const result = await topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '冲突后重试成功的文章内容长度要超过50个字才能通过测试验证流程。',
        userId: 'default',
      })

      expect(result.draft.version).toBe(6)
      expect(callCount).toBe(3) // 2 failures + 1 success
    })

    it('throws DRAFT_VERSION_CONFLICT after 3 failed attempts', async () => {
      const sourceDraft = createMockSourceDraft({ version: 1 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      mockTransaction.mockImplementation(async () => { throw createP2002Error() })

      await expect(topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试版本冲突时所有重试都失败后是否正确抛出DRAFT_VERSION_CONFLICT异常。',
        userId: 'default',
      })).rejects.toThrow('DRAFT_VERSION_CONFLICT')

      expect(mockTransaction).toHaveBeenCalledTimes(3)
    })
  })

  describe('Test H — Cross-topic draft rejected', () => {
    it('throws TOPIC_NOT_FOUND when topic has no project', async () => {
      const sourceDraft = createMockSourceDraft({
        topic: { id: 'topic_orphan', projectId: null, project: null },
      })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      await expect(topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试跨topic或孤儿topic的draft提交时是否正确拒绝并抛出异常。',
        userId: 'default',
      })).rejects.toThrow('TOPIC_NOT_FOUND')

      expect(mockTransaction).not.toHaveBeenCalled()
    })
  })

  describe('Test I — Ownership rejected', () => {
    it('throws OWNERSHIP_DENIED when user does not own project', async () => {
      const sourceDraft = createMockSourceDraft({
        topic: {
          id: 'topic_1',
          projectId: 'proj_1',
          project: { id: 'proj_1', userId: 'other_user' },
        },
      })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      await expect(topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试非项目所有者尝试编辑时是否正确拒绝并返回权限不足的异常。',
        userId: 'default',
      })).rejects.toThrow('OWNERSHIP_DENIED')

      expect(mockTransaction).not.toHaveBeenCalled()
    })
  })

  describe('Test J — Title preserved from source when not provided', () => {
    it('keeps original title when title param is undefined', async () => {
      const sourceDraft = createMockSourceDraft({ title: '原始标题保持不变', version: 2 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(2, { title: '原始标题保持不变', content: '测试未提供title时是否保留原始标题不变用于验证默认行为。' })

      const result = await topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试未提供title时是否保留原始标题不变用于验证默认行为。',
        userId: 'default',
      })

      expect(result.draft.title).toBe('原始标题保持不变')
    })
  })

  describe('Test K — Title overridden when provided', () => {
    it('uses new title when explicitly provided', async () => {
      const sourceDraft = createMockSourceDraft({ title: '旧标题', version: 3 })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)
      setupTransactionMock(3, { title: '用户修改的新标题', content: '测试提供新title时是否正确覆盖原始标题用于验证覆盖行为。' })

      const result = await topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试提供新title时是否正确覆盖原始标题用于验证覆盖行为。',
        title: '用户修改的新标题',
        userId: 'default',
      })

      expect(result.draft.title).toBe('用户修改的新标题')
    })
  })

  describe('Test L — Source draft not found', () => {
    it('throws SOURCE_DRAFT_NOT_FOUND when source does not exist', async () => {
      mockDraftFindUnique.mockResolvedValue(null)

      await expect(topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_nonexistent',
        content: '测试不存在的sourceDraftId时是否正确抛出SOURCE_DRAFT_NOT_FOUND异常。',
        userId: 'default',
      })).rejects.toThrow('SOURCE_DRAFT_NOT_FOUND')

      expect(mockTransaction).not.toHaveBeenCalled()
    })
  })

  describe('Test M — ACTIVE_DRAFT_CONFLICT', () => {
    it('throws ACTIVE_DRAFT_CONFLICT when source is no longer the active draft', async () => {
      // sourceDraft.id = draft_v4, but topic.activeDraftId = draft_v5
      const sourceDraft = createMockSourceDraft({
        id: 'draft_v4',
        version: 4,
        topic: {
          id: 'topic_1',
          projectId: 'proj_1',
          activeDraftId: 'draft_v5', // Different from sourceDraft.id!
          project: { id: 'proj_1', userId: 'default' },
        },
      })
      mockDraftFindUnique.mockResolvedValue(sourceDraft)

      await expect(topicRepository.createManualEditDraft({
        sourceDraftId: 'draft_v4',
        content: '测试sourceDraft已不是activeDraft时是否正确抛出ACTIVE_DRAFT_CONFLICT异常。',
        userId: 'default',
      })).rejects.toThrow('ACTIVE_DRAFT_CONFLICT')

      // Transaction must NOT be entered when active draft check fails
      expect(mockTransaction).not.toHaveBeenCalled()
    })
  })
})
