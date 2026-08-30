import { NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { contentService } from '@/lib/services/content-service'
import { getDefaultUserId, ensureDefaultUser } from '@/lib/utils/default-user'

export const runtime = 'nodejs'

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: '数据库未配置' },
      { status: 503 },
    )
  }

  try {
    const defaultUserId = getDefaultUserId()
    await ensureDefaultUser()

    const [profile, archiveCount] = await Promise.all([
      contentService.getWritingProfile(defaultUserId),
      contentService.countArchives(defaultUserId),
    ])

    return NextResponse.json({
      success: true,
      data: {
        profile,
        archiveCount,
      },
    })
  } catch (error) {
    console.error('[API] Get writing profile failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
