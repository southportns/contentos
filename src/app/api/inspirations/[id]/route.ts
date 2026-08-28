import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { contentService } from '@/lib/services/content-service'

export const runtime = 'nodejs'

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(['idea', 'reference', 'angle', 'structure', 'hook', 'other']).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: '数据库未配置' }, { status: 503 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const input = updateSchema.parse(body)

    const updated = await contentService.updateInspiration(id, input)

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
    console.error('[API] Update inspiration failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: '数据库未配置' }, { status: 503 })
  }

  try {
    const { id } = await params
    await contentService.deleteInspiration(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Delete inspiration failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
