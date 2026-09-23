/*
 * P0.5.1 — Save Manual Draft Edit Server Action Tests
 *
 * Tests verify:
 *   1. Database not configured
 *   2. Missing sourceDraftId
 *   3. Missing/empty content
 *   4. Source draft not found → error mapped
 *   5. Ownership denied → error mapped
 *   6. Success path
 *   7. DRAFT_VERSION_CONFLICT → error mapped
 *   8. TOPIC_NOT_FOUND → error mapped
 *   9. Unknown error mapping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIsDatabaseConfigured = vi.hoisted(() => vi.fn())
const mockGetDefaultUserId = vi.hoisted(() => vi.fn())
const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockCreateManualEditDraft = vi.hoisted(() => vi.fn())

vi.mock('@/lib/utils/db-safe', () => ({
  isDatabaseConfigured: mockIsDatabaseConfigured,
}))

vi.mock('@/lib/utils/default-user', () => ({
  getDefaultUserId: mockGetDefaultUserId,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

vi.mock('@/lib/repositories/topic-repository', () => ({
  topicRepository: {
    createManualEditDraft: mockCreateManualEditDraft,
  },
}))

import { saveManualDraftEdit } from '../server-actions'

describe('P0.5.1 — saveManualDraftEdit', () => {
  beforeEach(() => {
    mockIsDatabaseConfigured.mockReset()
    mockGetDefaultUserId.mockReset()
    mockRevalidatePath.mockReset()
    mockCreateManualEditDraft.mockReset()

    // Defaults
    mockIsDatabaseConfigured.mockReturnValue(true)
    mockGetDefaultUserId.mockReturnValue('default')
  })

  describe('Test A — Database not configured', () => {
    it('returns success:false when DB is not configured', async () => {
      mockIsDatabaseConfigured.mockReturnValue(false)

      const result = await saveManualDraftEdit('draft_1', 'some content')

      expect(result.success).toBe(false)
      expect(result.error).toBe('数据库未配置')
      expect(mockCreateManualEditDraft).not.toHaveBeenCalled()
    })
  })

  describe('Test B — Missing sourceDraftId', () => {
    it('returns success:false when sourceDraftId is empty', async () => {
      const result = await saveManualDraftEdit('', 'some content')

      expect(result.success).toBe(false)
      expect(result.error).toBe('版本不存在或已不可用')
      expect(mockCreateManualEditDraft).not.toHaveBeenCalled()
    })
  })

  describe('Test C — Missing/empty content', () => {
    it('returns success:false when content is empty string', async () => {
      const result = await saveManualDraftEdit('draft_1', '')

      expect(result.success).toBe(false)
      expect(result.error).toBe('内容不能为空')
      expect(mockCreateManualEditDraft).not.toHaveBeenCalled()
    })

    it('returns success:false when content is only whitespace', async () => {
      const result = await saveManualDraftEdit('draft_1', '   \n\t  ')

      expect(result.success).toBe(false)
      expect(result.error).toBe('内容不能为空')
    })
  })

  describe('Test D — Source draft not found', () => {
    it('maps SOURCE_DRAFT_NOT_FOUND to user-friendly error', async () => {
      mockCreateManualEditDraft.mockRejectedValue(new Error('SOURCE_DRAFT_NOT_FOUND'))

      const result = await saveManualDraftEdit('draft_missing', '有效内容长度超过50字用于测试源版本不存在的错误映射逻辑是否正确工作。')

      expect(result.success).toBe(false)
      expect(result.error).toBe('该版本不存在或已不可用')
    })
  })

  describe('Test E — Ownership denied', () => {
    it('maps OWNERSHIP_DENIED to user-friendly error', async () => {
      mockCreateManualEditDraft.mockRejectedValue(new Error('OWNERSHIP_DENIED'))

      const result = await saveManualDraftEdit('draft_other', '有效内容长度超过50字用于测试权限不足时错误映射逻辑是否正确工作。')

      expect(result.success).toBe(false)
      expect(result.error).toBe('无权操作此版本')
    })
  })

  describe('Test F — Success path', () => {
    it('returns draft and topic on success, calls revalidatePath', async () => {
      const mockDraft = {
        id: 'draft_v5',
        version: 5,
        changeType: 'MANUAL_EDIT',
        content: '修改后的文章内容',
      }
      const mockTopic = {
        id: 'topic_1',
        activeDraftId: 'draft_v5',
      }
      mockCreateManualEditDraft.mockResolvedValue({ draft: mockDraft, topic: mockTopic })

      const result = await saveManualDraftEdit('draft_v4', '修改后的文章内容足够长以通过所有验证规则的要求。', '新标题')

      expect(result.success).toBe(true)
      expect(result.draft).toEqual(mockDraft)
      expect(result.topic).toEqual(mockTopic)
      expect(mockCreateManualEditDraft).toHaveBeenCalledWith({
        sourceDraftId: 'draft_v4',
        content: '修改后的文章内容足够长以通过所有验证规则的要求。',
        title: '新标题',
        changeReason: undefined,
        userId: 'default',
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/projects/(app)', 'layout')
    })

    it('passes changeReason when provided', async () => {
      mockCreateManualEditDraft.mockResolvedValue({
        draft: { id: 'draft_v5', version: 5 },
        topic: { id: 'topic_1', activeDraftId: 'draft_v5' },
      })

      await saveManualDraftEdit('draft_v4', '自定义修改理由的测试内容长度超过50字以通过验证逻辑。', null, '修正了第二段的逻辑')

      expect(mockCreateManualEditDraft).toHaveBeenCalledWith(
        expect.objectContaining({ changeReason: '修正了第二段的逻辑' })
      )
    })
  })

  describe('Test G — DRAFT_VERSION_CONFLICT', () => {
    it('maps version conflict to user-friendly error', async () => {
      mockCreateManualEditDraft.mockRejectedValue(new Error('DRAFT_VERSION_CONFLICT'))

      const result = await saveManualDraftEdit('draft_v4', '测试版本冲突时的错误映射逻辑是否正确工作的内容需要超过50个字。')

      expect(result.success).toBe(false)
      expect(result.error).toBe('版本创建冲突，请重试')
    })
  })

  describe('Test H — TOPIC_NOT_FOUND', () => {
    it('maps topic not found to user-friendly error', async () => {
      mockCreateManualEditDraft.mockRejectedValue(new Error('TOPIC_NOT_FOUND'))

      const result = await saveManualDraftEdit('draft_v4', '测试topic不存在时的错误映射逻辑是否正确工作的内容需要超过50个字。')

      expect(result.success).toBe(false)
      expect(result.error).toBe('项目上下文不存在')
    })
  })

  describe('Test I — Unknown error mapping', () => {
    it('maps unknown errors to generic error message', async () => {
      mockCreateManualEditDraft.mockRejectedValue(new Error('SOMETHING_ELSE'))

      const result = await saveManualDraftEdit('draft_v4', '测试未知错误时的默认错误映射逻辑是否正确工作的内容需要超过50个字。')

      expect(result.success).toBe(false)
      expect(result.error).toBe('保存失败，请稍后重试')
    })

    it('handles non-Error thrown values', async () => {
      mockCreateManualEditDraft.mockRejectedValue('string error')

      const result = await saveManualDraftEdit('draft_v4', '测试非Error类型抛出时的处理逻辑是否正确工作的内容需要超过50个字。')

      expect(result.success).toBe(false)
      expect(result.error).toBe('保存失败，请稍后重试')
    })
  })
})
