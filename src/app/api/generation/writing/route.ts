import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runWriting } from '@/skills/writing'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'
import { retrieveKnowledgeContextForGeneration } from '@/knowledge/context'

export const runtime = 'nodejs'
export const maxDuration = 120

// P0.3.8.4.1 — Writing API requires strategyId for approval gate.
// The server loads the strategy from DB to verify approval status —
// it NEVER trusts client-provided approval status.
const inputSchema = z.object({
  topic: z.string().min(1),
  strategyId: z.string().min(1),
  strategy: z.object({
    title: z.string(),
    hook: z.string(),
    structure: z.array(
      z.object({
        section: z.string(),
        purpose: z.string(),
        keyArguments: z.array(z.string()),
        estimatedWords: z.number(),
      }),
    ),
    keyArguments: z.array(z.string()),
    emotionalArc: z.object({
      start: z.string(),
      middle: z.string(),
      end: z.string(),
    }),
    callToAction: z.string(),
    tone: z.string(),
    estimatedWordCount: z.number(),
  }),
  selectedAngle: z.object({
    title: z.string(),
    angle: z.string(),
    targetEmotion: z.string(),
    keyPoints: z.array(z.string()),
  }),
  platform: z.string().optional(),
  tone: z.string().optional(),
  wordCount: z.number().int().positive().optional(),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  // Expression Engine — optional audience summary
  audience: z.string().optional(),
  // Expression Engine — optional ExpressionPlan
  expressionPlan: z.any().optional(),
  /**
   * 原始素材内容（来自上传文件或提取的洞察）。
   * 提供时，文案必须基于这些事实，不得虚构数据、人物或细节。
   */
  originalContent: z
    .object({
      content: z.string().optional(),
      keyInsights: z.array(z.string()).optional(),
      memorableQuotes: z.array(z.string()).optional(),
    })
    .optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    // ── P0.3.8.4.1 — Strategy Approval Gate (CRITICAL SECURITY CHECK) ──
    // Server loads strategy from DB — NEVER trusts client-provided data.
    // Cases: pending, rejected, missing strategy, tampered payload → ALL BLOCKED
    if (isDatabaseConfigured()) {
      const strategy = await safeDb(
        () => contentService.getStrategyById(input.strategyId),
        'writing-gate-check',
      )

      // Missing strategy → NOT APPROVED (missing = not approved, never default-approve)
      if (!strategy) {
        return NextResponse.json(
          {
            success: false,
            error: 'STRATEGY_NOT_APPROVED',
            message: 'Strategy not found. Strategy must be generated and approved before writing.',
          },
          { status: 403 },
        )
      }

      // Strategy exists but not approved → BLOCKED
      if (strategy.approvalStatus !== 'approved') {
        return NextResponse.json(
          {
            success: false,
            error: 'STRATEGY_NOT_APPROVED',
            message: `Strategy is '${strategy.approvalStatus}'. Only 'approved' strategies can proceed to writing.`,
            currentStatus: strategy.approvalStatus,
          },
          { status: 403 },
        )
      }
    }

    // P0.3.7.5 — Knowledge Context orchestration:
    // Semantic Retrieval → KnowledgeContextBuilder → KnowledgeContext.
    // Retrieval failure degrades to null (pure LLM generation, never blocked).
    const knowledgeContext = await retrieveKnowledgeContextForGeneration(
      [input.topic, input.selectedAngle.title, input.selectedAngle.angle].join(' '),
    )

    const result = await runWriting({
      ...input,
      knowledgeContext: knowledgeContext ?? undefined,
    })

    // Persist to database (get topicId from the approved strategy)
    if (isDatabaseConfigured()) {
      await safeDb(async () => {
        // Get strategy to find topicId for draft persistence
        const strategy = await contentService.getStrategyById(input.strategyId)
        if (strategy) {
          const { id } = await contentService.saveDraft({
            topicId: strategy.topicId,
            title: result.title,
            content: result.content,
            outline: result.sections,
            wordCount: result.wordCount,
            status: 'DRAFT',
          })
          await contentService.updateTopicStatus(strategy.topicId, 'WRITING')
          // Return draft ID in the response for evaluation to use
          return id
        }
        return null
      }, 'writing-save')
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
