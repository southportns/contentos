/**
 * Human Expression Engine — Zod Schemas
 *
 * Runtime validation schemas for all Expression Engine data structures.
 * Uses Zod to match the project's existing validation pattern.
 *
 * @see docs/HUMAN_EXPRESSION_ENGINE_SPEC.md
 */

import { z } from 'zod'

// ─── ExpressionPlan Schema ────────────────────────────────

export const thoughtModeSchema = z.enum([
  'observation',
  'memory_trigger',
  'association',
  'question',
  'contradiction',
  'realization',
  'reflection',
  'self_correction',
  'digression',
  'return',
])

export const rhythmLevelSchema = z.enum(['low', 'medium', 'high'])

export const expressionLevelSchema = z.enum(['low', 'medium', 'high'])

export const openingModeSchema = z.enum([
  'observation',
  'question',
  'scene',
  'contradiction',
  'direct_statement',
  'personal_reflection',
])

export const conclusionModeSchema = z.enum([
  'reflection',
  'open_ended',
  'echo',
  'question',
  'direct_takeaway',
])

export const thoughtStepSchema = z.object({
  step: z.number().int().min(1),
  mode: thoughtModeSchema,
  purpose: z.string().min(1),
})

export const emotionPointSchema = z.object({
  stage: z.string().min(1),
  emotion: z.string().min(1),
  intensity: z.number().min(0).max(100),
})

export const rhythmPlanSchema = z.object({
  sentenceVariance: rhythmLevelSchema,
  paragraphVariance: rhythmLevelSchema,
  shortSentencePreference: rhythmLevelSchema,
  pauseFrequency: rhythmLevelSchema,
})

export const expressionProfileSchema = z.object({
  oralness: expressionLevelSchema,
  specificity: expressionLevelSchema,
  reflection: expressionLevelSchema,
  imperfectionTolerance: expressionLevelSchema,
})

export const expressionSpeakerSchema = z.object({
  role: z.string().optional(),
  relationshipToAudience: z.string().optional(),
  authority: z.enum(['low', 'medium', 'high']).optional(),
  emotionalDistance: z.enum(['close', 'medium', 'distant']).optional(),
})

export const expressionOpeningSchema = z.object({
  mode: openingModeSchema,
  instruction: z.string().min(1),
})

export const expressionConclusionSchema = z.object({
  mode: conclusionModeSchema,
  instruction: z.string().min(1),
})

export const expressionConstraintsSchema = z.object({
  mustPreserve: z.array(z.string()),
  avoidPatterns: z.array(z.string()),
  truthConstraints: z.array(z.string()),
})

export const expressionPlanSchema = z.object({
  version: z.literal('1.0'),
  speaker: expressionSpeakerSchema,
  thoughtPath: z.array(thoughtStepSchema).min(1),
  emotionCurve: z.array(emotionPointSchema),
  rhythm: rhythmPlanSchema,
  expression: expressionProfileSchema,
  opening: expressionOpeningSchema,
  conclusion: expressionConclusionSchema,
  constraints: expressionConstraintsSchema,
})

// ─── ExpressionAudit Schema ───────────────────────────────

export const auditIssueTypeSchema = z.enum([
  'formulaic',
  'generic',
  'abstract',
  'uniform_rhythm',
  'over_structured',
  'over_explained',
  'emotion_flat',
  'voice_drift',
  'thoughtless_transition',
  'fake_specificity',
  'repetitive_pattern',
  'predictable_structure',
])

export const auditSeveritySchema = z.enum(['low', 'medium', 'high'])

export const auditIssueLocationSchema = z.object({
  paragraphIndex: z.number().int().optional(),
  sentenceIndex: z.number().int().optional(),
  quote: z.string().optional(),
})

export const expressionAuditIssueSchema = z.object({
  id: z.string().min(1),
  type: auditIssueTypeSchema,
  severity: auditSeveritySchema,
  location: auditIssueLocationSchema.optional(),
  diagnosis: z.string().min(1),
  rewriteInstruction: z.string().min(1),
})

export const expressionAuditDimensionsSchema = z.object({
  naturalness: z.number().min(0).max(100),
  voiceConsistency: z.number().min(0).max(100),
  specificity: z.number().min(0).max(100),
  rhythm: z.number().min(0).max(100),
  thoughtAuthenticity: z.number().min(0).max(100),
  emotionalAuthenticity: z.number().min(0).max(100),
  structuralNaturalness: z.number().min(0).max(100),
})

export const expressionAuditSchema = z.object({
  version: z.literal('1.0'),
  overallScore: z.number().min(0).max(100),
  dimensions: expressionAuditDimensionsSchema,
  issues: z.array(expressionAuditIssueSchema),
  pass: z.boolean(),
})

// ─── ExpressionRewrite Schema ─────────────────────────────

export const expressionRewriteResultSchema = z.object({
  version: z.literal('1.0'),
  revisedContent: z.string().min(1),
  revisedTitle: z.string().optional(),
  changedSections: z.array(
    z.object({
      location: z.string().min(1),
      issueId: z.string().min(1),
      original: z.string(),
      revised: z.string(),
      reason: z.string().min(1),
    }),
  ),
  summary: z.string().min(1),
})

// ─── Exported Types (inferred from Zod) ───────────────────

export type ExpressionPlanSchema = z.infer<typeof expressionPlanSchema>
export type ExpressionAuditSchema = z.infer<typeof expressionAuditSchema>
export type ExpressionRewriteResultSchema = z.infer<typeof expressionRewriteResultSchema>

// ─── Validation Helpers ───────────────────────────────────

/**
 * Validate an ExpressionPlan object. Returns true if valid.
 */
export function validateExpressionPlan(plan: unknown): boolean {
  const result = expressionPlanSchema.safeParse(plan)
  return result.success
}

/**
 * Validate an ExpressionAudit object. Returns true if valid.
 */
export function validateExpressionAudit(audit: unknown): boolean {
  const result = expressionAuditSchema.safeParse(audit)
  return result.success
}

/**
 * Validate an ExpressionRewriteResult object. Returns true if valid.
 */
export function validateExpressionRewriteResult(result: unknown): boolean {
  return expressionRewriteResultSchema.safeParse(result).success
}
