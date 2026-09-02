import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runRefine } from '@/skills/refine'

export const runtime = 'nodejs'
export const maxDuration = 120

const inputSchema = z.object({
  content: z.string().min(1, '内容不能为空'),
  title: z.string(),
  hook: z.string(),
  wordCount: z.number(),
  mode: z.enum(['tone_change', 'hook_select', 'title_select', 'hook_and_title_select']),
  toneChange: z
    .object({
      newTone: z.string().min(1),
    })
    .optional(),
  hookSelect: z
    .object({
      candidates: z.array(z.string()),
      selectedIndex: z.number().int().min(0),
    })
    .optional(),
  titleSelect: z
    .object({
      candidates: z.array(z.string()),
      selectedIndex: z.number().int().min(0),
    })
    .optional(),
  platform: z.string().optional(),
  topic: z.string().optional(),
  selectedAngleTitle: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runRefine(input)

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
