'use client'

import { useState, useCallback } from 'react'

interface TopicResearchInput {
  topic: string
  platform?: string
  audience?: string
  contentType?: string
  goal?: string
  tone?: string
}

interface TopicResearchOutput {
  topic: string
  category: string
  keywords: string[]
  relatedTopics: string[]
  coreQuestions: string[]
  audience?: string
  potentialAngles: string[]
  researchQueries: string[]
}

interface ContentSearchOutput {
  contents: Array<{
    platform: string
    url: string
    title: string | null
    author: string | null
    content: string | null
    publishedAt: string | null
    metrics: {
      likes: number | null
      comments: number | null
      shares: number | null
      favorites: number | null
      views: number | null
    } | null
  }>
}

export function useTopicResearch() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topicProfile, setTopicProfile] = useState<TopicResearchOutput | null>(
    null,
  )
  const [contents, setContents] = useState<ContentSearchOutput['contents']>([])
  const [searching, setSearching] = useState(false)

  const researchTopic = useCallback(
    async (input: TopicResearchInput) => {
      setLoading(true)
      setError(null)
      setTopicProfile(null)
      setContents([])

      try {
        const res = await fetch('/api/research/topic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })

        const data = await res.json()

        if (!data.success) {
          throw new Error(data.error || '研究失败')
        }

        setTopicProfile(data.data as TopicResearchOutput)
        return data.data as TopicResearchOutput
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const searchContents = useCallback(
    async (queries: string[], topicId: string) => {
      setSearching(true)
      setError(null)

      try {
        const res = await fetch('/api/research/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries, topicId, limit: 10 }),
        })

        const data = await res.json()

        if (!data.success) {
          throw new Error(data.error || '搜索失败')
        }

        setContents((data.data as ContentSearchOutput).contents)
        return (data.data as ContentSearchOutput).contents
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        return []
      } finally {
        setSearching(false)
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setTopicProfile(null)
    setContents([])
    setError(null)
  }, [])

  return {
    loading,
    searching,
    error,
    topicProfile,
    contents,
    researchTopic,
    searchContents,
    reset,
  }
}
