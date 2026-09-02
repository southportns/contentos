import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getComments, extractAwemeId, checkDouyinHealth } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 100

const commentsSchema = z.object({
  awemeId: z.string().optional(),
  url: z.string().optional(),
  count: z.number().int().positive().max(50).default(50),
  cursor: z.number().int().min(0).default(0),
})

export async function POST(req: NextRequest) {
  let awemeId: string | null = null
  try {
    const body = await req.json()
    const input = commentsSchema.parse(body)

    awemeId =
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

    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    const isTimeout = errMsg.includes('aborted') || errMsg.includes('timeout')
    const isRiskControl =
      errMsg.includes('403') ||
      errMsg.includes('429') ||
      errMsg.includes('Empty 200') ||
      errMsg.includes('anti-bot')

    // 风控/超时场景：返回 200 + success=false + 空评论列表，
    // 让前端 UI 能优雅降级（显示"评论获取失败"而非整页崩溃）
    if (isTimeout || isRiskControl) {
      const userMsg = isTimeout
        ? '评论采集超时。抖音可能触发反爬虫，请稍等后重试。'
        : '抖音风控拦截了评论获取。请稍后重试或刷新 Cookie。'

      console.error('[douyin-comments] Risk control / timeout:', {
        awemeId,
        error: errMsg,
        isTimeout,
        isRiskControl,
      })

      return NextResponse.json({
        success: false,
        error: userMsg,
        data: {
          awemeId: awemeId || '',
          count: 0,
          hasMore: false,
          cursor: 0,
          comments: [],
        },
      })
    }

    console.error('[douyin-comments] Error:', {
      awemeId,
      error: errMsg,
    })

    return NextResponse.json(
      {
        success: false,
        error: errMsg,
      },
      { status: 500 },
    )
  }
}
