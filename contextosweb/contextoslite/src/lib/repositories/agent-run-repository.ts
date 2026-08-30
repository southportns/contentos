import { Prisma, AgentRun } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const agentRunRepository = {
  async create(data: Prisma.AgentRunCreateInput): Promise<AgentRun> {
    return prisma.agentRun.create({ data })
  },

  async findById(id: string): Promise<AgentRun | null> {
    return prisma.agentRun.findUnique({ where: { id } })
  },

  async findByTopicId(topicId: string): Promise<AgentRun[]> {
    return prisma.agentRun.findMany({
      where: { topicId },
      orderBy: { createdAt: 'desc' },
    })
  },

  async update(
    id: string,
    data: Prisma.AgentRunUpdateInput,
  ): Promise<AgentRun> {
    return prisma.agentRun.update({ where: { id }, data })
  },
}
