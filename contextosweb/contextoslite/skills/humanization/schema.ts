import { z } from 'zod'

export const humanizationInputSchema = z.object({
  content: z.string().min(1, '内容不能为空'),
  title: z.string().optional(),
  platform: z.string().optional(),
  tone: z.string().optional(),
})

export const changeTypeSchema = z.enum([
  'template',
  'empty',
  'parallel',
  'summary',
  'aivocab',
  'connector',
  'emostack',
  'quotebomb',
])

export const humanizationOutputSchema = z.object({
  content: z.string(),
  title: z.string(),
  changes: z.array(
    z.object({
      original: z.string(),
      revised: z.string(),
      reason: z.string(),
      type: changeTypeSchema,
    }),
  ),
  issues: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
    }),
  ),
  aiStyleScore: z.number().min(0).max(100),
  humanizedScore: z.number().min(0).max(100),
})

export type HumanizationInput = z.infer<typeof humanizationInputSchema>
export type HumanizationOutput = z.infer<typeof humanizationOutputSchema>
export type ChangeType = z.infer<typeof changeTypeSchema>
