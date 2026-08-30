/**
 * CloudAlibabaProvider — 阿里云百炼 ASR Provider
 *
 * 通过阿里云百炼（DashScope）原生 API 完成语音识别。
 * 支持 Qwen-Audio-3.0-ASR-Flash、Fun-ASR-Flash 等非实时文件转写模型。
 *
 * DashScope ASR API 是异步的，流程：
 *   1. 获取 OSS 上传凭证 (GET /api/v1/uploads?action=getPolicy&model=xxx)
 *   2. 上传音频文件到 OSS (POST to OSS upload_host)
 *   3. 提交异步转写任务 (POST /api/v1/services/audio/asr/transcription)
 *   4. 轮询任务结果 (GET /api/v1/tasks/{task_id})
 *
 * 注意：DashScope 不支持 OpenAI 兼容的 /audio/transcriptions 端点。
 *
 * 环境变量:
 *  - ALIBABA_ASR_API_KEY: 阿里云百炼 API Key
 *  - ALIBABA_ASR_MODEL: 模型名称（默认 qwen-audio-3.0-asr-flash）
 *  - ALIBABA_ASR_BASE_URL: API 地址（默认 https://dashscope.aliyuncs.com/api/v1）
 *
 * 架构位置: Provider Layer（实现 ASRProvider 接口）
 */

import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, mkdirSync } from 'node:fs'
import { basename } from 'node:path'
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

// ─── Config (read dynamically from .env.local to support updates without restart) ──

function getAlibabaApiKey(): string {
  return getEnvVar('ALIBABA_ASR_API_KEY') || ''
}

/**
 * DashScope 原生 API base URL
 * 注意：与 OpenAI 兼容模式的 /compatible-mode/v1 不同
 */
function getAlibabaBaseUrl(): string {
  return (
    getEnvVar('ALIBABA_ASR_BASE_URL') ||
    'https://dashscope.aliyuncs.com/api/v1'
  )
}

function getAlibabaModel(): string {
  // paraformer-v1 supports async transcription API with X-DashScope-Async header
  // Flash models (qwen-audio-3.0-asr-flash, fun-asr-flash) use a different synchronous API
  return getEnvVar('ALIBABA_ASR_MODEL') || 'paraformer-v1'
}

const POLL_INTERVAL_MS = 2_000 // 轮询间隔
const POLL_MAX_ATTEMPTS = 60 // 最多轮询 60 次 (2 min)

// ─── Types ─────────────────────────────────────────────

/** OSS 上传凭证 — 从 DashScope 获取 */
interface UploadCertificate {
  upload_host: string
  oss_access_key_id: string
  signature: string
  policy: string
  upload_dir: string
  x_oss_object_acl: string
  x_oss_forbid_overwrite: boolean
}

/** DashScope 异步任务提交响应 */
interface TaskSubmitResponse {
  request_id: string
  output: {
    task_id: string
    task_status: string
  }
  code?: string
  message?: string
  status_code?: number
}

/** DashScope 任务查询响应 */
interface TaskFetchResponse {
  request_id: string
  output: {
    task_id: string
    task_status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'
    results?: Array<{
      transcription: string
      transcription_urls?: string
      audio_duration?: number
      segments?: Array<{
        text: string
        begin_time: number
        end_time: number
      }>
    }>
  }
  usage?: Record<string, number>
  code?: string
  message?: string
  status_code?: number
}

// ─── Provider Implementation ────────────────────────────

export class CloudAlibabaProvider implements ASRProvider {
  readonly id = 'cloud-alibaba'
  readonly mode = 'cloud' as const
  readonly displayName = '阿里云百炼 ASR'
  readonly languages = ['zh', 'en', 'auto']

  private ensureApiKey(): string {
    const key = getAlibabaApiKey()
    if (!key) {
      throw new Error(
        'ALIBABA_ASR_API_KEY is not set. Cloud ASR requires a valid API key.',
      )
    }
    return key
  }

  /**
   * 从视频 URL 提取音频文件路径。
   * Cloud Provider 需要本地音频文件来通过 multipart 上传。
   *
   * 优先级:
   *   1. audio.filePath（已由 transcript-service 预提取或 Failover 复用）
   *   2. audio.speechAudioDownloadUrl / audio.audioDownloadUrl（CDN 直链，直接下载更快）
   *   3. AudioExtractor（douyin-ingest，下载+提取，有缓存）
   */
  private async prepareAudioFile(audio: AudioInput): Promise<{ filePath: string; extracted?: ExtractedAudio }> {
    // 策略 1: 外部已提取音频文件，直接复用
    if (audio.filePath && existsSync(audio.filePath)) {
      return { filePath: audio.filePath }
    }

    // 策略 2: 使用 CDN 直链直接下载（比走 douyin-ingest 更快）
    const directUrl = audio.speechAudioDownloadUrl || audio.audioDownloadUrl
    if (directUrl) {
      try {
        const sessionId = randomUUID().slice(0, 8)
        const workDir = join(tmpdir(), `cloud-audio-${sessionId}`)
        mkdirSync(workDir, { recursive: true })
        const filePath = join(workDir, 'audio.mp3')

        const response = await fetch(directUrl, {
          signal: AbortSignal.timeout(60_000), // 1 min timeout for CDN download
        })

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer())
          if (buffer.length > 0) {
            await writeFile(filePath, buffer)
            // 返回模拟的 ExtractedAudio 以便后续清理
            return {
              filePath,
              extracted: { filePath, workDir } as ExtractedAudio,
            }
          }
        }
        console.warn('[cloud-alibaba] CDN direct download failed, falling back to AudioExtractor')
      } catch (cdnError) {
        console.warn(
          '[cloud-alibaba] CDN direct download error:',
          cdnError instanceof Error ? cdnError.message : String(cdnError),
        )
      }
    }

    // 策略 3: 回退到 AudioExtractor（douyin-ingest）
    if (!audio.url) {
      throw new Error('CloudAlibabaProvider requires a URL or file path')
    }

    const extracted = await extractAudio(audio.url)
    return { filePath: extracted.filePath, extracted }
  }

  /**
   * Step 1: 获取 OSS 上传凭证
   * GET /uploads?action=getPolicy&model=xxx
   */
  private async getUploadCertificate(apiKey: string, model: string): Promise<UploadCertificate> {
    const baseUrl = getAlibabaBaseUrl()
    const url = `${baseUrl}/uploads?action=getPolicy&model=${encodeURIComponent(model)}`

    console.log(`[cloud-alibaba] Getting upload certificate for model=${model}`)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error')
      throw new Error(`Failed to get upload certificate: ${response.status} — ${errText}`)
    }

    const data = await response.json() as {
      output?: UploadCertificate
      data?: UploadCertificate
      code?: string
      message?: string
    }

    // DashScope API may return the certificate in either `output` or `data` field
    const cert = data.output || data.data
    if (!cert) {
      throw new Error(`Upload certificate response missing output/data: ${JSON.stringify(data).slice(0, 500)}`)
    }

    console.log(`[cloud-alibaba] Got upload certificate, host=${cert.upload_host}`)
    return cert
  }

  /**
   * Step 2: 上传文件到 OSS
   * 使用 multipart/form-data POST 到 OSS upload_host
   */
  private async uploadToOss(
    cert: UploadCertificate,
    filePath: string,
  ): Promise<string> {
    const audioBuffer = await readFile(filePath)
    const fileName = basename(filePath)

    // 构建 OSS 上传的 multipart form
    const formData = new FormData()
    formData.append('OSSAccessKeyId', cert.oss_access_key_id)
    formData.append('Signature', cert.signature)
    formData.append('policy', cert.policy)
    formData.append('key', `${cert.upload_dir}/${fileName}`)
    formData.append('x-oss-object-acl', cert.x_oss_object_acl)
    formData.append('x-oss-forbid-overwrite', String(cert.x_oss_forbid_overwrite))
    formData.append('success_action_status', '200')
    formData.append('file', new Blob([audioBuffer]), fileName)

    console.log(`[cloud-alibaba] Uploading ${audioBuffer.length} bytes to OSS host=${cert.upload_host}`)

    const response = await fetch(cert.upload_host, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(120_000), // 2 min for upload
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error')
      throw new Error(`OSS upload failed: ${response.status} — ${errText}`)
    }

    // OSS URL format: oss://upload_dir/filename
    const ossUrl = `oss://${cert.upload_dir}/${fileName}`
    console.log(`[cloud-alibaba] OSS upload succeeded, url=${ossUrl}`)
    return ossUrl
  }

  /**
   * Step 3: 提交异步转写任务
   * POST /services/audio/asr/transcription
   */
  private async submitTranscriptionTask(
    apiKey: string,
    model: string,
    fileUrls: string[],
    options?: ASROptions,
  ): Promise<string> {
    const baseUrl = getAlibabaBaseUrl()
    const url = `${baseUrl}/services/audio/asr/transcription`

    const body: Record<string, unknown> = {
      model,
      input: {
        file_urls: fileUrls,
      },
    }

    // 可选参数
    const parameters: Record<string, unknown> = {}
    if (options?.language) {
      parameters.language_hints = [options.language]
    }
    if (options?.hotwords && options.hotwords.length > 0) {
      // hotwords 需要使用短语管理 API，这里暂不支持直接传递
      // parameters.hot_words = options.hotwords
    }
    if (Object.keys(parameters).length > 0) {
      body.parameters = parameters
    }

    console.log(`[cloud-alibaba] POST ${url} (model=${model}, files=${fileUrls.length})`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable', // Required for async transcription API
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error')
      throw new Error(`Task submission failed: ${response.status} — ${errText}`)
    }

    const data = (await response.json()) as TaskSubmitResponse

    if (!data.output?.task_id) {
      throw new Error(
        `Task submission response missing task_id: ${JSON.stringify(data).slice(0, 500)}`,
      )
    }

    console.log(`[cloud-alibaba] Task submitted, task_id=${data.output.task_id}, status=${data.output.task_status}`)
    return data.output.task_id
  }

  /**
   * Step 4: 轮询任务结果
   * GET /tasks/{task_id}
   */
  private async pollTranscriptionTask(
    apiKey: string,
    taskId: string,
  ): Promise<TaskFetchResponse> {
    const baseUrl = getAlibabaBaseUrl()
    const url = `${baseUrl}/tasks/${taskId}`

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error')
        throw new Error(`Task poll failed: ${response.status} — ${errText}`)
      }

      const data = (await response.json()) as TaskFetchResponse
      const status = data.output?.task_status

      if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
        console.log(`[cloud-alibaba] Task ${taskId} finished: ${status}`)
        return data
      }

      if (attempt < POLL_MAX_ATTEMPTS - 1) {
        console.log(`[cloud-alibaba] Task ${taskId} status=${status}, polling... (attempt ${attempt + 1}/${POLL_MAX_ATTEMPTS})`)
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    }

    throw new Error(`Task ${taskId} timed out after ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`)
  }

  async transcribe(
    audio: AudioInput,
    options?: ASROptions,
  ): Promise<TranscriptResult> {
    const apiKey = this.ensureApiKey()
    const model = getAlibabaModel()
    const sessionId = randomUUID().slice(0, 8)
    const startTime = Date.now()

    console.log(`[cloud-alibaba] transcribe started, model=${model}`)
    console.log(`[cloud-alibaba] audio: filePath=${audio.filePath ? 'yes' : 'no'}, url=${audio.url ? 'yes' : 'no'}, directUrl=${audio.speechAudioDownloadUrl ? 'yes' : 'no'}`)

    // 准备音频文件
    const { filePath: audioPath, extracted } = await this.prepareAudioFile(audio)
    const shouldCleanup = !!extracted

    console.log(`[cloud-alibaba] audioPath=${audioPath}, shouldCleanup=${shouldCleanup}`)

    try {
      const audioBuffer = await readFile(audioPath)
      console.log(`[cloud-alibaba] audio file size: ${audioBuffer.length} bytes`)

      // Step 1: 获取 OSS 上传凭证
      const cert = await this.getUploadCertificate(apiKey, model)

      // Step 2: 上传音频文件到 OSS
      const ossUrl = await this.uploadToOss(cert, audioPath)

      // Step 3: 提交异步转写任务
      const taskId = await this.submitTranscriptionTask(apiKey, model, [ossUrl], options)

      // Step 4: 轮询任务结果
      const taskResult = await this.pollTranscriptionTask(apiKey, taskId)

      if (taskResult.output.task_status !== 'SUCCEEDED') {
        throw new Error(
          `Transcription task failed: status=${taskResult.output.task_status}, message=${taskResult.message || 'unknown'}`,
        )
      }

      const result = taskResult.output.results?.[0]
      if (!result?.transcription) {
        throw new Error('Transcription result is empty')
      }

      const processingTimeMs = Date.now() - startTime
      console.log(`[cloud-alibaba] transcribe succeeded in ${processingTimeMs}ms, text length=${result.transcription.length}`)

      // Build segments
      const segments: TranscriptSegment[] = (result.segments || []).map(
        (s, i) => ({
          id: `${sessionId}-${i}`,
          startMs: Math.round(s.begin_time),
          endMs: Math.round(s.end_time),
          rawText: s.text,
          source: 'asr' as const,
        }),
      )

      // Build source info
      const sources: TranscriptSource[] = [{
        type: 'cloud-alibaba' as const,
        provider: this.id,
        model,
        processingTimeMs,
      }]

      const confidence = 90
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
        rawText: result.transcription,
        correctedText: result.transcription,
        confidence: quality.confidence,
        durationMs: result.audio_duration ? Math.round(result.audio_duration * 1000) : 0,
        segments,
        sources,
        quality,
        corrections: [],
        correctionCount: 0,
        processingTimeMs,
      }
    } finally {
      if (shouldCleanup && extracted) {
        await cleanupExtractedAudio(extracted)
      }
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const key = getAlibabaApiKey()
    if (!key) {
      return {
        healthy: false,
        message: 'ALIBABA_ASR_API_KEY is not set',
      }
    }

    try {
      // 轻量级 API 健康检查：请求模型列表
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5_000)

      const startTime = Date.now()
      const response = await fetch(`${getAlibabaBaseUrl()}/models`, {
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
    // 阿里云百炼 ASR 计费参考：约 0.01-0.04 元/分钟（模型不同）
    const durationMin = audio.durationSec ? audio.durationSec / 60 : 1
    const costPerMin = 0.02
    const model = getAlibabaModel()
    return {
      costCNY: Math.round(durationMin * costPerMin * 100) / 100,
      estimatedSeconds: Math.round(durationMin * 0.5),
      description: `Alibaba ${model} — ~¥${costPerMin}/min`,
    }
  }
}
