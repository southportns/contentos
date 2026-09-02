import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { searchDouyin, checkDouyinHealth, type PublishTimeFilter } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 130 // searchDouyin timeout 60s + 重试 + 缓冲

const searchSchema = z.object({
  /** 单个关键词或多个关键词（多标签搜索） */
  keywords: z.union([
    z.string().min(1),
    z.array(z.string().min(1)).min(1),
  ]).transform((v) => Array.isArray(v) ? v : [v]),
  count: z.number().int().positive().max(50).default(20),
  publishTime: z.enum(['none', '1d', '7d', '14d', '30d']).default('none'),
  /** 最低点赞数筛选，null 表示不筛选 */
  minLikes: z.number().int().min(0).nullable().optional().default(null),
  /** 最低粉丝数筛选（通过视频详情中的作者数据间接判断），null 表示不筛选 */
  minFollowers: z.number().int().min(0).nullable().optional().default(null),
})

// ── 兼容旧版 single keyword 字段 ──────────────────────────
const legacySchema = z.object({
  keyword: z.string().min(1).optional(),
}).transform((v) => v.keyword ? { keywords: [v.keyword] } : null)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 兼容旧版 { keyword: "xxx" } 格式
    const legacy = legacySchema.safeParse(body)
    let input: z.infer<typeof searchSchema>
    if (legacy.success && legacy.data) {
      input = searchSchema.parse({ ...body, keywords: legacy.data.keywords })
    } else {
      input = searchSchema.parse(body)
    }

    // 先检查微服务是否可用
    const healthy = await checkDouyinHealth()
    if (!healthy) {
      return NextResponse.json({
        success: false,
        error: '抖音数据服务未启动。请先启动微服务（端口 8800）。',
      }, { status: 503 })
    }

    // 多关键词并行搜索，合并去重
    const allKeywords = input.keywords
    const searchPromises = allKeywords.map((kw) =>
      searchDouyin(kw, input.count, input.publishTime as PublishTimeFilter)
        .catch(() => [] as Awaited<ReturnType<typeof searchDouyin>>),
    )
    const searchResults = await Promise.all(searchPromises)

    // 合并去重（按 aweme_id），同时记录每条结果匹配了哪些关键词
    const seen = new Map<string, { item: typeof searchResults[0][number]; matchedKeywords: Set<string> }>()
    searchResults.forEach((items, kwIndex) => {
      const kw = allKeywords[kwIndex]
      for (const item of items) {
        if (seen.has(item.aweme_id)) {
          seen.get(item.aweme_id)!.matchedKeywords.add(kw)
        } else {
          seen.set(item.aweme_id, { item, matchedKeywords: new Set([kw]) })
        }
      }
    })

    // 相关性过滤：视频标题/描述必须与至少一个搜索关键词相关
    // 抖音综合搜索会返回泛匹配结果（如搜"竺天天"返回包含"天"字的无关视频）
    // 过滤规则：关键词完全包含在 desc 中，或关键词的每个字符都出现在 desc 中
    const merged = Array.from(seen.values()).filter(({ item, matchedKeywords }) => {
      const desc = (item.desc || '').toLowerCase()
      return Array.from(matchedKeywords).some((kw) => {
        const kwLower = kw.toLowerCase()
        // 精确匹配：desc 包含完整关键词
        if (desc.includes(kwLower)) return true
        // 宽松匹配：关键词是 2-3 个字的短词时，要求至少 70% 的字出现在 desc 中
        // 这样可以保留"天总语录"→"天总说了这些语录"这类变体
        if (kwLower.length <= 6) {
          const chars = new Set(kwLower.split(''))
          let matchCount = 0
          for (const ch of chars) {
            if (desc.includes(ch)) matchCount++
          }
          return matchCount / chars.size >= 0.7
        }
        return false
      })
    }).map(({ item }) => item)

    // 点赞数筛选
    const filtered = input.minLikes != null
      ? merged.filter((item) => (item.digg_count ?? 0) >= input.minLikes!)
      : merged

    // 搜索返回空结果时，给出风控提示
    const message = filtered.length === 0
      ? allKeywords.length > 1
        ? `多标签搜索未返回符合条件的结果。建议：1) 调整标签关键词；2) 降低点赞筛选阈值；3) 稍后再试。`
        : '抖音搜索接口可能触发风控，返回空结果。建议：1) 换个关键词重试；2) 使用视频链接方式获取详情；3) 稍后再试。'
      : undefined

    return NextResponse.json({
      success: true,
      data: {
        keywords: allKeywords,
        contents: filtered.map((item) => ({
          platform: 'douyin',
          url: `https://www.douyin.com/video/${item.aweme_id}`,
          awemeId: item.aweme_id,
          title: item.desc,
          content: item.desc,
          author: item.author ?? null,
          cover: item.cover,
          metrics: {
            likes: item.digg_count ?? null,
            comments: item.comment_count ?? null,
            shares: item.share_count ?? null,
            favorites: item.collect_count ?? null,
            views: null,
          },
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
      ? '搜索超时（已自动重试）。建议：1) 减少搜索数量；2) 稍等 30 秒后重试；3) 直接粘贴视频链接获取详情。'
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
