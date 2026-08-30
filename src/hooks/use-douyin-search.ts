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
  /** 原始转写文本（纠错前），仅当有纠错时存在 */
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

        // 区分「无符合条件评论」和「有评论」
        if (sorted.length === 0) {
          setCommentStatus((prev) => ({ ...prev, [awemeId]: 'no-qualified' }))
        } else {
          setCommentStatus((prev) => ({ ...prev, [awemeId]: 'done' }))
        }

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
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        // 友好化常见错误
        const friendly = errMsg.includes('aborted')
          ? '评论采集超时，请稍后重试'
          : errMsg.includes('Failed to fetch')
            ? '无法连接评论服务，请检查微服务是否运行'
            : errMsg
        setCommentsError(friendly)
        setCommentStatus((prev) => ({ ...prev, [awemeId]: 'error' }))
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
   *
   * 进度模拟：ASR 是长时间操作，基于时间模拟进度以提供用户反馈。
   * - 0-8s: 5% → 45%（音频下载+上传阶段）
   * - 8-20s: 45% → 75%（ASR 识别阶段）
   * - 20s+: 75% → 95%（LLM 纠错阶段，缓慢增长）
   * - API 返回: 100%
   */
  const extractTranscript = useCallback(async (
    urlOrId: string,
    awemeId?: string,
  ) => {
    const key = awemeId || urlOrId
    setTranscriptLoading(true)
    setTranscriptError(null)

    // 启动模拟进度
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += 1
      let pct: number
      if (elapsed <= 8) {
        // 下载+上传阶段: 5% → 45%
        pct = 5 + (elapsed / 8) * 40
      } else if (elapsed <= 20) {
        // ASR 识别阶段: 45% → 75%
        pct = 45 + ((elapsed - 8) / 12) * 30
      } else {
        // LLM 纠错阶段: 75% → 95%（每秒 +0.5%）
        pct = Math.min(95, 75 + (elapsed - 20) * 0.5)
      }
      const detail = elapsed <= 8
        ? '下载音频 + 上传云端...'
        : elapsed <= 20
          ? 'ASR 语音识别中...'
          : 'AI 文案纠错中...'
      updateStep('transcript', 'active', detail, Math.round(pct))
    }, 1000)

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
      clearInterval(timer)
      setTranscriptLoading(false)
    }
  }, [updateStep])

  /**
   * 检查输入是否为抖音视频链接
   */
  const isDouyinVideoUrl = useCallback((input: string): boolean => {
    // 匹配完整视频链接或短链接
    return (input.includes('douyin.com') && /\/video\/\d+/.test(input))
      || input.includes('v.douyin.com')
      || input.includes('iesdouyin.com')
  }, [])

  /**
   * 账号研究：输入主题或链接，调用 content-search Skill 采集内容
   * 支持三种输入：
   *  1. 主题关键词（如"AI替代程序员"）→ DuckDuckGo 搜索
   *  2. 抖音视频链接 → 抖音微服务获取详情
   *  3. 抖音关键词搜索 → 抖音浏览器代理搜索
   *
   * 如果输入是抖音视频链接，会自动触发文案提取和评论采集。
   * 采集结果只写入 researchResults，不自动写入 workflow store，
   * 由用户通过 addToWorkflow 主动收录。
   */
  const researchContent = useCallback(
    async (input: string, publishTime: PublishTimeFilter = 'none') => {
      setResearchLoading(true)
      setResearchError(null)
      setResearchNotice(null)

      // 初始化进度步骤
      const isUrl = isDouyinVideoUrl(input)
      const stepDefs = isUrl
        ? [
            { id: 'search', label: '搜索视频', status: 'pending' as ResearchStepStatus },
            { id: 'detail', label: '获取视频详情', status: 'pending' as ResearchStepStatus },
            { id: 'transcript', label: '提取口播文案（ASR 语音识别）', status: 'pending' as ResearchStepStatus },
            { id: 'comments', label: '采集评论数据', status: 'pending' as ResearchStepStatus },
          ]
        : [
            { id: 'search', label: '搜索内容', status: 'pending' as ResearchStepStatus },
            { id: 'detail', label: '获取详细数据', status: 'pending' as ResearchStepStatus },
          ]
      setResearchSteps(stepDefs)

      // Step 1: 搜索
      updateStep('search', 'active')
      try {
        const res = await fetch('/api/research/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queries: [input],
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

        updateStep('search', 'done', `${contents.length} 条结果`)
        updateStep('detail', 'done')

        setResearchResults(contents)

        // 如果搜索返回了状态消息（如网络错误、风控提示等），展示给用户
        if (data.message) {
          setResearchNotice(data.message)
        }

        // 如果输入是抖音视频链接，自动提取文案和采集评论
        if (isUrl) {
          for (const content of contents) {
            const awemeId = content.url.match(/\/video\/(\d+)/)?.[1]
            if (awemeId) {
              // 并行触发文案提取和评论采集（不阻塞 UI，但追踪进度）
              // extractTranscript 内部会自动管理进度提示
              updateStep('comments', 'active', '正在获取评论...')

              extractTranscript(content.url, awemeId)
                .then(() => updateStep('transcript', 'done', '文案提取完成', 100))
                .catch((err) => updateStep('transcript', 'error', err instanceof Error ? err.message : '失败'))

              collectComments(awemeId)
                .then(() => updateStep('comments', 'done', '评论采集完成'))
                .catch((err) => updateStep('comments', 'error', err instanceof Error ? err.message : '失败'))
            }
          }
        }

        return contents
      } catch (err) {
        updateStep('search', 'error')
        setResearchError(
          err instanceof Error ? err.message : 'Unknown error',
        )
        return []
      } finally {
        setResearchLoading(false)
      }
    },
    [isDouyinVideoUrl, extractTranscript, collectComments, updateStep],
  )

  /**
   * 将指定内容加入内容库（通过 API 持久化到数据库）
   *
   * 加入内容库时，会同时附带已提取的口播文案和已采集的评论数据，
   * 使内容库中的每条记录完整保留所有研究信息。
   *
   * 对于已存在于内容库中的条目（如 researchContent 已写入），
   * 会更新其 transcript / collectedComments / commentAnalysis 字段，
   * 确保后续提取的文案和采集的评论能同步到内容库。
   */
  const addToWorkflow = useCallback(async (contents: SearchedContent[]) => {
    setResearchResults((prev) => {
      const seen = new Set(prev.map((c) => c.url))
      return [...prev, ...contents.filter((c) => !seen.has(c.url))]
    })

    // 为每条 content 附带已提取的 transcript 和已采集的 comments
    const enriched: SearchedContent[] = contents.map((c) => {
      const awemeId = c.platform === 'douyin'
        ? c.url.match(/\/video\/(\d+)/)?.[1]
        : undefined

      return {
        ...c,
        transcript: awemeId && transcripts[awemeId]
          ? {
              text: transcripts[awemeId].text,
              language: transcripts[awemeId].language,
              duration: transcripts[awemeId].duration,
              model: transcripts[awemeId].model,
            }
          : c.transcript ?? null,
        collectedComments: awemeId && collectedComments[awemeId]
          ? collectedComments[awemeId].map((cmt) => ({
              text: cmt.text,
              nickname: cmt.nickname,
              diggCount: cmt.diggCount,
              createTime: cmt.createTime,
            }))
          : c.collectedComments ?? null,
        commentAnalysis: awemeId && commentAnalysis[awemeId]
          ? {
              topComments: commentAnalysis[awemeId].topComments.map((cmt) => ({
                text: cmt.text,
                nickname: cmt.nickname,
                diggCount: cmt.diggCount,
                createTime: cmt.createTime,
              })),
              keywords: commentAnalysis[awemeId].keywords,
              sentiment: commentAnalysis[awemeId].sentiment,
              summary: commentAnalysis[awemeId].summary,
            }
          : c.commentAnalysis ?? null,
      }
    })

    // Save to database via API (upsert by URL)
    try {
      await fetch('/api/content-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enriched),
      })
      // Trigger a reload of the content library store
      window.dispatchEvent(new CustomEvent('content-library-updated'))
    } catch (err) {
      console.error('[douyin-search] Failed to save to content library:', err)
    }
  }, [transcripts, collectedComments, commentAnalysis])

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
    researchNotice,
    researchResults,
    researchContent,
    researchSteps,
    addToWorkflow,
    // 评论采集
    commentsLoading,
    commentsError,
    commentStatus,
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
  TranscriptCorrection,
}
