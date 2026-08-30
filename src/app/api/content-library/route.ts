import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { contentLibraryRepository } from '@/lib/repositories/content-library-repository'
import { getDefaultUserId, ensureDefaultUser } from '@/lib/utils/default-user'
import type { SearchedContent } from '@/hooks/use-workflow'

export const runtime = 'nodejs'

// ── SearchedContent ↔ ContentLibraryItem conversion ──────

function searchedContentToDb(c: SearchedContent, userId: string) {
  return {
    userId,
    platform: c.platform,
    url: c.url,
    title: c.title,
    content: c.content,
    author: c.author,
    cover: c.cover ?? null,
    publishedAt: c.publishedAt,
    likes: c.metrics?.likes ?? null,
    commentsCount: c.metrics?.comments ?? null,
    shares: c.metrics?.shares ?? null,
    favorites: c.metrics?.favorites ?? null,
    views: c.metrics?.views ?? null,
    transcript: c.transcript
      ? (c.transcript as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    collectedComments: c.collectedComments
      ? (c.collectedComments as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    commentAnalysis: c.commentAnalysis
      ? (c.commentAnalysis as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  }
}

function dbToSearchedContent(item: {
  id: string
  platform: string
  url: string
  title: string | null
  content: string | null
  author: string | null
  cover: string | null
  publishedAt: string | null
  likes: number | null
  commentsCount: number | null
  shares: number | null
  favorites: number | null
  views: number | null
  transcript: unknown
  collectedComments: unknown
  commentAnalysis: unknown
}): SearchedContent {
  return {
    platform: item.platform,
    url: item.url,
    title: item.title,
    content: item.content,
    author: item.author,
    cover: item.cover,
    publishedAt: item.publishedAt,
    metrics: {
      likes: item.likes,
      comments: item.commentsCount,
      shares: item.shares,
      favorites: item.favorites,
      views: item.views,
    },
    transcript: (item.transcript as SearchedContent['transcript']) ?? undefined,
    collectedComments: (item.collectedComments as SearchedContent['collectedComments']) ?? undefined,
    commentAnalysis: (item.commentAnalysis as SearchedContent['commentAnalysis']) ?? undefined,
  }
}

// ── Schemas ──────────────────────────────────────────────

const metricsSchema = z.object({
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  favorites: z.number().nullable(),
  views: z.number().nullable(),
}).nullable()

const transcriptSchema = z.object({
  text: z.string(),
  language: z.string(),
  duration: z.number(),
  model: z.string(),
}).nullable()

const collectedCommentsSchema = z.array(z.object({
  text: z.string(),
  nickname: z.string(),
  diggCount: z.number(),
  createTime: z.string().nullable(),
})).nullable()

const commentAnalysisSchema = z.object({
  topComments: z.array(z.object({
    text: z.string(),
    nickname: z.string(),
    diggCount: z.number(),
    createTime: z.string().nullable(),
  })),
  keywords: z.array(z.string()),
  sentiment: z.object({
    positive: z.number(),
    neutral: z.number(),
    negative: z.number(),
  }),
  summary: z.string(),
}).nullable()

const contentItemSchema = z.object({
  platform: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  author: z.string().nullable(),
  cover: z.string().nullable().optional(),
  publishedAt: z.string().nullable(),
  metrics: metricsSchema,
  transcript: transcriptSchema.optional(),
  collectedComments: collectedCommentsSchema.optional(),
  commentAnalysis: commentAnalysisSchema.optional(),
})

// ── GET: List all content library items ──────────────────

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: '数据库未配置' }, { status: 503 })
  }

  try {
    const userId = getDefaultUserId()
    const items = await contentLibraryRepository.findByUserId(userId)
    const contents = items.map(dbToSearchedContent)

    return NextResponse.json({ success: true, data: contents })
  } catch (error) {
    console.error('[API] Get content library failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

// ── POST: Upsert one or more content items ───────────────

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: '数据库未配置' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const items = z.array(contentItemSchema).parse(body)
    const userId = getDefaultUserId()

    await ensureDefaultUser()

    const upserted: SearchedContent[] = []

    for (const item of items) {
      const dbData = searchedContentToDb(item as SearchedContent, userId)

      // Check if item exists by URL
      const existing = await contentLibraryRepository.findByUrl(item.url, userId)

      if (existing) {
        // Update existing — merge transcript/comments (don't overwrite with null)
        const updated = await contentLibraryRepository.update(existing.id, {
          ...dbData,
          transcript: dbData.transcript === Prisma.JsonNull ? existing.transcript as Prisma.InputJsonValue : dbData.transcript,
          collectedComments: dbData.collectedComments === Prisma.JsonNull ? existing.collectedComments as Prisma.InputJsonValue : dbData.collectedComments,
          commentAnalysis: dbData.commentAnalysis === Prisma.JsonNull ? existing.commentAnalysis as Prisma.InputJsonValue : dbData.commentAnalysis,
        })
        upserted.push(dbToSearchedContent(updated))
      } else {
        // Create new
        const created = await contentLibraryRepository.create({
          ...dbData,
          // Convert Prisma.JsonNull to null for create
          transcript: dbData.transcript === Prisma.JsonNull ? undefined : dbData.transcript,
          collectedComments: dbData.collectedComments === Prisma.JsonNull ? undefined : dbData.collectedComments,
          commentAnalysis: dbData.commentAnalysis === Prisma.JsonNull ? undefined : dbData.commentAnalysis,
        })
        upserted.push(dbToSearchedContent(created))
      }
    }

    return NextResponse.json({ success: true, data: upserted })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
    console.error('[API] Upsert content library failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

// ── DELETE: Delete by URL or clear all ───────────────────

export async function DELETE(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: '数据库未配置' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const url = searchParams.get('url')
    const clearAll = searchParams.get('all') === 'true'
    const userId = getDefaultUserId()

    if (clearAll) {
      await contentLibraryRepository.deleteByUserId(userId)
      return NextResponse.json({ success: true })
    }

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL parameter required' },
        { status: 400 },
      )
    }

    const item = await contentLibraryRepository.findByUrl(url, userId)
    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Content not found' },
        { status: 404 },
      )
    }

    await contentLibraryRepository.delete(item.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Delete content library failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
