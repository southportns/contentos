import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { projectRepository } from '@/lib/repositories/project-repository'
import { topicRepository } from '@/lib/repositories/topic-repository'
import { prisma } from '@/lib/prisma'
import { getDefaultUserId, ensureDefaultUser } from '@/lib/utils/default-user'

export const runtime = 'nodejs'

// Format: MM/DD HH:mm
function formatTime(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

// ── Request Schema ──────────────────────────────────

const SaveProjectSchema = z.object({
  // Project info
  projectId: z.string().optional(),
  projectName: z.string().optional(),

  // Topic info
  topic: z.string().min(1),
  platform: z.string().optional().nullable(),
  audience: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional().default([]),
  coreQuestions: z.array(z.string()).optional().default([]),

  // Selected angle
  selectedAngle: z.object({
    id: z.string(),
    title: z.string(),
    angle: z.string(),
    reasoning: z.string().optional(),
    targetEmotion: z.string().optional(),
    estimatedViralScore: z.number().optional(),
    difficulty: z.string().optional(),
    keyPoints: z.array(z.string()).optional().default([]),
    audienceAppeal: z.string().optional(),
  }),

  // Strategy
  strategy: z.object({
    title: z.string(),
    hook: z.string(),
    structure: z.array(z.object({
      section: z.string(),
      purpose: z.string(),
      keyArguments: z.array(z.string()).default([]),
      estimatedWords: z.number(),
    })).optional().default([]),
    keyArguments: z.array(z.string()).optional().default([]),
    emotionalArc: z.object({
      start: z.string(),
      middle: z.string(),
      end: z.string(),
    }),
    callToAction: z.string().optional(),
    tone: z.string().optional(),
    estimatedWordCount: z.number().optional(),
  }),

  // Draft
  draft: z.object({
    title: z.string(),
    content: z.string(),
    hook: z.string().optional(),
    wordCount: z.number().optional(),
  }),

  // Evaluation (optional)
  evaluation: z.object({
    overallScore: z.number(),
    scores: z.record(z.string(), z.number()).optional(),
    strengths: z.array(z.string()).optional().default([]),
    weaknesses: z.array(z.string()).optional().default([]),
    suggestions: z.array(z.object({
      section: z.string(),
      issue: z.string(),
      suggestion: z.string(),
      priority: z.string(),
    })).optional().default([]),
    emotionalArcAnalysis: z.object({
      achieved: z.boolean(),
      analysis: z.string(),
    }).optional(),
    conclusion: z.string().optional(),
  }).optional(),

  // Strategy evaluation (optional)
  strategyEvaluation: z.object({
    platform: z.string(),
    overallScore: z.number(),
    grade: z.string(),
    scores: z.record(z.string(), z.number()).optional(),
    platformFit: z.number().optional(),
    strategyConsistency: z.number().optional(),
    strengths: z.array(z.string()).optional().default([]),
    weaknesses: z.array(z.string()).optional().default([]),
    criticalIssues: z.array(z.string()).optional().default([]),
    improvementPriorities: z.array(z.object({
      priority: z.number(),
      problem: z.string(),
      reason: z.string(),
      suggestion: z.string(),
    })).optional().default([]),
    shareAnalysis: z.object({
      motivation: z.string(),
      target: z.string(),
      context: z.string(),
    }).optional(),
    aiStyleRisk: z.number().optional(),
    authenticityScore: z.number().optional(),
    evidenceQuality: z.number().optional(),
    confidence: z.number().optional(),
    verdict: z.string().optional(),
  }).optional(),

  // Refine changes (for style distillation)
  refineChanges: z.array(
    z.object({
      type: z.string(),
      original: z.string(),
      revised: z.string(),
      reason: z.string(),
    }),
  ).optional(),
})

// ── POST Handler ─────────────────────────────────────

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: '数据库未配置，无法保存创作' },
      { status: 503 },
    )
  }

  try {
    const body = await request.json()
    const data = SaveProjectSchema.parse(body)

    const defaultUserId = getDefaultUserId()

    // 0. Ensure default user exists (foreign key constraint)
    await ensureDefaultUser()

    // 1. Create or update project
    //    Keep the existing name (time - topic summary) set by the topic step; only
    //    use a fallback for brand-new projects without a prior name.
    const projectName = data.projectName || `${formatTime(new Date())} - ${data.topic.slice(0, 20)}`
    let project
    let topic

    if (data.projectId) {
      // Update existing project
      project = await projectRepository.findById(data.projectId)
      if (!project) {
        return NextResponse.json(
          { success: false, error: '创作不存在' },
          { status: 404 },
        )
      }
      await projectRepository.update(project.id, {
        name: projectName,
        description: `主题：${data.topic}`,
      })

      // Find or create topic for this project
      const existingTopics = (project as unknown as { topics: Array<{ id: string }> }).topics ?? []
      if (existingTopics.length > 0) {
        // Update existing topic
        topic = await topicRepository.update(existingTopics[0].id, {
          topic: data.topic,
          category: data.category || null,
          platform: data.platform || null,
          audience: data.audience || null,
          status: 'READY',
        })
        // Clean up old related data (angles, strategy, drafts, etc.)
        await prisma.angle.deleteMany({ where: { topicId: topic.id } })
        await prisma.contentStrategy.deleteMany({ where: { topicId: topic.id } })
        await prisma.draft.deleteMany({ where: { topicId: topic.id } })
      } else {
        topic = await topicRepository.create({
          topic: data.topic,
          category: data.category || null,
          platform: data.platform || null,
          audience: data.audience || null,
          status: 'READY',
          project: { connect: { id: project.id } },
        })
      }
    } else {
      // Create new project
      project = await projectRepository.create({
        name: projectName,
        description: `主题：${data.topic}`,
        user: { connect: { id: defaultUserId } },
      })

      // 2. Create topic
      topic = await topicRepository.create({
        topic: data.topic,
        category: data.category || null,
        platform: data.platform || null,
        audience: data.audience || null,
        status: 'READY',
        project: { connect: { id: project.id } },
      })
    }

    // 3. Create selected angle
    await prisma.angle.create({
      data: {
        topic: { connect: { id: topic.id } },
        title: data.selectedAngle.title,
        coreThesis: data.selectedAngle.angle,
        emotion: data.selectedAngle.targetEmotion || null,
        keyPoints: data.selectedAngle.keyPoints as unknown as Prisma.InputJsonValue,
        audienceAppeal: data.selectedAngle.audienceAppeal || null,
        estimatedViralScore: data.selectedAngle.estimatedViralScore || null,
        status: 'APPROVED',
      },
    })

    // 4. Create strategy
    const strategyData = data.strategy
    await prisma.contentStrategy.create({
      data: {
        topic: { connect: { id: topic.id } },
        coreThesis: strategyData.title,
        hookStrategy: strategyData.hook,
        contentStructure: strategyData.structure.length > 0
          ? strategyData.structure
          : Prisma.JsonNull,
        keyArguments: strategyData.keyArguments as unknown as Prisma.InputJsonValue,
        endingStrategy: strategyData.emotionalArc
          ? `${strategyData.emotionalArc.start} → ${strategyData.emotionalArc.middle} → ${strategyData.emotionalArc.end}`
          : null,
        ctaStrategy: strategyData.callToAction || null,
        tone: strategyData.tone || null,
        estimatedWordCount: strategyData.estimatedWordCount || null,
      },
    })

    // 5. Create draft
    const draft = await prisma.draft.create({
      data: {
        topic: { connect: { id: topic.id } },
        title: data.draft.title,
        content: data.draft.content,
        status: 'FINAL',
        wordCount: data.draft.wordCount || null,
      },
    })

    // 6. Create evaluation (if exists)
    if (data.evaluation) {
      const evalData = data.evaluation
      await prisma.evaluation.create({
        data: {
          draft: { connect: { id: draft.id } },
          topic: { connect: { id: topic.id } },
          overallScore: evalData.overallScore,
          emotionalImpactScore: evalData.scores?.emotionalImpact || null,
          logicalClarityScore: evalData.scores?.logicalClarity || null,
          noveltyScore: evalData.scores?.novelty || null,
          readabilityScore: evalData.scores?.readability || null,
          utilityScore: evalData.scores?.utility || null,
          platformFitScore: evalData.scores?.platformFit || null,
          strengths: evalData.strengths as unknown as Prisma.InputJsonValue,
          issues: evalData.weaknesses as unknown as Prisma.InputJsonValue,
          suggestions: evalData.suggestions.length > 0 ? evalData.suggestions : Prisma.JsonNull,
          emotionalArcAnalysis: evalData.emotionalArcAnalysis || Prisma.JsonNull,
          conclusion: evalData.conclusion || null,
        },
      })
    }

    // 7. Create strategy evaluation (if exists)
    if (data.strategyEvaluation) {
      const seData = data.strategyEvaluation
      await prisma.strategyEvaluation.create({
        data: {
          draft: { connect: { id: draft.id } },
          topic: { connect: { id: topic.id } },
          platform: seData.platform,
          overallScore: seData.overallScore,
          grade: seData.grade,
          scores: seData.scores || Prisma.JsonNull,
          platformFit: seData.platformFit || null,
          strategyConsistency: seData.strategyConsistency || null,
          strengths: seData.strengths as unknown as Prisma.InputJsonValue,
          weaknesses: seData.weaknesses as unknown as Prisma.InputJsonValue,
          criticalIssues: seData.criticalIssues as unknown as Prisma.InputJsonValue,
          improvementPriorities: seData.improvementPriorities.length > 0 ? seData.improvementPriorities : Prisma.JsonNull,
          shareAnalysis: seData.shareAnalysis || Prisma.JsonNull,
          aiStyleRisk: seData.aiStyleRisk || null,
          authenticityScore: seData.authenticityScore || null,
          evidenceQuality: seData.evidenceQuality || null,
          confidence: seData.confidence || null,
          verdict: seData.verdict || null,
        },
      })
    }

    // Touch the project to update updatedAt
    await projectRepository.update(project.id, {})

    // 8. Archive final content for style distillation
    try {
      const { contentService } = await import('@/lib/services/content-service')
      await contentService.archiveContent(defaultUserId, {
        topic: data.topic,
        platform: data.platform || undefined,
        finalTitle: data.draft.title,
        finalContent: data.draft.content,
        finalHook: data.draft.hook || undefined,
        refineChanges: data.refineChanges || undefined,
        selectedAngleTitle: data.selectedAngle.title,
        strategyTone: data.strategy.tone || undefined,
        wordCount: data.draft.wordCount || undefined,
      })
    } catch (archiveError) {
      // Archiving failure should not block project save
      console.error('[API] Archive content failed (non-blocking):', archiveError)
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.id,
        topicId: topic.id,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    console.error('[API] Save project failed:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
