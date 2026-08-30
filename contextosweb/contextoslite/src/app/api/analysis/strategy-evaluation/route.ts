import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runStrategyEvaluation, resolvePlatform } from '@/skills/strategy-evaluation'
import { platformConfigs } from '@/skills/strategy-evaluation/schema'

export const runtime = 'nodejs'
export const maxDuration = 120

const inputSchema = z.object({
  platform: z.string(),
  topic: z.string().min(1),
  audienceDescription: z.string().optional(),
  angle: z
    .object({
      title: z.string(),
      angle: z.string(),
      targetEmotion: z.string(),
      keyPoints: z.array(z.string()),
    })
    .optional(),
  strategy: z
    .object({
      title: z.string(),
      hook: z.string(),
      structure: z.array(
        z.object({
          section: z.string(),
          purpose: z.string(),
          keyArguments: z.array(z.string()),
          estimatedWords: z.number(),
        }),
      ),
      emotionalArc: z.object({
        start: z.string(),
        middle: z.string(),
        end: z.string(),
      }),
      callToAction: z.string(),
      tone: z.string(),
    })
    .optional(),
  draft: z.object({
    title: z.string(),
    content: z.string().min(1),
    wordCount: z.number().optional(),
  }),
  researchData: z
    .object({
      contents: z.array(
        z.object({
          platform: z.string(),
          title: z.string().nullable(),
          viralScore: z.number().optional(),
        }),
      ),
      audienceInsights: z
        .object({
          needs: z.array(z.string()),
          painPoints: z.array(z.string()),
        })
        .optional(),
    })
    .optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    // Resolve platform string to enum
    const platform = resolvePlatform(input.platform)

    const result = await runStrategyEvaluation({
      ...input,
      platform,
    })

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

// ─── GET: return platform scoring configs ───────────────

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      platforms: Object.fromEntries(
        Object.entries(platformConfigs).map(([key, config]) => [
          key,
          {
            name: config.name,
            displayName: config.displayName,
            coreGoals: config.coreGoals,
            weights: config.weights,
            dimensions: Object.entries(config.dimensionDetails).map(
              ([dim, detail]) => ({
                key: dim,
                description: detail.description,
                evaluationPoints: detail.evaluationPoints,
              }),
            ),
          },
        ]),
      ),
    },
  })
}
