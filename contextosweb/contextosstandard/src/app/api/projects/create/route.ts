import { NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { projectRepository } from '@/lib/repositories/project-repository'
import { getDefaultUserId, ensureDefaultUser } from '@/lib/utils/default-user'

export const runtime = 'nodejs'

// Format: MM/DD HH:mm
function formatTime(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

// ── POST: Auto-create a project (no form needed) ─────

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: '数据库未配置，无法创建创作' },
      { status: 503 },
    )
  }

  try {
    const defaultUserId = getDefaultUserId()

    // Ensure default user exists (foreign key constraint)
    await ensureDefaultUser()

    // Create project with creation time as the name.
    // Once the user identifies a topic, the name will be updated
    // to "time - topic summary".
    const now = new Date()
    const project = await projectRepository.create({
      name: formatTime(now),
      user: { connect: { id: defaultUserId } },
    })

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.id,
        createdAt: project.createdAt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    console.error('[API] Auto-create project failed:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
