import { Prisma, Content } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const contentRepository = {
  async create(data: Prisma.ContentCreateInput): Promise<Content> {
    return prisma.content.create({ data })
  },

  async createMany(data: Prisma.ContentCreateManyInput[]): Promise<number> {
    const result = await prisma.content.createMany({ data })
    return result.count
  },

  async findById(id: string): Promise<Content | null> {
    return prisma.content.findUnique({
      where: { id },
      include: { analysis: true, comments: true },
    })
  },

  async findByTopicId(topicId: string): Promise<Content[]> {
    return prisma.content.findMany({
      where: { topicId },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findByPlatform(platform: string): Promise<Content[]> {
    return prisma.content.findMany({
      where: { platform },
      orderBy: { likes: 'desc' },
    })
  },

  async findByUrl(url: string): Promise<Content | null> {
    return prisma.content.findFirst({ where: { url } })
  },

  async createAnalysis(
    data: Prisma.ContentAnalysisCreateInput,
  ): Promise<void> {
    await prisma.contentAnalysis.create({ data })
  },

  async delete(id: string): Promise<void> {
    await prisma.content.delete({ where: { id } })
  },
}

export type ContentWithRelations = Prisma.ContentGetPayload<{
  include: { analysis: true; comments: true }
}>
