import { Prisma, Project } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const projectRepository = {
  async create(data: Prisma.ProjectCreateInput): Promise<Project> {
    return prisma.project.create({ data })
  },

  async findById(id: string): Promise<Prisma.ProjectGetPayload<{ include: { topics: true } }> | null> {
    return prisma.project.findUnique({
      where: { id },
      include: { topics: true },
    })
  },

  async findByUserId(userId: string): Promise<Project[]> {
    return prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
  },

  async findByUserIdWithTopics(
    userId: string,
  ): Promise<Prisma.ProjectGetPayload<{
    include: { topics: { include: { angles: { orderBy: { createdAt: 'desc' } }; drafts: { orderBy: { createdAt: 'desc' } } } } }
  }>[]> {
    return prisma.project.findMany({
      where: { userId },
      include: {
        topics: {
          include: {
            angles: { orderBy: { createdAt: 'desc' } },
            drafts: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
  },

  /**
   * P0.4.1 — Find project with full content history for detail page.
   * Single query loads: Project → Topic → angles, strategy, drafts (version DESC),
   * draft.evaluation, draft.humanization, draft.strategyEvaluation.
   * Read-only: no writes performed.
   */
  async findByIdWithContentHistory(
    id: string,
  ): Promise<Prisma.ProjectGetPayload<{
    include: {
      topics: {
        include: {
          angles: { orderBy: { createdAt: 'desc' } }
          strategy: true
          // P0.4.8 — Include activeDraftId so the UI can identify the current working version
          activeDraft: true
          drafts: {
            orderBy: { version: 'desc' }
            include: {
              evaluation: true
              humanization: true
              strategyEvaluation: true
            }
          }
        }
      }
    }
  }> | null> {
    return prisma.project.findUnique({
      where: { id },
      include: {
        topics: {
          orderBy: { createdAt: 'asc' },
          include: {
            angles: { orderBy: { createdAt: 'desc' } },
            strategy: true,
            activeDraft: true,
            drafts: {
              orderBy: { version: 'desc' },
              include: {
                evaluation: true,
                humanization: true,
                strategyEvaluation: true,
              },
            },
          },
        },
      },
    })
  },

  async update(id: string, data: Prisma.ProjectUpdateInput): Promise<Project> {
    return prisma.project.update({ where: { id }, data })
  },

  async delete(id: string): Promise<void> {
    await prisma.project.delete({ where: { id } })
  },
}
