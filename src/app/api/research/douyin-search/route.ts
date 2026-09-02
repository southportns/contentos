import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { searchDouyin, getSearchCooldownStatus, type PublishTimeFilter } from '@/lib/tools/douyin-client'

export const runtime = 'nodejs'
export const maxDuration = 15 // 4s 快速失败 + 冷却检查 + 缓冲

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

    // 多关键词并行搜索，合并去重
    // 注意：Promise.all 中单个搜索失败不会阻塞整体，失败的关键词返回空结果
    // 多关键词场景下跳过 spacing，因为每个关键词本身是独立的请求，不需要互相等待
    const allKeywords = input.keywords
    const isMultiKeyword = allKeywords.length > 1
    const searchPromises = allKeywords.map((kw) =>
      searchDouyin(kw, input.count, input.publishTime as PublishTimeFilter, {
        skipSpacing: isMultiKeyword, // 多关键词并行时跳过 spacing
      }).catch((err) => {
        // 超时 = 风控拦截，记录日志但不阻塞其他关键词
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('aborted') || msg.includes('timeout')) {
          console.warn(`[douyin-search] Keyword "${kw}" timed out (likely anti-bot)`)
        } else {
          console.warn(`[douyin-search] Keyword "${kw}" failed: ${msg}`)
        }
        return [] as Awaited<ReturnType<typeof searchDouyin>>
      }),
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

    // 检查是否有关键词在冷却期
    const cooldownKeywords = allKeywords.filter((kw) => {
      const status = getSearchCooldownStatus(kw)
      return status.inCooldown
    })

    // 搜索返回空结果时，给出风控提示
    const message = filtered.length === 0
      ? cooldownKeywords.length > 0
        ? `关键词 "${cooldownKeywords[0]}" 刚触发风控，冷却中（约 ${getSearchCooldownStatus(cooldownKeywords[0]).remainingSec}s 后可重试）。建议：1) 换个关键词；2) 直接粘贴视频链接获取详情；3) 等冷却结束后重试。`
        : allKeywords.length > 1
          ? '多标签搜索未返回符合条件的结果。可能原因：1) 抖音风控暂时拦截；2) 标签组合过严。建议：a) 减少标签数量重试；b) 降低点赞筛选阈值；c) 直接粘贴视频链接获取详情。'
          : '抖音搜索接口可能触发风控，返回空结果。建议：1) 换个关键词重试；2) 直接粘贴视频链接获取详情（更稳定）；3) 稍等 1-2 分钟后再试。'
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
      ? '搜索请求被抖音风控拦截（4s 快速失败已生效）。建议：1) 换个关键词或减少标签数量；2) 直接粘贴视频链接获取详情；3) 稍等冷却期后重试。'
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
