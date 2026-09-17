/**
 * P0.3.9.2 — Evaluation → Refine Issue Adapter
 *
 * Converts structured EvaluationResult into RefineIssue[] for the
 * Refine page's issue selection UI. High-priority issues are
 * pre-selected by default (user must still click "fix" to execute).
 */

import type { EvaluationResult, RiskAnalysisResult } from '@/hooks/use-workflow'

/**
 * RefineIssue — structured representation of an evaluation suggestion
 * for the Refine page's issue selection UI.
 */
export interface RefineIssue {
  /** Stable ID: uses evaluation suggestion index as fallback */
  id: string
  section: string
  issue: string
  suggestion: string
  priority: 'high' | 'medium' | 'low'
  selected: boolean
  resolved: boolean
}

/**
 * Convert EvaluationResult into RefineIssue[].
 *
 * - High-priority issues are pre-selected (selected: true).
 * - Medium/Low priority issues are not pre-selected.
 * - All issues start as unresolved.
 * - IDs are generated as `eval-{index}` since EvaluationResult
 *   suggestions don't have explicit IDs in the current schema.
 */
export function evaluationToRefineIssues(
  evaluation: EvaluationResult | null,
): RefineIssue[] {
  if (!evaluation) return []
  if (!evaluation.suggestions?.length) return []

  return evaluation.suggestions.map((sug, index) => {
    const id = `eval-${index}` satisfies string
    return {
      id,
      section: sug.section ?? '',
      issue: sug.issue ?? '',
      suggestion: sug.suggestion ?? '',
      priority: sug.priority ?? 'medium',
      selected: sug.priority === 'high',
      resolved: false,
    }
  })
}

/**
 * Build RefineEvaluationContext from selected RefineIssue[]
 * for the Refine API's evaluationContext field.
 */
export function selectedIssuesToEvaluationContext(
  issues: RefineIssue[],
): {
  suggestions: Array<{
    id?: string
    section: string
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
  weaknesses: string[]
  scores?: {
    emotionalImpact?: number
    logicalClarity?: number
    novelty?: number
    readability?: number
    utility?: number
    platformFit?: number
  }
} | null {
  const selected = issues.filter((i) => i.selected)
  if (selected.length === 0) return null

  // Weaknesses and scores need to come from the evaluation —
  // but this function only has issues. The caller must merge
  // evaluation-level context separately.
  return {
    suggestions: selected.map((i) => ({
      id: i.id,
      section: i.section,
      issue: i.issue,
      suggestion: i.suggestion,
      priority: i.priority,
    })),
    weaknesses: [],
  }
}

/**
 * Build RefineRiskContext from RiskAnalysisResult.
 */
export function riskAnalysisToRefineRiskContext(
  riskAnalysis: RiskAnalysisResult | null,
): {
  overallRiskLevel?: 'safe' | 'low' | 'medium' | 'high'
  risks: Array<{
    id?: string
    category: string
    description?: string
    suggestion?: string
    severity?: 'high' | 'medium' | 'low'
  }>
} | null {
  if (!riskAnalysis) return null

  return {
    overallRiskLevel: riskAnalysis.overallRiskLevel,
    risks: riskAnalysis.risks.map((r, idx) => ({
      id: `risk-${idx}`,
      category: r.category,
      description: r.description,
      suggestion: r.suggestion,
      severity: r.severity,
    })),
  }
}

/**
 * Toggle issue selection by id.
 */
export function toggleIssueSelection(
  issues: RefineIssue[],
  id: string,
): RefineIssue[] {
  return issues.map((issue) =>
    issue.id === id ? { ...issue, selected: !issue.selected } : issue,
  )
}

/**
 * Mark issues as resolved by id.
 */
export function markIssuesResolved(
  issues: RefineIssue[],
  resolvedIds: string[],
): RefineIssue[] {
  const resolvedSet = new Set(resolvedIds)
  return issues.map((issue) =>
    resolvedSet.has(issue.id) ? { ...issue, resolved: true } : issue,
  )
}

/**
 * Get all selected issues.
 */
export function getSelectedIssues(issues: RefineIssue[]): RefineIssue[] {
  return issues.filter((i) => i.selected)
}