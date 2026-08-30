import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runRiskAnalysis } from '@/skills/risk-analysis'

export const runtime = 'nodejs'
export const maxDuration = 60

const inputSchema = z.object({
  content: z.string().min(1, '内容不能为空'),
  title: z.string(),
  platform: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runRiskAnalysis(input)

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
