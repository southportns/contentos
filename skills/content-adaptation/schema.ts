import { z } from 'zod'

export const adaptationInputSchema = z.object({
  referenceContent: z.object({
    title: z.string().nullable(),
    content: z.string().nullable(),
    transcript: z.string().nullable(),
    platform: z.string(),
    author: z.string().nullable(),
    url: z.string().nullable(),
    metrics: z
      .object({
        likes: z.number().nullable(),
        comments: z.number().nullable(),
        shares: z.number().nullable(),
        favorites: z.number().nullable(),
        views: z.number().nullable(),
      })
      .nullable(),
  }),
  userIdea: z.string().min(1, '用户想法不能为空'),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  platform: z.string().optional(),
})

export const adaptationOutputSchema = z.object({
  referenceAnalysis: z.object({
    hookType: z.string(),
    contentStructure: z.array(z.string()),
    emotionalArc: z.object({
      start: z.string(),
      middle: z.string(),
      end: z.string(),
    }),
    keyPoints: z.array(z.string()),
    viralFactors: z.array(z.string()),
    weaknesses: z.array(z.string()),
  }),
  adaptedAngles: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      angle: z.string(),
      reasoning: z.string(),
      targetEmotion: z.string(),
      keyPoints: z.array(z.string()),
      whatChanged: z.string(),
      estimatedViralScore: z.number(),
    }),
  ),
  strategySuggestion: z.object({
    tone: z.string(),
    structure: z.array(
      z.object({
        section: z.string(),
        purpose: z.string(),
        keyArguments: z.array(z.string()),
      }),
    ),
    hookStrategy: z.string(),
    ctaStrategy: z.string(),
  }),
})

export type AdaptationInput = z.infer<typeof adaptationInputSchema>
export type AdaptationOutput = z.infer<typeof adaptationOutputSchema>
