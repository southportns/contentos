'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ModelProvider } from '@/lib/ai/models'

// ─── Types ─────────────────────────────────────────────

export interface ProviderInfo {
  id: ModelProvider
  label: string
  configured: boolean
}

export interface LLMConfig {
  provider: ModelProvider
  model: string
  providers: ProviderInfo[]
  apiKeys: Record<string, { configured: boolean; masked: string }>
  baseUrls: Record<string, string>
}

export interface LLMSettings {
  config: LLMConfig | null
  loading: boolean
  error: string | null
  // Action states
  saving: boolean
  saveError: string | null
  saveSuccess: boolean
  // Models
  models: string[]
  modelsLoading: boolean
  modelsError: string | null
  modelsSource: 'api' | 'static' | null
  // Actions
  saveConfig: (input: {
    provider: ModelProvider
    model?: string
    apiKeys?: Partial<Record<ModelProvider, string>>
  }) => Promise<boolean>
  fetchModels: (provider: ModelProvider, apiKey?: string) => Promise<void>
  refresh: () => Promise<void>
}

// ─── Hook ───────────────────────────────────────────────

export function useLLMSettings(): LLMSettings {
  const [config, setConfig] = useState<LLMConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [modelsSource, setModelsSource] = useState<'api' | 'static' | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/llm')
      const json = await res.json()
      if (!json.success) {
        throw new Error(json.error || 'Failed to load config')
      }
      setConfig(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const saveConfig = useCallback(
    async (input: {
      provider: ModelProvider
      model?: string
      apiKeys?: Partial<Record<ModelProvider, string>>
    }): Promise<boolean> => {
      setSaving(true)
      setSaveError(null)
      setSaveSuccess(false)
      try {
        const res = await fetch('/api/settings/llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
        const json = await res.json()
        if (!json.success) {
          throw new Error(
            typeof json.error === 'string'
              ? json.error
              : 'Failed to save config',
          )
        }
        setSaveSuccess(true)
        // Refresh config to show updated state
        await refresh()
        // Clear success after 3s
        setTimeout(() => setSaveSuccess(false), 3000)
        return true
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Unknown error')
        return false
      } finally {
        setSaving(false)
      }
    },
    [refresh],
  )

  const fetchModels = useCallback(
    async (provider: ModelProvider, apiKey?: string): Promise<void> => {
      setModelsLoading(true)
      setModelsError(null)
      setModels([])
      setModelsSource(null)
      try {
        const res = await fetch('/api/settings/llm/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey }),
        })
        const json = await res.json()
        if (!json.success) {
          throw new Error(
            typeof json.error === 'string'
              ? json.error
              : 'Failed to fetch models',
          )
        }
        setModels(json.data.models || [])
        setModelsSource(json.data.source || 'static')
      } catch (e) {
        setModelsError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setModelsLoading(false)
      }
    },
    [],
  )

  return {
    config,
    loading,
    error,
    saving,
    saveError,
    saveSuccess,
    models,
    modelsLoading,
    modelsError,
    modelsSource,
    saveConfig,
    fetchModels,
    refresh,
  }
}
