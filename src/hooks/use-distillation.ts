'use client'

import { useState, useCallback } from 'react'

interface DistillationInput {
  sourceContent: {
    title: string | null
    content: string
    sourceType: string
    fileName: string | null
  }
  userIdea: string
  persona?: {
    name: string
    description: string | null
  }
  platform?: string
}

interface DistillationResult {
  sourceAnalysis: {
    coreTheme: string
    keyInsights: string[]
    contentStructure: string[]
    emotionalArc: { start: string; middle: string; end: string }
    memorableQuotes: string[]
    applicableAngles: string[]
    weaknesses: string[]
  }
  distilledAngles: Array<{
    id: string
    title: string
    angle: string
    reasoning: string
    targetEmotion: string
    keyPoints: string[]
    whatExtracted: string
    estimatedViralScore: number
  }>
  strategySuggestion: {
    tone: string
    structure: Array<{ section: string; purpose: string; keyArguments: string[] }>
    hookStrategy: string
    ctaStrategy: string
  }
}

export function useDistillation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DistillationResult | null>(null)

  const generate = useCallback(async (input: DistillationInput) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/generation/distillation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '内容提炼失败')
      }

      setResult(data.data as DistillationResult)
      return data.data as DistillationResult
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

  return { loading, error, result, generate, reset }
}
