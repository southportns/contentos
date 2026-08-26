'use server'

import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { revalidatePath } from 'next/cache'

export async function getProjects() {
  if (!isDatabaseConfigured()) return []

  try {
    const { projectRepository } = await import('@/lib/repositories/project-repository')
    // Use a default user ID for now (single-user mode)
    const defaultUserId = process.env.DEFAULT_USER_ID || 'default'
    return await projectRepository.findByUserIdWithTopics(defaultUserId)
  } catch (error) {
    console.error('[Server Action] getProjects failed:', error)
    return []
  }
}

export async function createProject(formData: FormData) {
  if (!isDatabaseConfigured()) {
    throw new Error('Database not configured')
  }

  const name = formData.get('name') as string
  const description = formData.get('description') as string

  if (!name) {
    throw new Error('项目名称不能为空')
  }

  const { projectRepository } = await import('@/lib/repositories/project-repository')
  const defaultUserId = process.env.DEFAULT_USER_ID || 'default'

  await projectRepository.create({
    name,
    description,
    user: { connect: { id: defaultUserId } },
  })

  revalidatePath('/projects')
}
