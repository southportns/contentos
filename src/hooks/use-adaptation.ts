'use client'

import { useState, useCallback, useRef } from 'react'

interface ReferenceContent {
  title: string | null
  content: string | null
  transcript: string | null
  platform: string
  author: string | null
  url: string | null
  metrics: {
    likes: number | null
    comments: number | null
    shares: number | null
    favorites: number | null
    views: number | null
  } | null
}

interface AdaptationInput {
  referenceContent: ReferenceContent
  userIdea: string
  persona?: {
    name: string
    description: string | null
  }
  platform?: string
  topicId?: string
}

interface AdaptationOutput {
  referenceAnalysis: {
    hookType: string
    contentStructure: string[]
    emotionalArc: { start: string; middle: string; end: string }
    keyPoints: string[]
    viralFactors: string[]
    weaknesses: string[]
  }
  adaptedAngles: Array<{
    id: string
    title: string
    angle: string
    reasoning: string
    targetEmotion: string
    keyPoints: string[]
    whatChanged: string
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
 * Partial result — accumulates as SSE events arrive.
 * referenceAnalysis + strategySuggestion come first (Phase A),
 * adaptedAngles come later (Phase B).
 */
type PartialResult = {
  referenceAnalysis?: AdaptationOutput['referenceAnalysis']
  strategySuggestion?: AdaptationOutput['strategySuggestion']
  adaptedAngles?: AdaptationOutput['adaptedAngles']
}

export function useAdaptation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AdaptationOutput | null>(null)
  const [partial, setPartial] = useState<PartialResult | null>(null)
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'angles' | 'done'>('idle')
  const abortRef = useRef<AbortController | null>(null)

  const generate = useCallback(async (input: AdaptationInput) => {
    setLoading(true)
    setError(null)
    setResult(null)
    setPartial(null)
    setPhase('analyzing')

    // Abort any previous request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/generation/adaptation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, stream: true }),
        signal: controller.signal,
      })

      // Fallback to non-stream if server doesn't support SSE
      if (!res.ok || !res.headers.get('Content-Type')?.includes('text/event-stream')) {
        const data = await res.json()
        if (!data.success) {
          throw new Error(data.error || '改编分析失败')
        }
        setResult(data.data as AdaptationOutput)
        setPhase('done')
        return data.data as AdaptationOutput
      }

      // ─── Parse SSE stream ──────────────────────────
      const reader = res.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      const decoder = new TextDecoder()
      let buffer = ''
      const finalResult: PartialResult = {}

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse complete SSE events (separated by \n\n)
        const events = buffer.split('\n\n')
        buffer = events.pop() || '' // Keep incomplete chunk in buffer

        for (const eventStr of events) {
          const lines = eventStr.split('\n')
          let eventType = ''
          let dataStr = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7)
            else if (line.startsWith('data: ')) dataStr = line.slice(6)
          }

          if (!eventType || !dataStr) continue

          try {
            const data = JSON.parse(dataStr)

            switch (eventType) {
              case 'analysis':
                finalResult.referenceAnalysis = data.referenceAnalysis
                finalResult.strategySuggestion = data.strategySuggestion
                setPartial({ ...finalResult })
                setPhase('angles')
                break
              case 'angles':
                finalResult.adaptedAngles = data.adaptedAngles
                setPartial({ ...finalResult })
                break
              case 'done':
                setResult(data as AdaptationOutput)
                setPartial(null)
                setPhase('done')
                break
              case 'error':
                throw new Error(data.error || '改编分析失败')
            }
          } catch (e) {
            if (e instanceof Error && e.message) throw e
          }
        }
      }

      // If done event wasn't received but we have all parts
      if (!result && finalResult.referenceAnalysis && finalResult.adaptedAngles) {
        const assembled: AdaptationOutput = {
          referenceAnalysis: finalResult.referenceAnalysis,
          strategySuggestion: finalResult.strategySuggestion!,
          adaptedAngles: finalResult.adaptedAngles,
        }
        setResult(assembled)
        setPartial(null)
        setPhase('done')
        return assembled
      }

      return null
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      return null
    } finally {
      setLoading(false)
      if (phase !== 'done') setPhase('idle')
    }
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setResult(null)
    setError(null)
    setPartial(null)
    setPhase('idle')
  }, [])

  return { loading, error, result, partial, phase, generate, reset }
}
