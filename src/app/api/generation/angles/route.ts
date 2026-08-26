import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runAngleGeneration } from '@/skills/angle-generation'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const maxDuration = 60

const inputSchema = z.object({
  topic: z.string().min(1),
  topicId: z.string().optional(),
  topicProfile: z.object({
    category: z.string(),
    keywords: z.array(z.string()),
    coreQuestions: z.array(z.string()),
    potentialAngles: z.array(z.string()),
  }),
  viralPatterns: z
    .object({
      commonStrengths: z.array(z.string()),
      viralFactors: z.array(z.string()),
      avgViralScore: z.number(),
    })
    .optional(),
  audienceInsights: z
    .object({
      needs: z.array(z.string()),
      painPoints: z.array(z.string()),
      emotions: z.array(
        z.object({ emotion: z.string(), intensity: z.number() }),
      ),
      contentGaps: z.array(z.string()),
    })
    .optional(),
  count: z.number().int().min(3).max(10).default(5),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    const result = await runAngleGeneration(input)

    // Persist to database
    if (isDatabaseConfigured() && input.topicId) {
      await safeDb(async () => {
        await contentService.saveAngles({
          topicId: input.topicId!,
          angles: result.angles.map((a) => ({
            title: a.title,
            coreThesis: a.angle,
            targetAudience: a.audienceAppeal,
            emotion: a.targetEmotion,
            noveltyScore: a.estimatedViralScore,
            relatabilityScore: 0,
            shareabilityScore: a.estimatedViralScore,
            risk: a.difficulty,
            supportingEvidence: a.reasoning,
          })),
        })
        await contentService.updateTopicStatus(
          input.topicId!,
          'ANGLE_SELECTION',
        )
      }, 'angle-generation-save')
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
