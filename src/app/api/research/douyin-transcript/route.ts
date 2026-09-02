import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { executeTranscript } from '@/modules/transcript'
import type { TranscriptMode } from '@/modules/transcript'
import { getEnvVar } from '@/lib/env/env-loader'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min — 下载+转写+LLM纠错需要较长时间

const transcriptSchema = z.object({
  url: z.string().optional(),
  awemeId: z.string().optional(),
  mode: z.enum(['auto', 'local', 'cloud']).optional(),
  quality: z.enum(['standard', 'high', 'maximum']).optional(),
  providerPreference: z.string().optional(),
  /** 是否跳过 LLM 纠错，默认 true */
  skipCorrection: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = transcriptSchema.parse(body)

    // 构建 URL 或 ID
    let target: string

    if (input.url) {
      target = input.url
    } else if (input.awemeId) {
      target = input.awemeId
    } else {
      return NextResponse.json(
        { success: false, error: 'url or awemeId is required' },
        { status: 400 },
      )
    }

    // 通过 TranscriptService 执行完整 pipeline
    // mode 优先级: 前端传入 > .env.local ASR_MODE > getDefaultMode()
    // 动态从 .env.local 读取，确保 Settings API 保存后立即生效
    const envMode = getEnvVar('ASR_MODE') as TranscriptMode | undefined
    const mode: TranscriptMode =
      (input.mode as TranscriptMode) ||
      envMode ||
      'auto'

    console.log(`[douyin-transcript] mode=${mode}, input.mode=${input.mode}, envMode=${envMode}`)

    const result = await executeTranscript({
      urlOrId: target,
      mode,
      quality: input.quality || 'high',
      providerPreference: input.providerPreference,
      skipCorrection: input.skipCorrection ?? true,
    })

    console.log(`[douyin-transcript] result: rawText=${result.rawText?.length} chars, correctedText=${result.correctedText?.length} chars, correctionCount=${result.correctionCount}, skipCorrection=${input.skipCorrection ?? true}, segments=${result.segments?.length}, videoId=${result.source?.videoId}`)

    const skipped = input.skipCorrection ?? true

    return NextResponse.json({
      success: true,
      data: {
        awemeId: result.source.videoId || (input.url ? input.url.match(/\/video\/(\d+)/)?.[1] : input.awemeId) || '',
        text: result.correctedText,
        // 跳过纠错时保留原始文本，供前端展示和后续手动纠错
        // 未跳过时，仅在有帮助错时保留对比
        rawText: skipped || result.correctionCount > 0 ? result.rawText : undefined,
        language: result.language,
        duration: Math.round(result.durationMs / 1000),
        model: result.provider.model,
        provider: result.provider.provider,
        providerMode: result.provider.mode,
        segments: result.segments.map(s => ({
          start: s.startMs / 1000,
          end: s.endMs / 1000,
          text: s.correctedText || s.rawText,
        })),
        // 纠错详情
        corrections: result.correctionCount > 0 ? result.corrections : undefined,
        correctionCount: result.correctionCount,
        // 是否已纠错
        corrected: !skipped && result.correctionCount >= 0,
        // 质量评分
        confidence: result.confidence,
        qualityLevel: result.quality.level,
        // 视频上下文
        videoDesc: result.videoDesc,
        videoAuthor: result.videoAuthor,
        // 处理信息
        processingTimeMs: result.processingTimeMs,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
