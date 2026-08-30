import { NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckCategory = 'ai' | 'tool' | 'database' | 'asr'
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

  // ─── ASR (口播稿识别) ────────────────────────────
  const asrMode = process.env.ASR_MODE || 'auto'
  const cloudProvider = process.env.ASR_CLOUD_PROVIDER || 'alibaba'
  const alibabaKey = process.env.ALIBABA_ASR_API_KEY || ''
  const xiaomiKey = process.env.XIAOMI_ASR_API_KEY || ''
  const hasCloudKey = !!(alibabaKey || xiaomiKey)
  const hasLocalDeps = !!(process.env.DOUYIN_INGEST_BIN || 'douyin-ingest')

  // 当模式为 cloud 但未配置云端 Key 时标为 required
  const cloudKeyLevel: CheckLevel = asrMode === 'cloud' && !hasCloudKey ? 'required' : 'optional'
  // 当模式为 local 但缺少 douyin-ingest 时标为 required
  const localDepsLevel: CheckLevel = asrMode === 'local' && !hasLocalDeps ? 'required' : 'optional'

  envChecks.push({
    key: 'ASR_MODE',
    label: 'ASR 模式',
    category: 'asr',
    level: 'optional',
    isActiveProvider: false,
    configured: true,
    maskedValue: asrMode,
  })
  envChecks.push({
    key: 'ASR_CLOUD_PROVIDER',
    label: '云端 ASR 服务商',
    category: 'asr',
    level: 'optional',
    isActiveProvider: asrMode === 'cloud' || asrMode === 'auto',
    configured: true,
    maskedValue: cloudProvider,
  })
  envChecks.push({
    key: 'ALIBABA_ASR_API_KEY',
    label: '阿里云百炼 ASR Key',
    category: 'asr',
    level: cloudProvider === 'alibaba' ? cloudKeyLevel : 'optional',
    isActiveProvider: cloudProvider === 'alibaba' && (asrMode === 'cloud' || (asrMode === 'auto' && !hasCloudKey)),
    configured: !!alibabaKey,
    maskedValue: alibabaKey ? maskValue(alibabaKey) : null,
  })
  envChecks.push({
    key: 'ALIBABA_ASR_MODEL',
    label: '阿里云 ASR 模型',
    category: 'asr',
    level: 'optional',
    isActiveProvider: false,
    configured: !!process.env.ALIBABA_ASR_MODEL,
    maskedValue: process.env.ALIBABA_ASR_MODEL || 'fun-asr (default)',
  })
  envChecks.push({
    key: 'XIAOMI_ASR_API_KEY',
    label: '小米 MiMo ASR Key',
    category: 'asr',
    level: cloudProvider === 'xiaomi' ? cloudKeyLevel : 'optional',
    isActiveProvider: cloudProvider === 'xiaomi' && (asrMode === 'cloud' || (asrMode === 'auto' && !hasCloudKey)),
    configured: !!xiaomiKey,
    maskedValue: xiaomiKey ? maskValue(xiaomiKey) : null,
  })
  envChecks.push({
    key: 'DOUYIN_INGEST_BIN',
    label: 'douyin-ingest CLI (本地 ASR 依赖)',
    category: 'asr',
    level: localDepsLevel,
    isActiveProvider: asrMode === 'local',
    configured: hasLocalDeps,
    maskedValue: process.env.DOUYIN_INGEST_BIN || 'douyin-ingest (in PATH)',
  })
  envChecks.push({
    key: 'WHISPER_MODEL',
    label: 'Whisper 模型 (本地)',
    category: 'asr',
    level: 'optional',
    isActiveProvider: asrMode === 'local',
    configured: !!process.env.WHISPER_MODEL,
    maskedValue: process.env.WHISPER_MODEL || 'medium (default)',
  })
  envChecks.push({
    key: 'WHISPER_DEVICE',
    label: 'Whisper 计算设备',
    category: 'asr',
    level: 'optional',
    isActiveProvider: asrMode === 'local',
    configured: !!process.env.WHISPER_DEVICE,
    maskedValue: process.env.WHISPER_DEVICE || 'cpu (default)',
  })
  envChecks.push({
    key: 'WHISPER_BEAM_SIZE',
    label: 'Whisper Beam Size',
    category: 'asr',
    level: 'optional',
    isActiveProvider: false,
    configured: !!process.env.WHISPER_BEAM_SIZE,
    maskedValue: process.env.WHISPER_BEAM_SIZE || '5 (default)',
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

  // 新判定逻辑：只需满足以下条件即认为环境配置通过
  //   1. 至少配置了一个大模型 API Key
  //   2. 数据库已连接
  //   3. ASR: 如果模式为 cloud，必须有云端 Key；如果模式为 local，必须有 douyin-ingest
  // Web search is always available in Lite edition (DuckDuckGo + Jina Reader)
  const asrReady =
    asrMode === 'auto' ||
    (asrMode === 'cloud' && hasCloudKey) ||
    (asrMode === 'local' && hasLocalDeps)

  const requiredMissing = [hasAnyAiKey, dbConnected, asrReady].filter(
    (v) => !v
  ).length

  let overallStatus: 'ok' | 'warning' | 'error' = 'ok'
  if (!hasAnyAiKey || !dbConnected || !asrReady) {
    overallStatus = !hasAnyAiKey || !dbConnected ? 'error' : 'warning'
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
