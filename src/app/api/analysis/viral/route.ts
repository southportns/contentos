import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runViralAnalysis } from '@/skills/viral-analysis'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const maxDuration = 120

const metricsSchema = z.object({
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  favorites: z.number().nullable(),
  views: z.number().nullable(),
})

const contentItemSchema = z.object({
  platform: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  metrics: metricsSchema.nullable(),
})

const analysisInputSchema = z.object({
  contents: z.array(contentItemSchema).min(1),
  topicCategory: z.string().optional(),
  topicId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = analysisInputSchema.parse(body)

    const result = await runViralAnalysis(input)

    // Persist to database
    if (isDatabaseConfigured() && input.topicId) {
      await safeDb(async () => {
        await contentService.saveAnalysis({
          topicId: input.topicId!,
          analyses: result.analyses.map((a) => ({
            contentUrl: a.url,
            emotionScore: a.emotionScore,
            noveltyScore: a.noveltyScore,
            shareabilityScore: a.viralScore,
            viralScore: a.viralScore,
            reasoning: a.summary,
          })),
        })
        await contentService.updateTopicStatus(input.topicId!, 'ANALYZING')
      }, 'viral-analysis-save')
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
