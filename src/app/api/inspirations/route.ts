import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { contentService } from '@/lib/services/content-service'
import { getDefaultUserId, ensureDefaultUser } from '@/lib/utils/default-user'

export const runtime = 'nodejs'

const createSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  content: z.string().min(1, '内容不能为空'),
  source: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
  category: z.enum(['idea', 'reference', 'angle', 'structure', 'hook', 'other']).optional(),
})

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: '数据库未配置' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined

    const defaultUserId = getDefaultUserId()
    const inspirations = await contentService.getInspirations(defaultUserId, {
      category,
      limit,
      offset,
    })

    return NextResponse.json({ success: true, data: inspirations })
  } catch (error) {
    console.error('[API] Get inspirations failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: '数据库未配置' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const input = createSchema.parse(body)

    const defaultUserId = getDefaultUserId()

    // Ensure default user exists
    await ensureDefaultUser()

    const inspiration = await contentService.createInspiration(defaultUserId, {
      title: input.title,
      content: input.content,
      source: input.source,
      sourceUrl: input.sourceUrl || undefined,
      tags: input.tags,
      category: input.category,
    })

    return NextResponse.json({ success: true, data: inspiration })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
    console.error('[API] Create inspiration failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
