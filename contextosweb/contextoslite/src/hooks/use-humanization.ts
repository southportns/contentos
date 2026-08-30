'use client'

import { useState, useCallback } from 'react'

interface HumanizationInput {
  content: string
  title?: string
  platform?: string
  tone?: string
}

interface HumanizationChange {
  original: string
  revised: string
  reason: string
  type:
    | 'template'
    | 'empty'
    | 'parallel'
    | 'summary'
    | 'aivocab'
    | 'connector'
    | 'emostack'
    | 'quotebomb'
}

interface HumanizationIssue {
  type: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

interface HumanizationOutput {
  content: string
  title: string
  changes: HumanizationChange[]
  issues: HumanizationIssue[]
  aiStyleScore: number
  humanizedScore: number
}

export function useHumanization() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<HumanizationOutput | null>(null)

  const humanize = useCallback(async (input: HumanizationInput) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/generation/humanization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '去AI味失败')
      }

      setResult(data.data as HumanizationOutput)
      return data.data as HumanizationOutput
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

  return { loading, error, result, humanize, reset }
}
