import { Prisma, UserWritingProfile, UserContentArchive } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const profileRepository = {
  // ── UserWritingProfile ───────────────────────────────

  async findProfileByUserId(userId: string): Promise<UserWritingProfile | null> {
    return prisma.userWritingProfile.findUnique({
      where: { userId },
    })
  },

  async upsertProfile(
    userId: string,
    data: Omit<Prisma.UserWritingProfileUpsertArgs['create'], 'user' | 'userId'>,
  ): Promise<UserWritingProfile> {
    return prisma.userWritingProfile.upsert({
      where: { userId },
      create: {
        ...data,
        userId,
      },
      update: {
        ...data,
        version: { increment: 1 },
      },
    })
  },

  // ── UserContentArchive ───────────────────────────────

  async createArchive(
    data: Prisma.UserContentArchiveCreateInput,
  ): Promise<UserContentArchive> {
    return prisma.userContentArchive.create({ data })
  },

  async findArchivesByUserId(
    userId: string,
    limit?: number,
  ): Promise<UserContentArchive[]> {
    return prisma.userContentArchive.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit ?? 20,
    })
  },

  async countArchivesByUserId(userId: string): Promise<number> {
    return prisma.userContentArchive.count({ where: { userId } })
  },
}
