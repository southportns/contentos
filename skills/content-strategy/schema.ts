import { z } from 'zod'

export const contentStrategyInputSchema = z.object({
  topic: z.string().min(1, '主题不能为空'),
  selectedAngle: z.object({
    id: z.string(),
    title: z.string(),
    angle: z.string(),
    targetEmotion: z.string(),
    keyPoints: z.array(z.string()),
  }),
  topicProfile: z
    .object({
      keywords: z.array(z.string()),
      coreQuestions: z.array(z.string()),
    })
    .optional(),
  audienceInsights: z
    .object({
      needs: z.array(z.string()),
      painPoints: z.array(z.string()),
    })
    .optional(),
  platform: z.string().optional(),
  contentType: z.string().optional(),
  tone: z.string().optional(),
  wordCount: z.number().int().optional(),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
})

export const contentStrategyOutputSchema = z.object({
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
  keyArguments: z.array(z.string()),
  emotionalArc: z.object({
    start: z.string(),
    middle: z.string(),
    end: z.string(),
  }),
  callToAction: z.string(),
  suggestedReferences: z.array(z.string()),
  tone: z.string(),
  estimatedWordCount: z.number(),
})

export type ContentStrategyInput = z.infer<typeof contentStrategyInputSchema>
export type ContentStrategyOutput = z.infer<typeof contentStrategyOutputSchema>
