import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runHumanization } from '@/skills/humanization'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const maxDuration = 120

const inputSchema = z.object({
  content: z.string().min(1, '内容不能为空'),
  title: z.string().optional(),
  topicId: z.string().optional(),
  platform: z.string().optional(),
  tone: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runHumanization(input)

    // Persist to database
    if (isDatabaseConfigured() && input.topicId) {
      await safeDb(async () => {
        await contentService.saveDraft({
          topicId: input.topicId!,
          title: result.title,
          content: result.content,
          wordCount: result.content.length,
          status: 'HUMANIZED',
        })
        await contentService.updateTopicStatus(
          input.topicId!,
          'OPTIMIZING',
        )
      }, 'humanization-save')
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
