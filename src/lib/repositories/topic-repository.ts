import { Prisma, Topic, Draft, Evaluation, Humanization } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

// P0.4.8 — Active Draft error codes
export const ACTIVE_DRAFT_INVALID = 'ACTIVE_DRAFT_INVALID'

export const topicRepository = {
  async create(data: Prisma.TopicCreateInput): Promise<Topic> {
    return prisma.topic.create({ data })
  },
  async findById(id: string): Promise<Topic | null> {
    return prisma.topic.findUnique({ where: { id }, include: { researchSessions: true, contents: true, angles: true, strategy: true, drafts: true, evaluations: true } })
  },
  async findByProjectId(projectId: string): Promise<Topic[]> {
    return prisma.topic.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } })
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
  async createAngle(data: Prisma.AngleCreateInput): Promise<void> {
    await prisma.angle.create({ data })
  },
  async updateAngleStatus(_topicId: string, angleId: string, status: string): Promise<void> {
    await prisma.angle.update({ where: { id: angleId }, data: { status } })
  },
  async upsertStrategy(data: Omit<Prisma.ContentStrategyCreateInput, 'angle'> & { angleId?: string }): Promise<{ id: string }> {
    const topicId = (data.topic as { connect: { id: string } }).connect.id
    const { angleId, ...rest } = data
    const strategy = await prisma.contentStrategy.upsert({
      where: { topicId },
      create: { ...rest, angleId: angleId || null, approvalStatus: 'pending' },
      update: { angleId: angleId || null, coreThesis: rest.coreThesis, targetEmotion: rest.targetEmotion, targetAudience: rest.targetAudience, hookStrategy: rest.hookStrategy, contentStructure: rest.contentStructure, storyStrategy: rest.storyStrategy, conflict: rest.conflict, turningPoint: rest.turningPoint, endingStrategy: rest.endingStrategy, ctaStrategy: rest.ctaStrategy, approvalStatus: 'pending', rejectionReason: null, approvedAt: null, rejectedAt: null },
    })
    return { id: strategy.id }
  },
  async approveStrategy(strategyId: string): Promise<boolean> {
    const result = await prisma.contentStrategy.updateMany({ where: { id: strategyId, approvalStatus: 'pending' }, data: { approvalStatus: 'approved', approvedAt: new Date() } })
    return result.count > 0
  },
  async rejectStrategy(strategyId: string, reason?: string): Promise<boolean> {
    const result = await prisma.contentStrategy.updateMany({ where: { id: strategyId, approvalStatus: 'pending' }, data: { approvalStatus: 'rejected', rejectionReason: reason ?? null, rejectedAt: new Date() } })
    return result.count > 0
  },
  async findStrategyByTopicId(topicId: string): Promise<Prisma.ContentStrategyGetPayload<{}> | null> {
    return prisma.contentStrategy.findUnique({ where: { topicId } })
  },
  async findStrategyById(strategyId: string): Promise<Prisma.ContentStrategyGetPayload<{}> | null> {
    return prisma.contentStrategy.findUnique({ where: { id: strategyId } })
  },
  async createDraft(data: Prisma.DraftCreateInput): Promise<{ id: string }> {
    const draft = await prisma.draft.create({ data })
    return { id: draft.id }
  },
  async createRestoredDraft(sourceDraftId: string, userId: string): Promise<Draft> {
    const MAX_RETRIES = 3
    const sourceDraft = await prisma.draft.findUnique({ where: { id: sourceDraftId }, include: { topic: { include: { project: true } } } })
    if (!sourceDraft) throw new Error('SOURCE_DRAFT_NOT_FOUND')
    if (!sourceDraft.topic || !sourceDraft.topic.project) throw new Error('TOPIC_NOT_FOUND')
    if (sourceDraft.topic.project.userId !== userId) throw new Error('OWNERSHIP_DENIED')
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const newDraft = await prisma.$transaction(async (tx) => {
          const maxVersionDraft = await tx.draft.findFirst({ where: { topicId: sourceDraft.topicId }, orderBy: { version: 'desc' }, select: { version: true } })
          const nextVersion = (maxVersionDraft?.version ?? 0) + 1
          const newDraft = await tx.draft.create({ data: { topicId: sourceDraft.topicId, version: nextVersion, parentDraftId: sourceDraft.id, changeType: 'RESTORE', changeReason: `基于 v${sourceDraft.version} 恢复创建`, title: sourceDraft.title, content: sourceDraft.content, outline: sourceDraft.outline, status: 'DRAFT', wordCount: sourceDraft.content.length } })
          await tx.topic.update({ where: { id: sourceDraft.topicId }, data: { activeDraftId: newDraft.id } })
          return newDraft
        })
        return newDraft
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (error instanceof Error && (error as unknown as { code?: string }).code === 'P2002') {
          if (attempt < MAX_RETRIES) continue
          throw new Error('DRAFT_VERSION_CONFLICT')
        }
        throw lastError
      }
    }
    throw lastError ?? new Error('DRAFT_VERSION_CONFLICT')
  },
  async createManualEditDraft(params: { sourceDraftId: string; content: string; title?: string | null; changeReason?: string; userId: string }): Promise<{ draft: Draft; topic: Topic }> {
    const { sourceDraftId, content, title, changeReason, userId } = params
    const MAX_RETRIES = 3
    const sourceDraft = await prisma.draft.findUnique({ where: { id: sourceDraftId }, include: { topic: { include: { project: true } } } })
    if (!sourceDraft) throw new Error('SOURCE_DRAFT_NOT_FOUND')
    if (!sourceDraft.topic || !sourceDraft.topic.project) throw new Error('TOPIC_NOT_FOUND')
    if (sourceDraft.topic.project.userId !== userId) throw new Error('OWNERSHIP_DENIED')
    if (sourceDraft.topic.activeDraftId !== sourceDraft.id) throw new Error('ACTIVE_DRAFT_CONFLICT')
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const maxVersionDraft = await tx.draft.findFirst({ where: { topicId: sourceDraft.topicId }, orderBy: { version: 'desc' }, select: { version: true } })
          const nextVersion = (maxVersionDraft?.version ?? 0) + 1
          const newDraft = await tx.draft.create({ data: { topicId: sourceDraft.topicId, version: nextVersion, parentDraftId: sourceDraft.id, changeType: 'MANUAL_EDIT', changeReason: changeReason || `基于 v${sourceDraft.version} 手动编辑`, title: title !== undefined ? title : sourceDraft.title, content, outline: sourceDraft.outline, status: 'DRAFT', wordCount: content.length } })
          const updatedTopic = await tx.topic.update({ where: { id: sourceDraft.topicId }, data: { activeDraftId: newDraft.id } })
          return { draft: newDraft, topic: updatedTopic }
        })
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (error instanceof Error && (error as unknown as { code?: string }).code === 'P2002') {
          if (attempt < MAX_RETRIES) continue
          throw new Error('DRAFT_VERSION_CONFLICT')
        }
        throw lastError
      }
    }
    throw lastError ?? new Error('DRAFT_VERSION_CONFLICT')
  },
  async getActiveDraft(topicId: string): Promise<Draft | null> {
    const topic = await prisma.topic.findUnique({ where: { id: topicId }, include: { activeDraft: true, drafts: { orderBy: { version: 'desc' } } } })
    if (!topic) return null
    if (topic.activeDraft) return topic.activeDraft
    return topic.drafts.length > 0 ? topic.drafts[0] : null
  },
  async setActiveDraft(topicId: string, draftId: string, userId: string): Promise<Draft> {
    const draft = await prisma.draft.findUnique({ where: { id: draftId }, include: { topic: { include: { project: true } } } })
    if (!draft) throw new Error('SOURCE_DRAFT_NOT_FOUND')
    if (draft.topicId !== topicId) throw new Error(ACTIVE_DRAFT_INVALID)
    if (!draft.topic || !draft.topic.project || draft.topic.project.userId !== userId) throw new Error('OWNERSHIP_DENIED')
    await prisma.topic.update({ where: { id: topicId }, data: { activeDraftId: draftId } })
    return draft
  },
  async createEvaluation(data: Prisma.EvaluationCreateInput): Promise<void> {
    await prisma.evaluation.create({ data })
  },
  // ── P0.5.3 — Evaluation Persistence ────────────────
  async upsertDraftEvaluation(data: { draftId: string; topicId: string; overallScore?: number; emotionalImpactScore?: number; logicalClarityScore?: number; noveltyScore?: number; readabilityScore?: number; utilityScore?: number; platformFitScore?: number; aiStyleScore?: number; strengths?: string[]; issues?: string[]; suggestions?: unknown; emotionalArcAnalysis?: unknown; conclusion?: string }): Promise<Evaluation> {
    const evaluation = await prisma.evaluation.upsert({
      where: { draftId: data.draftId },
      create: { draft: { connect: { id: data.draftId } }, topic: { connect: { id: data.topicId } }, overallScore: data.overallScore, emotionalImpactScore: data.emotionalImpactScore, logicalClarityScore: data.logicalClarityScore, noveltyScore: data.noveltyScore, readabilityScore: data.readabilityScore, utilityScore: data.utilityScore, platformFitScore: data.platformFitScore, aiStyleScore: data.aiStyleScore, strengths: data.strengths as unknown as Prisma.InputJsonValue, issues: data.issues as unknown as Prisma.InputJsonValue, suggestions: data.suggestions as unknown as Prisma.InputJsonValue, emotionalArcAnalysis: data.emotionalArcAnalysis as unknown as Prisma.InputJsonValue, conclusion: data.conclusion },
      update: { overallScore: data.overallScore, emotionalImpactScore: data.emotionalImpactScore, logicalClarityScore: data.logicalClarityScore, noveltyScore: data.noveltyScore, readabilityScore: data.readabilityScore, utilityScore: data.utilityScore, platformFitScore: data.platformFitScore, aiStyleScore: data.aiStyleScore, strengths: data.strengths as unknown as Prisma.InputJsonValue, issues: data.issues as unknown as Prisma.InputJsonValue, suggestions: data.suggestions as unknown as Prisma.InputJsonValue, emotionalArcAnalysis: data.emotionalArcAnalysis as unknown as Prisma.InputJsonValue, conclusion: data.conclusion },
    })
    return evaluation
  },
  // ── P0.5.3 — Refine → New Draft Version ────────────
  async createRefinedDraft(params: { sourceDraftId: string; content: string; title?: string | null; hook?: string | null; outline?: unknown; changeReason?: string; userId: string }): Promise<{ draft: Draft; topic: Topic }> {
    const { sourceDraftId, content, title, hook, outline, changeReason, userId } = params
    const MAX_RETRIES = 3
    const sourceDraft = await prisma.draft.findUnique({ where: { id: sourceDraftId }, include: { topic: { include: { project: true } } } })
    if (!sourceDraft) throw new Error('SOURCE_DRAFT_NOT_FOUND')
    if (!sourceDraft.topic || !sourceDraft.topic.project) throw new Error('TOPIC_NOT_FOUND')
    if (sourceDraft.topic.project.userId !== userId) throw new Error('OWNERSHIP_DENIED')
    if (sourceDraft.topic.activeDraftId !== sourceDraft.id) throw new Error('ACTIVE_DRAFT_CONFLICT')
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const maxVersionDraft = await tx.draft.findFirst({ where: { topicId: sourceDraft.topicId }, orderBy: { version: 'desc' }, select: { version: true } })
          const nextVersion = (maxVersionDraft?.version ?? 0) + 1
          const newDraft = await tx.draft.create({ data: { topicId: sourceDraft.topicId, version: nextVersion, parentDraftId: sourceDraft.id, changeType: 'REFINE', changeReason: changeReason || `基于 v${sourceDraft.version} AI 精修`, title: title !== undefined ? title : sourceDraft.title, content, outline: outline !== undefined ? outline as Prisma.InputJsonValue : sourceDraft.outline, status: 'DRAFT', wordCount: content.length } })
          const updatedTopic = await tx.topic.update({ where: { id: sourceDraft.topicId }, data: { activeDraftId: newDraft.id } })
          return { draft: newDraft, topic: updatedTopic }
        })
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (error instanceof Error && (error as unknown as { code?: string }).code === 'P2002') {
          if (attempt < MAX_RETRIES) continue
          throw new Error('DRAFT_VERSION_CONFLICT')
        }
        throw lastError
      }
    }
    throw lastError ?? new Error('DRAFT_VERSION_CONFLICT')
  },
  // ── P0.5.3 — Humanization → New Draft Version ──────
  async createHumanizedDraft(params: { sourceDraftId: string; content: string; title?: string | null; hook?: string | null; outline?: unknown; aiStyleScore?: number; humanizedScore?: number; changes?: unknown; issues?: unknown; changeReason?: string; userId: string }): Promise<{ draft: Draft; topic: Topic; humanization: Humanization }> {
    const { sourceDraftId, content, title, hook, outline, aiStyleScore, humanizedScore, changes, issues, changeReason, userId } = params
    const MAX_RETRIES = 3
    const sourceDraft = await prisma.draft.findUnique({ where: { id: sourceDraftId }, include: { topic: { include: { project: true } } } })
    if (!sourceDraft) throw new Error('SOURCE_DRAFT_NOT_FOUND')
    if (!sourceDraft.topic || !sourceDraft.topic.project) throw new Error('TOPIC_NOT_FOUND')
    if (sourceDraft.topic.project.userId !== userId) throw new Error('OWNERSHIP_DENIED')
    if (sourceDraft.topic.activeDraftId !== sourceDraft.id) throw new Error('ACTIVE_DRAFT_CONFLICT')
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const maxVersionDraft = await tx.draft.findFirst({ where: { topicId: sourceDraft.topicId }, orderBy: { version: 'desc' }, select: { version: true } })
          const nextVersion = (maxVersionDraft?.version ?? 0) + 1
          const newDraft = await tx.draft.create({ data: { topicId: sourceDraft.topicId, version: nextVersion, parentDraftId: sourceDraft.id, changeType: 'HUMANIZATION', changeReason: changeReason || `基于 v${sourceDraft.version} 采用人性化版本`, title: title !== undefined ? title : sourceDraft.title, content, outline: outline !== undefined ? outline as Prisma.InputJsonValue : sourceDraft.outline, status: 'DRAFT', wordCount: content.length } })
          const updatedTopic = await tx.topic.update({ where: { id: sourceDraft.topicId }, data: { activeDraftId: newDraft.id } })
          const humanization = await tx.humanization.create({ data: { draft: { connect: { id: newDraft.id } }, topic: { connect: { id: sourceDraft.topicId } }, aiStyleScore, humanizedScore, adopted: true, changes: changes as Prisma.InputJsonValue, issues: issues as Prisma.InputJsonValue } })
          return { draft: newDraft, topic: updatedTopic, humanization }
        })
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (error instanceof Error && (error as unknown as { code?: string }).code === 'P2002') {
          if (attempt < MAX_RETRIES) continue
          throw new Error('DRAFT_VERSION_CONFLICT')
        }
        throw lastError
      }
    }
    throw lastError ?? new Error('DRAFT_VERSION_CONFLICT')
  },
}