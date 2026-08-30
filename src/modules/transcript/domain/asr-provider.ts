/**
 * ASR Provider — 统一接口定义
 *
 * 所有 Local 和 Cloud ASR Provider 必须实现此接口。
 * 这保证了 ContextOS 可以无缝替换任何 ASR 引擎，
 * 而不影响上层业务逻辑。
 *
 * 架构位置: Domain Layer（接口定义）
 */

import type {
  AudioInput,
  ASROptions,
  TranscriptResult,
  ProviderHealth,
  CostEstimate,
} from './transcript.types'

export interface ASRProvider {
  /** Provider 唯一标识，如 "local-whisper" / "cloud-alibaba" */
  readonly id: string

  /** 运行模式 */
  readonly mode: 'local' | 'cloud'

  /** Provider 显示名称 */
  readonly displayName: string

  /** 支持的语言列表，如 ['zh', 'en'] */
  readonly languages: string[]

  /**
   * 执行语音识别
   *
   * @param audio 音频输入（本地路径或远程 URL）
   * @param options ASR 选项（热词、语言、VAD 等）
   * @returns 识别结果（包含原始文本、片段、置信度等）
   */
  transcribe(
    audio: AudioInput,
    options?: ASROptions,
  ): Promise<TranscriptResult>

  /**
   * 健康检查：检测 Provider 是否可用
   * 用于 Auto Mode 决策和 Failover
   */
  healthCheck(): Promise<ProviderHealth>

  /**
   * 成本估算（主要针对 Cloud Provider）
   * Local Provider 返回 0 成本
   */
  estimateCost(audio: AudioInput): Promise<CostEstimate>
}
