/**
 * Web Client — DuckDuckGo HTML Search + Jina Reader
 *
 * Replaces Firecrawl for web research. No API key required.
 * - Search: DuckDuckGo HTML API (https://html.duckduckgo.com/html/)
 * - Scrape: Jina Reader (https://r.jina.ai/) — free, no auth needed
 */

export interface SearchResult {
  url: string
  title: string
  description: string
}

export interface ScrapeResult {
  url: string
  title: string
  content: string
  markdown: string
  html?: string
}

/**
 * Parse DuckDuckGo HTML search results.
 */
function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const results: SearchResult[] = []

  // DuckDuckGo HTML results have result links in <a class="result__a" href="...">
  const linkRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRegex =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

  const links = [...html.matchAll(linkRegex)]
  const snippets = [...html.matchAll(snippetRegex)]

  for (let i = 0; i < links.length; i++) {
    const rawUrl = links[i][1] || ''
    const titleHtml = links[i][2] || ''
    const snippetHtml = snippets[i]?.[1] || ''

    // DuckDuckGo wraps URLs in a redirect: //duckduckgo.com/l/?uddg=<encoded_url>&rut=...
    let url = rawUrl
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1])
    }
    // Remove leading // if present
    if (url.startsWith('//')) url = 'https:' + url

    // Strip HTML tags from title and snippet
    const title = titleHtml.replace(/<[^>]*>/g, '').trim()
    const description = snippetHtml.replace(/<[^>]*>/g, '').trim()

    if (url && title) {
      results.push({ url, title, description })
    }
  }

  return results
}

/**
 * Search the web using DuckDuckGo HTML API.
 * No API key required — completely free.
 */
export async function searchWeb(
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  const url = 'https://html.duckduckgo.com/html/'

  const formData = new URLSearchParams()
  formData.append('q', query)
  formData.append('b', '0') // no bookmark
  formData.append('kl', 'cn-zh') // region

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`)
    }

    const html = await response.text()
    const results = parseDuckDuckGoHtml(html)

    return results.slice(0, limit)
  } catch (error) {
    console.error('[web-client] DuckDuckGo search error:', error)
    throw error
  }
}

/**
 * Scrape a URL using Jina Reader (r.jina.ai).
 * Returns clean markdown content — no API key required.
 *
 * Jina Reader is a free public service that converts any URL
 * to clean markdown text suitable for LLM consumption.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const jinaUrl = `https://r.jina.ai/${url}`

  try {
    const response = await fetch(jinaUrl, {
      headers: {
        Accept: 'text/markdown',
        'User-Agent': 'ContentOS/1.0',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`Jina Reader scrape failed: HTTP ${response.status}`)
    }

    const markdown = await response.text()

    // Jina Reader returns markdown with a title line at the top
    // Format: "Title: <title>\n\nURL Source: <url>\n\nMarkdown Source: ...\n\n<content>"
    let title = ''
    let content = markdown

    const titleMatch = markdown.match(/^Title:\s*(.+)$/m)
    if (titleMatch) {
      title = titleMatch[1].trim()
    }

    // Extract content after the metadata header
    const contentStart = markdown.indexOf('\n\n', markdown.indexOf('Markdown Source:'))
    if (contentStart > -1) {
      content = markdown.slice(contentStart + 2).trim()
    }

    return {
      url,
      title: title || url,
      content,
      markdown,
    }
  } catch (error) {
    console.error(`[web-client] Jina Reader scrape error for ${url}:`, error)
    throw error
  }
}

/**
 * Scrape multiple URLs sequentially with a small delay
 * to avoid overwhelming the Jina Reader service.
 */
export async function scrapeMultipleUrls(
  urls: string[],
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = []

  for (const url of urls) {
    try {
      const result = await scrapeUrl(url)
      results.push(result)
      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error)
    }
  }

  return results
}

/**
 * Crawl a website by first fetching the main page,
 * then extracting and scraping linked pages.
 * This is a simplified replacement for Firecrawl's crawl feature.
 */
export async function crawlWebsite(
  url: string,
  limit = 20,
): Promise<ScrapeResult[]> {
  try {
    // First scrape the main page
    const mainResult = await scrapeUrl(url)
    const results: ScrapeResult[] = [mainResult]

    // Extract links from the main page markdown
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    const links = [...mainResult.markdown.matchAll(linkRegex)]
      .map((m) => m[2])
      .filter((link) => link.startsWith('http') && !link.includes('jina.ai'))

    // Scrape up to (limit - 1) additional pages
    for (const link of links.slice(0, limit - 1)) {
      try {
        const result = await scrapeUrl(link)
        results.push(result)
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch {
        // Skip failed scrapes
      }
    }

    return results
  } catch (error) {
    console.error(`[web-client] Crawl failed for ${url}:`, error)
    return []
  }
}
