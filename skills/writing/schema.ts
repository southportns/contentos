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
  // Expression Engine — optional audience summary for latent context
  audience: z.string().optional(),
  // Expression Engine — optional ExpressionPlan for expression-guided writing
  expressionPlan: z.any().optional(),
  /**
   * 原始素材内容（来自上传文件或提取的洞察）。
   * 提供时，文案必须基于这些事实，不得虚构数据、人物或细节。
   */
  originalContent: z
    .object({
      content: z.string().optional(),
      keyInsights: z.array(z.string()).optional(),
      memorableQuotes: z.array(z.string()).optional(),
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
