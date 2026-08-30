import { NextResponse } from 'next/server'
import { getHotSearch, checkDouyinHealth } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  try {
    // 先检查微服务是否可用
    const healthy = await checkDouyinHealth()
    if (!healthy) {
      return NextResponse.json({
        success: false,
        error: '抖音数据服务未启动。请先启动微服务（端口 8800）。',
      }, { status: 503 })
    }

    const items = await getHotSearch()

    return NextResponse.json({
      success: true,
      data: items,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    const isTimeout = errMsg.includes('aborted') || errMsg.includes('timeout')
    const userMsg = isTimeout
      ? '获取热搜超时，抖音接口可能响应缓慢。请稍后重试。'
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
