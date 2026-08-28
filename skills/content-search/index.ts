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
 * 检查 query 是否是抖音 URL
 */
function isDouyinUrl(query: string): boolean {
  return extractAwemeId(query) !== null && query.includes('douyin')
}

/**
 * 通过抖音微服务搜索内容
 */
async function searchViaDouyin(
  query: string,
  limit: number,
  publishTime: PublishTimeFilter = 'none',
): Promise<ContentSearchOutput['contents']> {
  const contents: ContentSearchOutput['contents'] = []

  try {
    // 如果是抖音 URL，直接获取详情
    if (isDouyinUrl(query)) {
      const awemeId = extractAwemeId(query)!
      const detail = await getVideoDetail(awemeId)
      contents.push({
        platform: 'douyin',
        url: `https://www.douyin.com/video/${detail.aweme_id}`,
        title: detail.desc || null,
        author: detail.author || null,
        content: detail.desc || null,
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
      return contents
    }

    // 否则通过浏览器代理搜索
    const items = await searchDouyin(query, limit, publishTime)

    // 获取每个视频的详细数据（点赞、评论等）
    for (const item of items.slice(0, limit)) {
      try {
        const detail = await getVideoDetail(item.aweme_id)
        contents.push({
          platform: 'douyin',
          url: `https://www.douyin.com/video/${detail.aweme_id}`,
          title: detail.desc || item.desc || null,
          author: detail.author || null,
          content: detail.desc || item.desc || null,
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
      } catch {
        // 如果详情获取失败，使用搜索结果中的基础信息
        contents.push({
          platform: 'douyin',
          url: `https://www.douyin.com/video/${item.aweme_id}`,
          title: item.desc || null,
          author: null,
          content: item.desc || null,
          publishedAt: null,
          metrics: null,
        })
      }
    }
  } catch {
      // 抖音搜索失败时静默跳过，继续走 DuckDuckGo
  }

  return contents
}

export async function runContentSearch(
  input: ContentSearchInput,
): Promise<ContentSearchOutput> {
  const validated = contentSearchInputSchema.parse(input)

  const seenUrls = new Set<string>()
  const contents: ContentSearchOutput['contents'] = []

  // 检查抖音微服务是否可用
  const douyinAvailable = await checkDouyinHealth()

  for (const query of validated.queries) {
    // 如果抖音微服务可用且 query 与抖音相关，优先走抖音数据源
    if (douyinAvailable && (isDouyinQuery(query) || isDouyinUrl(query))) {
      const douyinContents = await searchViaDouyin(query, validated.limit, validated.publishTime)
      for (const content of douyinContents) {
        if (!seenUrls.has(content.url)) {
          seenUrls.add(content.url)
          contents.push(content)
        }
      }
      // 抖音数据已获取，跳过 Firecrawl
      continue
    }

    // 默认走 DuckDuckGo 搜索
    try {
      const searchResults: SearchResult[] = await searchWeb(
        query,
        validated.limit,
      )

      for (const result of searchResults) {
        if (seenUrls.has(result.url)) continue
        seenUrls.add(result.url)

        try {
          const scrapeResult = await scrapeUrl(result.url)
          if (scrapeResult.content && scrapeResult.content.length > 100) {
            contents.push(transformToContent(result.url, scrapeResult))
          }
        } catch {
          // Skip failed scrapes
        }
      }
    } catch {
      // Skip failed searches
    }
  }

  return contentSearchOutputSchema.parse({ contents })
}
