'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { SearchedContent } from '@/hooks/use-workflow'

// ── Store (simple singleton for cross-component sync) ─────

let libraryState: SearchedContent[] = []
const libraryListeners = new Set<() => void>()

function notifyLibraryListeners() {
  libraryListeners.forEach((l) => l())
}

// ── Hook ──────────────────────────────────────────────────

export function useContentLibrary() {
  const [contents, setContents] = useState<SearchedContent[]>(libraryState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  // Subscribe to store changes
  useEffect(() => {
    const listener = () => setContents([...libraryState])
    libraryListeners.add(listener)
    return () => {
      libraryListeners.delete(listener)
    }
  }, [])

  // Load from API on first mount
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/content-library')
      const data = await res.json()
      if (data.success) {
        libraryState = data.data as SearchedContent[]
        notifyLibraryListeners()
      } else {
        throw new Error(data.error || '加载内容库失败')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load on first mount
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true
      load()
    }
  }, [load])

  // Listen for 'content-library-updated' events (from addToWorkflow etc.)
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('content-library-updated', handler)
    return () => window.removeEventListener('content-library-updated', handler)
  }, [load])

  // Add or update contents in the library
  const addContents = useCallback(async (items: SearchedContent[]) => {
    if (items.length === 0) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/content-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || '保存到内容库失败')
      }

      const upserted = data.data as SearchedContent[]

      // Merge into local state: update existing or append new
      const existing = new Map(libraryState.map((c) => [c.url, c]))
      for (const item of upserted) {
        existing.set(item.url, item)
      }
      libraryState = Array.from(existing.values())
      notifyLibraryListeners()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  // Remove a single item by URL
  const removeContent = useCallback(async (url: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/content-library?url=${encodeURIComponent(url)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || '删除失败')
      }

      libraryState = libraryState.filter((c) => c.url !== url)
      notifyLibraryListeners()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
    }
  }, [])

  // Clear all contents
  const clearAll = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/content-library?all=true', {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || '清空失败')
      }

      libraryState = []
      notifyLibraryListeners()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
    }
  }, [])

  return {
    contents,
    loading,
    error,
    load,
    addContents,
    removeContent,
    clearAll,
  }
}
