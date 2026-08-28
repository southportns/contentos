import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { id } = await params
    const { personaRepository } = await import('@/lib/repositories/persona-repository')
    const persona = await personaRepository.findById(id)

    if (!persona) {
      return NextResponse.json({ success: false, error: '人设不存在' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: persona })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const input = updateSchema.parse(body)

    const { personaRepository } = await import('@/lib/repositories/persona-repository')

    const existing = await personaRepository.findById(id)
    if (!existing) {
      return NextResponse.json({ success: false, error: '人设不存在' }, { status: 404 })
    }

    const persona = await personaRepository.update(id, {
      name: input.name,
      description: input.description,
    })

    return NextResponse.json({ success: true, data: persona })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
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
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { id } = await params
    const { personaRepository } = await import('@/lib/repositories/persona-repository')

    const existing = await personaRepository.findById(id)
    if (!existing) {
      return NextResponse.json({ success: false, error: '人设不存在' }, { status: 404 })
    }

    await personaRepository.delete(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
