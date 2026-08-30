/**
 * AudioExtractor — 共享音频提取层
 *
 * 使用 douyin-ingest CLI 从抖音视频提取音频为本地文件。
 * Local 和 Cloud Provider 共用此模块，避免重复下载视频。
 *
 * 优化策略:
 *  1. 调用 douyin-ingest <url> --speech-audio-dir <dir>（不带 --transcribe）
 *  2. 解析 JSON 输出，优先使用 speech_audio_file 路径（douyin-ingest 内部已处理直链下载/FFmpeg 提取）
 *  3. 如果 speech_audio_file 不存在（如 cache hit 跳过了提取），回退到目录扫描
 *  4. 保留 audio_download_url / speech_audio_download_url 供后续直链下载使用
 *
 * 架构位置: Pipeline Layer（Provider 之间的共享基础设施）
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rm, readdir, stat, access } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

// ─── Config ────────────────────────────────────────────

const DOUYIN_INGEST_TIMEOUT_MS = 120_000 // 2 min for download + audio extraction

// ─── Types ─────────────────────────────────────────────

export interface ExtractedAudio {
  /** 本地音频文件路径（通常是 {awemeId}.speech.mp3） */
  filePath: string
  /** 临时工作目录（调用方负责清理） */
  workDir: string
  /** 视频的 awemeId（如果能从输出中获取） */
  awemeId?: string
  /** 音频时长（秒），从 douyin-ingest 输出中获取 */
  durationSec?: number
  /** CDN 直链：原始音频下载 URL（如有） */
  audioDownloadUrl?: string
  /** CDN 直链：口播音频下载 URL（如有，优先于 audioDownloadUrl） */
  speechAudioDownloadUrl?: string
  /** 音频是否来自缓存命中（无需重新下载） */
  fromCache?: boolean
  /** 视频标题/描述（从 douyin-ingest 输出中提取，避免额外 API 调用） */
  videoDesc?: string
  /** 视频作者（从 douyin-ingest 输出中提取） */
  videoAuthor?: string
}

// ─── Types (douyin-ingest output) ──────────────────────

interface IngestVideo {
  aweme_id: string
  duration_seconds?: number
  audio_download_url?: string
  speech_audio_download_url?: string
  speech_audio_file?: string
  speech_audio_requires_extraction?: boolean
  /** 视频标题/描述（douyin-ingest 返回） */
  desc?: string
  /** 视频作者（douyin-ingest 返回） */
  author?: string
  transcription?: {
    text: string
    language: string
    duration: number
    model: string
    segments: Array<{ start: number; end: number; text: string }>
  }
}

interface IngestResponse {
  ok: boolean
  cache_hit?: boolean
  error?: { type: string; message: string; fix_command?: string }
  videos?: IngestVideo[]
}

// ─── Helpers (shared logic) ────────────────────────────

function resolveDouyinIngestCommand(): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    const wrapperPath = join(process.cwd(), 'scripts', 'di-wrapper.py')
    if (existsSync(wrapperPath)) {
      return { cmd: 'python', args: [wrapperPath] }
    }
  }
  const bin = process.env.DOUYIN_INGEST_BIN || 'douyin-ingest'
  return { cmd: bin, args: [] }
}

function buildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }

  if (process.env.DOUYIN_INGEST_HOME) {
    env.DOUYIN_INGEST_HOME = process.env.DOUYIN_INGEST_HOME
  }
  if (!env.HF_ENDPOINT) {
    env.HF_ENDPOINT = 'https://hf-mirror.com'
  }
  env.PYTHONUTF8 = '1'
  env.PYTHONIOCODING = 'utf-8'

  if (process.platform === 'win32' && env.PATH) {
    const pathDirs = env.PATH.split(';').filter(Boolean)
    const prependIfMissing = (dir: string) => {
      if (!pathDirs.some(d => d.toLowerCase() === dir.toLowerCase())) {
        pathDirs.unshift(dir)
      }
    }
    prependIfMissing(
      `${process.env.USERPROFILE}\\AppData\\Local\\Microsoft\\WinGet\\Links`,
    )
    prependIfMissing(
      `${process.env.APPDATA}\\Python\\Python312\\Scripts`,
    )
    env.PATH = pathDirs.join(';')
  }

  if (process.platform === 'win32') {
    const wingetLinks = `${process.env.USERPROFILE}\\AppData\\Local\\Microsoft\\WinGet\\Links`
    if (!env.FFPROBE_BINARY) {
      env.FFPROBE_BINARY = `${wingetLinks}\\ffprobe.exe`
    }
    if (!env.FFMPEG_BINARY) {
      env.FFMPEG_BINARY = `${wingetLinks}\\ffmpeg.exe`
    }
  }

  return env
}

// ─── File helpers ──────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function fileReady(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile() && s.size > 0
  } catch {
    return false
  }
}

// ─── Audio Extractor ───────────────────────────────────

/**
 * 从抖音视频 URL 提取音频为本地文件。
 *
 * 使用 douyin-ingest 的 --speech-audio-dir 功能：
 * 下载视频并通过 FFmpeg 提取音频，但不执行 ASR 转写（不传 --transcribe）。
 *
 * 优化：解析 JSON 输出中的 speech_audio_file 路径和 CDN 直链，
 * 避免目录扫描，并保留直链供后续复用。
 *
 * @param url 抖音视频 URL 或 awemeId
 * @returns 提取的音频文件路径和临时目录
 */
export async function extractAudio(url: string): Promise<ExtractedAudio> {
  const sessionId = randomUUID().slice(0, 8)
  const workDir = join(tmpdir(), `di-audio-${sessionId}`)
  const audioDir = join(workDir, 'audio')
  mkdirSync(audioDir, { recursive: true })

  const { cmd: ingestCmd, args: ingestArgs } = resolveDouyinIngestCommand()

  const args = [
    ...ingestArgs,
    url,
    '--headless',
    '--json',
    '--speech-audio-dir', audioDir,
    '--cache-ttl', process.env.INGEST_CACHE_TTL || '1800',
  ]

  try {
    const { stdout } = await execFileAsync(ingestCmd, args, {
      timeout: DOUYIN_INGEST_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: buildEnv(),
      cwd: workDir,
      encoding: 'utf-8',
    })

    // 解析 JSON 输出获取 awemeId、时长、音频路径、CDN 直链和视频上下文
    let awemeId: string | undefined
    let durationSec: number | undefined
    let audioDownloadUrl: string | undefined
    let speechAudioDownloadUrl: string | undefined
    let speechAudioFile: string | undefined
    let fromCache = false
    let videoDesc: string | undefined
    let videoAuthor: string | undefined

    try {
      const payload = JSON.parse(stdout) as IngestResponse
      fromCache = payload.cache_hit ?? false
      const video = payload.videos?.[0]
      awemeId = video?.aweme_id
      durationSec = video?.duration_seconds
      audioDownloadUrl = video?.audio_download_url
      speechAudioDownloadUrl = video?.speech_audio_download_url
      speechAudioFile = video?.speech_audio_file
      videoDesc = video?.desc || undefined
      videoAuthor = video?.author || undefined
    } catch {
      // JSON 解析失败不影响音频提取（回退到目录扫描）
    }

    // 优先策略 1: 使用 douyin-ingest 输出的 speech_audio_file 路径
    // douyin-ingest 内部已经处理了直链下载 → FFmpeg 提取 → 缓存复用
    if (speechAudioFile) {
      // speech_audio_file 可能是绝对路径（douyin-ingest 生成的）或相对路径
      const candidatePath = existsSync(speechAudioFile)
        ? speechAudioFile
        : join(audioDir, speechAudioFile)
      if (await fileReady(candidatePath)) {
        return {
          filePath: candidatePath,
          workDir,
          awemeId,
          durationSec,
          audioDownloadUrl,
          speechAudioDownloadUrl,
          fromCache,
          videoDesc,
          videoAuthor,
        }
      }
    }

    // 优先策略 2: 在 audioDir 中查找提取的音频文件（回退方案）
    // douyin-ingest 输出格式通常是 {awemeId}.speech.mp3
    const files = await readdir(audioDir)
    const audioFile = files.find(
      f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a'),
    )

    if (audioFile) {
      const filePath = join(audioDir, audioFile)
      if (await fileReady(filePath)) {
        return {
          filePath,
          workDir,
          awemeId,
          durationSec,
          audioDownloadUrl,
          speechAudioDownloadUrl,
          fromCache,
          videoDesc,
          videoAuthor,
        }
      }
    }

    // 如果以上都失败，但有 audioDownloadUrl 或 speechAudioDownloadUrl，
    // 仍然返回这些 URL 供调用方自行下载
    if (audioDownloadUrl || speechAudioDownloadUrl) {
      // 不抛错 — 调用方可以使用 CDN 直链自行下载
      console.warn(
        '[audio-extractor] No local audio file found, but CDN URLs available. ' +
        'Caller should download directly.',
      )
    }

    throw new Error(
      'No audio file found after douyin-ingest extraction. ' +
      `Checked directory: ${audioDir}, files: ${files.length}. ` +
      `speech_audio_file: ${speechAudioFile || 'none'}, ` +
      `cache_hit: ${fromCache}`,
    )
  } catch (error) {
    // 清理临时目录
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw new Error(
      `Audio extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * 清理音频提取产生的临时文件
 */
export async function cleanupExtractedAudio(extracted: ExtractedAudio): Promise<void> {
  await rm(extracted.workDir, { recursive: true, force: true }).catch(() => {})
}
