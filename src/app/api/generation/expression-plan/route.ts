import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runExpressionPlanning } from '@/skills/expression-planning'

export const runtime = 'nodejs'
export const maxDuration = 120

const inputSchema = z.object({
  topic: z.string().min(1),
  selectedAngle: z.object({
    title: z.string(),
    angle: z.string(),
    targetEmotion: z.string().optional(),
    keyPoints: z.array(z.string()).optional(),
  }),
  strategy: z.object({
    title: z.string(),
    hook: z.string().optional(),
    callToAction: z.string().optional(),
    tone: z.string().optional(),
    emotionalArc: z
      .object({
        start: z.string(),
        middle: z.string(),
        end: z.string(),
      })
      .optional(),
    keyArguments: z.array(z.string()).optional(),
  }),
  platform: z.string().optional(),
  contentType: z.string().optional(),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  emotionArc: z
    .object({
      start: z.string(),
      middle: z.string(),
      end: z.string(),
    })
    .optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runExpressionPlanning(input)

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
