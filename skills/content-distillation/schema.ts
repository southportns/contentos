import { z } from 'zod'

export const distillationInputSchema = z.object({
  sourceContent: z.object({
    title: z.string().nullable(),
    content: z.string().min(1, '内容不能为空'),
    sourceType: z.string(), // article | report | book | essay | other
    fileName: z.string().nullable(),
  }),
  userIdea: z.string().min(1, '用户创作意图不能为空'),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  platform: z.string().optional(),
})

export const distillationOutputSchema = z.object({
  sourceAnalysis: z.object({
    coreTheme: z.string(),
    keyInsights: z.array(z.string()),
    contentStructure: z.array(z.string()),
    emotionalArc: z.object({
      start: z.string(),
      middle: z.string(),
      end: z.string(),
    }),
    memorableQuotes: z.array(z.string()),
    applicableAngles: z.array(z.string()),
    weaknesses: z.array(z.string()),
  }),
  distilledAngles: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      angle: z.string(),
      reasoning: z.string(),
      targetEmotion: z.string(),
      keyPoints: z.array(z.string()),
      whatExtracted: z.string(),
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

export type DistillationInput = z.infer<typeof distillationInputSchema>
export type DistillationOutput = z.infer<typeof distillationOutputSchema>
