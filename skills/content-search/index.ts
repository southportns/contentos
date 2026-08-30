import {
  searchWeb,
  scrapeUrl,
  type SearchResult,
  type ScrapeResult,
} from '@/lib/tools/web-client'
import {
  searchDouyin,
  getVideoDetail,
  extractAwemeId,
  isDouyinShortUrl,
  resolveDouyinShortUrl,
  checkDouyinHealth,
  type PublishTimeFilter,
} from '@/lib/tools/douyin-client'
import {
  contentSearchInputSchema,
  contentSearchOutputSchema,
} from './schema'
import type { ContentSearchInput, ContentSearchOutput } from './schema'

function detectPlatform(url: string): string {
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes('xiaohongshu.com') || lowerUrl.includes('xhslink.com'))
    return 'xiaohongshu'
  if (lowerUrl.includes('douyin.com')) return 'douyin'
  if (lowerUrl.includes('weibo.com')) return 'weibo'
  if (lowerUrl.includes('zhihu.com')) return 'zhihu'
  if (lowerUrl.includes('mp.weixin.qq.com')) return 'wechat'
  if (lowerUrl.includes('bilibili.com')) return 'bilibili'
  if (lowerUrl.includes('toutiao.com')) return 'toutiao'
  return 'web'
}

function extractAuthor(scrapeResult: ScrapeResult): string | null {
  const lines = scrapeResult.markdown.split('\n')
  for (const line of lines.slice(0, 20)) {
    const match = line.match(/^(?:作者|author|来源)[:：]\s*(.+)/i)
    if (match) return match[1].trim()
  }
  return scrapeResult.title || null
}

function extractPublishedDate(scrapeResult: ScrapeResult): string | null {
  const datePattern = /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/
  const match = scrapeResult.markdown.match(datePattern)
  return match ? match[1] : null
}

function transformToContent(
  url: string,
  scrapeResult: ScrapeResult,
): ContentSearchOutput['contents'][number] {
  return {
    platform: detectPlatform(url),
    url,
    title: scrapeResult.title || null,
    author: extractAuthor(scrapeResult),
    content: scrapeResult.content || null,
    publishedAt: extractPublishedDate(scrapeResult),
    metrics: null,
  }
}

/**
 * 检查 query 是否包含抖音相关关键词
 */
function isDouyinQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return (
    lower.includes('抖音') ||
    lower.includes('douyin') ||
    lower.includes('短视频')
  )
}

/**
 * 检查 query 是否是抖音 URL（包含完整链接或短链接）
 */
function isDouyinUrl(query: string): boolean {
  return (extractAwemeId(query) !== null && query.includes('douyin')) || isDouyinShortUrl(query)
}

/**
 * 通过抖音微服务搜索内容
 * 返回 { contents, error? } 对象，error 在失败时包含错误信息
 */
async function searchViaDouyin(
  query: string,
  limit: number,
  publishTime: PublishTimeFilter = 'none',
): Promise<{ contents: ContentSearchOutput['contents']; error?: string }> {
  const contents: ContentSearchOutput['contents'] = []

  try {
    // 提取 awemeId：如果是短链接，先解析
    let awemeId: string | null = null
    if (isDouyinShortUrl(query)) {
      awemeId = await resolveDouyinShortUrl(query)
      if (!awemeId) {
        return { contents, error: `无法解析抖音短链接：${query}，可能链接已失效` }
      }
    } else if (isDouyinUrl(query)) {
      awemeId = extractAwemeId(query)
    }

    // 如果有 awemeId，直接获取详情
    if (awemeId) {
      const detail = await getVideoDetail(awemeId)
      contents.push({
        platform: 'douyin',
        url: `https://www.douyin.com/video/${detail.aweme_id}`,
        title: detail.desc || null,
        author: detail.author || null,
        content: detail.desc || null,
        cover: detail.cover_url || null,
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
      })
      return { contents }
    }

    // 否则通过浏览器代理搜索
    const items = await searchDouyin(query, limit, publishTime)

    // 并行获取所有视频的详细数据（点赞、评论等）
    const detailPromises = items.slice(0, limit).map(async (item) => {
      try {
        const detail = await getVideoDetail(item.aweme_id)
        return {
          platform: 'douyin' as const,
          url: `https://www.douyin.com/video/${detail.aweme_id}`,
          title: detail.desc || item.desc || null,
          author: detail.author || null,
          content: detail.desc || item.desc || null,
          cover: detail.cover_url || item.cover || null,
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
        }
      } catch {
        // 如果详情获取失败，使用搜索结果中的基础信息
        return {
          platform: 'douyin' as const,
          url: `https://www.douyin.com/video/${item.aweme_id}`,
          title: item.desc || null,
          author: null,
          content: item.desc || null,
          cover: item.cover || null,
          publishedAt: null,
          metrics: null,
        }
      }
    })

    const details = await Promise.all(detailPromises)
    contents.push(...details)
    return { contents }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    const isTimeout = msg.includes('aborted') || msg.includes('timeout')
    const userMsg = isTimeout
      ? `抖音数据获取超时（微服务响应缓慢）。请稍后重试，或直接使用视频链接获取详情。`
      : `抖音数据获取失败：${msg}`
    return { contents, error: userMsg }
  }
}

export async function runContentSearch(
  input: ContentSearchInput,
): Promise<ContentSearchOutput> {
  const validated = contentSearchInputSchema.parse(input)

  const seenUrls = new Set<string>()
  const contents: ContentSearchOutput['contents'] = []
  const errors: string[] = []

  // 检查抖音微服务是否可用（有 5 秒缓存，避免频繁请求）
  const douyinAvailable = await checkDouyinHealth()

  // Process all queries in parallel for better performance
  const queryResults = await Promise.all(
    validated.queries.map(async (query) => {
      // 如果是抖音链接（完整 URL 或短链接），无论微服务健康检查如何都尝试走抖音路径
      // 因为 health check 可能偶尔失败但实际可用
      const isDyUrl = isDouyinUrl(query)
      const isDyKeyword = isDouyinQuery(query)
      if (isDyUrl || (douyinAvailable && isDyKeyword)) {
        const { contents: douyinContents, error: douyinError } = await searchViaDouyin(
          query,
          validated.limit,
          validated.publishTime,
        )
        if (douyinError) {
          errors.push(douyinError)
        } else if (douyinContents.length === 0) {
          errors.push(`抖音搜索「${query}」未返回结果，可能是风控或微服务异常`)
        }
        return douyinContents
      }

      // 默认走 DuckDuckGo 搜索 + 并行 scrape
      try {
        const searchResults: SearchResult[] = await searchWeb(
          query,
          validated.limit,
        )

        // Scrape all URLs in parallel (Jina Reader handles concurrent requests)
        const scrapePromises = searchResults.map(async (result) => {
          try {
            const scrapeResult = await scrapeUrl(result.url)
            if (scrapeResult.content && scrapeResult.content.length > 100) {
              return transformToContent(result.url, scrapeResult)
            }
          } catch {
            // Skip failed scrapes
          }
          return null
        })

        const settled = await Promise.all(scrapePromises)
        const filtered = settled.filter((c): c is NonNullable<typeof c> => c !== null)
        if (filtered.length === 0 && searchResults.length > 0) {
          errors.push(`搜索「${query}」找到 ${searchResults.length} 条结果，但内容抓取全部失败`)
        }
        return filtered
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误'
        // 判断是否为网络连接问题
        const isConnectError = msg.includes('fetch failed') || msg.includes('timeout') || msg.includes('Connect Timeout')
        if (isConnectError) {
          errors.push(`网络搜索「${query}」连接失败：${msg}。建议使用抖音关键词搜索或输入视频链接`)
        } else {
          errors.push(`搜索「${query}」失败：${msg}`)
        }
        return []
      }
    }),
  )

  // Merge and deduplicate results
  for (const queryContent of queryResults) {
    for (const content of queryContent) {
      if (!seenUrls.has(content.url)) {
        seenUrls.add(content.url)
        contents.push(content)
      }
    }
  }

  // 生成搜索状态消息
  let message: string | undefined
  if (contents.length === 0 && errors.length > 0) {
    message = errors.join('；')
  } else if (errors.length > 0) {
    message = errors.join('；')
  }

  return contentSearchOutputSchema.parse({ contents, message })
}
