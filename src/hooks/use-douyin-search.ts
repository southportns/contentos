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
        let hasMore = json.data.hasMore as boolean
        let pageCount = 1

        // 持续翻页采集，直到达到上限或没有更多
        // 提前退出：如果已收集到足够多高赞评论（≥20 条 ≥100 赞），不再翻页
        while (
          hasMore &&
          pageCount < MAX_COMMENT_PAGES &&
          allComments.length < MAX_COMMENTS &&
          allComments.filter((c) => c.diggCount >= MIN_LIKES_THRESHOLD).length < 20
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
   * 提取抖音视频口播文案（仅 ASR，不自动纠错）
   *
   * 通过 douyin-ingest CLI 工具下载视频音频并使用 faster-whisper 转写为文字。
   * 不保留视频文件，只提取音频并转写。
   * LLM 纠错不自动执行，用户检查后如有需要可调用 correctTranscript 手动触发。
   *
   * 进度模拟：ASR 是长时间操作，基于时间模拟进度以提供用户反馈。
   * - 0-8s: 5% → 45%（音频下载+上传阶段）
   * - 8-20s: 45% → 90%（ASR 识别阶段）
   * - 20s+: 90% → 95%（获取视频上下文，缓慢增长）
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
        // ASR 识别阶段: 45% → 90%
        pct = 45 + ((elapsed - 8) / 12) * 45
      } else {
        // 获取上下文阶段: 90% → 95%
        pct = Math.min(95, 90 + (elapsed - 20) * 0.3)
      }
      const detail = elapsed <= 8
        ? '下载音频 + 上传云端...'
        : elapsed <= 20
          ? 'ASR 语音识别中...'
          : '获取视频上下文...'
      updateStep('transcript', 'active', detail, Math.round(pct))
    }, 1000)

    try {
      const res = await fetch('/api/research/douyin-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          urlOrId.includes('http')
            ? { url: urlOrId, skipCorrection: true }
            : { awemeId: urlOrId, skipCorrection: true },
        ),
      })
      console.log('[use-douyin-search] transcript response status:', res.status, res.ok)
      const json = await res.json()
      console.log('[use-douyin-search] transcript json success:', json.success, 'text length:', json.data?.text?.length, 'awemeId:', json.data?.awemeId)
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
   * 手动触发文案纠错（LLM 纠正 ASR 原始文本）
   *
   * v3 优化：使用 SSE 流式输出，前端实时展示纠错进度。
   * 纠错完成后更新 transcripts 状态，保留纠错前后对比。
   */
  const [correctionLoading, setCorrectionLoading] = useState(false)
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  const [correctionProgress, setCorrectionProgress] = useState(0)
  const [correctionStreamText, setCorrectionStreamText] = useState<string>('')

  const correctTranscript = useCallback(async (
    awemeId: string,
    rawText: string,
    videoDesc?: string,
    videoAuthor?: string,
    model?: string,
  ) => {
    setCorrectionLoading(true)
    setCorrectionError(null)
    setCorrectionProgress(0)
    setCorrectionStreamText('')

    // 计时器模拟进度（流式 delta 到达后由实际文本长度驱动）
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += 1
      // 0-3s: 5% → 30%（LLM 思考阶段）
      // 3-10s: 30% → 80%（生成阶段）
      // 10s+: 80% → 95%（缓慢增长）
      let pct: number
      if (elapsed <= 3) {
        pct = 5 + (elapsed / 3) * 25
      } else if (elapsed <= 10) {
        pct = 30 + ((elapsed - 3) / 7) * 50
      } else {
        pct = Math.min(95, 80 + (elapsed - 10) * 1.5)
      }
      setCorrectionProgress(Math.round(pct))
    }, 1000)

    try {
      const res = await fetch('/api/research/douyin-correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          videoDesc,
          videoAuthor,
          model,
          stream: true,
        }),
      })

      // 检查是否是 SSE 流
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('text/event-stream')) {
        // 回退：非流式响应
        const json = await res.json()
        if (!json.success) {
          throw new Error(json.error || 'Failed to correct transcript')
        }
        const corrected = json.data as VideoTranscript
        setTranscripts((prev) => {
          const existing = prev[awemeId]
          return {
            ...prev,
            [awemeId]: {
              ...(existing || {}),
              ...corrected,
              segments: existing?.segments?.map((seg, i) => ({
                ...seg,
                text: corrected.segments?.[i]?.text || seg.text,
              })) || [],
            },
          }
        })
        setCorrectionProgress(100)
        return corrected
      }

      // 解析 SSE 流
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let finalData: VideoTranscript | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 数据行
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留最后不完整的行

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const dataStr = line.slice(6)

          try {
            const msg = JSON.parse(dataStr)

            if (msg.type === 'delta') {
              // 流式文本增量
              setCorrectionStreamText((prev) => prev + msg.text)
              // 根据已接收文本长度估算进度
              setCorrectionProgress((prev) => {
                const textProgress = Math.min(80, 30 + (correctionStreamText.length / rawText.length) * 50)
                return Math.max(prev, Math.round(textProgress))
              })
            } else if (msg.type === 'final') {
              // 最终结果
              finalData = msg.data as VideoTranscript
              setCorrectionProgress(100)
            } else if (msg.type === 'error') {
              throw new Error(msg.error || 'Correction failed')
            }
          } catch (parseErr) {
            // 忽略解析错误，继续
            if (parseErr instanceof Error && parseErr.message.includes('Correction failed')) {
              throw parseErr
            }
          }
        }
      }

      if (!finalData) {
        throw new Error('No final result received from stream')
      }

      const corrected = finalData
      setTranscripts((prev) => {
        const existing = prev[awemeId]
        return {
          ...prev,
          [awemeId]: {
            ...(existing || {}),
            ...corrected,
            segments: existing?.segments?.map((seg, i) => ({
              ...seg,
              text: corrected.segments?.[i]?.text || seg.text,
            })) || [],
          },
        }
      })
      return corrected
    } catch (err) {
      setCorrectionError(
        err instanceof Error ? err.message : 'Unknown error',
      )
      return null
    } finally {
      clearInterval(timer)
      setCorrectionLoading(false)
      setCorrectionStreamText('')
      // 延迟重置进度
      setTimeout(() => setCorrectionProgress(0), 500)
    }
  }, [])

  /**
   * 检测输入是否为抖音视频链接
   *
   * 支持以下场景:
   *  - 标准视频 URL: https://www.douyin.com/video/123
   *  - 搜索页 URL: https://www.douyin.com/search/xxx?modal_id=123&type=general
   *  - 短链接: https://v.douyin.com/xxx/
   *  - 分享文本: 7.99 复制打开抖音... https://v.douyin.com/xxx/
   */
  const isDouyinVideoUrl = useCallback((input: string): boolean => {
    // 匹配完整视频链接（含 /video/{id}）
    if (input.includes('douyin.com') && /\/video\/\d+/.test(input)) return true
    // 匹配搜索页链接（含 modal_id 参数）
    if (input.includes('douyin.com') && /modal_id=\d+/.test(input)) return true
    // 匹配短链接
    if (input.includes('v.douyin.com') || input.includes('iesdouyin.com')) return true
    return false
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
    // 文案纠错
    correctionLoading,
    correctionError,
    correctionProgress,
    correctionStreamText,
    correctTranscript,
  }
}

export type {
  DouyinContent,
  DouyinHotItem,
  ResearchResult,
  DouyinComment,
  CommentAnalysisResult,
  PublishTimeFilter,
  SearchOptions,
  MultiTagSearchParams,
  VideoTranscript,
  TranscriptSegment,
  TranscriptCorrection,
}
