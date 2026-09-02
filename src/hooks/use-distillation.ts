'use client'

import { useState, useCallback, useRef } from 'react'

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

/**
 * Progress state for long-running distillation task.
 * Since LLM APIs don't return real progress, we simulate phased progress
 * based on elapsed time vs estimated total duration.
 */
export interface DistillationProgress {
  progress: number  // 0-100
  stage: string     // human-readable stage label
}

export function useDistillation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DistillationResult | null>(null)
  const [progress, setProgress] = useState<DistillationProgress>({ progress: 0, stage: '' })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const resetProgress = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setProgress({ progress: 0, stage: '' })
    startTimeRef.current = 0
  }, [])

  const generate = useCallback(async (input: DistillationInput) => {
    setLoading(true)
    setError(null)
    setResult(null)
    resetProgress()

    // Start simulated progress (estimated 90s for full distillation)
    startTimeRef.current = Date.now()
    const ESTIMATED_DURATION_MS = 90_000

    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current
      const ratio = elapsed / ESTIMATED_DURATION_MS

      let newProgress: number
      let newStage: string

      if (ratio < 0.05) {
        newProgress = ratio / 0.05 * 10
        newStage = '准备中...'
      } else if (ratio < 0.2) {
        newProgress = 10 + (ratio - 0.05) / 0.15 * 20
        newStage = '分析内容结构...'
      } else if (ratio < 0.85) {
        newProgress = 30 + (ratio - 0.2) / 0.65 * 55
        newStage = '生成创作角度...'
      } else if (ratio < 1.0) {
        newProgress = 85 + (ratio - 0.85) / 0.15 * 14
        newStage = '即将完成...'
      } else {
        newProgress = 99
        newStage = '处理中...'
      }

      setProgress({ progress: newProgress, stage: newStage })
    }

    setProgress({ progress: 0, stage: '准备中...' })
    intervalRef.current = setInterval(updateProgress, 500)

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

      // Complete progress
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setProgress({ progress: 100, stage: '完成' })

      setResult(data.data as DistillationResult)
      return data.data as DistillationResult
    } catch (err) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [resetProgress])

  const reset = useCallback(() => {
    resetProgress()
    setResult(null)
    setError(null)
  }, [resetProgress])

  return { loading, error, result, progress, generate, reset }
}
