'use client'

import { useState, useCallback, useEffect } from 'react'
import { workflowActions } from '@/hooks/use-workflow'
import type { SearchedContent } from '@/hooks/use-workflow'

// ─── Types ─────────────────────────────────────────────

interface DouyinContent {
  platform: string
  url: string
  awemeId?: string
  title: string | null
  content: string | null
  author: string | null
  cover?: string | null
  publishedAt?: string | null
  metrics: {
    likes: number | null
    comments: number | null
    shares: number | null
    favorites: number | null
    views: number | null
  } | null
}

interface DouyinHotItem {
  word: string
  hot_value: string
}

interface ResearchResult {
  contents: SearchedContent[]
}

interface DouyinComment {
  text: string
  nickname: string
  diggCount: number
  createTime: string | null
}

interface CommentAnalysisResult {
  topComments: DouyinComment[]
  keywords: string[]
  sentiment: {
    positive: number
    neutral: number
    negative: number
  }
  summary: string
}

type PublishTimeFilter = 'none' | '1d' | '7d' | '14d' | '30d'

interface TranscriptSegment {
  start: number
  end: number
  text: string
}

interface VideoTranscript {
  awemeId: string
  text: string
  language: string
  duration: number
  model: string
  segments: TranscriptSegment[]
}

// ─── Constants ────────────────────────────────────────

/** 评论采集上限 */
const MAX_COMMENTS = 100
/** 每页评论数 */
const COMMENTS_PAGE_SIZE = 20
/** 最大翻页数（100 条 / 20 条每页 = 5 页） */
const MAX_COMMENT_PAGES = Math.ceil(MAX_COMMENTS / COMMENTS_PAGE_SIZE)
/** 最低点赞数过滤阈值 */
const MIN_LIKES_THRESHOLD = 100

// ─── Hook ──────────────────────────────────────────────

export function useDouyinSearch() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<DouyinContent[]>([])
  const [hotSearch, setHotSearch] = useState<DouyinHotItem[]>([])
  const [hotLoading, setHotLoading] = useState(false)
  const [hotError, setHotError] = useState<string | null>(null)

  // Content research state
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [researchResults, setResearchResults] = useState<SearchedContent[]>([])

  // Comment collection state
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [collectedComments, setCollectedComments] = useState<
    Record<string, DouyinComment[]>
  >({}) // keyed by awemeId
  const [commentAnalysis, setCommentAnalysis] = useState<
    Record<string, CommentAnalysisResult>
  >({}) // keyed by awemeId

  // Transcript state
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<
    Record<string, VideoTranscript>
  >({}) // keyed by awemeId

  const [searchNotice, setSearchNotice] = useState<string | null>(null)

  const search = useCallback(
    async (
      keyword: string,
      count = 20,
      publishTime: PublishTimeFilter = 'none',
    ) => {
      setLoading(true)
      setError(null)
      setSearchNotice(null)
      try {
        const res = await fetch('/api/research/douyin-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, count, publishTime }),
        })
        const json = await res.json()
        if (!json.success) {
          throw new Error(json.error || 'Search failed')
        }
        const contents = json.data.contents as DouyinContent[]
        setResults(contents)
        // 搜索返回空结果时显示风控提示
        if (contents.length === 0 && json.data.message) {
          setSearchNotice(json.data.message as string)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const fetchHotSearch = useCallback(async () => {
    setHotLoading(true)
    setHotError(null)
    try {
      const res = await fetch('/api/research/douyin-hot')
      const json = await res.json()
      if (json.success) {
        setHotSearch(json.data as DouyinHotItem[])
      } else {
        setHotError(json.error || '获取热搜失败')
      }
    } catch {
      setHotError('网络错误，获取热搜失败')
    } finally {
      setHotLoading(false)
    }
  }, [])

  const getVideoDetail = useCallback(async (urlOrId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/research/douyin-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          urlOrId.includes('http') ? { url: urlOrId } : { awemeId: urlOrId },
        ),
      })
      const json = await res.json()
      if (!json.success) {
        throw new Error(json.error || 'Failed to get video detail')
      }
      return json.data as DouyinContent
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * 账号研究：输入主题或链接，调用 content-search Skill 采集内容
   * 支持三种输入：
   *  1. 主题关键词（如"AI替代程序员"）→ DuckDuckGo 搜索
   *  2. 抖音视频链接 → 抖音微服务获取详情
   *  3. 抖音关键词搜索 → 抖音浏览器代理搜索
   * 采集结果同时写入 workflow contents 供后续分析使用
   */
  const researchContent = useCallback(
    async (input: string, publishTime: PublishTimeFilter = 'none') => {
      setResearchLoading(true)
      setResearchError(null)
      try {
        const res = await fetch('/api/research/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queries: [input],
            topicId: 'explorer-research',
            limit: 10,
            publishTime,
          }),
        })
        const json = await res.json()
        if (!json.success) {
          throw new Error(json.error || 'Research failed')
        }
        const data = json.data as ResearchResult
        const contents = data.contents as SearchedContent[]
        setResearchResults(contents)
        // 同步写入 workflow 供后续分析使用
        workflowActions.setContents(contents)
        return contents
      } catch (err) {
        setResearchError(
          err instanceof Error ? err.message : 'Unknown error',
        )
        return []
      } finally {
        setResearchLoading(false)
      }
    },
    [],
  )

  /**
   * 采集指定视频的评论
   *
   * 采集规则：
   * 1. 采集不超过 100 条评论
   * 2. 过滤掉低于 100 赞的评论
   * 3. 按点赞数由高到低排列
   */
  const collectComments = useCallback(
    async (awemeId: string) => {
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        // 第一页评论
        const res = await fetch('/api/research/douyin-comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            awemeId,
            count: COMMENTS_PAGE_SIZE,
            cursor: 0,
          }),
        })
        const json = await res.json()
        if (!json.success) {
          throw new Error(json.error || 'Failed to fetch comments')
        }

        const firstPage = json.data.comments as DouyinComment[]
        let allComments = [...firstPage]
        let cursor = json.data.cursor as number
        let hasMore = json.data.hasMore as boolean
        let pageCount = 1

        // 持续翻页采集，直到达到上限或没有更多
        while (
          hasMore &&
          pageCount < MAX_COMMENT_PAGES &&
          allComments.length < MAX_COMMENTS
        ) {
          const moreRes = await fetch('/api/research/douyin-comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              awemeId,
              count: COMMENTS_PAGE_SIZE,
              cursor,
            }),
          })
          const moreJson = await moreRes.json()
          if (!moreJson.success) break

          const moreComments = moreJson.data.comments as DouyinComment[]
          allComments = [...allComments, ...moreComments]
          cursor = moreJson.data.cursor as number
          hasMore = moreJson.data.hasMore as boolean
          pageCount++
        }

        // 规则2：过滤掉低于 100 赞的评论
        const filtered = allComments.filter(
          (c) => c.diggCount >= MIN_LIKES_THRESHOLD,
        )

        // 规则3：按点赞数由高到低排列
        const sorted = filtered.sort((a, b) => b.diggCount - a.diggCount)

        // 更新最终评论列表
        setCollectedComments((prev) => ({
          ...prev,
          [awemeId]: sorted,
        }))

        // 调用 audience-analysis 分析评论
        try {
          const analysisRes = await fetch('/api/analysis/audience', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: sorted.map((c) => ({
                platform: 'douyin_comment',
                title: c.nickname,
                content: c.text,
                metrics: {
                  likes: c.diggCount,
                  comments: null,
                },
              })),
              topicCategory: 'comment_analysis',
              topicKeywords: [],
            }),
          })
          const analysisJson = await analysisRes.json()

          if (analysisJson.success) {
            const analysis = analysisJson.data
            // 热点评论 Top 5（已按点赞排序，直接取前5）
            const topComments = sorted.slice(0, 5)

            // 提取高频关键词
            const keywords: string[] = [
              ...(analysis.needs || []),
              ...(analysis.painPoints || []),
              ...(analysis.behaviors || []),
            ].slice(0, 10)

            // 情绪分布
            const emotions = analysis.emotions || []
            const sentiment = {
              positive: emotions
                .filter(
                  (e: { emotion: string; percentage: number }) =>
                    e.emotion.includes('正向') ||
                    e.emotion.includes('积极') ||
                    e.emotion.includes('开心') ||
                    e.emotion.includes('喜爱') ||
                    e.emotion.includes('信任'),
                )
                .reduce(
                  (sum: number, e: { percentage: number }) =>
                    sum + e.percentage,
                  0,
                ),
              neutral: emotions
                .filter(
                  (e: { emotion: string; percentage: number }) =>
                    e.emotion.includes('中立') ||
                    e.emotion.includes('平静') ||
                    e.emotion.includes('客观'),
                )
                .reduce(
                  (sum: number, e: { percentage: number }) =>
                    sum + e.percentage,
                  0,
                ),
              negative: emotions
                .filter(
                  (e: { emotion: string; percentage: number }) =>
                    e.emotion.includes('负') ||
                    e.emotion.includes('消极') ||
                    e.emotion.includes('愤怒') ||
                    e.emotion.includes('悲伤') ||
                    e.emotion.includes('恐惧') ||
                    e.emotion.includes('厌恶') ||
                    e.emotion.includes('焦虑'),
                )
                .reduce(
                  (sum: number, e: { percentage: number }) =>
                    sum + e.percentage,
                  0,
                ),
            }

            setCommentAnalysis((prev) => ({
              ...prev,
              [awemeId]: {
                topComments,
                keywords,
                sentiment,
                summary: analysis.contentGaps?.join('; ') || '',
              },
            }))
          }
        } catch {
          // 分析失败不影响评论展示
        }

        return sorted
      } catch (err) {
        setCommentsError(
          err instanceof Error ? err.message : 'Unknown error',
        )
        return []
      } finally {
        setCommentsLoading(false)
      }
    },
    [],
  )

  /**
   * 提取抖音视频口播文案
   *
   * 通过 douyin-ingest CLI 工具下载视频音频并使用 faster-whisper 转写为文字。
   * 不保留视频文件，只提取音频并转写。
   */
  const extractTranscript = useCallback(async (
    urlOrId: string,
    awemeId?: string,
  ) => {
    const key = awemeId || urlOrId
    setTranscriptLoading(true)
    setTranscriptError(null)
    try {
      const res = await fetch('/api/research/douyin-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          urlOrId.includes('http')
            ? { url: urlOrId }
            : { awemeId: urlOrId },
        ),
      })
      const json = await res.json()
      if (!json.success) {
        throw new Error(json.error || 'Failed to extract transcript')
      }
      const transcript = json.data as VideoTranscript
      setTranscripts((prev) => ({
        ...prev,
        [key]: transcript,
      }))
      return transcript
    } catch (err) {
      setTranscriptError(
        err instanceof Error ? err.message : 'Unknown error',
      )
      return null
    } finally {
      setTranscriptLoading(false)
    }
  }, [])

  /**
   * 将指定内容加入 workflow contents（追加模式）
   * 注意：不能在 setResearchResults 的 updater 中调用 workflowActions.setContents，
   * 因为 updater 在渲染期间执行，同步触发外部 store 会导致 "setState in render" 错误。
   */
  const addToWorkflow = useCallback((contents: SearchedContent[]) => {
    setResearchResults((prev) => {
      const seen = new Set(prev.map((c) => c.url))
      return [...prev, ...contents.filter((c) => !seen.has(c.url))]
    })
    // 在 updater 外部调用，避免渲染期间触发外部 store 通知
    queueMicrotask(() => {
      // 从外部 store 的当前快照读取，确保合并正确
      const current = workflowActions.getContents()
      const seen = new Set(current.map((c) => c.url))
      const merged = [...current, ...contents.filter((c) => !seen.has(c.url))]
      workflowActions.setContents(merged)
    })
  }, [])

  // Auto-load hot search on mount
  useEffect(() => {
    let cancelled = false

    async function load() {
      setHotLoading(true)
      setHotError(null)
      try {
        const res = await fetch('/api/research/douyin-hot')
        const json = await res.json()
        if (json.success && !cancelled) {
          setHotSearch(json.data as DouyinHotItem[])
        } else if (!cancelled) {
          setHotError(json.error || '获取热搜失败')
        }
      } catch {
        if (!cancelled) setHotError('网络错误，获取热搜失败')
      } finally {
        if (!cancelled) setHotLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return {
    // 话题搜索
    loading,
    error,
    searchNotice,
    results,
    search,
    getVideoDetail,
    // 热搜
    hotSearch,
    hotLoading,
    hotError,
    fetchHotSearch,
    // 账号研究
    researchLoading,
    researchError,
    researchResults,
    researchContent,
    addToWorkflow,
    // 评论采集
    commentsLoading,
    commentsError,
    collectedComments,
    commentAnalysis,
    collectComments,
    // 口播文案提取
    transcriptLoading,
    transcriptError,
    transcripts,
    extractTranscript,
  }
}

export type {
  DouyinContent,
  DouyinHotItem,
  ResearchResult,
  DouyinComment,
  CommentAnalysisResult,
  PublishTimeFilter,
  VideoTranscript,
  TranscriptSegment,
}
