'use client'

import { useState, useCallback } from 'react'

interface RiskAnalysisInput {
  content: string
  title: string
  platform?: string
}

export interface RiskItem {
  category: 'political_sensitive' | 'social_sensitive' | 'personal_privacy' | 'misinformation' | 'hate_speech' | 'commercial_compliance' | 'platform_violation' | 'legal_risk'
  severity: 'high' | 'medium' | 'low'
  description: string
  suggestion: string
  quote?: string
}

export interface RiskAnalysisResult {
  risks: RiskItem[]
  overallRiskLevel: 'safe' | 'low' | 'medium' | 'high'
  summary: string
}
export function useRiskAnalysis() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RiskAnalysisResult | null>(null)

  const analyze = useCallback(async (input: RiskAnalysisInput) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/analysis/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '风险分析失败')
      }

      setResult(data.data as RiskAnalysisResult)
      return data.data as RiskAnalysisResult
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

  return { loading, error, result, analyze, reset }
}
