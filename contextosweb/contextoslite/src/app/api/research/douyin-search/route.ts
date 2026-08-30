import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { searchDouyin, checkDouyinHealth, type PublishTimeFilter } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 60

const searchSchema = z.object({
  keyword: z.string().min(1),
  count: z.number().int().positive().max(50).default(20),
  publishTime: z.enum(['none', '1d', '7d', '14d', '30d']).default('none'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = searchSchema.parse(body)

    // 先检查微服务是否可用
    const healthy = await checkDouyinHealth()
    if (!healthy) {
      return NextResponse.json({
        success: false,
        error: '抖音数据服务未启动。请先启动微服务（端口 8800）。',
      }, { status: 503 })
    }

    const items = await searchDouyin(
      input.keyword,
      input.count,
      input.publishTime as PublishTimeFilter,
    )

    // 搜索返回空结果时，给出风控提示
    const message = items.length === 0
      ? '抖音搜索接口可能触发风控，返回空结果。建议：1) 换个关键词重试；2) 在「账号研究」页使用链接方式获取视频详情；3) 稍后再试。'
      : undefined

    return NextResponse.json({
      success: true,
      data: {
        keyword: input.keyword,
        contents: items.map((item) => ({
          platform: 'douyin',
          url: `https://www.douyin.com/video/${item.aweme_id}`,
          awemeId: item.aweme_id,
          title: item.desc,
          content: item.desc,
          cover: item.cover,
          metrics: null,
        })),
        message,
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
    // 区分超时和其他错误
    const isTimeout = errMsg.includes('aborted') || errMsg.includes('timeout')
    const userMsg = isTimeout
      ? '搜索超时，抖音接口可能响应缓慢。请稍后重试，或在「账号研究」页使用视频链接直接获取详情。'
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
