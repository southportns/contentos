/*
 * P0.4.1 — Project Detail Repository + Read-only Guarantee Tests
 *
 * Tests verify:
 *   1. findByIdWithContentHistory returns correct structure
 *   2. Drafts are ordered by version DESC
 *   3. All relations are loaded (angles, strategy, evaluation, humanization, strategyEvaluation)
 *   4. Project not found returns null
 *   5. Read-only: no writes (create/update/delete) are performed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Track all write operations ─────────────────────────────────────────────

const mockProjectFindUnique = vi.hoisted(() => vi.fn())
const mockProjectCreate = vi.hoisted(() => vi.fn())
const mockProjectUpdate = vi.hoisted(() => vi.fn())
const mockProjectDelete = vi.hoisted(() => vi.fn())
const mockDraftCreate = vi.hoisted(() => vi.fn())
const mockDraftUpdate = vi.hoisted(() => vi.fn())
const mockDraftDelete = vi.hoisted(() => vi.fn())
const mockStrategyUpdate = vi.hoisted(() => vi.fn())
const mockTopicUpdate = vi.hoisted(() => vi.fn())

// ─── Mock Prisma Client ─────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      project: {
        findUnique: mockProjectFindUnique,
        create: mockProjectCreate,
        update: mockProjectUpdate,
        delete: mockProjectDelete,
      },
      draft: {
        create: mockDraftCreate,
        update: mockDraftUpdate,
        delete: mockDraftDelete,
      },
      contentStrategy: {
        update: mockStrategyUpdate,
      },
      topic: {
        update: mockTopicUpdate,
      },
    },
  }
})

// ─── Import after mock ──────────────────────────────────────────────────────

import { projectRepository } from '../project-repository'

// ─── Test Data ──────────────────────────────────────────────────────────────

function createMockProject(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-09-20T10:00:00Z')
  return {
    id: 'proj_1',
    name: 'Test Project',
    description: 'A test project',
    status: 'active',
    userId: 'default',
    createdAt: now,
    updatedAt: now,
    topics: [
      {
        id: 'topic_1',
        projectId: 'proj_1',
        topic: '如何穿搭更显气质',
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
            title: '职场轻熟风',
            coreThesis: '通过基础款打造高级感',
            status: 'APPROVED',
            createdAt: now,
            updatedAt: now,
          },
        ],
        strategy: {
          id: 'strat_1',
          topicId: 'topic_1',
          approvalStatus: 'approved',
          coreThesis: '基础款美学',
          createdAt: now,
          updatedAt: now,
        },
        drafts: [
          {
            id: 'draft_v4',
            topicId: 'topic_1',
            version: 4,
            title: '我终于明白，为什么我们一生都在追求被爱',
            content: '这是一个关于自我成长的真实故事...',
            status: 'FINAL',
            wordCount: 562,
            createdAt: new Date('2026-09-20T16:30:00Z'),
            updatedAt: new Date('2026-09-20T16:30:00Z'),
            evaluation: {
              id: 'eval_4',
              draftId: 'draft_v4',
              overallScore: 88,
              emotionalImpactScore: 90,
              logicalClarityScore: 85,
              noveltyScore: 82,
              readabilityScore: 91,
              platformFitScore: 87,
              createdAt: new Date('2026-09-20T16:35:00Z'),
            },
            humanization: {
              id: 'hum_4',
              draftId: 'draft_v4',
              adopted: true,
              aiStyleScore: 25,
              humanizedScore: 85,
              createdAt: new Date('2026-09-20T16:40:00Z'),
            },
            strategyEvaluation: {
              id: 'se_4',
              draftId: 'draft_v4',
              overallScore: 86,
              grade: 'strong',
              platformFit: 90,
              strategyConsistency: 88,
              createdAt: new Date('2026-09-20T16:45:00Z'),
            },
          },
          {
            id: 'draft_v3',
            topicId: 'topic_1',
            version: 3,
            title: '被爱的旅程',
            content: '追寻爱的路上...',
            status: 'DRAFT',
            wordCount: 520,
            createdAt: new Date('2026-09-19T14:20:00Z'),
            updatedAt: new Date('2026-09-19T14:20:00Z'),
            evaluation: {
              id: 'eval_3',
              draftId: 'draft_v3',
              overallScore: 75,
              createdAt: new Date('2026-09-19T14:25:00Z'),
            },
            humanization: null,
            strategyEvaluation: null,
          },
          {
            id: 'draft_v2',
            topicId: 'topic_1',
            version: 2,
            title: '爱的追寻',
            content: '每个人都在追寻爱...',
            status: 'DRAFT',
            wordCount: 480,
            createdAt: new Date('2026-09-19T10:15:00Z'),
            updatedAt: new Date('2026-09-19T10:15:00Z'),
            evaluation: null,
            humanization: null,
            strategyEvaluation: null,
          },
          {
            id: 'draft_v1',
            topicId: 'topic_1',
            version: 1,
            title: '追寻爱',
            content: '爱是人类永恒的主题...',
            status: 'DRAFT',
            wordCount: 450,
            createdAt: new Date('2026-09-18T09:00:00Z'),
            updatedAt: new Date('2026-09-18T09:00:00Z'),
            evaluation: null,
            humanization: null,
            strategyEvaluation: null,
          },
        ],
      },
    ],
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P0.4.1 — findByIdWithContentHistory', () => {
  beforeEach(() => {
    mockProjectFindUnique.mockClear()
    mockProjectCreate.mockClear()
    mockProjectUpdate.mockClear()
    mockProjectDelete.mockClear()
    mockDraftCreate.mockClear()
    mockDraftUpdate.mockClear()
    mockDraftDelete.mockClear()
    mockStrategyUpdate.mockClear()
    mockTopicUpdate.mockClear()

    // Default implementation: returns mock project
    mockProjectFindUnique.mockImplementation((args: { where: { id: string } }) => {
      if (args.where.id === 'proj_1') {
        return Promise.resolve(createMockProject())
      }
      return Promise.resolve(null)
    })
  })

  describe('project exists', () => {
    it('returns project with all nested relations', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('proj_1')
      expect(result!.name).toBe('Test Project')
      expect(result!.topics).toHaveLength(1)
    })

    it('loads topic with angles', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const topic = result!.topics[0]

      expect(topic.angles).toHaveLength(1)
      expect(topic.angles[0].title).toBe('职场轻熟风')
    })

    it(' loads topic with strategy', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const topic = result!.topics[0]

      expect(topic.strategy).not.toBeNull()
      expect(topic.strategy!.approvalStatus).toBe('approved')
    })

    it('loads drafts ordered by version DESC', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const drafts = result!.topics[0].drafts

      expect(drafts).toHaveLength(4)
      expect(drafts[0].version).toBe(4) // Latest first
      expect(drafts[1].version).toBe(3)
      expect(drafts[2].version).toBe(2)
      expect(drafts[3].version).toBe(1)
    })
  })

  describe('draft relations', () => {
    it('loads evaluation for draft that has one', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const drafts = result!.topics[0].drafts
      const v4 = drafts.find(d => d.version === 4)

      expect(v4!.evaluation).not.toBeNull()
      expect(v4!.evaluation!.overallScore).toBe(88)
    })

    it('evaluation is null when draft has no evaluation', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const drafts = result!.topics[0].drafts
      const v1 = drafts.find(d => d.version === 1)

      expect(v1!.evaluation).toBeNull()
    })

    it('loads humanization for draft that has one', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const drafts = result!.topics[0].drafts
      const v4 = drafts.find(d => d.version === 4)

      expect(v4!.humanization).not.toBeNull()
      expect(v4!.humanization!.adopted).toBe(true)
    })

    it('humanization is null when draft has no humanization', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const drafts = result!.topics[0].drafts
      const v1 = drafts.find(d => d.version === 1)

      expect(v1!.humanization).toBeNull()
    })

    it('loads strategyEvaluation for draft that has one', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const drafts = result!.topics[0].drafts
      const v4 = drafts.find(d => d.version === 4)

      expect(v4!.strategyEvaluation).not.toBeNull()
      expect(v4!.strategyEvaluation!.overallScore).toBe(86)
      expect(v4!.strategyEvaluation!.grade).toBe('strong')
    })

    it('strategyEvaluation is null when draft has none', async () => {
      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      const drafts = result!.topics[0].drafts
      const v1 = drafts.find(d => d.version === 1)

      expect(v1!.strategyEvaluation).toBeNull()
    })
  })

  describe('project not found', () => {
    it('returns null when project does not exist', async () => {
      const result = await projectRepository.findByIdWithContentHistory('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('project without drafts', () => {
    it('returns project with empty drafts array', async () => {
      mockProjectFindUnique.mockResolvedValue({
        ...createMockProject(),
        topics: [
          {
            ...createMockProject().topics[0],
            drafts: [],
          },
        ],
      })

      const result = await projectRepository.findByIdWithContentHistory('proj_1')
      expect(result!.topics[0].drafts).toHaveLength(0)
    })
  })

  // ─── Read-only guarantee ────────────────────────────────────────────────

  describe('read-only guarantee', () => {
    it('does NOT call any write methods (project create/update/delete)', async () => {
      await projectRepository.findByIdWithContentHistory('proj_1')

      expect(mockProjectCreate).not.toHaveBeenCalled()
      expect(mockProjectUpdate).not.toHaveBeenCalled()
      expect(mockProjectDelete).not.toHaveBeenCalled()
    })

    it('does NOT call any write methods (draft create/update/delete)', async () => {
      await projectRepository.findByIdWithContentHistory('proj_1')

      expect(mockDraftCreate).not.toHaveBeenCalled()
      expect(mockDraftUpdate).not.toHaveBeenCalled()
      expect(mockDraftDelete).not.toHaveBeenCalled()
    })

    it('does NOT call any write methods (strategy update, topic update)', async () => {
      await projectRepository.findByIdWithContentHistory('proj_1')

      expect(mockStrategyUpdate).not.toHaveBeenCalled()
      expect(mockTopicUpdate).not.toHaveBeenCalled()
    })

    it('ONLY calls findUnique (read operation)', async () => {
      await projectRepository.findByIdWithContentHistory('proj_1')

      expect(mockProjectFindUnique).toHaveBeenCalledTimes(1)
      // Verify the call structure
      expect(mockProjectFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proj_1' },
          include: expect.objectContaining({
            topics: expect.any(Object),
          }),
        })
      )
    })

    it('multiple reads do not trigger any writes', async () => {
      await projectRepository.findByIdWithContentHistory('proj_1')
      await projectRepository.findByIdWithContentHistory('proj_1')
      await projectRepository.findByIdWithContentHistory('nonexistent')

      expect(mockProjectCreate).not.toHaveBeenCalled()
      expect(mockProjectUpdate).not.toHaveBeenCalled()
      expect(mockProjectDelete).not.toHaveBeenCalled()
      expect(mockDraftCreate).not.toHaveBeenCalled()
      expect(mockDraftUpdate).not.toHaveBeenCalled()
      expect(mockDraftDelete).not.toHaveBeenCalled()
      expect(mockStrategyUpdate).not.toHaveBeenCalled()
      expect(mockTopicUpdate).not.toHaveBeenCalled()
    })
  })

  describe('query structure validation', () => {
    it('queries with proper include for drafts ordered by version DESC', async () => {
      await projectRepository.findByIdWithContentHistory('proj_1')

      const callArgs = mockProjectFindUnique.mock.calls[0][0]
      const includeTopics = callArgs.include.topics
      const includeDrafts = includeTopics.include.drafts

      expect(includeDrafts.orderBy).toEqual({ version: 'desc' })
      expect(includeDrafts.include.evaluation).toBe(true)
      expect(includeDrafts.include.humanization).toBe(true)
      expect(includeDrafts.include.strategyEvaluation).toBe(true)
    })
  })
})
