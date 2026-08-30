import { z } from 'zod'

export const riskAnalysisInputSchema = z.object({
  content: z.string().min(1, '内容不能为空'),
  title: z.string(),
  platform: z.string().optional(),
})

export const riskAnalysisOutputSchema = z.object({
  risks: z.array(
    z.object({
      category: z.enum([
        'political_sensitive',
        'social_sensitive',
        'personal_privacy',
        'misinformation',
        'hate_speech',
        'commercial_compliance',
        'platform_violation',
        'legal_risk',
      ]),
      severity: z.enum(['high', 'medium', 'low']),
      description: z.string(),
      suggestion: z.string(),
      quote: z.string().optional(),
    }),
  ),
  overallRiskLevel: z.enum(['high', 'medium', 'low', 'safe']),
  summary: z.string(),
})

export type RiskAnalysisInput = z.infer<typeof riskAnalysisInputSchema>
export type RiskAnalysisOutput = z.infer<typeof riskAnalysisOutputSchema>
