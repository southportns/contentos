import { z } from 'zod'

// ─── P0.3.9.1 — Structured Context Types ─────────────────────────────────

/**
 * Evaluation context distilled for Refine consumption.
 * Deliberately small — only carries what Refine needs.
 * Not a 1:1 copy of the Evaluation DB model.
 */
export const refineEvaluationContextSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string().optional(),
      section: z.string(),
      issue: z.string(),
      suggestion: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    }),
  ),
  weaknesses: z.array(z.string()),
  scores: z
    .object({
      emotionalImpact: z.number().optional(),
      logicalClarity: z.number().optional(),
      novelty: z.number().optional(),
      readability: z.number().optional(),
      utility: z.number().optional(),
      platformFit: z.number().optional(),
    })
    .optional(),
})

/**
 * Risk context distilled for Refine consumption.
 * Does NOT expose the raw RiskAnalysis DB model.
 */
export const refineRiskContextSchema = z.object({
  overallRiskLevel: z.enum(['safe', 'low', 'medium', 'high']).optional(),
  risks: z.array(
    z.object({
      id: z.string().optional(),
      category: z.string(),
      description: z.string().optional(),
      suggestion: z.string().optional(),
      severity: z.enum(['high', 'medium', 'low']).optional(),
    }),
  ),
})

/**
 * Approved Strategy as constraint for Refine.
 * Refine may optimise expression but must NOT destroy approved strategic elements.
 */
export const refineApprovedStrategySchema = z.object({
  title: z.string().optional(),
  keyArguments: z.array(z.string()).optional(),
  emotionalArc: z
    .object({
      start: z.string().optional(),
      middle: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  callToAction: z.string().optional(),
  tone: z.string().optional(),
  selectedAngleTitle: z.string().optional(),
})

// ─── Refine Input Schema ──────────────────────────────────────────────────

export const refineInputSchema = z.object({
  // 原始初稿
  content: z.string().min(1, '内容不能为空'),
  title: z.string(),
  hook: z.string(),
  wordCount: z.number(),

  // 精修模式（P0.3.9.1: +issue_fix, +humanize）
  mode: z.enum([
    'tone_change',
    'hook_select',
    'title_select',
    'hook_and_title_select',
    'issue_fix',
    'humanize',
  ]),

  // 语气修改
  toneChange: z
    .object({
      newTone: z.string().min(1),
    })
    .optional(),

  // 黄金三秒钩子
  hookSelect: z
    .object({
      candidates: z.array(z.string()),
      selectedIndex: z.number().int().min(0),
    })
    .optional(),

  // 标题选定
  titleSelect: z
    .object({
      candidates: z.array(z.string()),
      selectedIndex: z.number().int().min(0),
    })
    .optional(),

  // 上下文
  platform: z.string().optional(),
  topic: z.string().optional(),
  selectedAngleTitle: z.string().optional(),

  // ── P0.3.9.1 New optional structured contexts ──
  evaluationContext: refineEvaluationContextSchema.optional(),
  riskContext: refineRiskContextSchema.optional(),
  approvedStrategy: refineApprovedStrategySchema.optional(),
  persona: z.string().optional(),
})

// ─── Refine Output Schema ─────────────────────────────────────────────────

const refineChangeSchema = z.object({
  type: z.enum([
    'hook_replaced',
    'title_replaced',
    'tone_change',
    'candidates_generated',
    'hook_generated',
    'title_generated',
    'issue_fix',
    'humanization',
  ]),
  original: z.string(),
  revised: z.string(),
  reason: z.string(),
  linkedIssueId: z.string().optional(),
  confidence: z.number().optional(),
})

export const refineOutputSchema = z.object({
  content: z.string(),
  title: z.string(),
  hook: z.string(),
  wordCount: z.number(),
  changes: z.array(refineChangeSchema),
  hookCandidates: z.array(z.string()).optional(),
  titleCandidates: z.array(z.string()).optional(),
  summary: z.string(),

  // ── P0.3.9.1 New optional output fields ──
  resolvedIssues: z
    .array(
      z.object({
        issueId: z.string(),
        resolution: z.string(),
        changeId: z.string().optional(),
      }),
    )
    .optional(),
  unresolvedIssues: z
    .array(
      z.object({
        issueId: z.string(),
        reason: z.string(),
        suggestion: z.string(),
      }),
    )
    .optional(),
  preservedElements: z
    .array(
      z.object({
        element: z.string(),
        reason: z.string(),
      }),
    )
    .optional(),
})

// 紧凑输出模式 — 用于 hook/title 候选生成，不返回完整内容
export const compactCandidateOutputSchema = z.object({
  hookCandidates: z.array(z.string()).optional(),
  titleCandidates: z.array(z.string()).optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────

export type RefineInput = z.infer<typeof refineInputSchema>
export type RefineOutput = z.infer<typeof refineOutputSchema>
export type RefineEvaluationContext = z.infer<typeof refineEvaluationContextSchema>
export type RefineRiskContext = z.infer<typeof refineRiskContextSchema>
export type RefineApprovedStrategyContext = z.infer<typeof refineApprovedStrategySchema>
export type RefineChange = z.infer<typeof refineChangeSchema>
export type RefineMode = RefineInput['mode']
