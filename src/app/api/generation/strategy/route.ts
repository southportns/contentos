import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runContentStrategy } from '@/skills/content-strategy'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const maxDuration = 60

const inputSchema = z.object({
  topic: z.string().min(1),
  topicId: z.string().optional(),
  angleId: z.string().optional(),
  selectedAngle: z.object({
    id: z.string(),
    title: z.string(),
    angle: z.string(),
    targetEmotion: z.string(),
    keyPoints: z.array(z.string()),
  }),
  topicProfile: z
    .object({
      keywords: z.array(z.string()),
      coreQuestions: z.array(z.string()),
    })
    .optional(),
  audienceInsights: z
    .object({
      needs: z.array(z.string()),
      painPoints: z.array(z.string()),
    })
    .optional(),
  platform: z.string().optional(),
  contentType: z.string().optional(),
  tone: z.string().optional(),
  wordCount: z.number().int().positive().optional(),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runContentStrategy(input)

    // Persist to database
    if (isDatabaseConfigured() && input.topicId) {
      await safeDb(async () => {
        await contentService.saveStrategy({
          topicId: input.topicId!,
          angleId: input.angleId,
          coreThesis: result.title,
          hookStrategy: result.hook,
          contentStructure: result.structure,
          ctaStrategy: result.callToAction,
          targetEmotion: input.selectedAngle.targetEmotion,
          targetAudience: undefined,
        })
        await contentService.updateTopicStatus(input.topicId!, 'STRATEGY')
      }, 'content-strategy-save')
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
