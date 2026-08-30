'use client'

import { useState, useCallback } from 'react'

interface StrategyEvaluationInput {
  platform: string
  topic: string
  audienceDescription?: string
  angle?: {
    title: string
    angle: string
    targetEmotion: string
    keyPoints: string[]
  }
  strategy?: {
    title: string
    hook: string
    structure: Array<{
      section: string
      purpose: string
      keyArguments: string[]
      estimatedWords: number
    }>
    emotionalArc: { start: string; middle: string; end: string }
    callToAction: string
    tone: string
  }
  draft: {
    title: string
    content: string
    wordCount?: number
  }
  researchData?: {
    contents: Array<{
      platform: string
      title: string | null
      viralScore?: number
    }>
    audienceInsights?: {
      needs: string[]
      painPoints: string[]
    }
  }
}

interface ImprovementPriority {
  priority: number
  problem: string
  reason: string
  suggestion: string
}

interface StrategyEvaluationOutput {
  platform: string
  overallScore: number
  grade: 'exceptional' | 'strong' | 'good' | 'average' | 'poor'
  scores: Record<string, number>
  platformFit: number
  strategyConsistency: number
  strengths: string[]
  weaknesses: string[]
  criticalIssues: string[]
  improvementPriorities: ImprovementPriority[]
  shareAnalysis: {
    motivation: string
    target: string
    context: string
  }
  aiStyleRisk: number
  authenticityScore: number
  evidenceQuality: number
  confidence: number
  verdict: string
}

export function useStrategyEvaluation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StrategyEvaluationOutput | null>(null)

  const evaluate = useCallback(async (input: StrategyEvaluationInput) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/analysis/strategy-evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '策略评分失败')
      }

      setResult(data.data as StrategyEvaluationOutput)
      return data.data as StrategyEvaluationOutput
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

  return { loading, error, result, evaluate, reset }
}
