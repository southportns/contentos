/**
 * Transcript Service — 转写服务编排层
 *
 * 负责编排完整的 Transcript Pipeline:
 *  1. 通过 douyin-client 获取视频元数据（标题、作者等上下文）
 *  2. 通过 ASR Router 执行语音识别
 *  3. 通过 transcript-correction Skill 执行 LLM 纠错
 *  4. 返回统一的 TranscriptResult
 *
 * 架构位置: Service Layer（编排 Provider + Skill + Tool）
 * 调用方: API Route
 */

import { randomUUID } from 'node:crypto'
import type {
  TranscriptMode,
  TranscriptResult,
  TranscriptCorrection,
  AudioInput,
  ASROptions,
} from '../domain/transcript.types'
import { routeASR } from '../routing/provider-router'
import { runTranscriptCorrection } from '@/skills/transcript-correction'
import {
  extractAudio,
  cleanupExtractedAudio,
  type ExtractedAudio,
} from '../pipeline/audio-extractor'
import { getEnvVar } from '@/lib/env/env-loader'
import { extractAwemeId } from '@/lib/tools/douyin-client'

// ─── Input ──────────────────────────────────────────────

export interface TranscriptRequest {
  /** 抖音视频 URL 或 awemeId */
  urlOrId: string
  /** 转写模式 */
  mode?: TranscriptMode
  /** 指定 Provider（可选） */
  providerPreference?: string
  /** 质量等级 */
  quality?: 'standard' | 'high' | 'maximum'
  /** 视频描述（如已从外部获取，可跳过重复查询） */
  videoDesc?: string
  /** 视频作者 */
  videoAuthor?: string
  /**
   * 是否跳过 LLM 纠错，仅提取 ASR 原始文本。
   *
   * - true: 仅执行 ASR 语音识别，跳过 LLM 纠错，返回 rawText
   * - false/undefined: 执行完整 pipeline（ASR + LLM 纠错）
   *
   * 默认 true — 先快速提取文案，用户检查后如有需要再单独纠错。
   */
  skipCorrection?: boolean
}

// ─── Lazy import douyin-client to avoid circular deps ───

async function getVideoContext(awemeId: string): Promise<{
  videoDesc?: string
  videoAuthor?: string
}> {
  try {
    // 动态导入避免循环依赖
    const { getVideoDetail } = await import('@/lib/tools/douyin-client')
    const detail = await getVideoDetail(awemeId)
    return {
      videoDesc: detail.desc || undefined,
      videoAuthor: detail.author || undefined,
    }
  } catch {
    return {}
  }
}

// ─── Service ────────────────────────────────────────────

/**
 * 执行完整的转写流程
 *
 * Pipeline:
 *  1. 构建 AudioInput（URL 形式）
 *  2. 如果是 Cloud 模式，预提取音频到本地文件（避免 Provider 内部重复下载）
 *  3. 通过 ASR Router 选择 Provider 并执行识别
 *  4. 获取视频上下文（标题、作者）作为 LLM 纠错输入
 *  5. 执行 LLM 纠错（如果质量等级 >= standard）
 *  6. 返回完整 TranscriptResult
 *
 * 音频复用策略:
 *  - Cloud 模式: 先通过 AudioExtractor 提取音频到 filePath，
 *    CloudProvider 直接使用 filePath 上传，避免 FFmpeg 直接从抖音 URL 下载失败。
 *    如果 Failover 到 LocalProvider，LocalProvider 通过 douyin-ingest 缓存复用，不会重复下载。
 *  - Local 模式: 直接传 URL 给 LocalWhisperProvider（douyin-ingest --transcribe），
 *    它内部完成下载+提取+ASR。如果 Failover 到 CloudProvider，
 *    CloudProvider 通过 AudioExtractor 提取音频（douyin-ingest 缓存复用）。
 *
 * 上下文复用策略（v2 优化）:
 *  - douyin-ingest 的 JSON 输出包含 desc 和 author 字段
 *  - extractAudio 会从 JSON 中提取这些字段并放入 ExtractedAudio
 *  - 如果 extractAudio 已获取到视频上下文，不再调用 getVideoDetail API
 *  - 仅在 extractAudio 未获取到上下文时，才回退到 API 调用
 */
export async function executeTranscript(
  request: TranscriptRequest,
): Promise<TranscriptResult> {
  const {
    urlOrId,
    mode = (getEnvVar('ASR_MODE') as TranscriptMode) || 'auto',
    providerPreference,
    quality = 'high',
    videoDesc: externalVideoDesc,
    videoAuthor: externalVideoAuthor,
    skipCorrection = true, // 默认跳过纠错，用户可手动触发
  } = request

  // Step 1: 构建 AudioInput
  const awemeId = extractAwemeId(urlOrId)
  // 如果输入是纯 ID，构建标准视频 URL
  // 如果输入是 URL（标准/搜索页/短链），提取到 awemeId 后也构建标准视频 URL
  //   - 搜索页链接 (modal_id) 不能直接被 douyin-ingest 处理，需转换为标准 URL
  //   - 分享文本中的短链同理
  const url = awemeId
    ? `https://www.douyin.com/video/${awemeId}`
    : urlOrId.trim()

  const audioInput: AudioInput = {
    url,
  }

  const asrOptions: ASROptions = {
    language: 'zh',
    withSegments: true,
    quality,
  }

  // Step 2: Cloud 模式下预提取音频
  // 这样 CloudProvider 直接使用 filePath，避免从抖音 URL 下载失败
  // douyin-ingest 有缓存机制，后续 LocalProvider 的 Failover 不会重复下载
  // 优化：同时保留 CDN 直链（speechAudioDownloadUrl / audioDownloadUrl），
  //       如果预提取失败但直链可用，CloudProvider 可直接用直链下载
  // 优化：extractAudio 同时从 douyin-ingest JSON 中提取 desc 和 author，
  //       避免后续单独调用 getVideoDetail API
  let extractedAudio: ExtractedAudio | undefined
  const hasCloudKey = !!(getEnvVar('ALIBABA_ASR_API_KEY') || getEnvVar('XIAOMI_ASR_API_KEY'))
  if (
    mode === 'cloud' ||
    (mode === 'auto' && hasCloudKey)
  ) {
    try {
      console.log('[transcript-service] Pre-extracting audio for cloud mode...')
      extractedAudio = await extractAudio(url)
      audioInput.filePath = extractedAudio.filePath
      audioInput.durationSec = extractedAudio.durationSec
      // 传递 CDN 直链供 Provider 在 filePath 不可用时直接下载
      audioInput.speechAudioDownloadUrl = extractedAudio.speechAudioDownloadUrl
      audioInput.audioDownloadUrl = extractedAudio.audioDownloadUrl
    } catch (extractError) {
      // 预提取失败不阻断流程，让 CloudProvider 自己尝试提取
      console.warn(
        '[transcript-service] Pre-extraction failed, falling back to provider-level extraction:',
        extractError instanceof Error ? extractError.message : String(extractError),
      )
    }
  }

  try {
    // Step 3: 通过 ASR Router 执行识别
    const { provider, result: asrResult } = await routeASR(
      audioInput,
      mode,
      asrOptions,
      providerPreference,
    )

    // Step 4: 确定视频上下文（优先级：外部传入 > extractAudio 提取 > API 查询）
    let videoDesc = externalVideoDesc
    let videoAuthor = externalVideoAuthor
    const effectiveAwemeId = extractedAudio?.awemeId || awemeId

    // 优先使用 extractAudio 从 douyin-ingest JSON 中提取的上下文
    if (!videoDesc && extractedAudio?.videoDesc) {
      videoDesc = extractedAudio.videoDesc
    }
    if (!videoAuthor && extractedAudio?.videoAuthor) {
      videoAuthor = extractedAudio.videoAuthor
    }

    // 如果 extractAudio 未获取到上下文，回退到 API 调用
    if ((!videoDesc || !videoAuthor) && effectiveAwemeId) {
      const context = await getVideoContext(effectiveAwemeId)
      videoDesc = videoDesc || context.videoDesc
      videoAuthor = videoAuthor || context.videoAuthor
    }

    // Step 5: LLM 纠错（quality >= high 且未跳过时执行）
    // 优化：LLM 直接输出纯文本（不要求 JSON），生成时间从 ~14s 降至 ~0.2s
    // 默认跳过纠错，用户可手动触发以节省时间
    let correctedText = asrResult.rawText
    let corrections: TranscriptCorrection[] = []
    let correctionCount = 0

    if (skipCorrection) {
      // 跳过纠错，correctedText = rawText
      console.log('[transcript-service] Skipping LLM correction (skipCorrection=true)')
    } else
    // 防御：如果 ASR 返回空文本，跳过 LLM 纠错，直接返回空文本
    // 这通常发生在音频无人声、缓存命中但转写被跳过等场景
    if (quality !== 'standard' && asrResult.rawText && asrResult.rawText.trim().length > 0) {
      try {
        const correction = await runTranscriptCorrection({
          rawText: asrResult.rawText,
          videoDesc,
          videoAuthor,
          model: asrResult.provider.model,
        })
        correctedText = correction.correctedText
        corrections = correction.corrections
        correctionCount = correction.correctionCount
      } catch (correctionError) {
        // 纠错失败不影响转写结果，使用原始文本
        console.error(
          '[transcript-service] LLM correction failed:',
          correctionError,
        )
      }
    } else if (quality !== 'standard' && (!asrResult.rawText || asrResult.rawText.trim().length === 0)) {
      console.warn(
        '[transcript-service] ASR returned empty rawText, skipping LLM correction. ' +
        `provider=${asrResult.provider.provider}, model=${asrResult.provider.model}`,
      )
    }

    // Step 6: 构建最终 TranscriptResult
    const finalResult: TranscriptResult = {
      ...asrResult,
      id: asrResult.id || randomUUID().slice(0, 8),
      rawText: asrResult.rawText,
      correctedText,
      corrections,
      correctionCount,
      videoDesc,
      videoAuthor,
      provider: {
        mode: provider.mode,
        provider: provider.id,
        model: asrResult.provider.model,
      },
    }

    return finalResult
  } finally {
    // 清理预提取的音频临时文件
    if (extractedAudio) {
      await cleanupExtractedAudio(extractedAudio).catch(() => {})
    }
  }
}
