import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runExpressionAudit } from '@/skills/expression-audit'

export const runtime = 'nodejs'
export const maxDuration = 120

const inputSchema = z.object({
  draft: z.string().min(1, '内容不能为空'),
  title: z.string().optional(),
  expressionPlan: z.any().optional(),
  strategy: z
    .object({
      title: z.string(),
      keyArguments: z.array(z.string()).optional(),
      callToAction: z.string().optional(),
    })
    .optional(),
  platform: z.string().optional(),
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

    const result = await runExpressionAudit(input)

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
