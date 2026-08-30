import { prisma } from '@/lib/prisma'

/**
 * Get the default user ID from environment or fallback to 'default'.
 * Used in single-user mode before auth is implemented.
 */
export function getDefaultUserId(): string {
  return process.env.DEFAULT_USER_ID || 'default'
}

/**
 * Ensure the default user exists in the database.
 * Call this before any operation that creates records linked to a user.
 */
export async function ensureDefaultUser(): Promise<void> {
  const userId = getDefaultUserId()
  const email =
    userId === 'default'
      ? 'default@contentos.local'
      : `${userId}@contentos.local`

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email,
      name: 'Default User',
    },
  })
}
