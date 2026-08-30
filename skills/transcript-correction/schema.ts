import { z } from 'zod'

export const transcriptCorrectionInputSchema = z.object({
  /** Whisper 原始转写文本 */
  rawText: z.string().min(1, '转写文本不能为空'),
  /** 视频标题/描述，作为纠错的上下文参考 */
  videoDesc: z.string().optional(),
  /** 视频作者名，辅助理解语境 */
  videoAuthor: z.string().optional(),
  /** 使用的 Whisper 模型名称 */
  model: z.string().optional(),
})

export const transcriptCorrectionOutputSchema = z.object({
  /** 纠错后的完整文本 */
  correctedText: z.string(),
  /** 纠错详情列表 */
  corrections: z.array(
    z.object({
      /** 原始片段 */
      original: z.string(),
      /** 纠错后的片段 */
      corrected: z.string(),
      /** 纠错原因 */
      reason: z.string(),
    }),
  ),
  /** 纠错数量统计 */
  correctionCount: z.number().min(0),
})

export type TranscriptCorrectionInput = z.infer<
  typeof transcriptCorrectionInputSchema
>
export type TranscriptCorrectionOutput = z.infer<
  typeof transcriptCorrectionOutputSchema
>
