'use client'

import { useState, useCallback } from 'react'

// ─── P0.3.9.1: Extended Refine Contract ─────────────────────────────────

interface RefineChange {
  type:
    | 'hook_replaced'
    | 'title_replaced'
    | 'tone_change'
    | 'candidates_generated'
    | 'hook_generated'
    | 'title_generated'
    | 'issue_fix'
    | 'humanization'
  original: string
  revised: string
  reason: string
  linkedIssueId?: string
  confidence?: number
}

interface RefineResult {
  content: string
  title: string
  hook: string
  wordCount: number
  changes: RefineChange[]
  hookCandidates?: string[]
  titleCandidates?: string[]
  summary: string
  // P0.3.9.1 New optional fields
  resolvedIssues?: Array<{
    issueId: string
    resolution: string
    changeId?: string
  }>
  unresolvedIssues?: Array<{
    issueId: string
    reason: string
    suggestion: string
  }>
  preservedElements?: Array<{
    element: string
    reason: string
  }>
}

type RefineMode =
  | 'tone_change'
  | 'hook_select'
  | 'title_select'
  | 'hook_and_title_select'
  | 'issue_fix'
  | 'humanize'

interface RefineEvaluationContext {
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
}

interface RefineRiskContext {
  overallRiskLevel?: 'safe' | 'low' | 'medium' | 'high'
  risks: Array<{
    id?: string
    category: string
    description?: string
    suggestion?: string
    severity?: 'high' | 'medium' | 'low'
  }>
}

interface RefineApprovedStrategyContext {
  title?: string
  keyArguments?: string[]
  emotionalArc?: {
    start?: string
    middle?: string
    end?: string
  }
  callToAction?: string
  tone?: string
  selectedAngleTitle?: string
}

interface RefineInput {
  content: string
  title: string
  hook: string
  wordCount: number
  mode: RefineMode
  toneChange?: { newTone: string }
  hookSelect?: { candidates: string[]; selectedIndex: number }
  titleSelect?: { candidates: string[]; selectedIndex: number }
  platform?: string
  topic?: string
  selectedAngleTitle?: string
  // P0.3.9.1 New optional fields
  evaluationContext?: RefineEvaluationContext
  riskContext?: RefineRiskContext
  approvedStrategy?: RefineApprovedStrategyContext
  persona?: string
}

export function useRefine() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RefineResult | null>(null)

  const refine = useCallback(async (input: RefineInput) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/generation/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '精修失败')
      }

      setResult(data.data as RefineResult)
      return data.data as RefineResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { loading, error, result, refine, reset }
}
