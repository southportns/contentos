import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runWriting } from '@/skills/writing'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const maxDuration = 120

const inputSchema = z.object({
  topic: z.string().min(1),
  topicId: z.string().optional(),
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
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runWriting(input)

    // Persist to database
    if (isDatabaseConfigured() && input.topicId) {
      await safeDb(async () => {
        const { id } = await contentService.saveDraft({
          topicId: input.topicId!,
          title: result.title,
          content: result.content,
          outline: result.sections,
          wordCount: result.wordCount,
          status: 'DRAFT',
        })
        await contentService.updateTopicStatus(input.topicId!, 'WRITING')
        // Return draft ID in the response for evaluation to use
        return id
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
