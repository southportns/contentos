import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  runTranscriptCorrection,
  runTranscriptCorrectionStream,
} from '@/skills/transcript-correction'

export const runtime = 'nodejs'
export const maxDuration = 60 // LLM 纠错通常 < 15s，留足余量

const correctSchema = z.object({
  /** 原始 ASR 转写文本 */
  rawText: z.string().min(1, '转写文本不能为空'),
  /** 视频标题/描述，作为纠错上下文 */
  videoDesc: z.string().optional(),
  /** 视频作者 */
  videoAuthor: z.string().optional(),
  /** ASR 模型名称 */
  model: z.string().optional(),
  /** 是否使用流式输出（默认 true） */
  stream: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = correctSchema.parse(body)

    console.log(
      `[douyin-correct] rawText=${input.rawText.length} chars, ` +
      `videoDesc=${!!input.videoDesc}, videoAuthor=${!!input.videoAuthor}, ` +
      `stream=${input.stream ?? true}`,
    )

    // 流式模式：返回 Server-Sent Events (SSE) 流
    if (input.stream ?? true) {
      const { textStream, getFinalResult } = await runTranscriptCorrectionStream({
        rawText: input.rawText,
        videoDesc: input.videoDesc,
        videoAuthor: input.videoAuthor,
        model: input.model,
      })

      const encoder = new TextEncoder()

      const stream = new ReadableStream({
        async start(controller) {
          try {
            // 发送流式文本块
            for await (const delta of textStream) {
              const data = JSON.stringify({ type: 'delta', text: delta })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }

            // 获取最终结果（包含纠错详情）
            const finalResult = await getFinalResult()

            console.log(
              `[douyin-correct] stream result: correctedText=${finalResult.correctedText.length} chars, ` +
              `correctionCount=${finalResult.correctionCount}`,
            )

            // 发送最终结果（包含纠错详情）
            const finalData = JSON.stringify({
              type: 'final',
              data: {
                text: finalResult.correctedText,
                rawText: input.rawText,
                corrections: finalResult.corrections,
                correctionCount: finalResult.correctionCount,
                corrected: true,
              },
            })
            controller.enqueue(encoder.encode(`data: ${finalData}\n\n`))

            controller.close()
          } catch (error) {
            const errorData = JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            })
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
            controller.close()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // 非流式模式（兼容旧调用方）
    const result = await runTranscriptCorrection({
      rawText: input.rawText,
      videoDesc: input.videoDesc,
      videoAuthor: input.videoAuthor,
      model: input.model,
    })

    console.log(
      `[douyin-correct] result: correctedText=${result.correctedText.length} chars, ` +
      `correctionCount=${result.correctionCount}`,
    )

    return NextResponse.json({
      success: true,
      data: {
        text: result.correctedText,
        rawText: input.rawText,
        corrections: result.corrections,
        correctionCount: result.correctionCount,
        corrected: true,
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
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
