import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runAudienceAnalysis } from '@/skills/audience-analysis'

export const runtime = 'nodejs'
export const maxDuration = 60

const contentItemSchema = z.object({
  platform: z.string(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  metrics: z
    .object({
      comments: z.number().nullable(),
      likes: z.number().nullable(),
    })
    .nullable(),
})

const analysisInputSchema = z.object({
  contents: z.array(contentItemSchema).min(1),
  topicCategory: z.string().optional(),
  topicKeywords: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = analysisInputSchema.parse(body)

    const result = await runAudienceAnalysis(input)

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
