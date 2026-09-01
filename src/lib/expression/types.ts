/**
 * Human Expression Engine — Data Types
 *
 * ExpressionPlan: 表达蓝图，决定作者如何思考和表达
 * ExpressionAudit: 表达审计结果，定位标准化表达问题
 * ExpressionRewrite: 定向重写指令和结果
 *
 * @see docs/HUMAN_EXPRESSION_ENGINE_SPEC.md
 * @see docs/P0.1_HUMAN_EXPRESSION_ENGINE_PROMPT.md
 */

// ─── ExpressionPlan v1.0 ──────────────────────────────────

export type ThoughtMode =
  | 'observation'
  | 'memory_trigger'
  | 'association'
  | 'question'
  | 'contradiction'
  | 'realization'
  | 'reflection'
  | 'self_correction'
  | 'digression'
  | 'return'

export type RhythmLevel = 'low' | 'medium' | 'high'

export type ExpressionLevel = 'low' | 'medium' | 'high'

export type OpeningMode =
  | 'observation'
  | 'question'
  | 'scene'
  | 'contradiction'
  | 'direct_statement'
  | 'personal_reflection'

export type ConclusionMode =
  | 'reflection'
  | 'open_ended'
  | 'echo'
  | 'question'
  | 'direct_takeaway'

export type Authority = 'low' | 'medium' | 'high'
export type EmotionalDistance = 'close' | 'medium' | 'distant'

export interface ThoughtStep {
  step: number
  mode: ThoughtMode
  purpose: string
}

export interface EmotionPoint {
  stage: string
  emotion: string
  intensity: number // 0-100
}

export interface RhythmPlan {
  sentenceVariance: RhythmLevel
  paragraphVariance: RhythmLevel
  shortSentencePreference: RhythmLevel
  pauseFrequency: RhythmLevel
}

export interface ExpressionProfile {
  oralness: ExpressionLevel
  specificity: ExpressionLevel
  reflection: ExpressionLevel
  imperfectionTolerance: ExpressionLevel
}

export interface ExpressionSpeaker {
  role?: string
  relationshipToAudience?: string
  authority?: Authority
  emotionalDistance?: EmotionalDistance
}

export interface ExpressionOpening {
  mode: OpeningMode
  instruction: string
}

export interface ExpressionConclusion {
  mode: ConclusionMode
  instruction: string
}

export interface ExpressionConstraints {
  mustPreserve: string[]
  avoidPatterns: string[]
  truthConstraints: string[]
}

export interface ExpressionPlan {
  version: '1.0'
  speaker: ExpressionSpeaker
  thoughtPath: ThoughtStep[]
  emotionCurve: EmotionPoint[]
  rhythm: RhythmPlan
  expression: ExpressionProfile
  opening: ExpressionOpening
  conclusion: ExpressionConclusion
  constraints: ExpressionConstraints
}

// ─── ExpressionAudit v1.0 ─────────────────────────────────

export type AuditIssueType =
  | 'formulaic'
  | 'generic'
  | 'abstract'
  | 'uniform_rhythm'
  | 'over_structured'
  | 'over_explained'
  | 'emotion_flat'
  | 'voice_drift'
  | 'thoughtless_transition'
  | 'fake_specificity'
  | 'repetitive_pattern'

export type AuditSeverity = 'low' | 'medium' | 'high'

export interface AuditIssueLocation {
  paragraphIndex?: number
  sentenceIndex?: number
  quote?: string
}

export interface ExpressionAuditIssue {
  id: string
  type: AuditIssueType
  severity: AuditSeverity
  location?: AuditIssueLocation
  diagnosis: string
  rewriteInstruction: string
}

export interface ExpressionAuditDimensions {
  naturalness: number // 0-100
  voiceConsistency: number
  specificity: number
  rhythm: number
  thoughtAuthenticity: number
  emotionalAuthenticity: number
}

export interface ExpressionAudit {
  version: '1.0'
  overallScore: number // 0-100
  dimensions: ExpressionAuditDimensions
  issues: ExpressionAuditIssue[]
  pass: boolean
}

// ─── ExpressionRewrite v1.0 ───────────────────────────────

export interface ExpressionRewriteResult {
  version: '1.0'
  revisedContent: string
  revisedTitle?: string
  changedSections: Array<{
    location: string
    issueId: string
    original: string
    revised: string
    reason: string
  }>
  summary: string
}

// ─── Expression Planning Input ────────────────────────────

export interface ExpressionPlanningInput {
  topic: string
  selectedAngle: {
    title: string
    angle: string
    targetEmotion?: string
    keyPoints?: string[]
  }
  strategy: {
    title: string
    hook?: string
    callToAction?: string
    tone?: string
    emotionalArc?: {
      start: string
      middle: string
      end: string
    }
    keyArguments?: string[]
  }
  platform?: string
  contentType?: string
  persona?: {
    name: string
    description: string | null
  }
  emotionArc?: {
    start: string
    middle: string
    end: string
  }
}

// ─── Expression Audit Input ────────────────────────────────

export interface ExpressionAuditInput {
  draft: string
  title?: string
  expressionPlan?: ExpressionPlan
  strategy?: {
    title: string
    keyArguments?: string[]
    callToAction?: string
  }
  platform?: string
  persona?: {
    name: string
    description: string | null
  }
}

// ─── Expression Rewrite Input ─────────────────────────────

export interface ExpressionRewriteInput {
  draft: string
  title?: string
  audit: ExpressionAudit
  expressionPlan?: ExpressionPlan
  strategy?: {
    title: string
    keyArguments?: string[]
    callToAction?: string
  }
  platform?: string
}

// ─── Scoring Weights ──────────────────────────────────────

export const DEFAULT_EXPRESSION_WEIGHTS = {
  naturalness: 0.25,
  voiceConsistency: 0.15,
  specificity: 0.15,
  rhythm: 0.15,
  thoughtAuthenticity: 0.15,
  emotionalAuthenticity: 0.15,
} as const

// ─── Config ────────────────────────────────────────────────

export const MAX_EXPRESSION_REWRITE_ROUNDS = 1

export const EXPRESSION_AUDIT_PASS_THRESHOLD = 70

export const EXPRESSION_AUDIT_HIGH_SEVERITY_BLOCKER = true
