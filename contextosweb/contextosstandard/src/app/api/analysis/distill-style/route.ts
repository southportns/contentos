import { NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { contentService } from '@/lib/services/content-service'
import { runStyleDistillation } from '@/skills/style-distillation'
import type { UserContentArchive } from '@/generated/prisma'
import { getDefaultUserId, ensureDefaultUser } from '@/lib/utils/default-user'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: '数据库未配置' },
      { status: 503 },
    )
  }

  try {
    const defaultUserId = getDefaultUserId()
    await ensureDefaultUser()

    // Fetch all user content archives
    const archives = await contentService.getArchives(defaultUserId, 50)

    if (!archives || archives.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '还没有终稿记录，无法蒸馏写作风格。完成至少 1 篇内容后重试。',
        },
        { status: 400 },
      )
    }

    // Transform archives for the skill
    const skillInput = archives.map((a: UserContentArchive) => ({
      topic: a.topic,
      platform: a.platform || undefined,
      finalTitle: a.finalTitle,
      finalContent: a.finalContent,
      finalHook: a.finalHook || undefined,
      selectedAngleTitle: a.selectedAngleTitle || undefined,
      strategyTone: a.strategyTone || undefined,
      wordCount: a.wordCount || undefined,
      refineChanges: Array.isArray(a.refineChanges)
        ? (a.refineChanges as unknown as Array<Record<string, string>>)
            .map((c) => ({
              type: c.type,
              original: c.original,
              revised: c.revised,
              reason: c.reason,
            }))
        : undefined,
    }))

    // Run distillation
    const profile = await runStyleDistillation({ archives: skillInput })

    // Save to database
    const saved = await contentService.saveWritingProfile(defaultUserId, {
      toneProfile: profile.toneProfile,
      personality: profile.personality,
      languagePatterns: profile.languagePatterns,
      preferredTopics: profile.preferredTopics,
      preferredStructures: profile.preferredStructures,
      hookStyles: profile.hookStyles,
      emotionalTendencies: profile.emotionalTendencies,
      summary: profile.summary,
      distillSampleCount: archives.length,
      lastDistillAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      data: {
        profile: saved,
        distilled: profile,
        sampleCount: archives.length,
      },
    })
  } catch (error) {
    console.error('[API] Style distillation failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
