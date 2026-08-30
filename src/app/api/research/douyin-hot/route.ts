import { NextResponse } from 'next/server'
import { getHotSearch } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 45

export async function GET() {
  try {
    // 直接请求热搜数据（微服务已做 5 分钟缓存，响应很快）
    // 不再单独做 health check，省一次 HTTP 往返
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
