/**
 * Content Transcript Engine — Domain Types
 *
 * 统一定义 Transcript 模块的核心数据结构。
 * 所有 Provider、Pipeline、Service 共用这些类型。
 *
 * 架构位置: Domain Layer（纯类型，无运行时依赖）
 */

// ─── Audio Input ───────────────────────────────────────

/**
 * 音频输入：可以是本地文件路径或远程 URL。
 * Cloud Provider 通常需要公开可访问的 URL，
 * Local Provider 可以直接读取本地文件。
 */
export interface AudioInput {
  /** 本地文件路径（Local Provider 使用） */
  filePath?: string
  /** 远程 URL（Cloud Provider 使用，需公开可访问） */
  url?: string
  /** 音频时长（秒），用于成本估算 */
  durationSec?: number
  /** 音频格式，如 wav / mp3 / m4a */
  format?: string
  /** CDN 直链：口播音频下载 URL（douyin-ingest 提供，优先于 url） */
  speechAudioDownloadUrl?: string
  /** CDN 直链：原始音频下载 URL（备选） */
  audioDownloadUrl?: string
}

// ─── ASR Options ────────────────────────────────────────

/**
 * ASR 调用选项，由 TranscriptService 构建并传递给 Provider。
 */
export interface ASROptions {
  /** 语言代码，如 zh / en / auto */
  language?: string
  /** 热词列表，传递给支持 hotwords 的 Provider */
  hotwords?: string[]
  /** 是否返回时间戳片段 */
  withSegments?: boolean
  /** 是否启用 VAD（Voice Activity Detection） */
  enableVAD?: boolean
  /** 说话人分离 */
  enableDiarization?: boolean
  /** 质量等级 */
  quality?: 'standard' | 'high' | 'maximum'
}

// ─── Transcript Segment ─────────────────────────────────

export interface TranscriptSegment {
  id: string
  /** 开始时间（毫秒） */
  startMs: number
  /** 结束时间（毫秒） */
  endMs: number
  /** 原始 ASR 文本 */
  rawText: string
  /** LLM 纠错后文本 */
  correctedText?: string
  /** ASR 置信度（0-100） */
  confidence?: number
  /** 说话人标识 */
  speaker?: string
  /** 来源类型 */
  source: 'asr' | 'ocr' | 'subtitle' | 'fusion'
  /** 该片段的纠错详情 */
  corrections?: TranscriptCorrection[]
}

// ─── Transcript Correction ──────────────────────────────

export interface TranscriptCorrection {
  /** 原始文本 */
  original: string
  /** 纠错后文本 */
  corrected: string
  /** 纠错原因 */
  reason: string
}

// ─── Transcript Source ──────────────────────────────────

export interface TranscriptSource {
  type:
    | 'fun-asr'
    | 'glm-asr'
    | 'whisper'
    | 'sensevoice'
    | 'paraformer'
    | 'cloud-alibaba'
    | 'cloud-xiaomi'
    | 'ocr'
    | 'subtitle'
  provider?: string
  model?: string
  confidence?: number
  /** 处理耗时（毫秒） */
  processingTimeMs: number
}

// ─── Quality Model ──────────────────────────────────────

export interface TranscriptQuality {
  /** 综合置信度（0-100） */
  confidence: number
  /** 质量等级 */
  level: 'EXCELLENT' | 'HIGH' | 'GOOD' | 'FAIR' | 'LOW'
  /** 各维度分数 */
  scores: {
    asr?: number
    modelAgreement?: number
    ocrAgreement?: number
    subtitleAgreement?: number
    hotwordConsistency?: number
    semanticConsistency?: number
  }
}

// ─── Transcript Result ──────────────────────────────────

/**
 * 统一的 Transcript 输出结果。
 * 所有 Provider 的输出最终都转换为这个结构。
 */
export interface TranscriptResult {
  id: string
  source: {
    type: 'douyin'
    videoId?: string
    url: string
  }
  provider: {
    mode: 'local' | 'cloud'
    provider: string
    model: string
  }
  language: string
  /** 原始 ASR 文本（纠错前） */
  rawText: string
  /** LLM 纠错后文本 */
  correctedText: string
  /** 综合置信度（0-100） */
  confidence: number
  /** 音频时长（毫秒） */
  durationMs: number
  /** 带时间戳的片段 */
  segments: TranscriptSegment[]
  /** 所有参与识别的来源列表 */
  sources: TranscriptSource[]
  /** 质量评估 */
  quality: TranscriptQuality
  /** 纠错详情 */
  corrections: TranscriptCorrection[]
  /** 纠错数量 */
  correctionCount: number
  /** 视频上下文 */
  videoDesc?: string
  videoAuthor?: string
  /** 处理总耗时（毫秒） */
  processingTimeMs: number
}

// ─── Provider Health ────────────────────────────────────

export interface ProviderHealth {
  healthy: boolean
  message?: string
  /** 响应延迟（毫秒） */
  latencyMs?: number
}

// ─── Cost Estimate ──────────────────────────────────────

export interface CostEstimate {
  /** 预计成本（人民币） */
  costCNY: number
  /** 预计耗时（秒） */
  estimatedSeconds: number
  /** 计费说明 */
  description?: string
}

// ─── Hardware Profile ───────────────────────────────────

export interface HardwareProfile {
  os: string
  cpu: string
  ramGB: number
  gpu?: string
  vramGB?: number
  cudaAvailable: boolean
  cudaVersion?: string
}

// ─── Capability Level ───────────────────────────────────

export type CapabilityLevel = 'A' | 'B' | 'C' | 'D'

// ─── Transcript Mode ────────────────────────────────────

export type TranscriptMode = 'auto' | 'local' | 'cloud'

// ─── Provider Registry Entry ────────────────────────────

export interface ProviderRegistryEntry {
  id: string
  mode: 'local' | 'cloud'
  priority: number
  enabled: boolean
}
