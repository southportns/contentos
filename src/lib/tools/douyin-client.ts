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
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

// ─── Config ────────────────────────────────────────────

const DOUYIN_API_BASE =
  process.env.DOUYIN_API_BASE || 'http://localhost:8800'

const DOUYIN_TIMEOUT_MS = 30_000

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
  publish_time?: string
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
      publish_time: z.string().optional(),
    }),
  ),
  source: z.string(),
})

// ─── Client ────────────────────────────────────────────

async function douyinFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const url = `${DOUYIN_API_BASE}${path}`
  const timeout = options?.timeoutMs ?? DOUYIN_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const fetchOptions: RequestInit = {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    }
    if (options?.method === 'POST' && options.body) {
      fetchOptions.method = 'POST'
      fetchOptions.body = JSON.stringify(options.body)
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      throw new Error(
        `Douyin API error: ${response.status} ${response.statusText} at ${path}`,
      )
    }

    const data = await response.json()
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

// ─── Public API ────────────────────────────────────────

export async function getVideoDetail(
  awemeId: string,
): Promise<DouyinVideoDetail> {
  const data = await douyinFetch<unknown>(
    `/api/v1/video/${awemeId}`,
  )
  return videoDetailSchema.parse(data)
}

export async function getHotSearch(): Promise<DouyinHotSearchItem[]> {
  const data = await douyinFetch<{ count: number; items: DouyinHotSearchItem[] }>(
    '/api/v1/hot-search',
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
  )
  return commentsSchema.parse(data) as DouyinCommentResponse
}

export async function searchDouyin(
  keyword: string,
  count = 20,
  publishTime: PublishTimeFilter = 'none',
): Promise<DouyinSearchResult[]> {
  const data = await douyinFetch<{
    count: number
    items: DouyinSearchResult[]
    source: string
  }>('/api/v1/search', {
    method: 'POST',
    body: { keyword, count, publish_time: publishTime },
    timeoutMs: 45_000, // 搜索通过浏览器代理，需要更长时间
  })
  return searchSchema.parse(data).items
}

/**
 * 提取抖音视频 ID
 * 支持格式:
 *  - 纯 ID: 7648778898376854818
 *  - URL: https://www.douyin.com/video/7648778898376854818
 *  - 短链: https://v.douyin.com/xxx/
 */
export function extractAwemeId(input: string): string | null {
  const trimmed = input.trim()

  // 纯数字 ID
  if (/^\d{15,20}$/.test(trimmed)) {
    return trimmed
  }

  // URL 中的 /video/{id}
  const videoMatch = trimmed.match(/\/video\/(\d{15,20})/)
  if (videoMatch) {
    return videoMatch[1]
  }

  // URL 中的 /note/{id}
  const noteMatch = trimmed.match(/\/note\/(\d{15,20})/)
  if (noteMatch) {
    return noteMatch[1]
  }

  // modal_id 参数
  const modalMatch = trimmed.match(/modal_id=(\d{15,20})/)
  if (modalMatch) {
    return modalMatch[1]
  }

  return null
}

/**
 * 检查微服务是否可用
 */
export async function checkDouyinHealth(): Promise<boolean> {
  try {
    const data = await douyinFetch<{ status: string }>(
      '/api/v1/health',
      { timeoutMs: 5_000 },
    )
    return data.status === 'ok'
  } catch {
    return false
  }
}

// ─── Transcript (douyin-ingest) ─────────────────────────

const DOUYIN_INGEST_BIN =
  process.env.DOUYIN_INGEST_BIN || 'douyin-ingest'
const DOUYIN_INGEST_TIMEOUT_MS = 180_000 // 3 min (下载+转写)

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
  const url =
    awemeId && /^\d+$/.test(urlOrId.trim())
      ? `https://www.douyin.com/video/${awemeId}`
      : urlOrId.trim()

  const sessionId = randomUUID().slice(0, 8)
  const workDir = join(tmpdir(), `douyin-ingest-${sessionId}`)

  const args = [
    url,
    '--headless',
    '--json',
    '--transcribe',
    '--speech-audio-dir',
    join(workDir, 'audio'),
    '--transcript-dir',
    join(workDir, 'transcripts'),
  ]

  // 如果设置了 DOUYIN_INGEST_HOME，让 douyin-ingest 在该目录查找 storage_state
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (process.env.DOUYIN_INGEST_HOME) {
    env.DOUYIN_INGEST_HOME = process.env.DOUYIN_INGEST_HOME
  }

  try {
    const { stdout } = await execFileAsync(
      DOUYIN_INGEST_BIN,
      args,
      {
        timeout: DOUYIN_INGEST_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        env,
        cwd: workDir,
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

    return {
      awemeId: video.aweme_id || awemeId || urlOrId,
      text: tr.text,
      language: tr.language,
      duration: tr.duration,
      model: tr.model,
      segments: tr.segments || [],
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
