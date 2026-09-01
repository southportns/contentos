import { z } from 'zod'
import { expressionRewriteResultSchema } from '@/lib/expression/schema'

// Re-export for convenience
export const expressionRewriteOutputSchema = expressionRewriteResultSchema

// Input schema
export const expressionRewriteInputSchema = z.object({
  draft: z.string().min(1, '内容不能为空'),
  title: z.string().optional(),
  audit: z.any(), // ExpressionAudit JSON
  expressionPlan: z.any().optional(), // ExpressionPlan JSON
  strategy: z
    .object({
      title: z.string(),
      keyArguments: z.array(z.string()).optional(),
      callToAction: z.string().optional(),
    })
    .optional(),
  platform: z.string().optional(),
})

export type ExpressionRewriteInput = z.infer<typeof expressionRewriteInputSchema>
export type ExpressionRewriteOutput = z.infer<typeof expressionRewriteOutputSchema>
