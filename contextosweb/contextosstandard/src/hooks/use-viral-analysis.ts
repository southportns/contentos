'use client'

import { useState, useCallback } from 'react'

interface ContentItem {
  platform: string
  url: string
  title: string | null
  content: string | null
  author: string | null
  publishedAt: string | null
  metrics: {
    likes: number | null
    comments: number | null
    shares: number | null
    favorites: number | null
    views: number | null
  } | null
}

interface ContentAnalysis {
  url: string
  platform: string
  viralScore: number
  emotionScore: number
  controversyScore: number
  noveltyScore: number
  utilityScore: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  keyFactors: string[]
}

interface ViralAnalysisResult {
  analyses: ContentAnalysis[]
  patterns: {
    commonStrengths: string[]
    commonWeaknesses: string[]
    viralFactors: string[]
    avgViralScore: number
    topContents: Array<{ url: string; viralScore: number }>
  }
}

export function useViralAnalysis() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ViralAnalysisResult | null>(null)

  const analyze = useCallback(
    async (contents: ContentItem[], topicCategory?: string) => {
      setLoading(true)
      setError(null)
      setResult(null)

      try {
        const res = await fetch('/api/analysis/viral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, topicCategory }),
        })

        const data = await res.json()

        if (!data.success) {
          throw new Error(data.error || '分析失败')
        }

        setResult(data.data as ViralAnalysisResult)
        return data.data as ViralAnalysisResult
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    loading,
    error,
    result,
    analyze,
    reset,
  }
}
