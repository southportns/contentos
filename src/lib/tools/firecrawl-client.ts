import Firecrawl from '@mendable/firecrawl-js'

function getFirecrawlClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    throw new Error(
      'FIRECRAWL_API_KEY is not set. Please configure it in .env.local',
    )
  }
  return new Firecrawl({ apiKey })
}

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

export async function searchWeb(query: string, limit = 10): Promise<SearchResult[]> {
  const client = getFirecrawlClient()
  const result = await client.search(query, {
    limit,
  })

  if (!result.success) {
    throw new Error(`Firecrawl search failed: ${result.error}`)
  }

  return (result.data || []).map((item) => ({
    url: item.url || '',
    title: item.title || '',
    description: item.description || '',
  }))
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const client = getFirecrawlClient()
  const result = await client.scrapeUrl(url, {
    formats: ['markdown', 'html'],
  })

  if (!result.success || !result.data) {
    throw new Error(`Firecrawl scrape failed: ${result.error}`)
  }

  const data = result.data
  return {
    url,
    title: data.metadata?.title || '',
    content: data.markdown || '',
    markdown: data.markdown || '',
    html: data.html,
  }
}

export async function scrapeMultipleUrls(
  urls: string[],
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = []
  for (const url of urls) {
    try {
      const result = await scrapeUrl(url)
      results.push(result)
    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error)
    }
  }
  return results
}

export async function crawlWebsite(
  url: string,
  limit = 20,
): Promise<ScrapeResult[]> {
  const client = getFirecrawlClient()
  const result = await client.crawlUrl(url, {
    limit,
    scrapeOptions: {
      formats: ['markdown'],
    },
  })

  if (!result.success) {
    throw new Error(`Firecrawl crawl failed: ${result.error}`)
  }

  const items = result.data || []
  return items.map((item) => ({
    url: item.metadata?.url || '',
    title: item.metadata?.title || '',
    content: item.markdown || '',
    markdown: item.markdown || '',
  }))
}
