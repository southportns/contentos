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

  return { personas, loading, error, createPersona, updatePersona, deletePersona, refresh }
}
