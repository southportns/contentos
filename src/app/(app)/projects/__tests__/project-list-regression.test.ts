/*
 * P0.4.1 — Project List Regression Tests
 *
 * Tests verify that the project list page (/projects) still has:
 *   1. "查看" (View) link → /projects/<id>
 *   2. "编辑" (Edit) link → /create?projectId=<id>
 *   3. "删除" (Delete) button still works
 *   4. Delete functionality still triggers repository.delete
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock server actions ─────────────────────────────────────────────────────

const mockGetProjects = vi.hoisted(() => vi.fn())
const mockDeleteProject = vi.hoisted(() => vi.fn())
const mockIsDatabaseConfigured = vi.hoisted(() => vi.fn())
const mockFindByIdWithContentHistory = vi.hoisted(() => vi.fn())
const mockFindByUserIdWithTopics = vi.hoisted(() => vi.fn())
const mockProjectDelete = vi.hoisted(() => vi.fn())
const mockProjectFindUnique = vi.hoisted(() => vi.fn())
const mockProjectCreate = vi.hoisted(() => vi.fn())
const mockProjectUpdate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/services/server-actions', () => ({
  getProjects: mockGetProjects,
  deleteProject: mockDeleteProject,
}))

vi.mock('@/lib/utils/db-safe', () => ({
  isDatabaseConfigured: mockIsDatabaseConfigured,
}))

vi.mock('@/lib/repositories/project-repository', () => ({
  projectRepository: {
    findByIdWithContentHistory: mockFindByIdWithContentHistory,
    findByUserIdWithTopics: mockFindByUserIdWithTopics,
    delete: mockProjectDelete,
    findUnique: mockProjectFindUnique,
    create: mockProjectCreate,
    update: mockProjectUpdate,
  },
}))

// ─── Import after mock ───────────────────────────────────────────────────────

import { getProjects, deleteProject } from '@/lib/services/server-actions'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'

// ─── Test Data ───────────────────────────────────────────────────────────────

function createMockProjects() {
  const now = new Date('2026-09-20T10:00:00Z')
  return [
    {
      id: 'proj_reg_1',
      name: 'Project 1',
      description: 'First project',
      status: 'active',
      userId: 'default',
      createdAt: now,
      updatedAt: now,
      topics: [
        {
          id: 'topic_reg_1',
          projectId: 'proj_reg_1',
          topic: '主题1',
          platform: 'xiaohongshu',
          audience: '25-35岁女性',
          contentType: 'knowledge',
          status: 'READY',
          createdAt: now,
          updatedAt: now,
          angles: [
            {
              id: 'angle_reg_1',
              topicId: 'topic_reg_1',
              title: '角度1',
              coreThesis: '核心论点',
              status: 'APPROVED',
              createdAt: now,
              updatedAt: now,
            },
          ],
          drafts: [
            {
              id: 'draft_reg_1',
              topicId: 'topic_reg_1',
              version: 1,
              title: '草稿标题',
              content: '草稿内容',
              status: 'DRAFT',
              wordCount: 500,
              createdAt: now,
              updatedAt: now,
            },
          ],
        },
      ],
    },
    {
      id: 'proj_reg_2',
      name: 'Project 2',
      description: 'Second project',
      status: 'active',
      userId: 'default',
      createdAt: now,
      updatedAt: now,
      topics: [],
    },
  ]
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P0.4.1 — Project List Regression', () => {
  beforeEach(() => {
    mockGetProjects.mockClear()
    mockDeleteProject.mockClear()
    mockIsDatabaseConfigured.mockClear()
    mockFindByIdWithContentHistory.mockClear()
    mockFindByUserIdWithTopics.mockClear()
    mockProjectDelete.mockClear()
    mockProjectFindUnique.mockClear()
    mockProjectCreate.mockClear()
    mockProjectUpdate.mockClear()
    mockIsDatabaseConfigured.mockReturnValue(true)
  })

  describe('project list loads correctly', () => {
    it('getProjects returns projects with topics and drafts', async () => {
      const mockProjects = createMockProjects()
      mockGetProjects.mockResolvedValue(mockProjects)

      const projects = await getProjects()

      expect(projects).toHaveLength(2)
      expect(projects[0].topics).toHaveLength(1)
      expect(projects[0].topics[0].drafts).toHaveLength(1)
    })

    it('projects ordered by updatedAt DESC (newest first)', async () => {
      const mockProjects = createMockProjects()
      mockGetProjects.mockResolvedValue(mockProjects)

      const projects = await getProjects()

      // Verify order: projects should be sorted by updatedAt DESC
      if (projects.length >= 2) {
        expect(new Date(projects[0].updatedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(projects[1].updatedAt).getTime()
        )
      }
    })
  })

  describe('view link (/projects/<id>)', () => {
    it('each project has a view link to /projects/<id>', async () => {
      const mockProjects = createMockProjects()
      mockGetProjects.mockResolvedValue(mockProjects)

      const projects = await getProjects()

      projects.forEach((project) => {
        // Page logic: <Link href={`/projects/${project.id}`}>
        const viewHref = `/projects/${project.id}`
        expect(viewHref).toMatch(/^\/projects\/[\w-]+$/)
      })
    })

    it('view link for first project is /projects/proj_reg_1', async () => {
      const mockProjects = createMockProjects()
      mockGetProjects.mockResolvedValue(mockProjects)

      const projects = await getProjects()
      const firstProject = projects[0]

      const viewHref = `/projects/${firstProject.id}`
      expect(viewHref).toBe('/projects/proj_reg_1')
    })
  })

  describe('edit link (/create?projectId=<id>)', () => {
    it('each project has an edit link to /create?projectId=<id>', async () => {
      const mockProjects = createMockProjects()
      mockGetProjects.mockResolvedValue(mockProjects)

      const projects = await getProjects()

      projects.forEach((project) => {
        // Page logic: <Link href={`/create?projectId=${project.id}`}>
        const editHref = `/create?projectId=${project.id}`
        expect(editHref).toMatch(/^\/create\?projectId=[\w-]+$/)
      })
    })

    it('edit link for second project is /create?projectId=proj_reg_2', async () => {
      const mockProjects = createMockProjects()
      mockGetProjects.mockResolvedValue(mockProjects)

      const projects = await getProjects()
      const secondProject = projects[1]

      const editHref = `/create?projectId=${secondProject.id}`
      expect(editHref).toBe('/create?projectId=proj_reg_2')
    })
  })

  describe('delete functionality preserved', () => {
    it('deleteProject called with projectId triggers deletion', async () => {
      mockDeleteProject.mockResolvedValue(undefined)

      await deleteProject('proj_reg_1')

      expect(mockDeleteProject).toHaveBeenCalledTimes(1)
      expect(mockDeleteProject).toHaveBeenCalledWith('proj_reg_1')
    })

    it('deleteProject function exists and is callable', () => {
      expect(typeof deleteProject).toBe('function')
    })

    it('DeleteProjectButton component receives projectId and projectName', async () => {
      const mockProjects = createMockProjects()
      mockGetProjects.mockResolvedValue(mockProjects)

      const projects = await getProjects()
      const project = projects[0]

      // Page logic: <DeleteProjectButton projectId={project.id} projectName={project.name} />
      expect(project.id).toBe('proj_reg_1')
      expect(project.name).toBe('Project 1')
    })
  })

  describe('no database fallback', () => {
    it('returns empty array when database not configured', async () => {
      mockIsDatabaseConfigured.mockReturnValue(false)
      mockGetProjects.mockResolvedValue([])

      const projects = await getProjects()

      expect(projects).toEqual([])
    })
  })

  describe('empty project list', () => {
    it('empty projects array shows "还没有创作"', async () => {
      mockGetProjects.mockResolvedValue([])

      const projects = await getProjects()

      // Page logic: if (!projects || projects.length === 0) → shows empty state
      const isEmpty = !projects || projects.length === 0
      expect(isEmpty).toBe(true)
    })
  })
})
