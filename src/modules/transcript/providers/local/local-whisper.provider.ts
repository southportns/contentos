/**
 * LocalWhisperProvider — 本地 Whisper (faster-whisper) ASR Provider
 *
 * 封装现有的 douyin-ingest CLI → faster-whisper 链路。
 * 这是 V1.0 的默认 Local Provider，通过 douyin-ingest 完成：
 *  1. 视频下载
 *  2. 音频提取（FFmpeg）
 *  3. faster-whisper 语音识别
 *
 * 环境变量:
 *  - WHISPER_MODEL: Whisper 模型大小（tiny/small/base/medium/large-v3）
 *  - WHISPER_DEVICE: 计算设备（cpu/cuda）
 *  - WHISPER_BEAM_SIZE: beam search 大小
 *  - WHISPER_COMPUTE_TYPE: 量化类型
 *  - DOUYIN_INGEST_BIN: douyin-ingest 路径
 *  - DOUYIN_INGEST_HOME: 数据目录
 *
 * 架构位置: Provider Layer（实现 ASRProvider 接口）
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import type { ASRProvider } from '../../domain/asr-provider'
import type {
  AudioInput,
  ASROptions,
  TranscriptResult,
  ProviderHealth,
  CostEstimate,
  TranscriptSegment,
  TranscriptSource,
} from '../../domain/transcript.types'
import { buildQuality } from '../../pipeline/quality-engine'

const execFileAsync = promisify(execFile)

// ─── Config ────────────────────────────────────────────

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'small'
const WHISPER_DEVICE = process.env.WHISPER_DEVICE || 'cpu'
const WHISPER_BEAM_SIZE = parseInt(process.env.WHISPER_BEAM_SIZE || '5', 10)
const WHISPER_COMPUTE_TYPE = process.env.WHISPER_COMPUTE_TYPE || ''
const INGEST_CACHE_TTL = process.env.INGEST_CACHE_TTL || '1800'
const DOUYIN_INGEST_TIMEOUT_MS = 300_000

// ─── Types ─────────────────────────────────────────────

interface IngestVideo {
  aweme_id: string
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
  }
}

interface IngestResponse {
  ok: boolean
  error?: { type: string; message: string; fix_command?: string }
  videos?: IngestVideo[]
}

// ─── Helpers ────────────────────────────────────────────

function resolveDouyinIngestCommand(): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    const wrapperPath = join(process.cwd(), 'scripts', 'di-wrapper.py')
    try {
      if (existsSync(wrapperPath)) {
        return { cmd: 'python', args: [wrapperPath] }
      }
    } catch {
      // ignore
    }
  }
  const bin = process.env.DOUYIN_INGEST_BIN || 'douyin-ingest'
  return { cmd: bin, args: [] }
}

// ─── Provider Implementation ────────────────────────────

export class LocalWhisperProvider implements ASRProvider {
  readonly id = 'local-whisper'
  readonly mode = 'local' as const
  readonly displayName = 'Local Whisper (faster-whisper)'
  readonly languages = ['zh', 'en', 'auto']

  async transcribe(
    audio: AudioInput,
    options?: ASROptions,
  ): Promise<TranscriptResult> {
    // LocalWhisperProvider 通过 douyin-ingest CLI 完成整个流程
    // douyin-ingest 的位置参数 (user) 只接受 HTTP(S) URL、短链或分享文本，
    // 不接受本地文件路径。
    //
    // 优先用 audio.url（标准抖音 URL）调用 douyin-ingest：
    //   - douyin-ingest 内部有缓存机制，Failover 场景下预提取的音频会被缓存复用，
    //     不会重复下载视频。
    //   - 使用 --cache-ttl 0 强制执行转写（避免缓存命中跳过转写）。
    //
    // 只有当 audio.url 不存在时（极少见），才尝试用 filePath（但 douyin-ingest
    // 可能无法处理本地路径，这是最后手段）。
    const hasLocalFile = audio.filePath && existsSync(audio.filePath)
    const url = audio.url || (hasLocalFile ? audio.filePath! : audio.filePath)
    if (!url) {
      throw new Error('LocalWhisperProvider requires a URL or file path')
    }

    // Failover 场景下已有预提取的本地文件，说明音频已下载过，
    // douyin-ingest 缓存应该命中。使用 --cache-ttl 0 确保转写不被跳过。
    const cacheTtl = hasLocalFile ? '0' : INGEST_CACHE_TTL

    const sessionId = randomUUID().slice(0, 8)
    const workDir = join(tmpdir(), `douyin-ingest-${sessionId}`)
    mkdirSync(workDir, { recursive: true })

    const model = options?.quality === 'maximum'
      ? process.env.WHISPER_MODEL_LARGE || 'large-v3'
      : WHISPER_MODEL

    const args = [
      url,
      '--headless',
      '--json',
      '--transcribe',
      '--model', model,
      '--device', WHISPER_DEVICE,
      '--beam-size', String(WHISPER_BEAM_SIZE),
      '--cache-ttl', cacheTtl,
      '--speech-audio-dir', join(workDir, 'audio'),
      '--transcript-dir', join(workDir, 'transcripts'),
    ]

    if (WHISPER_COMPUTE_TYPE) {
      args.push('--compute-type', WHISPER_COMPUTE_TYPE)
    }

    const env: NodeJS.ProcessEnv = { ...process.env }

    if (process.env.DOUYIN_INGEST_HOME) {
      env.DOUYIN_INGEST_HOME = process.env.DOUYIN_INGEST_HOME
    }
    if (!env.HF_ENDPOINT) {
      env.HF_ENDPOINT = 'https://hf-mirror.com'
    }
    env.PYTHONUTF8 = '1'
    env.PYTHONIOENCODING = 'utf-8'

    if (process.platform === 'win32' && env.PATH) {
      const pathDirs = env.PATH.split(';').filter(Boolean)
      const prependIfMissing = (dir: string) => {
        if (!pathDirs.some(d => d.toLowerCase() === dir.toLowerCase())) {
          pathDirs.unshift(dir)
        }
      }
      prependIfMissing(`${process.env.USERPROFILE}\\AppData\\Local\\Microsoft\\WinGet\\Links`)
      prependIfMissing(`${process.env.APPDATA}\\Python\\Python312\\Scripts`)
      env.PATH = pathDirs.join(';')
    }

    if (process.platform === 'win32') {
      const wingetLinks = `${process.env.USERPROFILE}\\AppData\\Local\\Microsoft\\WinGet\\Links`
      if (!env.FFPROBE_BINARY) env.FFPROBE_BINARY = `${wingetLinks}\\ffprobe.exe`
      if (!env.FFMPEG_BINARY) env.FFMPEG_BINARY = `${wingetLinks}\\ffmpeg.exe`
    }

    const { cmd: ingestCmd, args: ingestArgs } = resolveDouyinIngestCommand()
    const startTime = Date.now()

    try {
      const { stdout } = await execFileAsync(
        ingestCmd,
        [...ingestArgs, ...args],
        {
          timeout: DOUYIN_INGEST_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024,
          env,
          cwd: workDir,
          encoding: 'utf-8',
        },
      )

      const payload = JSON.parse(stdout) as IngestResponse

      if (!payload.ok) {
        const msg = payload.error?.message || 'douyin-ingest failed'
        const fix = payload.error?.fix_command
        throw new Error(fix ? `${msg} (fix: ${fix})` : msg)
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

      // 防御：如果 transcription 存在但 text 为空，可能是缓存命中但转写被跳过
      if (!tr.text || tr.text.trim().length === 0) {
        throw new Error(
          'douyin-ingest returned empty transcription text — cache may have skipped transcription. ' +
          'Try clearing cache or using a different video.',
        )
      }

      const processingTimeMs = Date.now() - startTime

      // Build segments
      const segments: TranscriptSegment[] = (tr.segments || []).map((s, i) => ({
        id: `${sessionId}-${i}`,
        startMs: Math.round(s.start * 1000),
        endMs: Math.round(s.end * 1000),
        rawText: s.text,
        source: 'asr' as const,
      }))

      // Build source info
      const sources: TranscriptSource[] = [{
        type: 'whisper' as const,
        provider: this.id,
        model: tr.model,
        processingTimeMs,
      }]

      // faster-whisper 不直接输出置信度，使用默认值
      const defaultConfidence = 85
      const quality = buildQuality(defaultConfidence)

      return {
        id: sessionId,
        source: {
          type: 'douyin' as const,
          videoId: video.aweme_id,
          url,
        },
        provider: {
          mode: this.mode,
          provider: this.id,
          model: tr.model,
        },
        language: tr.language || options?.language || 'zh',
        rawText: tr.text,
        correctedText: tr.text, // 纠错由 TranscriptService 的 LLM 阶段处理
        confidence: quality.confidence,
        durationMs: Math.round(tr.duration * 1000),
        segments,
        sources,
        quality,
        corrections: [],
        correctionCount: 0,
        processingTimeMs,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('timed out')) {
        throw new Error(
          'douyin-ingest timed out — video may be too long or network too slow',
        )
      }
      throw new Error(`LocalWhisperProvider error: ${msg}`)
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const { cmd, args } = resolveDouyinIngestCommand()
      // Run a quick version check
      const { stdout } = await execFileAsync(
        cmd,
        [...args, '--version'],
        { timeout: 5_000, encoding: 'utf-8' },
      )
      return {
        healthy: true,
        message: stdout.trim().slice(0, 100),
        latencyMs: 0,
      }
    } catch {
      return {
        healthy: false,
        message: 'douyin-ingest not found or not executable',
      }
    }
  }

  async estimateCost(_audio: AudioInput): Promise<CostEstimate> {
    // Local provider: 无 API 费用
    return {
      costCNY: 0,
      estimatedSeconds: Math.round((_audio.durationSec || 60) * 3), // ~3x real-time on CPU
      description: 'Local inference — no API cost',
    }
  }
}
