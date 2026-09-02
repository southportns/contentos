/**
 * Douyin Client — 抖音数据 Tool 层
 *
 * 通过 douyin-downloader 微服务（localhost:8800）获取抖音内容数据。
 * 微服务基于 jiji262/douyin-downloader 开源项目，使用 Tabbit 浏览器自动获取 Cookie。
 *
 * 口播文案提取通过 douyin-ingest CLI（ltppp/douyin-ingest）实现，
 * 使用 faster-whisper 本地语音转文字。
 *
 * 架构位置: Tool Layer（与 firecrawl-client.ts 同级）
 * 调用方: content-search Skill / API Route
 */

import { z } from 'zod'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rm } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

// ─── Config ────────────────────────────────────────────

const DOUYIN_API_BASE =
  process.env.DOUYIN_API_BASE || 'http://localhost:8800'

const DOUYIN_TIMEOUT_MS = 15_000

// ─── Search fast-fail config ────────────────────────────
// 抖音搜索是风控最严格的端点。微服务内部有 3 次重试（1s+2s+5s），
// 被风控时重试无意义，浪费 ~50s。通过 4s 超时快速失败，
// 避免用户等待过久。
// 诊断数据：风控判定是即时的（< 1s），3s 未返回则等 8s 也不会回来。
const SEARCH_TIMEOUT_MS = 4_000

// Search result cache — 相同关键词 5 分钟内复用，减少 API 调用
interface SearchCacheEntry {
  timestamp: number
  data: DouyinSearchResult[]
}
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000 // 5 min
const searchCache = new Map<string, SearchCacheEntry>()

// Search cooldown — 关键词被风控后 30s 内不再请求，直接返回空结果
// 避免连续触发风控导致更严格的拦截
interface SearchCooldownEntry {
  timestamp: number
  reason: 'timeout' | 'error'
}
const SEARCH_COOLDOWN_TTL_MS = 30 * 1000 // 30s
const searchCooldownMap = new Map<string, SearchCooldownEntry>()

function isSearchInCooldown(keyword: string): SearchCooldownEntry | null {
  const entry = searchCooldownMap.get(keyword)
  if (entry && Date.now() - entry.timestamp < SEARCH_COOLDOWN_TTL_MS) {
    return entry
  }
  // Expired — clean up
  if (entry) searchCooldownMap.delete(keyword)
  return null
}

function setSearchCooldown(keyword: string, reason: 'timeout' | 'error'): void {
  searchCooldownMap.set(keyword, { timestamp: Date.now(), reason })
  // Simple cleanup: limit to 20 entries
  if (searchCooldownMap.size > 20) {
    const oldest = searchCooldownMap.keys().next().value
    if (oldest !== undefined) searchCooldownMap.delete(oldest)
  }
}

function getSearchCache(keyword: string, publishTime: PublishTimeFilter): DouyinSearchResult[] | null {
  const key = `${keyword}::${publishTime}`
  const entry = searchCache.get(key)
  if (entry && Date.now() - entry.timestamp < SEARCH_CACHE_TTL_MS) {
    return entry.data
  }
  // Expired — clean up
  if (entry) searchCache.delete(key)
  return null
}

function setSearchCache(keyword: string, publishTime: PublishTimeFilter, data: DouyinSearchResult[]): void {
  const key = `${keyword}::${publishTime}`
  searchCache.set(key, { timestamp: Date.now(), data })
  // Simple cleanup: limit cache to 50 entries
  if (searchCache.size > 50) {
    const oldest = searchCache.keys().next().value
    if (oldest !== undefined) searchCache.delete(oldest)
  }
}

// Request spacing — avoid triggering rate limits
// 注意：多关键词并行搜索时应跳过 spacing（由调用方控制）
let lastSearchRequestTime = 0
const MIN_SEARCH_INTERVAL_MS = 1000 // 1s between search requests

async function searchRequestSpacing(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastSearchRequestTime
  if (elapsed < MIN_SEARCH_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_SEARCH_INTERVAL_MS - elapsed))
  }
  lastSearchRequestTime = Date.now()
}

// ─── Types ─────────────────────────────────────────────

export interface DouyinVideoDetail {
  aweme_id: string
  desc: string
  author: string
  sec_uid: string
  digg_count: number
  comment_count: number
  share_count: number
  collect_count: number
  create_time: number
  cover_url: string
}

export interface DouyinHotSearchItem {
  word: string
  hot_value: string
}

export interface DouyinComment {
  text: string
  nickname: string
  digg_count: number
  create_time: number
}

export interface DouyinCommentResponse {
  count: number
  has_more: boolean
  cursor: number
  items: DouyinComment[]
}

export type PublishTimeFilter = 'none' | '1d' | '7d' | '14d' | '30d'

export interface DouyinSearchResult {
  aweme_id: string
  desc: string
  cover: string
  author?: string
  publish_time?: string
  digg_count?: number
  comment_count?: number
  share_count?: number
  collect_count?: number
}

export interface DouyinTranscriptSegment {
  start: number
  end: number
  text: string
}

export interface DouyinTranscript {
  awemeId: string
  text: string
  language: string
  duration: number
  model: string
  segments: DouyinTranscriptSegment[]
  /** 视频标题/描述，作为 LLM 纠错的上下文 */
  videoDesc?: string
  /** 视频作者，辅助 LLM 理解语境 */
  videoAuthor?: string
}

// ─── Schemas ───────────────────────────────────────────

const videoDetailSchema = z.object({
  aweme_id: z.string(),
  desc: z.string(),
  author: z.string(),
  sec_uid: z.string(),
  digg_count: z.number(),
  comment_count: z.number(),
  share_count: z.number(),
  collect_count: z.number(),
  create_time: z.number(),
  cover_url: z.string(),
})

const hotSearchSchema = z.object({
  count: z.number(),
  items: z.array(
    z.object({
      word: z.string(),
      hot_value: z.string(),
    }),
  ),
})

const commentsSchema = z.object({
  count: z.number(),
  has_more: z.boolean(),
  cursor: z.number(),
  items: z.array(
    z.object({
      text: z.string(),
      nickname: z.string(),
      digg_count: z.number(),
      create_time: z.number(),
    }),
  ),
})

const searchSchema = z.object({
  count: z.number(),
  items: z.array(
    z.object({
      aweme_id: z.string(),
      desc: z.string(),
      cover: z.string(),
      author: z.string().optional(),
      publish_time: z.string().optional(),
      digg_count: z.number().optional().default(0),
      comment_count: z.number().optional().default(0),
      share_count: z.number().optional().default(0),
      collect_count: z.number().optional().default(0),
    }),
  ),
  source: z.string(),
})

// ─── Client ────────────────────────────────────────────

/**
 * 带自动重试的 fetch — 针对网络错误（非超时）自动重试 1 次。
 *
 * 重要：微服务端 (api_client.py _request_json) 已经内置了 3 次重试，
 * 重试间隔为 1s+2s+5s=8s。微服务内部的超时上限约 15s（单次请求），
 * 3 次重试总耗时最多约 15+1+15+2+15+5 = 53s。
 *
 * 过去的实现对外层超时也做 1 次重试（45s × 2 + 1s = 91s），
 * 但这会导致双重超时叠加——微服务内部已经重试过了，外层再重试只会
 * 让用户等更久。现在改为：
 *  - 仅对网络错误（ECONNREFUSED/ECONNRESET）重试 1 次
 *  - 超时（aborted）不重试——微服务内部已重试 3 次，超时说明确实不可达
 *  - 4xx/5xx HTTP 状态码不重试
 *  - 重试间隔 1s
 */
async function douyinFetchWithRetry<T>(
  url: string,
  fetchOptions: RequestInit,
  timeout: number,
): Promise<T> {
  const maxRetries = 1
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!response.ok) {
        throw new Error(
          `Douyin API error: ${response.status} ${response.statusText}`,
        )
      }

      const data = await response.json()
      return data as T
    } catch (error) {
      clearTimeout(timer)
      lastError = error instanceof Error ? error : new Error(String(error))

      const isAbort = lastError.name === 'AbortError'
      const isTimeoutMsg = lastError.message.includes('aborted') || lastError.message.includes('timeout')
      const isNetworkErr = lastError.message.includes('fetch failed') || lastError.message.includes('ECONNREFUSED') || lastError.message.includes('ECONNRESET')

      // 超时不重试——微服务内部已重试 3 次，超时说明确实不可达
      if (isAbort || isTimeoutMsg) {
        throw lastError
      }

      // 非 HTTP 状态码错误、非网络错误 → 直接抛出
      if (!isNetworkErr) {
        throw lastError
      }

      // Last attempt — throw the error
      if (attempt === maxRetries) {
        throw lastError
      }

      // 仅网络错误重试，等待 1s
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  throw lastError || new Error('Unexpected: douyinFetchWithRetry exhausted without error')
}

async function douyinFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const url = `${DOUYIN_API_BASE}${path}`
  const timeout = options?.timeoutMs ?? DOUYIN_TIMEOUT_MS

  const fetchOptions: RequestInit = {
    headers: { 'Content-Type': 'application/json' },
  }
  if (options?.method === 'POST' && options.body) {
    fetchOptions.method = 'POST'
    fetchOptions.body = JSON.stringify(options.body)
  }

  return douyinFetchWithRetry<T>(url, fetchOptions, timeout)
}

/**
 * 并发限流器 — 限制同时发起的 Promise 数量，防止微服务过载。
 * 这对 searchViaDouyin 中并行获取多条视频详情至关重要。
 */
export async function withConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<{ result: R; ok: boolean }[]> {
  const results: { result: R; ok: boolean }[] = new Array(items.length)

  let nextIndex = 0

  async function worker() {
    while (true) {
      const myIndex = nextIndex++
      if (myIndex >= items.length) break

      try {
        const result = await fn(items[myIndex], myIndex)
        results[myIndex] = { result, ok: true }
      } catch {
        results[myIndex] = { result: null as unknown as R, ok: false }
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)

  return results
}

// ─── Public API ────────────────────────────────────────

export async function getVideoDetail(
  awemeId: string,
): Promise<DouyinVideoDetail> {
  const data = await douyinFetch<unknown>(
    `/api/v1/video/${awemeId}`,
    // 微服务内部有 3 次重试（延迟 1+2+5=8s），3 次重试最多约 53s。
    // 60s 给微服务足够时间完成全部内部重试。外层不重试超时。
    { timeoutMs: 60_000 },
  )
  return videoDetailSchema.parse(data)
}

export async function getHotSearch(): Promise<DouyinHotSearchItem[]> {
  const data = await douyinFetch<{ count: number; items: DouyinHotSearchItem[] }>(
    '/api/v1/hot-search',
    { timeoutMs: 30_000 }, // 微服务有 5 分钟缓存，首次请求可能慢，后续秒回
  )
  return hotSearchSchema.parse(data).items
}

export async function getComments(
  awemeId: string,
  count = 20,
  cursor = 0,
): Promise<DouyinCommentResponse> {
  const data = await douyinFetch<unknown>(
    `/api/v1/comments/${awemeId}?count=${count}&cursor=${cursor}`,
    // 评论采集是最容易被反爬的接口：
    // 微服务内部有 3 次重试（延迟 1+2+5=8s），单次请求上限 ~15s，
    // 3 次重试最多约 53s。设 45s 给微服务足够时间完成全部内部重试。
    // 如果 45s 还没返回，说明反爬严重（Cookie 过期/验证码触发），
    // 继续等也大概率拿不到结果。
    { timeoutMs: 45_000 },
  )
  const parsed = commentsSchema.parse(data) as DouyinCommentResponse
  // 降级处理：微服务返回空 items 但没有报错时，说明抖音风控拦截了请求
  // （empty 200 / 403 / 429）。返回空结果而非抛错，让上层 UI 能优雅降级。
  if (parsed.items.length === 0 && cursor === 0) {
    console.warn('[douyin-client] Comments returned empty for first page', {
      awemeId,
      count: parsed.count,
      hasMore: parsed.has_more,
      // 微服务可能在风控时返回 has_more=false, cursor=0, items=[]
      // 这是正常的风控降级，不需要抛错
    })
  }
  return parsed
}

export interface SearchDouyinOptions {
  /** 跳过请求间隔（多关键词并行搜索时使用，避免串行化） */
  skipSpacing?: boolean
}

export async function searchDouyin(
  keyword: string,
  count = 20,
  publishTime: PublishTimeFilter = 'none',
  options?: SearchDouyinOptions,
): Promise<DouyinSearchResult[]> {
  // Check cache first
  const cached = getSearchCache(keyword, publishTime)
  if (cached) {
    return cached
  }

  // Check cooldown — 该关键词刚被风控，不再请求
  const cooldown = isSearchInCooldown(keyword)
  if (cooldown) {
    const remainingSec = Math.ceil((SEARCH_COOLDOWN_TTL_MS - (Date.now() - cooldown.timestamp)) / 1000)
    console.warn(`[douyin-client] Keyword "${keyword}" in cooldown (${remainingSec}s remaining, reason: ${cooldown.reason})`)
    return []
  }

  // Request spacing to avoid rate limiting
  // 多关键词并行搜索时跳过 spacing，避免串行化增加延迟
  if (!options?.skipSpacing) {
    await searchRequestSpacing()
  }

  try {
    const data = await douyinFetch<{
      count: number
      items: DouyinSearchResult[]
      source: string
    }>('/api/v1/search', {
      method: 'POST',
      body: { keyword, count, publish_time: publishTime },
      timeoutMs: SEARCH_TIMEOUT_MS, // 4s 快速失败，避免被风控时浪费 ~50s
    })
    const items = searchSchema.parse(data).items

    // Cache results
    setSearchCache(keyword, publishTime, items)
    return items
  } catch (error) {
    // Set cooldown on failure — 避免连续触发风控
    const msg = error instanceof Error ? error.message : String(error)
    const reason = msg.includes('aborted') || msg.includes('timeout') ? 'timeout' : 'error'
    setSearchCooldown(keyword, reason)
    throw error
  }
}

/** Clear search cache and cooldown — useful after cookie refresh */
export function clearSearchCache(): void {
  searchCache.clear()
  searchCooldownMap.clear()
}

/** Clear search cooldown — useful for manual retry after cooldown expires */
export function clearSearchCooldown(): void {
  searchCooldownMap.clear()
}

/** Get cooldown status — useful for UI display */
export function getSearchCooldownStatus(keyword: string): { inCooldown: boolean; remainingSec: number } {
  const entry = searchCooldownMap.get(keyword)
  if (!entry) return { inCooldown: false, remainingSec: 0 }
  const elapsed = Date.now() - entry.timestamp
  if (elapsed >= SEARCH_COOLDOWN_TTL_MS) {
    searchCooldownMap.delete(keyword)
    return { inCooldown: false, remainingSec: 0 }
  }
  return { inCooldown: true, remainingSec: Math.ceil((SEARCH_COOLDOWN_TTL_MS - elapsed) / 1000) }
}

/**
 * 检查输入是否包含抖音短链接（如 https://v.douyin.com/xxx/）
 *
 * 支持以下场景:
 *  - 纯短链: https://v.douyin.com/xxx/
 *  - 分享文本: 7.99 复制打开抖音，看看【...】... https://v.douyin.com/xxx/
 */
export function isDouyinShortUrl(input: string): boolean {
  const lower = input.toLowerCase().trim()
  return lower.includes('v.douyin.com') || lower.includes('iesdouyin.com')
}

/**
 * 解析抖音短链接，跟随重定向获取真实 URL，再提取 awemeId
 *
 * 支持以下输入:
 *  - 纯短链: https://v.douyin.com/xxx/
 *  - 分享文本: 7.99 复制打开抖音，看看【...】... https://v.douyin.com/xxx/
 *    （会先提取 URL 再解析）
 *
 * 返回 awemeId 或 null
 */
export async function resolveDouyinShortUrl(
  shortUrlOrText: string,
): Promise<string | null> {
  try {
    // 从分享文本中提取 URL
    const urlMatch = shortUrlOrText.match(/https?:\/\/[^\s]+/i)
    const shortUrl = urlMatch ? urlMatch[0] : shortUrlOrText.trim()

    // 使用 GET 请求跟随重定向，获取最终 URL
    const response = await fetch(shortUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    // 从最终 URL 提取 awemeId
    const finalUrl = response.url
    const awemeId = extractAwemeId(finalUrl)
    if (awemeId) return awemeId

    // 如果 URL 中没有，尝试从页面内容中提取
    const html = await response.text()
    const videoMatch = html.match(/\/video\/(\d{15,20})/)
    if (videoMatch) return videoMatch[1]

    const noteMatch = html.match(/\/note\/(\d{15,20})/)
    if (noteMatch) return noteMatch[1]

    return null
  } catch {
    return null
  }
}

/**
 * 从文本中提取第一个抖音 URL（http/https）
 *
 * 支持以下场景:
 *  - 纯 URL: https://www.douyin.com/video/123
 *  - 分享文本: 7.99 复制打开抖音，看看【竺天天的视频】... http://v.douyin.com/xxx/
 *  - 搜索链接: https://www.douyin.com/search/xxx?modal_id=123&type=general
 */
function extractDouyinUrlFromText(input: string): string | null {
  // 匹配 http:// 或 https:// 开头的 URL，直到遇到空白字符或字符串结束
  const urlMatch = input.match(/https?:\/\/[^\s]+/i)
  return urlMatch ? urlMatch[0] : null
}

/**
 * 提取抖音视频 ID
 * 支持格式:
 *  - 纯 ID: 7648778898376854818
 *  - 标准 URL: https://www.douyin.com/video/7648778898376854818
 *  - 搜索页 URL: https://www.douyin.com/search/xxx?modal_id=7648778898376854818&type=general
 *  - 搜索页弹窗 URL: https://www.douyin.com/video/7648778898376854818/search/关键词?modal_id=7650123456789012345&type=general
 *    （modal_id 是弹窗中实际播放的视频 ID，优先于 /video/{id}）
 *  - 笔记 URL: https://www.douyin.com/note/7648778898376854818
 *  - 分享文本: 7.99 复制打开抖音，看看【...】... https://v.douyin.com/xxx/（先提取 URL 再解析）
 *  - 短链: https://v.douyin.com/xxx/（需调用 resolveDouyinShortUrl 异步解析）
 */
export function extractAwemeId(input: string): string | null {
  const trimmed = input.trim()

  // 纯数字 ID
  if (/^\d{15,20}$/.test(trimmed)) {
    return trimmed
  }

  // 从文本中提取 URL（处理分享链接中带中文前缀的情况）
  const url = extractDouyinUrlFromText(trimmed) || trimmed

  // modal_id 参数（搜索页弹窗 URL 中，modal_id 是实际播放视频的 ID）
  // 必须优先于 /video/{id} 和 /note/{id}，因为弹窗 URL 同时包含两者
  // 例: /video/7678929287143964367/search/xxx?modal_id=7672022680020033385
  const modalMatch = url.match(/modal_id=(\d{15,20})/)
  if (modalMatch) {
    return modalMatch[1]
  }

  // URL 中的 /video/{id}
  const videoMatch = url.match(/\/video\/(\d{15,20})/)
  if (videoMatch) {
    return videoMatch[1]
  }

  // URL 中的 /note/{id}
  const noteMatch = url.match(/\/note\/(\d{15,20})/)
  if (noteMatch) {
    return noteMatch[1]
  }

  return null
}

// ─── Health check cache ─────────────────────────────────────
// Cache health status for 5 seconds to avoid redundant HTTP round-trips
// when multiple API routes check health in the same request cycle.
let cachedHealth: {
  ok: boolean
  hasMsToken?: boolean
  timestamp: number
} | null = null
const HEALTH_CACHE_MS = 5_000

/**
 * 检查微服务是否可用（带 5 秒缓存，避免频繁请求）
 * 返回微服务状态及 msToken 是否存在
 */
export async function checkDouyinHealth(): Promise<boolean> {
  // Return cached result if still fresh
  if (cachedHealth && Date.now() - cachedHealth.timestamp < HEALTH_CACHE_MS) {
    return cachedHealth.ok
  }

  try {
    const data = await douyinFetch<{ status: string; has_ms_token?: boolean }>(
      '/api/v1/health',
      { timeoutMs: 3_000 },
    )
    const ok = data.status === 'ok'
    cachedHealth = {
      ok,
      hasMsToken: data.has_ms_token,
      timestamp: Date.now(),
    }
    // 如果 msToken 缺失，输出警告帮助诊断评论获取失败
    if (ok && data.has_ms_token === false) {
      console.warn(
        '[douyin-client] 微服务健康但 msToken 缺失——评论接口可能被风控拦截。' +
          '请通过 Tabbit 浏览器刷新抖音 Cookie。',
      )
    }
    return ok
  } catch {
    cachedHealth = { ok: false, timestamp: Date.now() }
    return false
  }
}

// ─── Transcript (douyin-ingest) ─────────────────────────

const DOUYIN_INGEST_BIN =
  process.env.DOUYIN_INGEST_BIN || 'douyin-ingest'

// Whisper model configuration — favor accuracy for Chinese transcription
// Model options: tiny < small < base < medium < large-v3
// Default: small (244M) — fits 3GB VRAM GPUs with int8 compute type
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'small'
const WHISPER_DEVICE = process.env.WHISPER_DEVICE || 'cpu'
// beam_size=5 enables multi-candidate comparison instead of greedy decoding
const WHISPER_BEAM_SIZE = parseInt(process.env.WHISPER_BEAM_SIZE || '5', 10)
const WHISPER_COMPUTE_TYPE = process.env.WHISPER_COMPUTE_TYPE || '' // auto: int8 for CPU
const INGEST_CACHE_TTL = process.env.INGEST_CACHE_TTL || '1800' // 30 min cache

/**
 * Resolve the full path to douyin-ingest on Windows.
 * Node.js execFile without shell:true does not resolve bare names via PATHEXT.
 */
function resolveDouyinIngestBin(): string {
  if (process.env.DOUYIN_INGEST_BIN) {
    return process.env.DOUYIN_INGEST_BIN
  }
  if (process.platform === 'win32') {
    // Try common Python Scripts locations
    const candidates = [
      `${process.env.APPDATA}\\Python\\Python312\\Scripts\\douyin-ingest.exe`,
      `${process.env.APPDATA}\\Python\\Python311\\Scripts\\douyin-ingest.exe`,
      `${process.env.APPDATA}\\Python\\Python310\\Scripts\\douyin-ingest.exe`,
    ]
    for (const p of candidates) {
      try {
        if (existsSync(p)) return p
      } catch {
        // ignore
      }
    }
  }
  return DOUYIN_INGEST_BIN
}

/**
 * On Windows, douyin-ingest.exe (PyInstaller bundle) may not inherit the
 * parent process PATH. Using a Python wrapper script ensures the PATH
 * is set correctly before importing the package, so shutil.which()
 * can find ffprobe/ffmpeg.
 */
function resolveDouyinIngestCommand(): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    // Use python + wrapper script for reliable PATH inheritance
    const wrapperPath = join(
      process.cwd(),
      'scripts',
      'di-wrapper.py',
    )
    if (existsSync(wrapperPath)) {
      return { cmd: 'python', args: [wrapperPath] }
    }
  }
  // Fallback: call douyin-ingest directly
  return { cmd: resolveDouyinIngestBin(), args: [] }
}
const DOUYIN_INGEST_TIMEOUT_MS = 300_000 // 5 min (下载+模型加载+转写)

interface IngestVideo {
  aweme_id: string
  speech_audio_file?: string
  transcription?: {
    text: string
    language: string
    duration: number
    model: string
    segments: Array<{
      start: number
      end: number
      text: string
    }>
    transcript_file?: string
    segments_file?: string
  }
}

/**
 * 通过 douyin-ingest CLI 提取抖音视频口播文案。
 *
 * 流程:
 *  1. 调用 `douyin-ingest <url> --headless --json --transcribe`
 *  2. 解析 JSON 输出，提取 transcription 字段
 *  3. 返回纯文本 + 带时间戳的片段
 *
 * 需要环境变量:
 *  - DOUYIN_INGEST_BIN: douyin-ingest 可执行文件路径（默认在 PATH 中查找）
 *  可选:
 *  - DOUYIN_INGEST_HOME: douyin-ingest 数据目录（storage_state.json 所在目录）
 *
 * @param urlOrId 抖音视频链接或 awemeId
 * @returns 口播文案（纯文本 + 分段时间戳）
 */
export async function getVideoTranscript(
  urlOrId: string,
): Promise<DouyinTranscript> {
  const awemeId = extractAwemeId(urlOrId)
  // 提取到 awemeId 时统一构建标准视频 URL
  // 支持纯 ID、标准 URL、搜索页链接 (modal_id)、分享文本等场景
  const url = awemeId
    ? `https://www.douyin.com/video/${awemeId}`
    : urlOrId.trim()

  const sessionId = randomUUID().slice(0, 8)
  const workDir = join(tmpdir(), `douyin-ingest-${sessionId}`)

  // Ensure work directory exists before using it as cwd
  mkdirSync(workDir, { recursive: true })

  const args = [
    url,
    '--headless',
    '--json',
    '--transcribe',
    '--model', WHISPER_MODEL,
    '--device', WHISPER_DEVICE,
    '--beam-size', String(WHISPER_BEAM_SIZE),
    '--cache-ttl', INGEST_CACHE_TTL,
    '--speech-audio-dir',
    join(workDir, 'audio'),
    '--transcript-dir',
    join(workDir, 'transcripts'),
  ]

  // Optional: compute type override (e.g. int8_float16 for GPU, int8 for CPU)
  if (WHISPER_COMPUTE_TYPE) {
    args.push('--compute-type', WHISPER_COMPUTE_TYPE)
  }

  // 构建子进程环境变量
  // 确保包含完整 PATH（winget 安装的 ffmpeg/ffprobe 可能不在 dev server 的 PATH 中）
  // 设置 HF 镜像加速 Whisper 模型下载
  const env: NodeJS.ProcessEnv = { ...process.env }

  // 如果设置了 DOUYIN_INGEST_HOME，让 douyin-ingest 在该目录查找 storage_state
  if (process.env.DOUYIN_INGEST_HOME) {
    env.DOUYIN_INGEST_HOME = process.env.DOUYIN_INGEST_HOME
  }

  // 设置 HuggingFace 镜像（如果未设置），加速 Whisper 模型下载
  if (!env.HF_ENDPOINT) {
    env.HF_ENDPOINT = 'https://hf-mirror.com'
  }

  // Force Python UTF-8 output — Windows default is cp936 (GBK) which garbles Chinese
  env.PYTHONUTF8 = '1'
  env.PYTHONIOENCODING = 'utf-8'

  // Windows: ensure all needed directories are in PATH
  if (process.platform === 'win32' && env.PATH) {
    const pathDirs = env.PATH.split(';').filter(Boolean)
    const prependIfMissing = (dir: string) => {
      if (!pathDirs.some(d => d.toLowerCase() === dir.toLowerCase())) {
        pathDirs.unshift(dir)
      }
    }
    // winget Links (ffmpeg/ffprobe) — prepend so PyInstaller exes find them
    prependIfMissing(`${process.env.USERPROFILE}\\AppData\\Local\\Microsoft\\WinGet\\Links`)
    // Python Scripts (douyin-ingest.exe)
    prependIfMissing(`${process.env.APPDATA}\\Python\\Python312\\Scripts`)
    env.PATH = pathDirs.join(';')
  }

  // Also set FFMPEG/FFPROBE binary paths explicitly for douyin-ingest
  if (process.platform === 'win32') {
    const wingetLinks = `${process.env.USERPROFILE}\\AppData\\Local\\Microsoft\\WinGet\\Links`
    if (!env.FFPROBE_BINARY) {
      env.FFPROBE_BINARY = `${wingetLinks}\\ffprobe.exe`
    }
    if (!env.FFMPEG_BINARY) {
      env.FFMPEG_BINARY = `${wingetLinks}\\ffmpeg.exe`
    }
  }

  // Resolve command — use python wrapper on Windows for reliable PATH
  const { cmd: ingestCmd, args: ingestArgs } = resolveDouyinIngestCommand()

  try {
    const { stdout } = await execFileAsync(
      ingestCmd,
      [...ingestArgs, ...args],
      {
        timeout: DOUYIN_INGEST_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        env,
        cwd: workDir,
        encoding: 'utf-8', // Force UTF-8 decoding — douyin-ingest outputs JSON with Chinese text
      },
    )

    const payload = JSON.parse(stdout) as {
      ok: boolean
      error?: { type: string; message: string; fix_command?: string }
      videos?: IngestVideo[]
    }

    if (!payload.ok) {
      const msg = payload.error?.message || 'douyin-ingest failed'
      const fix = payload.error?.fix_command
      throw new Error(
        fix ? `${msg} (fix: ${fix})` : msg,
      )
    }

    const video = payload.videos?.[0]
    if (!video) {
      throw new Error('douyin-ingest returned no videos')
    }

    const tr = video.transcription
    if (!tr) {
      throw new Error(
        'No transcription in douyin-ingest output — audio may be empty or transcription dependency missing',
      )
    }

    // 获取视频详情，作为 LLM 纠错的上下文
    let videoDesc: string | undefined
    let videoAuthor: string | undefined
    try {
      const finalAwemeId = video.aweme_id || awemeId || ''
      if (finalAwemeId) {
        const detail = await getVideoDetail(finalAwemeId)
        videoDesc = detail.desc || undefined
        videoAuthor = detail.author || undefined
      }
    } catch {
      // 获取详情失败不影响转写结果
    }

    return {
      awemeId: video.aweme_id || awemeId || urlOrId,
      text: tr.text,
      language: tr.language,
      duration: tr.duration,
      model: tr.model,
      segments: tr.segments || [],
      videoDesc,
      videoAuthor,
    }
  } catch (error) {
    // execFile 超时或非零退出码
    const msg =
      error instanceof Error ? error.message : String(error)
    if (msg.includes('timed out')) {
      throw new Error(
        'douyin-ingest timed out — video may be too long or network too slow',
      )
    }
    throw new Error(`douyin-ingest error: ${msg}`)
  } finally {
    // 清理临时目录
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
