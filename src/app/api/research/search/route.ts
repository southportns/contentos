import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runContentSearch } from '@/skills/content-search'
import { contentService } from '@/lib/services/content-service'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const maxDuration = 120

const searchInputSchema = z.object({
  queries: z.array(z.string()).min(1),
  // topicId is optional — when absent (e.g. explorer/research page),
  // search results are returned without DB persistence
  topicId: z.string().optional(),
  limit: z.number().int().positive().max(30).default(10),
  publishTime: z
    .enum(['none', '1d', '7d', '14d', '30d'])
    .default('none'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = searchInputSchema.parse(body)

    const result = await runContentSearch(input)

    // Persist to database — only when a valid topicId is provided
    // (explorer/research pages omit topicId entirely, so no DB lookup occurs)
    if (isDatabaseConfigured() && input.topicId) {
      await safeDb(async () => {
        // Verify the topic exists before saving to avoid FK violations
        const topic = await contentService.getTopic(input.topicId!)
        if (!topic) {
          console.warn(
            `[content-search-save] Topic ${input.topicId} not found, skipping DB save`,
          )
          return null
        }

        await contentService.saveResearchResult({
          topicId: input.topicId!,
          queries: input.queries,
          contents: result.contents.map((c) => ({
            platform: c.platform,
            url: c.url,
            title: c.title || undefined,
            author: c.author || undefined,
            body: c.content || undefined,
            publishedAt: c.publishedAt || undefined,
            likes: c.metrics?.likes ?? undefined,
            commentsCount: c.metrics?.comments ?? undefined,
            shares: c.metrics?.shares ?? undefined,
            favorites: c.metrics?.favorites ?? undefined,
            views: c.metrics?.views ?? undefined,
          })),
        })
      }, 'content-search-save')
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
