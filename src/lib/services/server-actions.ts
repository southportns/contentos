'use server'

import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { revalidatePath } from 'next/cache'
import { getDefaultUserId } from '@/lib/utils/default-user'

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
