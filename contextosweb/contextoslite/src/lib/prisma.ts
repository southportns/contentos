import { PrismaClient } from '@/generated/prisma'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Lazy Prisma client — only initializes when first accessed.
 * This prevents build-time failures when DATABASE_URL is not set.
 *
 * Uses SQLite via better-sqlite3 driver adapter (no external DB server needed).
 */
function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not configured. Set it in .env.local to use database features.',
    )
  }

  // DATABASE_URL format: "file:./dev.db" or absolute path
  const dbPath = process.env.DATABASE_URL.startsWith('file:')
    ? process.env.DATABASE_URL.slice(5)
    : process.env.DATABASE_URL

  const adapter = new PrismaBetterSqlite3({ url: path.resolve(dbPath) })
  return new PrismaClient({ adapter })
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
