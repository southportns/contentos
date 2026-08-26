import { Prisma, Project } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const projectRepository = {
  async create(data: Prisma.ProjectCreateInput): Promise<Project> {
    return prisma.project.create({ data })
  },

  async findById(id: string): Promise<Project | null> {
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
  ): Promise<Prisma.ProjectGetPayload<{ include: { topics: true } }>[]> {
    return prisma.project.findMany({
      where: { userId },
      include: { topics: true },
      orderBy: { updatedAt: 'desc' },
    })
  },

  async update(id: string, data: Prisma.ProjectUpdateInput): Promise<Project> {
    return prisma.project.update({ where: { id }, data })
  },

  async delete(id: string): Promise<void> {
    await prisma.project.delete({ where: { id } })
  },
}
