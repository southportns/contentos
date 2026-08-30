import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runEvaluation } from '@/skills/evaluation'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const maxDuration = 60

const inputSchema = z.object({
  content: z.string().min(1),
  title: z.string(),
  topicId: z.string().optional(),
  draftId: z.string().optional(),
  strategy: z
    .object({
      title: z.string(),
      keyArguments: z.array(z.string()),
      emotionalArc: z.object({
        start: z.string(),
        middle: z.string(),
        end: z.string(),
      }),
      callToAction: z.string(),
    })
    .optional(),
  selectedAngle: z
    .object({
      title: z.string(),
      targetEmotion: z.string(),
      keyPoints: z.array(z.string()),
    })
    .optional(),
  platform: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runEvaluation(input)

    // Persist to database
    if (isDatabaseConfigured() && input.topicId && input.draftId) {
      await safeDb(async () => {
        await contentService.saveEvaluation({
          draftId: input.draftId!,
          topicId: input.topicId!,
          emotionScore: result.scores.emotionalImpact,
          noveltyScore: result.scores.novelty,
          structureScore: result.scores.logicalClarity,
          readabilityScore: result.scores.readability,
          platformFitScore: result.scores.platformFit,
          overallScore: result.overallScore,
          strengths: result.strengths,
          issues: result.weaknesses,
          suggestions: result.suggestions,
        })
        await contentService.updateTopicStatus(
          input.topicId!,
          'EVALUATING',
        )
      }, 'evaluation-save')
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
