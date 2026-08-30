import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { projectRepository } from '@/lib/repositories/project-repository'
import { topicRepository } from '@/lib/repositories/topic-repository'

export const runtime = 'nodejs'

// Format: MM/DD HH:mm
function formatTime(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

// ── Request Schema ──────────────────────────────────

const UpdateTopicSchema = z.object({
  topic: z.string().min(1),
  platform: z.string().optional().nullable(),
  audience: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
})

// ── POST Handler: Update project name + create/update topic ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: '数据库未配置' },
      { status: 503 },
    )
  }

  try {
    const { id: projectId } = await params
    const body = await request.json()
    const data = UpdateTopicSchema.parse(body)

    // 1. Verify project exists
    const project = await projectRepository.findById(projectId)
    if (!project) {
      return NextResponse.json(
        { success: false, error: '创作不存在' },
        { status: 404 },
      )
    }

    // 2. Update project name to "creation time - topic summary"
    const topicSummary = data.topic.slice(0, 20)
    const projectName = `${formatTime(project.createdAt)} - ${topicSummary}`
    await projectRepository.update(projectId, {
      name: projectName,
      description: `主题：${data.topic}`,
    })

    // 3. Create or update topic for this project
    const existingTopics = project.topics ?? []
    let topic

    if (existingTopics.length > 0) {
      // Update existing topic
      topic = await topicRepository.update(existingTopics[0].id, {
        topic: data.topic,
        category: data.category || null,
        platform: data.platform || null,
        audience: data.audience || null,
        status: 'RESEARCHING',
      })
    } else {
      // Create new topic
      topic = await topicRepository.create({
        topic: data.topic,
        category: data.category || null,
        platform: data.platform || null,
        audience: data.audience || null,
        status: 'RESEARCHING',
        project: { connect: { id: projectId } },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        topicId: topic.id,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新失败'
    console.error('[API] Update project topic failed:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
