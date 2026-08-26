import { Prisma, Topic } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const topicRepository = {
  async create(data: Prisma.TopicCreateInput): Promise<Topic> {
    return prisma.topic.create({ data })
  },

  async findById(id: string): Promise<Topic | null> {
    return prisma.topic.findUnique({
      where: { id },
      include: {
        researchSessions: true,
        contents: true,
        angles: true,
        strategy: true,
        drafts: true,
        evaluations: true,
      },
    })
  },

  async findByProjectId(projectId: string): Promise<Topic[]> {
    return prisma.topic.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    })
  },

  async update(id: string, data: Prisma.TopicUpdateInput): Promise<Topic> {
    return prisma.topic.update({ where: { id }, data })
  },

  async updateStatus(id: string, status: string): Promise<Topic> {
    return prisma.topic.update({ where: { id }, data: { status } })
  },

  async delete(id: string): Promise<void> {
    await prisma.topic.delete({ where: { id } })
  },

  // ── Angle ───────────────────────────────────────────

  async createAngle(data: Prisma.AngleCreateInput): Promise<void> {
    await prisma.angle.create({ data })
  },

  async updateAngleStatus(
    _topicId: string,
    angleId: string,
    status: string,
  ): Promise<void> {
    await prisma.angle.update({
      where: { id: angleId },
      data: { status },
    })
  },

  // ── Strategy ────────────────────────────────────────

  async upsertStrategy(
    data: Omit<Prisma.ContentStrategyCreateInput, 'angle'> & { angleId?: string },
  ): Promise<void> {
    const topicId = (data.topic as { connect: { id: string } }).connect.id
    const { angleId, ...rest } = data
    await prisma.contentStrategy.upsert({
      where: { topicId },
      create: {
        ...rest,
        angleId: angleId || null,
      },
      update: {
        angleId: angleId || null,
        coreThesis: rest.coreThesis,
        targetEmotion: rest.targetEmotion,
        targetAudience: rest.targetAudience,
        hookStrategy: rest.hookStrategy,
        contentStructure: rest.contentStructure,
        storyStrategy: rest.storyStrategy,
        conflict: rest.conflict,
        turningPoint: rest.turningPoint,
        endingStrategy: rest.endingStrategy,
        ctaStrategy: rest.ctaStrategy,
      },
    })
  },

  // ── Draft ───────────────────────────────────────────

  async createDraft(data: Prisma.DraftCreateInput): Promise<{ id: string }> {
    const draft = await prisma.draft.create({ data })
    return { id: draft.id }
  },

  // ── Evaluation ──────────────────────────────────────

  async createEvaluation(
    data: Prisma.EvaluationCreateInput,
  ): Promise<void> {
    await prisma.evaluation.create({ data })
  },
}
