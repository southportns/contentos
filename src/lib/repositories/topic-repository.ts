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
  ): Promise<{ id: string }> {
    const topicId = (data.topic as { connect: { id: string } }).connect.id
    const { angleId, ...rest } = data
    const strategy = await prisma.contentStrategy.upsert({
      where: { topicId },
      create: {
        ...rest,
        angleId: angleId || null,
        approvalStatus: 'pending',
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
        // P0.3.8.4.1 — Reset approval status on regenerate
        approvalStatus: 'pending',
        rejectionReason: null,
        approvedAt: null,
        rejectedAt: null,
      },
    })
    return { id: strategy.id }
  },

  /**
   * P0.3.8.4.1 — Approve strategy (conditional update for race safety).
   * Only transitions from 'pending' → 'approved'.
   * Returns true if the update was applied, false if state was already changed.
   */
  async approveStrategy(strategyId: string): Promise<boolean> {
    const result = await prisma.contentStrategy.updateMany({
      where: { id: strategyId, approvalStatus: 'pending' },
      data: { approvalStatus: 'approved', approvedAt: new Date() },
    })
    return result.count > 0
  },

  /**
   * P0.3.8.4.1 — Reject strategy (conditional update for race safety).
   * Only transitions from 'pending' → 'rejected'.
   * Returns true if the update was applied, false if state was already changed.
   */
  async rejectStrategy(strategyId: string, reason?: string): Promise<boolean> {
    const result = await prisma.contentStrategy.updateMany({
      where: { id: strategyId, approvalStatus: 'pending' },
      data: { approvalStatus: 'rejected', rejectionReason: reason ?? null, rejectedAt: new Date() },
    })
    return result.count > 0
  },

  /**
   * P0.3.8.4.1 — Find strategy by topic ID (for Writing API gate).
   */
  async findStrategyByTopicId(topicId: string): Promise<Prisma.ContentStrategyGetPayload<{}> | null> {
    return prisma.contentStrategy.findUnique({ where: { topicId } })
  },

  /**
   * P0.3.8.4.1 — Find strategy by strategy ID.
   */
  async findStrategyById(strategyId: string): Promise<Prisma.ContentStrategyGetPayload<{}> | null> {
    return prisma.contentStrategy.findUnique({ where: { id: strategyId } })
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
