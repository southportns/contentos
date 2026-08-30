import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ModelProvider } from '@/lib/ai/models'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Provider registry ─────────────────────────────────

const ALL_PROVIDERS: ModelProvider[] = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'glm',
  'qwen',
  'hunyuan',
  'moonshot',
  'minimax',
  'doubao',
  'mimo',
]

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  glm: '智谱 GLM',
  qwen: '通义千问',
  hunyuan: '腾讯混元',
  moonshot: 'Kimi (月之暗面)',
  minimax: 'MiniMax',
  doubao: '字节豆包',
  mimo: '小米 MiMo',
}

const PROVIDER_KEY_ENV: Record<ModelProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  glm: 'GLM_API_KEY',
  qwen: 'QWEN_API_KEY',
  hunyuan: 'HUNYUAN_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  doubao: 'DOUBAO_API_KEY',
  mimo: 'MIMO_API_KEY',
}

const PROVIDER_BASE_URLS: Partial<Record<ModelProvider, string>> = {
  deepseek: 'https://api.deepseek.com/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  hunyuan: 'https://api.hunyuan.cloud.tencent.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  minimax: 'https://api.minimax.chat/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  mimo: 'https://api.mimo.xiaomi.com/v1',
}

// ─── .env.local read/write ─────────────────────────────

const ENV_LOCAL_PATH = join(process.cwd(), '.env.local')

function readEnvFile(): string {
  try {
    if (!existsSync(ENV_LOCAL_PATH)) return ''
    return readFileSync(ENV_LOCAL_PATH, 'utf-8')
  } catch {
    return ''
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  // Support: KEY=, KEY=val, KEY="val", KEY="" (empty quoted)
  const match = line.match(/^([A-Z_]+)=(?:"([^"]*)"|([^\s].*|))$/)
  if (!match) return null
  return { key: match[1], value: match[2] ?? match[3] ?? '' }
}

function getEnvValue(envContent: string, key: string): string {
  for (const line of envContent.split('\n')) {
    const parsed = parseEnvLine(line.trim())
    if (parsed && parsed.key === key) {
      return parsed.value
    }
  }
  return ''
}

function setEnvValue(envContent: string, key: string, value: string): string {
  const lines = envContent.split('\n')
  let found = false
  const result = lines.map((line) => {
    const parsed = parseEnvLine(line.trim())
    if (parsed && parsed.key === key) {
      found = true
      return `${key}="${value}"`
    }
    return line
  })
  if (!found) {
    result.push(`${key}="${value}"`)
  }
  return result.join('\n')
}

function maskValue(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '****'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

// ─── GET: return current config (masked) ───────────────

export async function GET() {
  const envContent = readEnvFile()

  const getVal = (key: string): string => {
    const fileVal = getEnvValue(envContent, key)
    return fileVal || process.env[key] || ''
  }

  const provider = (process.env.AI_PROVIDER as ModelProvider) || 'openai'
  const model = process.env.AI_MODEL || ''

  const apiKeys: Record<string, { configured: boolean; masked: string }> = {}

  for (const p of ALL_PROVIDERS) {
    const envKey = PROVIDER_KEY_ENV[p]
    const raw = getVal(envKey)
    apiKeys[p] = {
      configured: !!raw,
      masked: maskValue(raw),
    }
  }

  // Collect base URLs for providers that have them
  const baseUrls: Record<string, string> = {}
  for (const p of ALL_PROVIDERS) {
    const defaultUrl = PROVIDER_BASE_URLS[p]
    if (defaultUrl) {
      const envVarName = `${p.toUpperCase()}_BASE_URL`
      baseUrls[p] = getVal(envVarName) || defaultUrl
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      provider,
      model,
      providers: ALL_PROVIDERS.map((p) => ({
        id: p,
        label: PROVIDER_LABELS[p],
        configured: apiKeys[p].configured,
      })),
      apiKeys,
      baseUrls,
    },
  })
}

// ─── POST: save config to .env.local ───────────────────

const providerEnum = z.enum([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'glm',
  'qwen',
  'hunyuan',
  'moonshot',
  'minimax',
  'doubao',
  'mimo',
])

const saveSchema = z.object({
  provider: providerEnum,
  model: z.string().optional(),
  apiKeys: z.object(
    Object.fromEntries(
      ALL_PROVIDERS.map((p) => [p, z.string().optional()]),
    ) as Record<ModelProvider, z.ZodOptional<z.ZodString>>,
  ).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = saveSchema.parse(body)

    let envContent = readEnvFile()

    // Update AI_PROVIDER
    envContent = setEnvValue(envContent, 'AI_PROVIDER', input.provider)

    // Update AI_MODEL
    if (input.model) {
      envContent = setEnvValue(envContent, 'AI_MODEL', input.model)
    }

    // Update API keys (only if provided and non-empty)
    if (input.apiKeys) {
      for (const p of ALL_PROVIDERS) {
        const envKey = PROVIDER_KEY_ENV[p]
        const value = input.apiKeys[p]
        if (value && value.trim()) {
          envContent = setEnvValue(envContent, envKey, value.trim())
        }
      }
    }

    writeFileSync(ENV_LOCAL_PATH, envContent, 'utf-8')

    // Also update process.env for current runtime
    process.env.AI_PROVIDER = input.provider
    if (input.model) {
      process.env.AI_MODEL = input.model
    }
    if (input.apiKeys) {
      for (const p of ALL_PROVIDERS) {
        const envKey = PROVIDER_KEY_ENV[p]
        const value = input.apiKeys[p]
        if (value && value.trim()) {
          process.env[envKey] = value.trim()
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: '配置已保存到 .env.local，部分功能需要重启服务生效',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 },
      )
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
