import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runRefine } from '@/skills/refine'

export const runtime = 'nodejs'
export const maxDuration = 120

// ─── P0.3.9.1: Extended API schema — all new fields are optional ──────────
// Backward compatible: old requests without new fields still succeed.

const evaluationContextSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string().optional(),
      section: z.string(),
      issue: z.string(),
      suggestion: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    }),
  ),
  weaknesses: z.array(z.string()),
  scores: z
    .object({
      emotionalImpact: z.number().optional(),
      logicalClarity: z.number().optional(),
      novelty: z.number().optional(),
      readability: z.number().optional(),
      utility: z.number().optional(),
      platformFit: z.number().optional(),
    })
    .optional(),
})

const riskContextSchema = z.object({
  overallRiskLevel: z.enum(['safe', 'low', 'medium', 'high']).optional(),
  risks: z.array(
    z.object({
      id: z.string().optional(),
      category: z.string(),
      description: z.string().optional(),
      suggestion: z.string().optional(),
      severity: z.enum(['high', 'medium', 'low']).optional(),
    }),
  ),
})

const approvedStrategySchema = z.object({
  title: z.string().optional(),
  keyArguments: z.array(z.string()).optional(),
  emotionalArc: z
    .object({
      start: z.string().optional(),
      middle: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  callToAction: z.string().optional(),
  tone: z.string().optional(),
  selectedAngleTitle: z.string().optional(),
})

const inputSchema = z.object({
  content: z.string().min(1, '内容不能为空'),
  title: z.string(),
  hook: z.string(),
  wordCount: z.number(),
  mode: z.enum([
    'tone_change',
    'hook_select',
    'title_select',
    'hook_and_title_select',
    'issue_fix',
    'humanize',
  ]),
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
  // ── P0.3.9.1 New optional fields ──
  evaluationContext: evaluationContextSchema.optional(),
  riskContext: riskContextSchema.optional(),
  approvedStrategy: approvedStrategySchema.optional(),
  persona: z.string().optional(),
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
