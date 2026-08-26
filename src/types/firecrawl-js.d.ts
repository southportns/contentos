declare module '@mendable/firecrawl-js' {
  export interface FirecrawlSearchResult {
    url?: string
    title?: string
    description?: string
  }

  export interface FirecrawlScrapeResult {
    markdown?: string
    html?: string
    metadata?: {
      title?: string
      description?: string
      url?: string
      author?: string
    }
  }

  export interface FirecrawlResponse<T> {
    success: boolean
    data?: T
    error?: string
  }

  export default class Firecrawl {
    constructor(options: { apiKey: string })
    search(
      query: string,
      options?: { limit?: number },
    ): Promise<FirecrawlResponse<FirecrawlSearchResult[]>>
    scrapeUrl(
      url: string,
      options?: { formats?: string[] },
    ): Promise<FirecrawlResponse<FirecrawlScrapeResult>>
    crawlUrl(
      url: string,
      options?: { limit?: number; scrapeOptions?: { formats?: string[] } },
    ): Promise<FirecrawlResponse<FirecrawlScrapeResult[]>>
  }
}
