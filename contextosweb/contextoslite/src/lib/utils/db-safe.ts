/**
 * Check if database is configured and available.
 * Returns false if DATABASE_URL is not set or connection fails.
 */
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL
}

/**
 * Safely execute a database operation.
 * Returns null if database is not configured or operation fails.
 * Logs errors but does not throw — used for optional persistence.
 */
export async function safeDb<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<T | null> {
  if (!isDatabaseConfigured()) return null

  try {
    return await operation()
  } catch (error) {
    console.error(`[DB] ${context} failed:`, error)
    return null
  }
}
