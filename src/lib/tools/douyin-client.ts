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
    { timeoutMs: 30_000 }, // 视频详情可能涉及 Cookie 刷新，15s 默认不够
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
    { timeoutMs: 30_000 }, // 评论采集可能涉及 Cookie 刷新，15s 默认不够
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
    timeoutMs: 60_000, // API 搜索 + 浏览器降级搜索，Playwright 搜索可能较慢
  })
  return searchSchema.parse(data).items
}

/**
 * 检查输入是否为抖音短链接（如 https://v.douyin.com/xxx/）
 */
export function isDouyinShortUrl(input: string): boolean {
  const lower = input.toLowerCase().trim()
  return lower.includes('v.douyin.com') || lower.includes('iesdouyin.com')
}

/**
 * 解析抖音短链接，跟随重定向获取真实 URL，再提取 awemeId
 * 返回 awemeId 或 null
 */
export async function resolveDouyinShortUrl(
  shortUrl: string,
): Promise<string | null> {
  try {
    // 使用 HEAD 请求跟随重定向，获取最终 URL
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
 * 提取抖音视频 ID
 * 支持格式:
 *  - 纯 ID: 7648778898376854818
 *  - URL: https://www.douyin.com/video/7648778898376854818
 *  - 短链: https://v.douyin.com/xxx/（需调用 resolveDouyinShortUrl 异步解析）
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

// ─── Health check cache ─────────────────────────────────────
// Cache health status for 5 seconds to avoid redundant HTTP round-trips
// when multiple API routes check health in the same request cycle.
let cachedHealth: { ok: boolean; timestamp: number } | null = null
const HEALTH_CACHE_MS = 5_000

/**
 * 检查微服务是否可用（带 5 秒缓存，避免频繁请求）
 */
export async function checkDouyinHealth(): Promise<boolean> {
  // Return cached result if still fresh
  if (cachedHealth && Date.now() - cachedHealth.timestamp < HEALTH_CACHE_MS) {
    return cachedHealth.ok
  }

  try {
    const data = await douyinFetch<{ status: string }>(
      '/api/v1/health',
      { timeoutMs: 3_000 },
    )
    const ok = data.status === 'ok'
    cachedHealth = { ok, timestamp: Date.now() }
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
  const url =
    awemeId && /^\d+$/.test(urlOrId.trim())
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
