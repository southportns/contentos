import { Prisma, Inspiration } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const inspirationRepository = {
  async create(data: Prisma.InspirationCreateInput): Promise<Inspiration> {
    return prisma.inspiration.create({ data })
  },

  async findByUserId(
    userId: string,
    options?: { category?: string; limit?: number; offset?: number },
  ): Promise<Inspiration[]> {
    return prisma.inspiration.findMany({
      where: {
        userId,
        ...(options?.category ? { category: options.category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    })
  },

  async findById(id: string): Promise<Inspiration | null> {
    return prisma.inspiration.findUnique({ where: { id } })
  },

  async update(id: string, data: Prisma.InspirationUpdateInput): Promise<Inspiration> {
    return prisma.inspiration.update({ where: { id }, data })
  },

  async delete(id: string): Promise<void> {
    await prisma.inspiration.delete({ where: { id } })
  },

  async countByUserId(userId: string): Promise<number> {
    return prisma.inspiration.count({ where: { userId } })
  },
}
