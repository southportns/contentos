import { Prisma, Topic, Draft } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

// P0.4.8 — Active Draft error codes
export const ACTIVE_DRAFT_INVALID = 'ACTIVE_DRAFT_INVALID'

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

  /**
   * P0.4.3/P0.4.4 — Create a new Draft version by restoring content from a historical version.
   *
   * Restore = Create New Draft (never overwrites or deletes old versions).
   *
   * Transaction guarantees:
   * - Concurrent restores cannot produce duplicate versions (max version is re-read inside tx)
   * - No partial drafts on failure (all-or-nothing)
   *
   * P0.4.4 additions:
   * - Prisma P2002 (unique constraint violation on topicId+version) is caught
   * - Up to 3 retries with re-read of max version on each attempt
   * - Throws DRAFT_VERSION_CONFLICT if all retries exhausted
   *
   * @param sourceDraftId - The draft ID to restore content from
   * @param userId - Current user ID (for ownership validation)
   * @returns The newly created Draft
   * @throws Error if source draft not found, ownership denied, version conflict, or creation fails
   */
  async createRestoredDraft(
    sourceDraftId: string,
    userId: string,
  ): Promise<Draft> {
    const MAX_RETRIES = 3

    // Step 1: Read source draft and validate ownership (read-only, no conflict risk)
    const sourceDraft = await prisma.draft.findUnique({
      where: { id: sourceDraftId },
      include: { topic: { include: { project: true } } },
    })

    if (!sourceDraft) {
      throw new Error('SOURCE_DRAFT_NOT_FOUND')
    }

    if (!sourceDraft.topic || !sourceDraft.topic.project) {
      throw new Error('TOPIC_NOT_FOUND')
    }
    if (sourceDraft.topic.project.userId !== userId) {
      throw new Error('OWNERSHIP_DENIED')
    }

    // Step 2: Retry loop for version creation (handles P2002 unique constraint conflicts)
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const newDraft = await prisma.$transaction(async (tx) => {
          // Re-read max version inside transaction for freshness
          const maxVersionDraft = await tx.draft.findFirst({
            where: { topicId: sourceDraft.topicId },
            orderBy: { version: 'desc' },
            select: { version: true },
          })
          const nextVersion = (maxVersionDraft?.version ?? 0) + 1

          // Create new draft with only content fields copied
          // P0.4.5 — Record lineage: new draft's parent is the source draft
          // P0.4.6 — Record evolution metadata: why this version was created
          const newDraft = await tx.draft.create({
            data: {
              topicId: sourceDraft.topicId,
              version: nextVersion,
              parentDraftId: sourceDraft.id,
              changeType: 'RESTORE',
              changeReason: `基于 v${sourceDraft.version} 恢复创建`,
              title: sourceDraft.title,
              content: sourceDraft.content,
              outline: sourceDraft.outline,
              status: 'DRAFT',
              wordCount: sourceDraft.content.length,
            },
          })

          // P0.4.8 — Restore automatically sets the new draft as the active draft
          // This is inside the same transaction: if active draft update fails,
          // the entire draft creation is rolled back (atomicity guarantee).
          await tx.topic.update({
            where: { id: sourceDraft.topicId },
            data: { activeDraftId: newDraft.id },
          })

          return newDraft
        })

        return newDraft
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check for Prisma unique constraint violation (P2002) on topicId+version
        // Check code property directly (more reliable than instanceof for mocked errors)
        if (error instanceof Error && (error as unknown as { code?: string }).code === 'P2002') {
          // Version conflict — another concurrent operation grabbed the same version.
          // Re-read max version on next attempt will compute a fresh nextVersion.
          if (attempt < MAX_RETRIES) {
            continue // Retry
          }
          // All retries exhausted — throw controlled error
          throw new Error('DRAFT_VERSION_CONFLICT')
        }

        // For any other error, throw immediately (no retry)
        throw lastError
      }
    }

    // Should not reach here, but safety net
    throw lastError ?? new Error('DRAFT_VERSION_CONFLICT')
  },

  /**
   * P0.5.1 — Create a new MANUAL_EDIT Draft from an existing source draft's content.
   *
   * Manual Edit = Create New Draft with user-modified content (never overwrites old versions).
   *
   * Transaction guarantees (same as createRestoredDraft):
   * - Concurrent edits cannot produce duplicate versions (max version re-read inside tx)
   * - No partial drafts on failure (all-or-nothing)
   * - Atomic activeDraftId update
   *
   * @param params - Parameters for manual edit draft creation
   * @returns The newly created Draft and updated Topic
   * @throws Error if source draft not found, ownership denied, version conflict, or creation fails
   */
  async createManualEditDraft(params: {
    sourceDraftId: string
    content: string
    title?: string | null
    changeReason?: string
    userId: string
  }): Promise<{ draft: Draft; topic: Topic }> {
    const { sourceDraftId, content, title, changeReason, userId } = params
    const MAX_RETRIES = 3

    // Step 1: Read source draft and validate ownership
    const sourceDraft = await prisma.draft.findUnique({
      where: { id: sourceDraftId },
      include: { topic: { include: { project: true } } },
    })

    if (!sourceDraft) {
      throw new Error('SOURCE_DRAFT_NOT_FOUND')
    }

    if (!sourceDraft.topic || !sourceDraft.topic.project) {
      throw new Error('TOPIC_NOT_FOUND')
    }
    if (sourceDraft.topic.project.userId !== userId) {
      throw new Error('OWNERSHIP_DENIED')
    }

    // Step 2: Retry loop for version creation
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Re-read max version inside transaction for freshness
          const maxVersionDraft = await tx.draft.findFirst({
            where: { topicId: sourceDraft.topicId },
            orderBy: { version: 'desc' },
            select: { version: true },
          })
          const nextVersion = (maxVersionDraft?.version ?? 0) + 1

          // Create new MANUAL_EDIT draft with user-modified content
          const newDraft = await tx.draft.create({
            data: {
              topicId: sourceDraft.topicId,
              version: nextVersion,
              parentDraftId: sourceDraft.id,
              changeType: 'MANUAL_EDIT',
              changeReason: changeReason || `基于 v${sourceDraft.version} 手动编辑`,
              title: title !== undefined ? title : sourceDraft.title,
              content,
              outline: sourceDraft.outline,
              status: 'DRAFT',
              wordCount: content.length,
            },
          })

          // Update topic's active draft atomically
          const updatedTopic = await tx.topic.update({
            where: { id: sourceDraft.topicId },
            data: { activeDraftId: newDraft.id },
          })

          return { draft: newDraft, topic: updatedTopic }
        })

        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (error instanceof Error && (error as unknown as { code?: string }).code === 'P2002') {
          if (attempt < MAX_RETRIES) {
            continue
          }
          throw new Error('DRAFT_VERSION_CONFLICT')
        }

        throw lastError
      }
    }

    // Should not reach here, but safety net
    throw lastError ?? new Error('DRAFT_VERSION_CONFLICT')
  },

  // ── P0.4.8 — Active Draft ───────────────────────────

  /**
   * P0.4.8 — Get the active draft for a topic.
   *
   * Resolution order:
   * 1. If activeDraftId is set AND the draft exists → return it
   * 2. Otherwise → fallback to the draft with the highest version
   * 3. If no drafts exist → return null
   *
   * Fallback does NOT write back to the database (compatibility for topics
   * created before activeDraftId was introduced).
   *
   * @param topicId - The topic ID to query
   * @returns The active draft, or null if no drafts exist
   */
  async getActiveDraft(topicId: string): Promise<Draft | null> {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        activeDraft: true,
        drafts: { orderBy: { version: 'desc' } },
      },
    })

    if (!topic) return null

    // Case A: activeDraftId is explicitly set and draft exists
    if (topic.activeDraft) return topic.activeDraft

    // Case B / C: fallback to highest version draft (no write-back)
    return topic.drafts.length > 0 ? topic.drafts[0] : null
  },

  /**
   * P0.4.8 — Set a specific draft as the active draft for a topic.
   *
   * Performs ownership validation:
   * - Draft must belong to the specified topic (cross-topic protection)
   * - User must own the project that contains the topic
   *
   * @param topicId - The topic ID
   * @param draftId - The draft ID to set as active
   * @param userId - Current user ID (for ownership validation)
   * @throws Error ACTIVE_DRAFT_INVALID if draft doesn't belong to topic
   * @throws Error OWNERSHIP_DENIED if user doesn't own the project
   */
  async setActiveDraft(
    topicId: string,
    draftId: string,
    userId: string,
  ): Promise<Draft> {
    // Step 1: Validate draft belongs to topic + ownership
    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      include: { topic: { include: { project: true } } },
    })

    if (!draft) {
      throw new Error('SOURCE_DRAFT_NOT_FOUND')
    }

    // Cross-topic protection: draft must belong to the specified topic
    if (draft.topicId !== topicId) {
      throw new Error(ACTIVE_DRAFT_INVALID)
    }

    // Ownership validation
    if (!draft.topic || !draft.topic.project || draft.topic.project.userId !== userId) {
      throw new Error('OWNERSHIP_DENIED')
    }

    // Step 2: Update topic's active draft
    await prisma.topic.update({
      where: { id: topicId },
      data: { activeDraftId: draftId },
    })

    return draft
  },

  // ── Evaluation ──────────────────────────────────────

  async createEvaluation(
    data: Prisma.EvaluationCreateInput,
  ): Promise<void> {
    await prisma.evaluation.create({ data })
  },
}
