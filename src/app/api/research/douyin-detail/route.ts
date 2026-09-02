import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoDetail, extractAwemeId, checkDouyinHealth } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 100 // getVideoDetail timeout 45s + 重试 1 次 + 缓冲

const detailSchema = z.object({
  url: z.string().optional(),
  awemeId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = detailSchema.parse(body)

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

    const detail = await getVideoDetail(awemeId)

    return NextResponse.json({
      success: true,
      data: {
        platform: 'douyin',
        awemeId: detail.aweme_id,
        url: `https://www.douyin.com/video/${detail.aweme_id}`,
        title: detail.desc,
        content: detail.desc,
        author: detail.author,
        secUid: detail.sec_uid,
        cover: detail.cover_url,
        publishedAt: detail.create_time
          ? new Date(detail.create_time * 1000).toISOString()
          : null,
        metrics: {
          likes: detail.digg_count,
          comments: detail.comment_count,
          shares: detail.share_count,
          favorites: detail.collect_count,
          views: null,
        },
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
    const userMsg = isTimeout
      ? '获取视频详情超时（已自动重试）。抖音可能触发反爬虫，请稍等 30 秒后重试。'
      : errMsg

    return NextResponse.json(
      {
        success: false,
        error: userMsg,
      },
      { status: 500 },
    )
  }
}
