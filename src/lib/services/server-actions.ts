'use server'

import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { revalidatePath } from 'next/cache'
import { getDefaultUserId } from '@/lib/utils/default-user'
import type { Draft, Topic } from '@/generated/prisma'

export async function getProjects() {
  if (!isDatabaseConfigured()) return []

  try {
    const { projectRepository } = await import('@/lib/repositories/project-repository')
    const defaultUserId = getDefaultUserId()
    return await projectRepository.findByUserIdWithTopics(defaultUserId)
  } catch (error) {
    console.error('[Server Action] getProjects failed:', error)
    return []
  }
}

/**
 * P0.4.1 — Get project detail with full content history.
 * Read-only: returns project, topics, angles, strategy, drafts (with evaluation/humanization/strategyEvaluation).
 */
export async function getProjectDetail(projectId: string) {
  if (!isDatabaseConfigured()) return null

  if (!projectId) return null

  try {
    const { projectRepository } = await import('@/lib/repositories/project-repository')
    return await projectRepository.findByIdWithContentHistory(projectId)
  } catch (error) {
    console.error('[Server Action] getProjectDetail failed:', error)
    return null
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new Error('Database not configured')
  }

  if (!projectId) {
    throw new Error('创作 ID 不能为空')
  }

  const { projectRepository } = await import('@/lib/repositories/project-repository')

  // Verify the project exists before deleting
  const existing = await projectRepository.findById(projectId)
  if (!existing) {
    throw new Error('创作不存在')
  }

  // Cascade delete: Prisma schema has onDelete: Cascade on Topic → Project,
  // and all Topic children also cascade, so deleting the project removes everything.
  await projectRepository.delete(projectId)

  revalidatePath('/projects')
}

/**
 * P0.4.3 — Restore a draft version by creating a new Draft from historical content.
 *
 * Restore = Create New Draft (never overwrites old versions).
 *
 * @param sourceDraftId - The draft ID to restore content from
 * @returns { success: boolean, draft?: Draft, error?: string }
 */
export async function restoreDraftVersion(
  sourceDraftId: string,
): Promise<{ success: boolean; draft?: Draft; error?: string }> {
  if (!isDatabaseConfigured()) {
    return { success: false, error: '数据库未配置' }
  }

  if (!sourceDraftId) {
    return { success: false, error: '版本不存在或已不可用' }
  }

  try {
    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const defaultUserId = getDefaultUserId()

    const draft = await topicRepository.createRestoredDraft(sourceDraftId, defaultUserId)

    // Revalidate project detail page to show new version
    revalidatePath('/projects/(app)', 'layout')

    return { success: true, draft }
  } catch (error) {
    console.error('[Server Action] restoreDraftVersion failed:', error)

    // Map repository errors to user-friendly messages
    if (error instanceof Error) {
      switch (error.message) {
        case 'SOURCE_DRAFT_NOT_FOUND':
          return { success: false, error: '该版本不存在或已不可用' }
        case 'TOPIC_NOT_FOUND':
          return { success: false, error: '项目上下文不存在' }
        case 'OWNERSHIP_DENIED':
          return { success: false, error: '无权操作此版本' }
        case 'DRAFT_VERSION_CONFLICT':
          // P0.4.4 — Version creation conflict after max retries
          return { success: false, error: '版本创建冲突，请重试' }
        default:
          return { success: false, error: '恢复失败，请稍后重试' }
      }
    }

    return { success: false, error: '恢复失败，请稍后重试' }
  }
}

/**
 * P0.4.8 — Set a specific draft as the active (current working) draft.
 *
 * Viewing a version ≠ switching active draft. This action explicitly changes
 * the database state to mark a version as the current working version.
 *
 * @param topicId - The topic ID
 * @param draftId - The draft ID to set as active
 * @returns { success: boolean, error?: string }
 */
export async function setActiveDraft(
  topicId: string,
  draftId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isDatabaseConfigured()) {
    return { success: false, error: '数据库未配置' }
  }

  if (!topicId || !draftId) {
    return { success: false, error: '参数不完整，请重新选择' }
  }

  try {
    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const defaultUserId = getDefaultUserId()

    await topicRepository.setActiveDraft(topicId, draftId, defaultUserId)

    // Revalidate project detail page to reflect the new active draft
    revalidatePath('/projects/(app)', 'layout')

    return { success: true }
  } catch (error) {
    console.error('[Server Action] setActiveDraft failed:', error)

    if (error instanceof Error) {
      switch (error.message) {
        case 'SOURCE_DRAFT_NOT_FOUND':
          return { success: false, error: '该版本不存在或已不可用' }
        case 'ACTIVE_DRAFT_INVALID':
          // P0.4.8 — Cross-topic protection
          return { success: false, error: '当前版本无效，请重新选择' }
        case 'OWNERSHIP_DENIED':
          return { success: false, error: '无权操作此版本' }
        default:
          return { success: false, error: '设置失败，请稍后重试' }
      }
    }

    return { success: false, error: '设置失败，请稍后重试' }
  }
}

/**
 * P0.5.1 — Save a manual edit to the active draft.
 *
 * Creates a new MANUAL_EDIT Draft from the source draft, with user-modified content.
 * The new draft becomes the active draft. The original draft is never modified.
 *
 * @param sourceDraftId - The draft ID that is being edited
 * @param content - The modified content
 * @param title - Optional modified title (pass empty string to clear)
 * @param changeReason - Optional reason for the edit
 * @returns { success: boolean, draft?: Draft, topic?: Topic, error?: string }
 */
export async function saveManualDraftEdit(
  sourceDraftId: string,
  content: string,
  title?: string | null,
  changeReason?: string,
): Promise<{ success: boolean; draft?: Draft; topic?: Topic; error?: string }> {
  if (!isDatabaseConfigured()) {
    return { success: false, error: '数据库未配置' }
  }

  if (!sourceDraftId) {
    return { success: false, error: '版本不存在或已不可用' }
  }

  if (!content || content.trim().length === 0) {
    return { success: false, error: '内容不能为空' }
  }

  try {
    const { topicRepository } = await import('@/lib/repositories/topic-repository')
    const defaultUserId = getDefaultUserId()

    const result = await topicRepository.createManualEditDraft({
      sourceDraftId,
      content,
      title,
      changeReason,
      userId: defaultUserId,
    })

    // Revalidate project detail page to show new version
    revalidatePath('/projects/(app)', 'layout')

    return { success: true, draft: result.draft, topic: result.topic }
  } catch (error) {
    console.error('[Server Action] saveManualDraftEdit failed:', error)

    if (error instanceof Error) {
      switch (error.message) {
        case 'SOURCE_DRAFT_NOT_FOUND':
          return { success: false, error: '该版本不存在或已不可用' }
        case 'TOPIC_NOT_FOUND':
          return { success: false, error: '项目上下文不存在' }
        case 'OWNERSHIP_DENIED':
          return { success: false, error: '无权操作此版本' }
        case 'DRAFT_VERSION_CONFLICT':
          return { success: false, error: '版本创建冲突，请重试' }
        case 'ACTIVE_DRAFT_CONFLICT':
          // P0.5.1 Fix — stale active draft: another tab updated active draft before this save
          return { success: false, error: '当前版本已在其他标签页更新，请刷新后重试' }
        default:
          return { success: false, error: '保存失败，请稍后重试' }
      }
    }

    return { success: false, error: '保存失败，请稍后重试' }
  }
}

// ─── Persona Server Actions ─────────────────────────────

export async function getPersonas() {
  if (!isDatabaseConfigured()) return []

  try {
    const { personaRepository } = await import('@/lib/repositories/persona-repository')
    const defaultUserId = getDefaultUserId()
    return await personaRepository.findByUserId(defaultUserId)
  } catch (error) {
    console.error('[Server Action] getPersonas failed:', error)
    return []
  }
}

export async function createPersona(data: {
  name: string
  description?: string
}): Promise<{ id: string; name: string }> {
  if (!isDatabaseConfigured()) {
    throw new Error('Database not configured')
  }

  if (!data.name?.trim()) {
    throw new Error('人设名称不能为空')
  }

  const { personaRepository } = await import('@/lib/repositories/persona-repository')
  const defaultUserId = getDefaultUserId()

  const persona = await personaRepository.create({
    name: data.name.trim(),
    description: data.description || undefined,
    user: { connect: { id: defaultUserId } },
  })

  revalidatePath('/workspace')
  revalidatePath('/create/topic')

  return { id: persona.id, name: persona.name }
}

export async function updatePersona(
  id: string,
  data: {
    name?: string
    description?: string
  },
): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new Error('Database not configured')
  }

  if (!id) {
    throw new Error('人设 ID 不能为空')
  }

  const { personaRepository } = await import('@/lib/repositories/persona-repository')

  const existing = await personaRepository.findById(id)
  if (!existing) {
    throw new Error('人设不存在')
  }

  await personaRepository.update(id, {
    name: data.name,
    description: data.description,
  })

  revalidatePath('/workspace')
  revalidatePath('/create/topic')
}

export async function deletePersona(personaId: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new Error('Database not configured')
  }

  if (!personaId) {
    throw new Error('人设 ID 不能为空')
  }

  const { personaRepository } = await import('@/lib/repositories/persona-repository')

  const existing = await personaRepository.findById(personaId)
  if (!existing) {
    throw new Error('人设不存在')
  }

  // Topics referencing this persona will have personaId set to null (onDelete: SetNull)
  await personaRepository.delete(personaId)

  revalidatePath('/workspace')
  revalidatePath('/create/topic')
}
