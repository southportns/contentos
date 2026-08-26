'use client'

import { useState, useCallback } from 'react'

interface EvaluationInput {
  content: string
  title: string
  strategy?: {
    title: string
    keyArguments: string[]
    emotionalArc: { start: string; middle: string; end: string }
    callToAction: string
  }
  selectedAngle?: {
    title: string
    targetEmotion: string
    keyPoints: string[]
  }
  platform?: string
}

interface EvaluationOutput {
  overallScore: number
  scores: {
    emotionalImpact: number
    logicalClarity: number
    novelty: number
    readability: number
    utility: number
    platformFit: number
  }
  strengths: string[]
  weaknesses: string[]
  suggestions: Array<{
    section: string
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
  emotionalArcAnalysis: {
    achieved: boolean
    analysis: string
  }
  conclusion: string
}

export function useEvaluation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EvaluationOutput | null>(null)

  const evaluate = useCallback(async (input: EvaluationInput) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '评估失败')
      }

      setResult(data.data as EvaluationOutput)
      return data.data as EvaluationOutput
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
