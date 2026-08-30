/**
 * CloudXiaomiProvider — 小米 MiMo ASR Provider
 *
 * 通过小米 MiMo 开放平台 API 完成语音识别。
 * 使用 MiMo-V2.5-ASR 模型，支持中英双语及方言识别。
 *
 * API 接口特点:
 *  - 使用 OpenAI-compatible Chat Completions API
 *  - 音频通过 Base64 编码以 input_audio content 类型传入
 *  - 支持 wav / mp3 格式，Base64 后 ≤ 10MB
 *  - 支持中英、粤语、吴语、闽南语、四川话等
 *  - 支持噪声/远场/多人重叠/带伴奏歌词等复杂场景
 *
 * API 文档: https://platform.xiaomimimo.com/docs/zh-CN/quick-start/usage-guide/audio/Speech-Recognition
 *
 * 环境变量:
 *  - XIAOMI_ASR_API_KEY: 小米 MiMo API Key
 *  - XIAOMI_ASR_MODEL: 模型名称（默认 mimo-v2.5-asr）
 *  - XIAOMI_ASR_BASE_URL: API 地址（默认 https://api.xiaomimimo.com/v1）
 *
 * 架构位置: Provider Layer（实现 ASRProvider 接口）
 */

import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, mkdirSync } from 'node:fs'
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
import { extractAudio, cleanupExtractedAudio, type ExtractedAudio } from '../../pipeline/audio-extractor'
import { getEnvVar } from '@/lib/env/env-loader'

// ─── Config (read dynamically from .env.local) ──────────

function getXiaomiApiKey(): string {
  return getEnvVar('XIAOMI_ASR_API_KEY') || ''
}

function getXiaomiBaseUrl(): string {
  return (
    getEnvVar('XIAOMI_ASR_BASE_URL') ||
    'https://api.xiaomimimo.com/v1'
  )
}

function getXiaomiModel(): string {
  return getEnvVar('XIAOMI_ASR_MODEL') || 'mimo-v2.5-asr'
}

const XIAOMI_TIMEOUT_MS = 120_000 // 2 min
const XIAOMI_MAX_AUDIO_BYTES = 7_500_000 // ~7.5MB raw → ~10MB base64

// ─── Types (MiMo Chat Completions API) ──────────────────

interface MiMoChatChoice {
  message: {
    content: string
  }
  finish_reason: string
}

interface MiMoChatResponse {
  id: string
  model: string
  choices: MiMoChatChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  error?: {
    message: string
    type: string
    code: string
  }
}

// ─── Helpers ────────────────────────────────────────────

/**
 * 根据文件扩展名获取 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.wav':
      return 'audio/wav'
    case '.mp3':
      return 'audio/mpeg'
    // MiMo 仅支持 wav/mp3，但提供 fallback
    case '.m4a':
      return 'audio/mp4'
    default:
      return 'audio/mpeg'
  }
}

// ─── Provider Implementation ────────────────────────────

export class CloudXiaomiProvider implements ASRProvider {
  readonly id = 'cloud-xiaomi'
  readonly mode = 'cloud' as const
  readonly displayName = '小米 MiMo ASR'
  readonly languages = ['zh', 'en', 'auto']

  private ensureApiKey(): string {
    const key = getXiaomiApiKey()
    if (!key) {
      throw new Error(
        'XIAOMI_ASR_API_KEY is not set. Cloud ASR requires a valid MiMo API key.',
      )
    }
    return key
  }

  /**
   * 从视频 URL 提取音频文件路径。
   *
   * 优先级:
   *   1. audio.filePath（已由 transcript-service 预提取或 Failover 复用）
   *   2. audio.speechAudioDownloadUrl / audio.audioDownloadUrl（CDN 直链）
   *   3. AudioExtractor（douyin-ingest，下载+提取，有缓存）
   */
  private async prepareAudioFile(audio: AudioInput): Promise<{ filePath: string; extracted?: ExtractedAudio }> {
    // 策略 1: 外部已提取音频文件，直接复用
    if (audio.filePath && existsSync(audio.filePath)) {
      return { filePath: audio.filePath }
    }

    // 策略 2: 使用 CDN 直链直接下载
    const directUrl = audio.speechAudioDownloadUrl || audio.audioDownloadUrl
    if (directUrl) {
      try {
        const sessionId = randomUUID().slice(0, 8)
        const workDir = join(tmpdir(), `cloud-xiaomi-audio-${sessionId}`)
        mkdirSync(workDir, { recursive: true })
        const filePath = join(workDir, 'audio.mp3')

        const response = await fetch(directUrl, {
          signal: AbortSignal.timeout(60_000),
        })

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer())
          if (buffer.length > 0) {
            await writeFile(filePath, buffer)
            return {
              filePath,
              extracted: { filePath, workDir } as ExtractedAudio,
            }
          }
        }
        console.warn('[cloud-xiaomi] CDN direct download failed, falling back to AudioExtractor')
      } catch (cdnError) {
        console.warn(
          '[cloud-xiaomi] CDN direct download error:',
          cdnError instanceof Error ? cdnError.message : String(cdnError),
        )
      }
    }

    // 策略 3: 回退到 AudioExtractor（douyin-ingest）
    if (!audio.url) {
      throw new Error('CloudXiaomiProvider requires a URL or file path')
    }

    const extracted = await extractAudio(audio.url)
    return { filePath: extracted.filePath, extracted }
  }

  async transcribe(
    audio: AudioInput,
    options?: ASROptions,
  ): Promise<TranscriptResult> {
    const apiKey = this.ensureApiKey()
    const model = getXiaomiModel()
    const baseUrl = getXiaomiBaseUrl()
    const sessionId = randomUUID().slice(0, 8)
    const startTime = Date.now()

    console.log(`[cloud-xiaomi] transcribe started, model=${model}, baseUrl=${baseUrl}`)
    console.log(`[cloud-xiaomi] audio: filePath=${audio.filePath ? 'yes' : 'no'}, url=${audio.url ? 'yes' : 'no'}, directUrl=${audio.speechAudioDownloadUrl ? 'yes' : 'no'}`)

    // 准备音频文件
    const { filePath: audioPath, extracted } = await this.prepareAudioFile(audio)
    let shouldCleanup = !!extracted

    console.log(`[cloud-xiaomi] audioPath=${audioPath}, shouldCleanup=${shouldCleanup}`)

    try {
      // 读取音频文件并转换为 Base64
      const audioBuffer = await readFile(audioPath)
      console.log(`[cloud-xiaomi] audio file size: ${audioBuffer.length} bytes`)

      if (audioBuffer.length > XIAOMI_MAX_AUDIO_BYTES) {
        console.warn(
          `[cloud-xiaomi] Audio file is large (${audioBuffer.length} bytes, base64 will be ~${Math.round(audioBuffer.length * 1.37 / 1024 / 1024)}MB). ` +
          `MiMo ASR limit is 10MB base64. Processing may fail.`,
        )
      }

      const base64Audio = audioBuffer.toString('base64')
      const mimeType = getMimeType(audioPath)
      const dataUrl = `data:${mimeType};base64,${base64Audio}`

      // 构建 Chat Completions 请求
      // MiMo ASR 使用 chat.completions.create 接口
      // 音频以 input_audio content 类型传入
      const language = options?.language || 'auto'

      const requestBody = {
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: dataUrl,
                },
              },
            ],
          },
        ],
        // MiMo ASR 选项通过 extra_body 传递
        // 在 fetch 中直接放在请求体顶层
        asr_options: {
          language,
        },
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), XIAOMI_TIMEOUT_MS)

      try {
        const apiUrl = `${baseUrl}/chat/completions`
        console.log(`[cloud-xiaomi] POST ${apiUrl} (model=${model}, language=${language})`)

        const response = await fetch(
          apiUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          const errText = await response.text().catch(() => 'Unknown error')
          throw new Error(
            `Xiaomi MiMo ASR API error: ${response.status} ${response.statusText} — ${errText}`,
          )
        }

        const data = (await response.json()) as MiMoChatResponse

        if (data.error) {
          throw new Error(
            `Xiaomi MiMo ASR error: ${data.error.message} (${data.error.code})`,
          )
        }

        const processingTimeMs = Date.now() - startTime
        const transcriptText = data.choices?.[0]?.message?.content || ''
        console.log(`[cloud-xiaomi] transcribe succeeded in ${processingTimeMs}ms, text length=${transcriptText.length}`)

        // MiMo ASR 通过 Chat Completions 返回纯文本，不支持时间戳 segments
        // 将整段文本作为一个 segment
        const segments: TranscriptSegment[] = transcriptText
          ? [{
              id: `${sessionId}-0`,
              startMs: 0,
              endMs: audio.durationSec ? Math.round(audio.durationSec * 1000) : 0,
              rawText: transcriptText,
              source: 'asr' as const,
            }]
          : []

        // Build source info
        const sources: TranscriptSource[] = [{
          type: 'cloud-xiaomi' as const,
          provider: this.id,
          model,
          processingTimeMs,
        }]

        const confidence = 88 // MiMo ASR 质量较高，略低于阿里云
        const quality = buildQuality(confidence)

        return {
          id: sessionId,
          source: {
            type: 'douyin' as const,
            url: audio.url || audio.filePath || '',
          },
          provider: {
            mode: this.mode,
            provider: this.id,
            model,
          },
          language: options?.language || 'zh',
          rawText: transcriptText,
          correctedText: transcriptText,
          confidence: quality.confidence,
          durationMs: audio.durationSec ? Math.round(audio.durationSec * 1000) : 0,
          segments,
          sources,
          quality,
          corrections: [],
          correctionCount: 0,
          processingTimeMs,
        }
      } finally {
        clearTimeout(timer)
      }
    } finally {
      if (shouldCleanup && extracted) {
        await cleanupExtractedAudio(extracted)
      }
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const key = getXiaomiApiKey()
    if (!key) {
      return {
        healthy: false,
        message: 'XIAOMI_ASR_API_KEY is not set',
      }
    }

    try {
      // 轻量级 API 健康检查：请求模型列表
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5_000)

      const startTime = Date.now()
      const response = await fetch(`${getXiaomiBaseUrl()}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal,
      })

      clearTimeout(timer)

      return {
        healthy: response.ok,
        message: response.ok ? undefined : `HTTP ${response.status}`,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async estimateCost(audio: AudioInput): Promise<CostEstimate> {
    // 小米 MiMo ASR 计费参考：请参考 platform.xiaomimimo.com 定价页
    // 粗略估算：约 0.01-0.03 元/分钟
    const durationMin = audio.durationSec ? audio.durationSec / 60 : 1
    const costPerMin = 0.02
    const model = getXiaomiModel()
    return {
      costCNY: Math.round(durationMin * costPerMin * 100) / 100,
      estimatedSeconds: Math.round(durationMin * 0.5),
      description: `Xiaomi ${model} — ~¥${costPerMin}/min`,
    }
  }
}
