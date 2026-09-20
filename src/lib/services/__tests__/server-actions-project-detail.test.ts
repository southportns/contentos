/*
 * P0.4.1 — Server Action getProjectDetail Acceptance Tests
 *
 * Tests verify:
 *   1. Returns real project when DATABASE_URL is configured
 *   2. Returns null for empty projectId
 *   3. Returns null when database is not configured
 *   4. Returns null when repository query fails
 *   5. Read-only: delegates to findByIdWithContentHistory (no direct writes)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Track write operations ─────────────────────────────────────────────────

const mockFindByIdWithContentHistory = vi.hoisted(() => vi.fn())
const mockFindByUserIdWithTopics = vi.hoisted(() => vi.fn())
const mockProjectCreate = vi.hoisted(() => vi.fn())
const mockProjectUpdate = vi.hoisted(() => vi.fn())
const mockProjectDelete = vi.hoisted(() => vi.fn())

// ─── Mock server actions dependencies ────────────────────────────────────────

vi.mock('@/lib/utils/db-safe', () => ({
  isDatabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/repositories/project-repository', () => ({
  projectRepository: {
    findByIdWithContentHistory: mockFindByIdWithContentHistory,
    findByUserIdWithTopics: mockFindByUserIdWithTopics,
    create: mockProjectCreate,
    update: mockProjectUpdate,
    delete: mockProjectDelete,
  },
}))

// ─── Import after mock ───────────────────────────────────────────────────────

import { getProjectDetail } from '../server-actions'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'

// ─── Test Data ───────────────────────────────────────────────────────────────

function createMockProjectDetail() {
  const now = new Date('2026-09-20T10:00:00Z')
  return {
    id: 'proj_detail_1',
    name: 'Test Project Detail',
    description: 'Project for detail testing',
    status: 'active',
    userId: 'default',
    createdAt: now,
    updatedAt: now,
    topics: [
      {
        id: 'topic_1',
        projectId: 'proj_detail_1',
        topic: '测试主题',
        platform: 'xiaohongshu',
        audience: '25-35岁女性',
        contentType: 'knowledge',
        status: 'READY',
        createdAt: now,
        updatedAt: now,
        angles: [
          {
            id: 'angle_1',
            topicId: 'topic_1',
            title: '角度1',
            coreThesis: '核心论点',
            status: 'APPROVED',
            createdAt: now,
            updatedAt: now,
          },
        ],
        strategy: {
          id: 'strat_1',
          topicId: 'topic_1',
          approvalStatus: 'approved',
          coreThesis: '策略核心',
          createdAt: now,
          updatedAt: now,
        },
        drafts: [
          {
            id: 'draft_1',
            topicId: 'topic_1',
            version: 2,
            title: '标题v2',
            content: '内容v2',
            status: 'FINAL',
            wordCount: 500,
            createdAt: new Date('2026-09-20T12:00:00Z'),
            updatedAt: new Date('2026-09-20T12:00:00Z'),
            evaluation: {
              id: 'eval_1',
              draftId: 'draft_1',
              overallScore: 85,
              createdAt: new Date('2026-09-20T12:05:00Z'),
            },
            humanization: {
              id: 'hum_1',
              draftId: 'draft_1',
              adopted: true,
              createdAt: new Date('2026-09-20T12:10:00Z'),
            },
            strategyEvaluation: {
              id: 'se_1',
              draftId: 'draft_1',
              overallScore: 80,
              grade: 'strong',
              createdAt: new Date('2026-09-20T12:15:00Z'),
            },
          },
          {
            id: 'draft_2',
            topicId: 'topic_1',
            version: 1,
            title: '标题v1',
            content: '内容v1',
            status: 'DRAFT',
            wordCount: 450,
            createdAt: new Date('2026-09-20T10:00:00Z'),
            updatedAt: new Date('2026-09-20T10:00:00Z'),
            evaluation: null,
            humanization: null,
            strategyEvaluation: null,
          },
        ],
      },
    ],
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P0.4.1 — getProjectDetail Server Action', () => {
  beforeEach(() => {
    mockFindByIdWithContentHistory.mockClear()
    mockFindByUserIdWithTopics.mockClear()
    mockProjectCreate.mockClear()
    mockProjectUpdate.mockClear()
    mockProjectDelete.mockClear()
    ;(isDatabaseConfigured as ReturnType<typeof vi.fn>).mockReturnValue(true)
  })

  describe('database configured', () => {
    it('returns real project when DATABASE_URL is configured', async () => {
      const mockProject = createMockProjectDetail()
      mockFindByIdWithContentHistory.mockResolvedValue(mockProject)

      const result = await getProjectDetail('proj_detail_1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('proj_detail_1')
      expect(result!.name).toBe('Test Project Detail')
      expect(result!.topics).toHaveLength(1)
    })

    it('returns project with full content history (drafts, evaluation, humanization, strategyEvaluation)', async () => {
      const mockProject = createMockProjectDetail()
      mockFindByIdWithContentHistory.mockResolvedValue(mockProject)

      const result = await getProjectDetail('proj_detail_1')

      expect(result!.topics[0].drafts).toHaveLength(2)
      expect(result!.topics[0].drafts[0].evaluation).not.toBeNull()
      expect(result!.topics[0].drafts[0].humanization).not.toBeNull()
      expect(result!.topics[0].drafts[0].strategyEvaluation).not.toBeNull()
    })

    it('returns project with angles and strategy', async () => {
      const mockProject = createMockProjectDetail()
      mockFindByIdWithContentHistory.mockResolvedValue(mockProject)

      const result = await getProjectDetail('proj_detail_1')

      expect(result!.topics[0].angles).toHaveLength(1)
      expect(result!.topics[0].strategy).not.toBeNull()
      expect(result!.topics[0].strategy!.approvalStatus).toBe('approved')
    })

    it('returns null when project does not exist', async () => {
      mockFindByIdWithContentHistory.mockResolvedValue(null)

      const result = await getProjectDetail('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('empty projectId', () => {
    it('returns null when projectId is empty string', async () => {
      const result = await getProjectDetail('')

      expect(result).toBeNull()
      expect(mockFindByIdWithContentHistory).not.toHaveBeenCalled()
    })
    it('returns null when projectId is undefined-like (empty)', async () => {
      const result = await getProjectDetail('')

      expect(result).toBeNull()
    })
  })

  describe('database not configured', () => {
    it('returns null when database is not configured', async () => {
      ;(isDatabaseConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false)

      const result = await getProjectDetail('proj_detail_1')

      expect(result).toBeNull()
      expect(mockFindByIdWithContentHistory).not.toHaveBeenCalled()
    })
  })

  describe('repository failure handling', () => {
    it('returns null when repository query throws error', async () => {
      mockFindByIdWithContentHistory.mockRejectedValue(new Error('Database connection failed'))

      const result = await getProjectDetail('proj_detail_1')

      expect(result).toBeNull()
    })

    it('returns null when repository query throws unexpected error', async () => {
      mockFindByIdWithContentHistory.mockRejectedValue(new TypeError('Unexpected error'))

      const result = await getProjectDetail('proj_detail_1')

      expect(result).toBeNull()
    })
  })

  describe('read-only guarantee', () => {
    it('does NOT call any project write methods (create/update/delete)', async () => {
      mockFindByIdWithContentHistory.mockResolvedValue(createMockProjectDetail())

      await getProjectDetail('proj_detail_1')

      expect(mockProjectCreate).not.toHaveBeenCalled()
      expect(mockProjectUpdate).not.toHaveBeenCalled()
      expect(mockProjectDelete).not.toHaveBeenCalled()
    })

    it('ONLY calls findByIdWithContentHistory', async () => {
      mockFindByIdWithContentHistory.mockResolvedValue(createMockProjectDetail())

      await getProjectDetail('proj_detail_1')

      expect(mockFindByIdWithContentHistory).toHaveBeenCalledTimes(1)
      expect(mockFindByIdWithContentHistory).toHaveBeenCalledWith('proj_detail_1')
    })
  })
})
