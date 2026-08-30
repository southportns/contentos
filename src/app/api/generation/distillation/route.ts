import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runDistillation } from '@/skills/content-distillation'

export const runtime = 'nodejs'
export const maxDuration = 90

const inputSchema = z.object({
  sourceContent: z.object({
    title: z.string().nullable(),
    content: z.string().min(1, '内容不能为空'),
    sourceType: z.string(),
    fileName: z.string().nullable(),
  }),
  userIdea: z.string().min(1, '用户创作意图不能为空'),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  platform: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runDistillation(input)

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

    console.error('[API] Distillation failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
