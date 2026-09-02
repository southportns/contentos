'use client'

import { useState, useCallback, useEffect } from 'react'
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
  message?: string
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

// ─── Search Options ───────────────────────────────────

/** 搜索选项：支持多标签 + 筛选 */
interface SearchOptions {
  /** 发布时间筛选 */
  publishTime?: PublishTimeFilter
  /** 最低点赞数筛选，null/undefined 表示不筛选 */
  minLikes?: number | null
}

/** 多标签搜索参数 */
interface MultiTagSearchParams {
  /** 搜索标签列表（如 ["竺天天", "天总", "天总语录"]） */
  keywords: string[]
  /** 每个标签搜索的数量 */
  count?: number
  /** 筛选选项 */
  options?: SearchOptions
}

// ─── Research Progress Types ───────────────────────────

export type ResearchStepStatus = 'pending' | 'active' | 'done' | 'error'

export interface ResearchStep {
  id: string
  label: string
  status: ResearchStepStatus
  detail?: string
  /** 子进度（0-100），用于活跃步骤的实时进度提示 */
  progress?: number
}

interface TranscriptSegment {
  start: number
  end: number
  text: string
}

interface TranscriptCorrection {
  original: string
  corrected: string
  reason: string
}

interface VideoTranscript {
  awemeId: string
  text: string
  /** 原始转写文本（纠错前），仅当有纠错或跳过纠错时存在 */
  rawText?: string
  language: string
  duration: number
  model: string
  segments: TranscriptSegment[]
  /** 纠错详情列表 */
  corrections?: TranscriptCorrection[]
  /** 纠错数量 */
  correctionCount?: number
  /** ASR Provider 标识（如 local-whisper / cloud-alibaba） */
  provider?: string
  /** Provider 模式（local / cloud） */
  providerMode?: 'local' | 'cloud'
  /** 综合置信度（0-100） */
  confidence?: number
  /** 质量等级 */
  qualityLevel?: 'EXCELLENT' | 'HIGH' | 'GOOD' | 'FAIR' | 'LOW'
  /** 处理总耗时（毫秒） */
  processingTimeMs?: number
  /** 是否已纠错（false = 仅 ASR 原始文本，true = 已执行 LLM 纠错） */
  corrected?: boolean
  /** 视频描述（纠错上下文） */
  videoDesc?: string
  /** 视频作者（纠错上下文） */
  videoAuthor?: string
}

// ─── Constants ────────────────────────────────────────

/** 评论采集上限 */
const MAX_COMMENTS = 100
/** 每页评论数（增大到 50 减少翻页次数，从 5 页 → 2 页） */
const COMMENTS_PAGE_SIZE = 50
/** 最大翻页数（100 条 / 50 条每页 = 2 页） */
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
  const [researchNotice, setResearchNotice] = useState<string | null>(null)

  // Comment collection state
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [collectedComments, setCollectedComments] = useState<
    Record<string, DouyinComment[]>
  >({}) // keyed by awemeId
  /** 评论采集状态：'idle' | 'fetching' | 'done' | 'no-qualified' | 'error' */
  const [commentStatus, setCommentStatus] = useState<
    Record<string, 'idle' | 'fetching' | 'done' | 'no-qualified' | 'error'>
  >({})
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

  // Research progress state
  const [researchSteps, setResearchSteps] = useState<ResearchStep[]>([])

  const updateStep = useCallback((
    stepId: string,
    status: ResearchStepStatus,
    detail?: string,
    progress?: number,
  ) => {
    setResearchSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, status, detail: detail ?? s.detail, progress: progress ?? s.progress }
          : s,
      ),
    )
  }, [])

  const search = useCallback(
    async (
      keywordOrParams: string | MultiTagSearchParams,
      countOrOptions?: number | PublishTimeFilter | SearchOptions,
      legacyPublishTime?: PublishTimeFilter,
    ) => {
      setLoading(true)
      setError(null)
      setSearchNotice(null)
      try {
        // ── 参数归一化：兼容旧版 search(keyword, count, publishTime) 和新版 search(params) ──
        let keywords: string[]
        let searchCount: number
        let publishTime: PublishTimeFilter
        let minLikes: number | null = null

        if (typeof keywordOrParams === 'string') {
          // 旧版单关键词模式
          keywords = [keywordOrParams]
          searchCount = typeof countOrOptions === 'number' ? countOrOptions : 20
          publishTime = typeof countOrOptions === 'string'
            ? countOrOptions
            : (legacyPublishTime ?? 'none')
        } else {
          // 新版多标签模式
          keywords = keywordOrParams.keywords
          searchCount = keywordOrParams.count ?? 20
          publishTime = keywordOrParams.options?.publishTime ?? 'none'
          minLikes = keywordOrParams.options?.minLikes ?? null
        }

        const res = await fetch('/api/research/douyin-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keywords,
            count: searchCount,
            publishTime,
            minLikes,
          }),
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
      setCommentStatus((prev) => ({ ...prev, [awemeId]: 'fetching' }))
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
        let hasMore = json.data.hasMore