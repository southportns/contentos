/**
 * Content Transcript Engine — Module Barrel Export
 *
 * 统一导出所有公共 API。
 * 外部代码只通过此文件访问 Transcript 模块。
 *
 * 架构位置: Module Entry Point
 */

// ─── Domain Types ──────────────────────────────────────
export type {
  AudioInput,
  ASROptions,
  TranscriptSegment,
  TranscriptCorrection,
  TranscriptSource,
  TranscriptQuality,
  TranscriptResult,
  ProviderHealth,
  CostEstimate,
  HardwareProfile,
  CapabilityLevel,
  TranscriptMode,
} from './domain/transcript.types'

// ─── Provider Interface ─────────────────────────────────
export type { ASRProvider } from './domain/asr-provider'

// ─── Routing ────────────────────────────────────────────
export {
  routeASR,
  getDefaultMode,
  checkAllProvidersHealth,
} from './routing/provider-router'
export type { RouterResult } from './routing/provider-router'
export {
  detectHardware,
  getHardwareProfile,
  getCapabilityLevel,
} from './routing/hardware-detector'

// ─── Service ────────────────────────────────────────────
export { executeTranscript } from './services/transcript-service'
export type { TranscriptRequest } from './services/transcript-service'

// ─── Providers ──────────────────────────────────────────
export { LocalWhisperProvider } from './providers/local/local-whisper.provider'
export { CloudAlibabaProvider } from './providers/cloud/cloud-alibaba.provider'
