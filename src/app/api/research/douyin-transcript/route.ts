import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoTranscript } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min — 下载+转写需要较长时间

const transcriptSchema = z.object({
  url: z.string().optional(),
  awemeId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = transcriptSchema.parse(body)

    // 构建 douyin-ingest 可接受的 URL
    let target: string

    if (input.url) {
      target = input.url
    } else if (input.awemeId) {
      target = `https://www.douyin.com/video/${input.awemeId}`
    } else {
      return NextResponse.json(
        { success: false, error: 'url or awemeId is required' },
        { status: 400 },
      )
    }

    const transcript = await getVideoTranscript(target)

    return NextResponse.json({
      success: true,
      data: {
        awemeId: transcript.awemeId,
        text: transcript.text,
        language: transcript.language,
        duration: transcript.duration,
        model: transcript.model,
        segments: transcript.segments,
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
