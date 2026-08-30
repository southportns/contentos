import { config } from 'dotenv'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

// Load .env.local first (Next.js convention), then fall back to .env
config({ path: '.env.local' })
config({ path: '.env' })

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
})
