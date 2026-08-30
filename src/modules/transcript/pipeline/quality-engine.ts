/**
 * Quality Engine — 质量评分工具
 *
 * 根据多维度信号计算 Transcript 置信度和质量等级。
 * 目前 V1.0 只使用 ASR 置信度，后续 P1 可扩展为多维度融合评分。
 *
 * 架构位置: Pipeline Layer
 */

import type { TranscriptQuality } from '../domain/transcript.types'

/**
 * 根据置信度计算质量等级
 */
export function getQualityLevel(confidence: number): TranscriptQuality['level'] {
  if (confidence >= 95) return 'EXCELLENT'
  if (confidence >= 90) return 'HIGH'
  if (confidence >= 80) return 'GOOD'
  if (confidence >= 70) return 'FAIR'
  return 'LOW'
}

/**
 * 构建质量评估对象
 */
export function buildQuality(
  asrConfidence: number,
  extras?: Partial<TranscriptQuality['scores']>,
): TranscriptQuality {
  // V1.0：综合置信度 = ASR 置信度（后续可加权其他维度）
  const confidence = Math.round(asrConfidence * 10) / 10
  return {
    confidence,
    level: getQualityLevel(confidence),
    scores: {
      asr: asrConfidence,
      ...extras,
    },
  }
}
