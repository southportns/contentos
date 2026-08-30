import { NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckCategory = 'ai' | 'tool' | 'database'
type CheckLevel = 'required' | 'optional'

interface EnvCheck {
  key: string
  label: string
  category: CheckCategory
  level: CheckLevel
  /** Only meaningful for AI keys — indicates whether this is the currently active provider */
  isActiveProvider: boolean
  configured: boolean
  maskedValue: string | null
}

interface DebugEnvResult {
  timestamp: string
  nodeEnv: string
  aiProvider: string
  aiModel: string
  appUrl: string
  envChecks: EnvCheck[]
  database: {
    configured: boolean
    connected: boolean
    error?: string
  }
  overallStatus: 'ok' | 'warning' | 'error'
  summary: {
    total: number
    configured: number
    missing: number
    requiredMissing: number
  }
}

function maskValue(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '****'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export async function GET() {
  const currentProvider = process.env.AI_PROVIDER || 'openai'

  const allAiKeys = [
    { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', provider: 'openai' },
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', provider: 'anthropic' },
    { key: 'GOOGLE_GENERATIVE_AI_API_KEY', label: 'Google AI API Key', provider: 'google' },
    { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', provider: 'deepseek' },
    { key: 'GLM_API_KEY', label: 'GLM API Key', provider: 'glm' },
  ]

  const hasAnyAiKey = allAiKeys.some(({ key }) => !!process.env[key])

  const envChecks: EnvCheck[] = allAiKeys.map(({ key, label, provider }) => {
    const isActiveProvider = currentProvider === provider
    const raw = process.env[key]
    // 已配置的 AI Key 标为 required，未配置的标为 optional
    const level: CheckLevel = raw ? 'required' : 'optional'
    return {
      key,
      label,
      category: 'ai' as const,
      level,
      isActiveProvider,
      configured: !!raw,
      maskedValue: raw ? maskValue(raw) : null,
    }
  })

  // Web search tools (DuckDuckGo + Jina Reader — no API key needed)
  // In Lite edition, web search is always available without configuration
  envChecks.push({
    key: 'WEB_SEARCH',
    label: 'Web Search (DuckDuckGo + Jina Reader)',
    category: 'tool',
    level: 'required',
    isActiveProvider: false,
    configured: true,
    maskedValue: 'built-in (no key needed)',
  })

  // Database
  const dbRaw = process.env.DATABASE_URL
  envChecks.push({
    key: 'DATABASE_URL',
    label: 'Database URL',
    category: 'database',
    level: 'required',
    isActiveProvider: false,
    configured: !!dbRaw,
    maskedValue: dbRaw ? maskValue(dbRaw) : null,
  })

  // Check database connection
  let dbConnected = false
  let dbError: string | undefined

  if (isDatabaseConfigured()) {
    try {
      const { prisma } = await import('@/lib/prisma')
      await prisma.$queryRaw`SELECT 1`
      dbConnected = true
    } catch (err) {
      dbError = err instanceof Error ? err.message : 'Unknown database error'
    }
  }

  const configuredCount = envChecks.filter((e) => e.configured).length
  const missingCount = envChecks.length - configuredCount

  // 新判定逻辑：只需满足以下三个条件即认为环境配置通过
  //   1. 至少配置了一个大模型 API Key
  //   2. Firecrawl API Key 已配置
  //   3. 数据库已连接
  // Web search is always available in Lite edition (DuckDuckGo + Jina Reader)
  const requiredMissing = [hasAnyAiKey, dbConnected].filter(
    (v) => !v
  ).length

  let overallStatus: 'ok' | 'warning' | 'error' = 'ok'
  if (!hasAnyAiKey || !dbConnected) {
    overallStatus = 'error'
  }

  const result: DebugEnvResult = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'unknown',
    aiProvider: currentProvider,
    aiModel: process.env.AI_MODEL || 'default',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'not set',
    envChecks,
    database: {
      configured: isDatabaseConfigured(),
      connected: dbConnected,
      error: dbError,
    },
    overallStatus,
    summary: {
      total: envChecks.length,
      configured: configuredCount,
      missing: missingCount,
      requiredMissing,
    },
  }

  return NextResponse.json(result)
}
