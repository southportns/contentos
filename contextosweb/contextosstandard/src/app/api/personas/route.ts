import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { ensureDefaultUser, getDefaultUserId } from '@/lib/utils/default-user'

export const runtime = 'nodejs'

const createSchema = z.object({
  name: z.string().min(1, '人设名称不能为空'),
  description: z.string().optional(),
})

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { personaRepository } = await import('@/lib/repositories/persona-repository')
    await ensureDefaultUser()
    const defaultUserId = getDefaultUserId()
    const personas = await personaRepository.findByUserId(defaultUserId)
    return NextResponse.json({ success: true, data: personas })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const input = createSchema.parse(body)

    const { personaRepository } = await import('@/lib/repositories/persona-repository')
    await ensureDefaultUser()
    const defaultUserId = getDefaultUserId()

    const persona = await personaRepository.create({
      name: input.name.trim(),
      description: input.description || undefined,
      user: { connect: { id: defaultUserId } },
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
