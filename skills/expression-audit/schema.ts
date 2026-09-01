import { z } from 'zod'
import { expressionAuditSchema } from '@/lib/expression/schema'

// Re-export for convenience
export const expressionAuditOutputSchema = expressionAuditSchema

// Input schema
export const expressionAuditInputSchema = z.object({
  draft: z.string().min(1, '内容不能为空'),
  title: z.string().optional(),
  expressionPlan: z.any().optional(), // ExpressionPlan JSON
  strategy: z
    .object({
      title: z.string(),
      keyArguments: z.array(z.string()).optional(),
      callToAction: z.string().optional(),
    })
    .optional(),
  platform: z.string().optional(),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  audience: z.string().optional(),
})

export type ExpressionAuditInput = z.infer<typeof expressionAuditInputSchema>
export type ExpressionAuditOutput = z.infer<typeof expressionAuditOutputSchema>
