'use client'

import { useState, useCallback } from 'react'

interface RefineChange {
  type: string
  original: string
  revised: string
  reason: string
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
}

type RefineMode = 'tone_change' | 'hook_select' | 'title_select'

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
