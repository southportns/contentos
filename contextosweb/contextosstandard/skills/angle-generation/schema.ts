import { z } from 'zod'

export const angleGenerationInputSchema = z.object({
  topic: z.string().min(1, '主题不能为空'),
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
        z.object({
          emotion: z.string(),
          intensity: z.number(),
        }),
      ),
      contentGaps: z.array(z.string()),
    })
    .optional(),
  count: z.number().int().default(5),
})

export const angleGenerationOutputSchema = z.object({
  angles: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      angle: z.string(),
      reasoning: z.string(),
      targetEmotion: z.string(),
      estimatedViralScore: z.number(),
      difficulty: z.enum(['low', 'medium', 'high']),
      keyPoints: z.array(z.string()),
      audienceAppeal: z.string(),
    }),
  ),
})

export type AngleGenerationInput = z.infer<typeof angleGenerationInputSchema>
export type AngleGenerationOutput = z.infer<typeof angleGenerationOutputSchema>
export type ContentAngle = AngleGenerationOutput['angles'][number]
