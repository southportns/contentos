import { z } from 'zod'

export const evaluationInputSchema = z.object({
  content: z.string().min(1, '内容不能为空'),
  title: z.string(),
  strategy: z
    .object({
      title: z.string(),
      keyArguments: z.array(z.string()),
      emotionalArc: z.object({
        start: z.string(),
        middle: z.string(),
        end: z.string(),
      }),
      callToAction: z.string(),
    })
    .optional(),
  selectedAngle: z
    .object({
      title: z.string(),
      targetEmotion: z.string(),
      keyPoints: z.array(z.string()),
    })
    .optional(),
  platform: z.string().optional(),
})

export const evaluationOutputSchema = z.object({
  overallScore: z.number(),
  scores: z.object({
    emotionalImpact: z.number(),
    logicalClarity: z.number(),
    novelty: z.number(),
    readability: z.number(),
    utility: z.number(),
    platformFit: z.number(),
  }),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  suggestions: z.array(
    z.object({
      section: z.string(),
      issue: z.string(),
      suggestion: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    }),
  ),
  emotionalArcAnalysis: z.object({
    achieved: z.boolean(),
    analysis: z.string(),
  }),
  conclusion: z.string(),
})

export type EvaluationInput = z.infer<typeof evaluationInputSchema>
export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>
