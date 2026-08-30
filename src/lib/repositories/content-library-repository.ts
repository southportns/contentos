import { Prisma, ContentLibraryItem } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const contentLibraryRepository = {
  async create(data: Prisma.ContentLibraryItemCreateInput): Promise<ContentLibraryItem> {
    return prisma.contentLibraryItem.create({ data })
  },

  async upsert(
    where: Prisma.ContentLibraryItemWhereUniqueInput,
    update: Prisma.ContentLibraryItemUpdateInput,
    create: Prisma.ContentLibraryItemCreateInput,
  ): Promise<ContentLibraryItem> {
    return prisma.contentLibraryItem.upsert({ where, update, create })
  },

  async findByUserId(userId: string): Promise<ContentLibraryItem[]> {
    return prisma.contentLibraryItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findByUrl(url: string, userId: string): Promise<ContentLibraryItem | null> {
    return prisma.contentLibraryItem.findFirst({
      where: { url, userId },
    })
  },

  async update(id: string, data: Prisma.ContentLibraryItemUpdateInput): Promise<ContentLibraryItem> {
    return prisma.contentLibraryItem.update({ where: { id }, data })
  },

  async delete(id: string): Promise<void> {
    await prisma.contentLibraryItem.delete({ where: { id } })
  },

  async deleteByUserId(userId: string): Promise<void> {
    await prisma.contentLibraryItem.deleteMany({ where: { userId } })
  },
}
