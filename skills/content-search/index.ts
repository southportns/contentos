import {
  searchWeb,
  scrapeUrl,
  type SearchResult,
  type ScrapeResult,
} from '@/lib/tools/firecrawl-client'
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
  // Try to extract author from markdown metadata
  const lines = scrapeResult.markdown.split('\n')
  for (const line of lines.slice(0, 20)) {
    const match = line.match(/^(?:作者|author|来源)[:：]\s*(.+)/i)
    if (match) return match[1].trim()
  }
  return scrapeResult.title || null
}

function extractPublishedDate(scrapeResult: ScrapeResult): string | null {
  // Try to extract date from content
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

export async function runContentSearch(
  input: ContentSearchInput,
): Promise<ContentSearchOutput> {
  const validated = contentSearchInputSchema.parse(input)

  const seenUrls = new Set<string>()
  const contents: ContentSearchOutput['contents'] = []

  for (const query of validated.queries) {
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
