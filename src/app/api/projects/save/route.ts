import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { prisma } from '@/lib/prisma'
import { getDefaultUserId, ensureDefaultUser } from '@/lib/utils/default-user'
import { getNextDraftVersion, isFirstSave, getOriginalDraftVersion, getRefinedDraftVersion } from '@/lib/workflow/draft-version'

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

  // Draft (final output)
  draft: z.object({
    title: z.string(),
    content: z.string(),
    hook: z.string().optional(),
    wordCount: z.number().optional(),
  }),

  // Original draft (from Generate stage, before refine)
  originalDraft: z.object({
    title: z.string(),
    content: z.string(),
    hook: z.string().optional(),
    wordCount: z.number().optional(),
  }).optional(),

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

  // Refine data (full RefineResult)
  refineData: z.object({
    content: z.string(),
    title: z.string(),
    hook: z.string(),
    wordCount: z.number(),
    changes: z.array(z.object({
      type: z.string(),
      original: z.string(),
      revised: z.string(),
      reason: z.string(),
      linkedIssueId: z.string().optional(),
      confidence: z.number().optional(),
    })).default([]),
    hookCandidates: z.array(z.string()).optional(),
    titleCandidates: z.array(z.string()).optional(),
    summary: z.string().optional().default(''),
    resolvedIssues: z.array(z.object({
      issueId: z.string(),
      resolution: z.string(),
      changeId: z.string().optional(),
    })).optional().default([]),
    unresolvedIssues: z.array(z.object({
      issueId: z.string(),
      reason: z.string(),
      suggestion: z.string(),
    })).optional().default([]),
    preservedElements: z.array(z.object({
      element: z.string(),
      reason: z.string(),
    })).optional().default([]),
  }).optional(),

  // Humanization
  humanization: z.object({
    adopted: z.boolean(),
    result: z.object({
      content: z.string(),
      title: z.string(),
      hook: z.string(),
      wordCount: z.number(),
      changes: z.array(z.object({
        type: z.string(),
        original: z.string(),
        revised: z.string(),
        reason: z.string(),
        linkedIssueId: z.string().optional(),
        confidence: z.number().optional(),
      })).default([]),
      hookCandidates: z.array(z.string()).optional(),
      titleCandidates: z.array(z.string()).optional(),
      summary: z.string().optional().default(''),
      resolvedIssues: z.array(z.object({
        issueId: z.string(),
        resolution: z.string(),
        changeId: z.string().optional(),
      })).optional().default([]),
      unresolvedIssues: z.array(z.object({
        issueId: z.string(),
        reason: z.string(),
        suggestion: z.string(),
      })).optional().default([]),
      preservedElements: z.array(z.object({
        element: z.string(),
        reason: z.string(),
      })).optional().default([]),
    }).nullable(),
  }).optional(),

  // Refine issues
  refineIssues: z.array(z.object({
    id: z.string(),
    section: z.string(),
    issue: z.string(),
    suggestion: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    selected: z.boolean(),
    resolved: z.boolean(),
  })).optional(),

  // Refine changes (legacy, for backward compat)
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

    // Execute all database writes inside a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create or update project + topic
      const projectName = data.projectName || `${formatTime(new Date())} - ${data.topic.slice(0, 20)}`
      let project: { id: string }
      let topic: { id: string }

      if (data.projectId) {
        // Verify project exists within transaction
        const existingProject = await tx.project.findUnique({
          where: { id: data.projectId },
          include: { topics: { select: { id: true } } },
        })
        if (!existingProject) {
          throw new Error('创作不存在')
        }
        project = existingProject

        // Update project
        await tx.project.update({
          where: { id: project.id },
          data: {
            name: projectName,
            description: `主题：${data.topic}`,
          },
        })

        const existingTopics = (existingProject as unknown as { topics: Array<{ id: string }> }).topics ?? []
        if (existingTopics.length > 0) {
          // Update existing topic
          const topicId = existingTopics[0].id
          await tx.topic.update({
            where: { id: topicId },
            data: {
              topic: data.topic,
              category: data.category || null,
              platform: data.platform || null,
              audience: data.audience || null,
              status: 'READY',
            },
          })
          topic = { id: topicId }
          // Clean up old angles (allowed per spec) but NOT strategy, drafts, evaluations
          await tx.angle.deleteMany({ where: { topicId } })
          // IMPORTANT: Do NOT delete strategies here — preserve approval status
        } else {
          const newTopic = await tx.topic.create({
            data: {
              topic: data.topic,
              category: data.category || null,
              platform: data.platform || null,
              audience: data.audience || null,
              status: 'READY',
              project: { connect: { id: project.id } },
            },
          })
          topic = newTopic
        }
      } else {
        // Create new project
        project = await tx.project.create({
          data: {
            name: projectName,
            description: `主题：${data.topic}`,
            user: { connect: { id: defaultUserId } },
          },
        })

        // 2. Create topic
        const newTopic = await tx.topic.create({
          data: {
            topic: data.topic,
            category: data.category || null,
            platform: data.platform || null,
            audience: data.audience || null,
            status: 'READY',
            project: { connect: { id: project.id } },
          },
        })
        topic = newTopic
      }

      // 3. Create selected angle
      await tx.angle.create({
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

      // 4. Strategy — preserve approval status on existing strategies
      const strategyData = data.strategy
      const existingStrategy = await tx.contentStrategy.findUnique({
        where: { topicId: topic.id },
      })

      if (existingStrategy) {
        // Update existing strategy — preserve approvalStatus, rejectionReason, approvedAt, rejectedAt
        await tx.contentStrategy.update({
          where: { id: existingStrategy.id },
          data: {
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
            // IMPORTANT: Do NOT change approvalStatus, rejectionReason, approvedAt, rejectedAt
          },
        })
      } else {
        // Create new strategy
        await tx.contentStrategy.create({
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
            approvalStatus: 'pending',
          },
        })
      }

      // 5. Determine existing draft versions
      const existingDrafts = await tx.draft.findMany({
        where: { topicId: topic.id },
        select: { id: true, version: true },
      })
      const existingDraftCount = existingDrafts.length
      const existingVersions = existingDrafts.map((d) => d.version)
      const _isFirstSave = isFirstSave(existingDraftCount)

      // 6. Create drafts based on first save vs. subsequent save
      let originalDraftId: string | null = null
      let finalDraftId: string

      if (_isFirstSave) {
        // First save: create v1 (original) and optionally v2 (refined)
        const hasRefine = !!data.refineData && !!data.originalDraft

        if (hasRefine && data.originalDraft) {
          // Create Draft v1 (original)
          const v1 = await tx.draft.create({
            data: {
              topic: { connect: { id: topic.id } },
              version: getOriginalDraftVersion(),
              title: data.originalDraft.title,
              content: data.originalDraft.content,
              status: 'DRAFT',
              wordCount: data.originalDraft.wordCount || null,
            },
          })
          originalDraftId = v1.id

          // Create Draft v2 (final/refined)
          const v2 = await tx.draft.create({
            data: {
              topic: { connect: { id: topic.id } },
              version: getRefinedDraftVersion(),
              title: data.draft.title,
              content: data.draft.content,
              status: 'FINAL',
              wordCount: data.draft.wordCount || null,
            },
          })
          finalDraftId = v2.id
        } else {
          // No refine: create v1 only
          const v1 = await tx.draft.create({
            data: {
              topic: { connect: { id: topic.id } },
              version: getOriginalDraftVersion(),
              title: data.draft.title,
              content: data.draft.content,
              status: 'FINAL',
              wordCount: data.draft.wordCount || null,
            },
          })
          originalDraftId = v1.id
          finalDraftId = v1.id
        }
      } else {
        // Subsequent save: create next version
        const nextVersion = getNextDraftVersion(existingVersions)
        const newDraft = await tx.draft.create({
          data: {
            topic: { connect: { id: topic.id } },
            version: nextVersion,
            title: data.draft.title,
            content: data.draft.content,
            status: 'FINAL',
            wordCount: data.draft.wordCount || null,
          },
        })
        finalDraftId = newDraft.id
      }

      // 7. Create evaluation (only on first save, linked to original draft)
      if (data.evaluation && _isFirstSave && originalDraftId) {
        const evalData = data.evaluation
        await tx.evaluation.create({
          data: {
            draft: { connect: { id: originalDraftId } },
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

      // 8. Create strategy evaluation (only on first save, linked to original draft)
      if (data.strategyEvaluation && _isFirstSave && originalDraftId) {
        const seData = data.strategyEvaluation
        await tx.strategyEvaluation.create({
          data: {
            draft: { connect: { id: originalDraftId } },
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

      // 9. Create humanization (if generated, linked to final draft)
      if (data.humanization && data.humanization.result) {
        const humData = data.humanization
        const humResult = humData.result
        await tx.humanization.create({
          data: {
            draft: { connect: { id: finalDraftId } },
            topic: { connect: { id: topic.id } },
            adopted: humData.adopted,
            changes: humResult.changes.length > 0
              ? (humResult.changes as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            issues: null,
          },
        })
      }

      // 10. Touch the project to update updatedAt
      await tx.project.update({
        where: { id: project.id },
        data: {},
      })

      // 11. Archive final content (inside transaction — failure = full rollback)
      await tx.userContentArchive.create({
        data: {
          topic: data.topic,
          platform: data.platform || null,
          finalTitle: data.draft.title,
          finalContent: data.draft.content,
          finalHook: data.draft.hook || null,
          refineChanges: data.refineData?.changes || data.refineChanges || null,
          refineData: data.refineData || null,
          humanizationData: data.humanization?.result || null,
          humanizationAdopted: data.humanization?.adopted ?? null,
          resolvedIssues: data.refineData?.resolvedIssues || null,
          unresolvedIssues: data.refineData?.unresolvedIssues || null,
          preservedElements: data.refineData?.preservedElements || null,
          draftVersion: _isFirstSave
            ? (data.refineData && data.originalDraft ? getRefinedDraftVersion() : getOriginalDraftVersion())
            : getNextDraftVersion(existingVersions),
          refineVersion: _isFirstSave && data.refineData ? getRefinedDraftVersion() : null,
          selectedAngleTitle: data.selectedAngle.title,
          strategyTone: data.strategy.tone || null,
          wordCount: data.draft.wordCount || null,
          user: { connect: { id: defaultUserId } },
        },
      })

      return {
        projectId: project.id,
        topicId: topic.id,
        originalDraftId,
        finalDraftId,
        draftVersion: _isFirstSave
          ? (data.refineData && data.originalDraft ? getRefinedDraftVersion() : getOriginalDraftVersion())
          : getNextDraftVersion(existingVersions),
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        projectId: result.projectId,
        topicId: result.topicId,
        draftVersion: result.draftVersion,
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
