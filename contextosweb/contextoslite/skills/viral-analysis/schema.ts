import { z } from 'zod'

export const viralAnalysisInputSchema = z.object({
  contents: z.array(
    z.object({
      platform: z.string(),
      url: z.string(),
      title: z.string().nullable(),
      content: z.string().nullable(),
      author: z.string().nullable(),
      publishedAt: z.string().nullable(),
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
  ),
  topicCategory: z.string().optional(),
})

export const contentAnalysisSchema = z.object({
  url: z.string(),
  platform: z.string(),
  viralScore: z.number(),
  emotionScore: z.number(),
  controversyScore: z.number(),
  noveltyScore: z.number(),
  utilityScore: z.number(),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  keyFactors: z.array(z.string()),
})

export const viralAnalysisOutputSchema = z.object({
  analyses: z.array(contentAnalysisSchema),
  patterns: z.object({
    commonStrengths: z.array(z.string()),
    commonWeaknesses: z.array(z.string()),
    viralFactors: z.array(z.string()),
    avgViralScore: z.number(),
    topContents: z.array(
      z.object({
        url: z.string(),
        viralScore: z.number(),
      }),
    ),
  }),
})

export type ViralAnalysisInput = z.infer<typeof viralAnalysisInputSchema>
export type ViralAnalysisOutput = z.infer<typeof viralAnalysisOutputSchema>
export type ContentAnalysis = z.infer<typeof contentAnalysisSchema>
