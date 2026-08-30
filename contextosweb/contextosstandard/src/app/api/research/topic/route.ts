import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runTopicResearch } from '@/skills/topic-research'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const maxDuration = 60

const topicInputSchema = z.object({
  topic: z.string().min(1, '主题不能为空'),
  projectId: z.string().optional(),
  platform: z.string().optional(),
  audience: z.string().optional(),
  contentType: z.string().optional(),
  goal: z.string().optional(),
  tone: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = topicInputSchema.parse(body)

    // Run the Skill
    const result = await runTopicResearch(input)

    // Persist to database (optional — gracefully degrades if DB not configured)
    let topicId: string | undefined

    if (isDatabaseConfigured() && input.projectId) {
      const id = await safeDb(async () => {
        const topic = await contentService.createTopic({
          projectId: input.projectId!,
          topic: input.topic,
          platform: input.platform,
          audience: input.audience,
          contentType: input.contentType,
          goal: input.goal,
          tone: input.tone,
        })
        await contentService.updateTopicStatus(topic.id, 'RESEARCHING')
        return topic.id
      }, 'topic-research-create')
      topicId = id ?? undefined
    }

    return NextResponse.json({
      success: true,
      data: result,
      topicId,
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
