import { z } from 'zod'
import { expressionPlanSchema } from '@/lib/expression/schema'

// Re-export for convenience
export const expressionPlanningOutputSchema = expressionPlanSchema

// Input schema — matches ExpressionPlanningInput type
export const expressionPlanningInputSchema = z.object({
  topic: z.string().min(1, '主题不能为空'),
  selectedAngle: z.object({
    title: z.string(),
    angle: z.string(),
    targetEmotion: z.string().optional(),
    keyPoints: z.array(z.string()).optional(),
  }),
  strategy: z.object({
    title: z.string(),
    hook: z.string().optional(),
    callToAction: z.string().optional(),
    tone: z.string().optional(),
    emotionalArc: z
      .object({
        start: z.string(),
        middle: z.string(),
        end: z.string(),
      })
      .optional(),
    keyArguments: z.array(z.string()).optional(),
  }),
  platform: z.string().optional(),
  contentType: z.string().optional(),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  audience: z.string().optional(),
  emotionArc: z
    .object({
      start: z.string(),
      middle: z.string(),
      end: z.string(),
    })
    .optional(),
})

export type ExpressionPlanningInput = z.infer<typeof expressionPlanningInputSchema>
export type ExpressionPlanningOutput = z.infer<typeof expressionPlanningOutputSchema>
