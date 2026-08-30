import { PrismaClient } from '@/generated/prisma'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Lazy Prisma client — only initializes when first accessed.
 * This prevents build-time failures when DATABASE_URL is not set.
 *
 * Standard version: uses PostgreSQL via Prisma's default engine.
 */
function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not configured. Set it in .env.local to use database features.',
    )
  }
  return new PrismaClient()
}

/**
 * Get the Prisma client singleton. Initializes on first call.
 * Throws if DATABASE_URL is not configured.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma

  const client = createPrismaClient()
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }
  return client
}

/**
 * Lazy proxy — defers initialization until a property is accessed.
 * Safe to import in modules that might run at build time.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma()
    const value = client[prop as keyof PrismaClient]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
