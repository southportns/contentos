import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getComments, extractAwemeId, checkDouyinHealth } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 45

const commentsSchema = z.object({
  awemeId: z.string().optional(),
  url: z.string().optional(),
  count: z.number().int().positive().max(50).default(20),
  cursor: z.number().int().min(0).default(0),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = commentsSchema.parse(body)

    const awemeId =
      input.awemeId || (input.url ? extractAwemeId(input.url) : null)

    if (!awemeId) {
      return NextResponse.json(
        { success: false, error: 'Invalid URL or awemeId' },
        { status: 400 },
      )
    }

    // 先检查微服务是否可用
    const healthy = await checkDouyinHealth()
    if (!healthy) {
      return NextResponse.json({
        success: false,
        error: '抖音数据服务未启动。请先启动微服务（端口 8800）。',
      }, { status: 503 })
    }

    const result = await getComments(awemeId, input.count, input.cursor)

    return NextResponse.json({
      success: true,
      data: {
        awemeId,
        count: result.count,
        hasMore: result.has_more,
        cursor: result.cursor,
        comments: result.items.map((c) => ({
          text: c.text,
          nickname: c.nickname,
          diggCount: c.digg_count,
          createTime: c.create_time
            ? new Date(c.create_time * 1000).toISOString()
            : null,
        })),
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
