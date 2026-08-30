'use client'

import { useState, useCallback } from 'react'

interface WritingInput {
  topic: string
  strategy: {
    title: string
    hook: string
    structure: Array<{
      section: string
      purpose: string
      keyArguments: string[]
      estimatedWords: number
    }>
    keyArguments: string[]
    emotionalArc: { start: string; middle: string; end: string }
    callToAction: string
    tone: string
    estimatedWordCount: number
  }
  selectedAngle: {
    title: string
    angle: string
    targetEmotion: string
    keyPoints: string[]
  }
  platform?: string
  tone?: string
  wordCount?: number
  persona?: {
    name: string
    description: string | null
  }
}

interface WritingOutput {
  title: string
  content: string
  hook: string
  wordCount: number
  sections: Array<{ section: string; content: string }>
}

export function useWriting() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<WritingOutput | null>(null)

  const generate = useCallback(async (input: WritingInput) => {
    setLoading(true)
    setError(null)
    setDraft(null)

    try {
      const res = await fetch('/api/generation/writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '写作失败')
      }

      setDraft(data.data as WritingOutput)
      return data.data as WritingOutput
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setDraft(null)
    setError(null)
  }, [])

  return { loading, error, draft, generate, reset }
}
