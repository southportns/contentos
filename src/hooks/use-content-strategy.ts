'use client'

import { useState, useCallback } from 'react'

interface SelectedAngle {
  id: string
  title: string
  angle: string
  targetEmotion: string
  keyPoints: string[]
}

interface ContentStrategyInput {
  topic: string
  selectedAngle: SelectedAngle
  topicProfile?: {
    keywords: string[]
    coreQuestions: string[]
  }
  audienceInsights?: {
    needs: string[]
    painPoints: string[]
  }
  platform?: string
  contentType?: string
  tone?: string
  wordCount?: number
  persona?: {
    name: string
    description: string | null
  }
  /**
   * 原始素材内容（来自上传文件或提取的洞察）。
   * 提供时，策略必须基于这些事实，不得虚构数据。
   */
  sourceContent?: {
    content?: string
    keyInsights?: string[]
    memorableQuotes?: string[]
  }
}

interface StrategySection {
  section: string
  purpose: string
  keyArguments: string[]
  estimatedWords: number
}

interface ContentStrategyOutput {
  title: string
  hook: string
  structure: StrategySection[]
  keyArguments: string[]
  emotionalArc: {
    start: string
    middle: string
    end: string
  }
  callToAction: string
  suggestedReferences: string[]
  tone: string
  estimatedWordCount: number
}

export function useContentStrategy() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<ContentStrategyOutput | null>(null)

  const generate = useCallback(async (input: ContentStrategyInput) => {
    setLoading(true)
    setError(null)
    setStrategy(null)

    try {
      const res = await fetch('/api/generation/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '生成失败')
      }

      setStrategy(data.data as ContentStrategyOutput)
      return data.data as ContentStrategyOutput
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setStrategy(null)
    setError(null)
  }, [])

  return {
    loading,
    error,
    strategy,
    generate,
    reset,
  }
}
