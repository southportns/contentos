import { z } from 'zod'

export const writingInputSchema = z.object({
  topic: z.string().min(1, '主题不能为空'),
  strategy: z.object({
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
    tone: z.string(),
    estimatedWordCount: z.number(),
  }),
  selectedAngle: z.object({
    title: z.string(),
    angle: z.string(),
    targetEmotion: z.string(),
    keyPoints: z.array(z.string()),
  }),
  platform: z.string().optional(),
  tone: z.string().optional(),
  wordCount: z.number().int().positive().optional(),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
})

export const writingOutputSchema = z.object({
  title: z.string(),
  content: z.string(),
  hook: z.string(),
  wordCount: z.number(),
  sections: z.array(
    z.object({
      section: z.string(),
      content: z.string(),
    }),
  ),
})

export type WritingInput = z.infer<typeof writingInputSchema>
export type WritingOutput = z.infer<typeof writingOutputSchema>
