'use client'

import { useState, useCallback } from 'react'

interface ContentAngle {
  id: string
  title: string
  angle: string
  reasoning: string
  targetEmotion: string
  estimatedViralScore: number
  difficulty: 'low' | 'medium' | 'high'
  keyPoints: string[]
  audienceAppeal: string
}

interface AngleGenerationResult {
  angles: ContentAngle[]
}

interface AngleGenerationInput {
  topic: string
  topicProfile: {
    category: string
    keywords: string[]
    coreQuestions: string[]
    potentialAngles: string[]
  }
  viralPatterns?: {
    commonStrengths: string[]
    viralFactors: string[]
    avgViralScore: number
  }
  audienceInsights?: {
    needs: string[]
    painPoints: string[]
    emotions: Array<{ emotion: string; intensity: number }>
    contentGaps: string[]
  }
  count?: number
}

export function useAngleGeneration() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [angles, setAngles] = useState<ContentAngle[]>([])
  const [selectedAngle, setSelectedAngle] = useState<ContentAngle | null>(null)

  const generate = useCallback(async (input: AngleGenerationInput) => {
    setLoading(true)
    setError(null)
    setAngles([])
    setSelectedAngle(null)

    try {
      const res = await fetch('/api/generation/angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, count: input.count ?? 5 }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '生成失败')
      }

      setAngles((data.data as AngleGenerationResult).angles)
      return (data.data as AngleGenerationResult).angles
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const selectAngle = useCallback((angle: ContentAngle) => {
    setSelectedAngle(angle)
  }, [])

  const reset = useCallback(() => {
    setAngles([])
    setSelectedAngle(null)
    setError(null)
  }, [])

  return {
    loading,
    error,
    angles,
    selectedAngle,
    generate,
    selectAngle,
    reset,
  }
}
