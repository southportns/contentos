'use client'

import { useState, useEffect, useCallback } from 'react'

export interface Persona {
  id: string
  name: string
  description: string | null
  isActive: boolean
}

export type PersonaActionResult = { success: boolean; error?: string }

interface UsePersonasReturn {
  personas: Persona[]
  loading: boolean
  error: string | null
  createPersona: (data: { name: string; description?: string }) => Promise<PersonaActionResult>
  updatePersona: (id: string, data: { name?: string; description?: string }) => Promise<PersonaActionResult>
  deletePersona: (id: string) => Promise<PersonaActionResult>
  copyPersona: (sourceId: string) => Promise<PersonaActionResult & { data?: { id: string } }>
  refresh: () => void
}

function extractErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function usePersonas(): UsePersonasReturn {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshFlag, setRefreshFlag] = useState(0)

  const refresh = useCallback(() => setRefreshFlag((f) => f + 1), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/personas')
        if (!res.ok) throw new Error('获取人设列表失败')
        const json = await res.json()
        if (!cancelled) setPersonas(json.data || [])
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err, 'Unknown error'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [refreshFlag])

  const createPersona = useCallback(
    async (data: { name: string; description?: string }): Promise<PersonaActionResult> => {
      setError(null)
      try {
        const res = await fetch('/api/personas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => null)
          const msg = typeof json?.error === 'string' ? json.error : null
          throw new Error(msg || `创建失败 (HTTP ${res.status})`)
        }
        refresh()
        return { success: true }
      } catch (err) {
        const msg = extractErrorMessage(err, 'Unknown error')
        setError(msg)
        return { success: false, error: msg }
      }
    },
    [refresh],
  )

  const updatePersona = useCallback(
    async (id: string, data: { name?: string; description?: string }): Promise<PersonaActionResult> => {
      setError(null)
      try {
        const res = await fetch(`/api/personas/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => null)
          const msg = typeof json?.error === 'string' ? json.error : null
          throw new Error(msg || `更新失败 (HTTP ${res.status})`)
        }
        refresh()
        return { success: true }
      } catch (err) {
        const msg = extractErrorMessage(err, 'Unknown error')
        setError(msg)
        return { success: false, error: msg }
      }
    },
    [refresh],
  )

  const deletePersona = useCallback(
    async (id: string): Promise<PersonaActionResult> => {
      setError(null)
      try {
        const res = await fetch(`/api/personas/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          const json = await res.json().catch(() => null)
          const msg = typeof json?.error === 'string' ? json.error : null
          throw new Error(msg || `删除失败 (HTTP ${res.status})`)
        }
        refresh()
        return { success: true }
      } catch (err) {
        const msg = extractErrorMessage(err, 'Unknown error')
        setError(msg)
        return { success: false, error: msg }
      }
    },
    [refresh],
  )

  const copyPersona = useCallback(
    async (sourceId: string): Promise<PersonaActionResult & { data?: { id: string } }> => {
      setError(null)
      try {
        // 1. 获取源人设数据
        const sourceRes = await fetch(`/api/personas/${sourceId}`)
        if (!sourceRes.ok) throw new Error('获取源人设失败')
        const sourceJson = await sourceRes.json()
        if (!sourceJson.success || !sourceJson.data) {
          throw new Error('源人设不存在')
        }

        const source = sourceJson.data

        // 2. 创建副本（同名 + "副本" 后缀）
        const copyName = `${source.name}（副本）`
        const copyDescription = source.description || undefined

        const createRes = await fetch('/api/personas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: copyName, description: copyDescription }),
        })

        if (!createRes.ok) {
          const json = await createRes.json().catch(() => null)
          const msg = typeof json?.error === 'string' ? json.error : null
          throw new Error(msg || `创建副本失败 (HTTP ${createRes.status})`)
        }

        const createJson = await createRes.json()
        refresh()
        return { success: true, data: createJson.data }
      } catch (err) {
        const msg = extractErrorMessage(err, 'Unknown error')
        setError(msg)
        return { success: false, error: msg }
      }
    },
    [refresh],
  )

  return { personas, loading, error, createPersona, updatePersona, deletePersona, copyPersona, refresh }
}
