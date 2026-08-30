'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ─────────────────────────────────────────────

export type ASRMode = 'auto' | 'local' | 'cloud'

/** 云端 ASR Provider 标识 */
export type ASRCloudProvider = 'alibaba' | 'xiaomi'

export interface ASRLocalConfig {
  whisperModel: string
  whisperDevice: string
  whisperBeamSize: string
  whisperComputeType: string
}

export interface ASRCloudProviderConfig {
  /** provider 标识 */
  provider: ASRCloudProvider
  /** 是否已配置 API Key */
  configured: boolean
  /** 掩码后的 API Key */
  masked: string
  /** 当前选择的模型 */
  model: string
  /** Base URL */
  baseUrl: string
}

export interface ASRConfig {
  mode: ASRMode
  local: ASRLocalConfig
  cloud: ASRCloudProviderConfig
}

// ─── Hook ───────────────────────────────────────────────

export function useASRSettings() {
  const [config, setConfig] = useState<ASRConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // ASR models state
  const [asrModels, setAsrModels] = useState<string[]>([])
  const [asrModelsLoading, setAsrModelsLoading] = useState(false)
  const [asrModelsError, setAsrModelsError] = useState<string | null>(null)
  const [asrModelsSource, setAsrModelsSource] = useState<'api' | 'static' | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
        const res = await fetch('/api/settings/asr')
      const json = await res.json()
      if (!json.success) {
        throw new Error(json.error || 'Failed to load ASR config')
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
      mode?: ASRMode
      whisperModel?: string
      whisperDevice?: string
      whisperBeamSize?: string
      whisperComputeType?: string
      cloudProvider?: ASRCloudProvider
      cloudApiKey?: string
      cloudModel?: string
    }): Promise<boolean> => {
      setSaving(true)
      setSaveError(null)
      setSaveSuccess(false)
      try {
        const res = await fetch('/api/settings/asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
        const json = await res.json()
        if (!json.success) {
          throw new Error(
            typeof json.error === 'string'
              ? json.error
              : 'Failed to save ASR config',
          )
        }
        setSaveSuccess(true)
        await refresh()
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

  // Fetch ASR models from DashScope API
  const fetchAsrModels = useCallback(
    async (apiKey?: string): Promise<void> => {
      setAsrModelsLoading(true)
      setAsrModelsError(null)
      setAsrModels([])
      setAsrModelsSource(null)
      try {
        const res = await fetch('/api/settings/asr/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        })
        const json = await res.json()
        if (!json.success) {
          throw new Error(
            typeof json.error === 'string'
              ? json.error
              : 'Failed to fetch ASR models',
          )
        }
        setAsrModels(json.data.models || [])
        setAsrModelsSource(json.data.source || 'static')
      } catch (e) {
        setAsrModelsError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setAsrModelsLoading(false)
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
    saveConfig,
    refresh,
    // ASR models
    asrModels,
    asrModelsLoading,
    asrModelsError,
    asrModelsSource,
    fetchAsrModels,
  }
}
