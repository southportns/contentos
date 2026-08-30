import { z } from 'zod'

export const audienceAnalysisInputSchema = z.object({
  contents: z.array(
    z.object({
      platform: z.string(),
      title: z.string().nullable(),
      content: z.string().nullable(),
      metrics: z
        .object({
          comments: z.number().nullable(),
          likes: z.number().nullable(),
        })
        .nullable(),
    }),
  ),
  topicCategory: z.string().optional(),
  topicKeywords: z.array(z.string()).optional(),
})

export const audienceAnalysisOutputSchema = z.object({
  demographics: z.object({
    primaryAgeRange: z.string(),
    primaryGender: z.string(),
    secondaryAgeRange: z.string(),
    secondaryGender: z.string(),
  }),
  needs: z.array(z.string()),
  painPoints: z.array(z.string()),
  emotions: z.array(
    z.object({
      emotion: z.string(),
      intensity: z.number(),
      percentage: z.number(),
    }),
  ),
  behaviors: z.array(z.string()),
  preferences: z.array(z.string()),
  contentGaps: z.array(z.string()),
})

export type AudienceAnalysisInput = z.infer<typeof audienceAnalysisInputSchema>
export type AudienceAnalysisOutput = z.infer<typeof audienceAnalysisOutputSchema>
