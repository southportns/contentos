import { topicRepository } from '@/lib/repositories/topic-repository'
import { contentRepository } from '@/lib/repositories/content-repository'
import { agentRunRepository } from '@/lib/repositories/agent-run-repository'
import type { Topic, Content, AgentRun } from '@/generated/prisma'

// ─── Types ──────────────────────────────────────────────

export interface CreateTopicInput {
  projectId: string
  topic: string
  platform?: string
  audience?: string
  contentType?: string
  goal?: string
  tone?: string
  constraints?: string
}

export interface SaveResearchResultInput {
  topicId: string
  queries: string[]
  contents: Array<{
    platform: string
    url?: string
    title?: string
    author?: string
    body?: string
    publishedAt?: string
    likes?: number
    commentsCount?: number
    shares?: number
    favorites?: number
    views?: number
    keywords?: string[]
    rawHtml?: string
  }>
}

export interface SaveAnalysisInput {
  topicId: string
  analyses: Array<{
    contentUrl: string
    hookScore?: number
    emotionScore?: number
    relatabilityScore?: number
    noveltyScore?: number
    structureScore?: number
    shareabilityScore?: number
    conflictScore?: number
    storyScore?: number
    viralScore?: number
    reasoning?: string
    contentStructure?: unknown
    emotionCurve?: unknown
  }>
}

export interface SaveAngleInput {
  topicId: string
  angles: Array<{
    title: string
    coreThesis: string
    targetAudience?: string
    emotion?: string
    noveltyScore?: number
    relatabilityScore?: number
    shareabilityScore?: number
    risk?: string
    supportingEvidence?: string
  }>
}

export interface SaveStrategyInput {
  topicId: string
  angleId?: string
  coreThesis: string
  targetEmotion?: string
  targetAudience?: string
  hookStrategy?: string
  contentStructure?: unknown
  storyStrategy?: string
  conflict?: string
  turningPoint?: string
  endingStrategy?: string
  ctaStrategy?: string
}

export interface SaveDraftInput {
  topicId: string
  title?: string
  content: string
  outline?: unknown
  wordCount?: number
  status?: string
}

export interface SaveEvaluationInput {
  draftId: string
  topicId: string
  hookScore?: number
  emotionScore?: number
  relatabilityScore?: number
  noveltyScore?: number
  structureScore?: number
  readabilityScore?: number
  shareabilityScore?: number
  platformFitScore?: number
  aiStyleScore?: number
  overallScore?: number
  strengths: string[]
  issues: string[]
  suggestions?: unknown
}

export interface RecordAgentRunInput {
  topicId?: string
  skillId?: string
  input?: unknown
  output?: unknown
  model?: string
  tokens?: number
  latency?: number
  status?: string
  error?: string
  startedAt?: Date
  completedAt?: Date
}

// ─── Service ─────────────────────────────────────────────

export const contentService = {
  // ── Topic ───────────────────────────────────────────

  async createTopic(input: CreateTopicInput): Promise<Topic> {
    return topicRepository.create({
      project: { connect: { id: input.projectId } },
      topic: input.topic,
      platform: input.platform,
      audience: input.audience,
      contentType: input.contentType,
      goal: input.goal,
      tone: input.tone,
      constraints: input.constraints,
      status: 'DRAFT',
    })
  },

  async getTopic(id: string): Promise<Topic | null> {
    return topicRepository.findById(id)
  },

  async getTopicsByProject(projectId: string): Promise<Topic[]> {
    return topicRepository.findByProjectId(projectId)
  },

  async updateTopicStatus(id: string, status: string): Promise<Topic> {
    return topicRepository.updateStatus(id, status)
  },

  async deleteTopic(id: string): Promise<void> {
    return topicRepository.delete(id)
  },

  // ── Research ────────────────────────────────────────

  async saveResearchResult(input: SaveResearchResultInput): Promise<number> {
    return contentRepository.createMany(
      input.contents.map((c) => ({
        topicId: input.topicId,
        platform: c.platform,
        url: c.url || null,
        title: c.title || null,
        author: c.author || null,
        body: c.body || null,
        publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
        likes: c.likes ?? null,
        commentsCount: c.commentsCount ?? null,
        shares: c.shares ?? null,
        favorites: c.favorites ?? null,
        views: c.views ?? null,
        keywords: c.keywords || [],
        rawHtml: c.rawHtml || null,
      })),
    )
  },

  async getContentsByTopic(topicId: string): Promise<Content[]> {
    return contentRepository.findByTopicId(topicId)
  },

  // ── Analysis ────────────────────────────────────────

  async saveAnalysis(input: SaveAnalysisInput): Promise<void> {
    for (const analysis of input.analyses) {
      const content = await contentRepository.findByUrl(analysis.contentUrl)
      if (!content) continue

      await contentRepository.createAnalysis({
        content: { connect: { id: content.id } },
        topic: { connect: { id: input.topicId } },
        hookScore: analysis.hookScore,
        emotionScore: analysis.emotionScore,
        relatabilityScore: analysis.relatabilityScore,
        noveltyScore: analysis.noveltyScore,
        structureScore: analysis.structureScore,
        shareabilityScore: analysis.shareabilityScore,
        conflictScore: analysis.conflictScore,
        storyScore: analysis.storyScore,
        viralScore: analysis.viralScore,
        reasoning: analysis.reasoning,
        contentStructure: analysis.contentStructure as string | undefined,
        emotionCurve: analysis.emotionCurve as string | undefined,
      })
    }
  },

  // ── Angles ──────────────────────────────────────────

  async saveAngles(input: SaveAngleInput): Promise<void> {
    for (const angle of input.angles) {
      await topicRepository.createAngle({
        topic: { connect: { id: input.topicId } },
        title: angle.title,
        coreThesis: angle.coreThesis,
        targetAudience: angle.targetAudience,
        emotion: angle.emotion,
        noveltyScore: angle.noveltyScore,
        relatabilityScore: angle.relatabilityScore,
        shareabilityScore: angle.shareabilityScore,
        risk: angle.risk,
        supportingEvidence: angle.supportingEvidence,
        status: 'GENERATED',
      })
    }
  },

  async updateAngleStatus(
    topicId: string,
    angleId: string,
    status: string,
  ): Promise<void> {
    await topicRepository.updateAngleStatus(topicId, angleId, status)
  },

  // ── Strategy ────────────────────────────────────────

  async saveStrategy(input: SaveStrategyInput): Promise<void> {
    await topicRepository.upsertStrategy({
      topic: { connect: { id: input.topicId } },
      angleId: input.angleId || undefined,
      coreThesis: input.coreThesis,
      targetEmotion: input.targetEmotion,
      targetAudience: input.targetAudience,
      hookStrategy: input.hookStrategy,
      contentStructure: input.contentStructure as string | undefined,
      storyStrategy: input.storyStrategy,
      conflict: input.conflict,
      turningPoint: input.turningPoint,
      endingStrategy: input.endingStrategy,
      ctaStrategy: input.ctaStrategy,
    })
  },

  // ── Draft ───────────────────────────────────────────

  async saveDraft(input: SaveDraftInput): Promise<{ id: string }> {
    const draft = await topicRepository.createDraft({
      topic: { connect: { id: input.topicId } },
      title: input.title,
      content: input.content,
      outline: input.outline as string | undefined,
      wordCount: input.wordCount,
      status: input.status || 'DRAFT',
    })
    return { id: draft.id }
  },

  // ── Evaluation ──────────────────────────────────────

  async saveEvaluation(input: SaveEvaluationInput): Promise<void> {
    await topicRepository.createEvaluation({
      draft: { connect: { id: input.draftId } },
      topic: { connect: { id: input.topicId } },
      hookScore: input.hookScore,
      emotionScore: input.emotionScore,
      relatabilityScore: input.relatabilityScore,
      noveltyScore: input.noveltyScore,
      structureScore: input.structureScore,
      readabilityScore: input.readabilityScore,
      shareabilityScore: input.shareabilityScore,
      platformFitScore: input.platformFitScore,
      aiStyleScore: input.aiStyleScore,
      overallScore: input.overallScore,
      strengths: input.strengths,
      issues: input.issues,
      suggestions: input.suggestions as string | undefined,
    })
  },

  // ── Agent Run ───────────────────────────────────────

  async recordAgentRun(input: RecordAgentRunInput): Promise<AgentRun> {
    return agentRunRepository.create({
      topicId: input.topicId,
      skillId: input.skillId,
      input: input.input as string | undefined,
      output: input.output as string | undefined,
      model: input.model,
      tokens: input.tokens,
      latency: input.latency,
      status: input.status || 'pending',
      error: input.error,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    })
  },

  async updateAgentRun(
    id: string,
    data: Partial<RecordAgentRunInput>,
  ): Promise<AgentRun> {
    return agentRunRepository.update(id, {
      output: data.output as string | undefined,
      tokens: data.tokens,
      latency: data.latency,
      status: data.status,
      error: data.error,
      completedAt: data.completedAt,
    })
  },
}
