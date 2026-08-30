/**
 * ASR Settings API — 口播稿识别配置
 *
 * GET: 读取当前 ASR 配置（模式、Provider、API Key 掩位）
 * POST: 保存 ASR 配置到 .env.local
 *
 * 架构位置: Application Layer (API Route)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

// ─── ASR env keys ──────────────────────────────────────

const ASR_ENV_KEYS = {
  mode: 'ASR_MODE',
  // Local
  whisperModel: 'WHISPER_MODEL',
  whisperDevice: 'WHISPER_DEVICE',
  whisperBeamSize: 'WHISPER_BEAM_SIZE',
  whisperComputeType: 'WHISPER_COMPUTE_TYPE',
  // Cloud provider selection
  cloudProvider: 'ASR_CLOUD_PROVIDER',
  // Cloud — Alibaba
  alibabaApiKey: 'ALIBABA_ASR_API_KEY',
  alibabaModel: 'ALIBABA_ASR_MODEL',
  alibabaBaseUrl: 'ALIBABA_ASR_BASE_URL',
  // Cloud — Xiaomi (MiMo)
  xiaomiApiKey: 'XIAOMI_ASR_API_KEY',
  xiaomiModel: 'XIAOMI_ASR_MODEL',
  xiaomiBaseUrl: 'XIAOMI_ASR_BASE_URL',
} as const

// ─── GET ───────────────────────────────────────────────

export async function GET() {
  const envContent = readEnvFile()

  const getVal = (key: string): string => {
    const fileVal = getEnvValue(envContent, key)
    return fileVal || process.env[key] || ''
  }

  const alibabaKey = getVal(ASR_ENV_KEYS.alibabaApiKey)
  const xiaomiKey = getVal(ASR_ENV_KEYS.xiaomiApiKey)

  // Determine cloud provider: explicit setting > first available key > default alibaba
  const cloudProviderRaw = getVal(ASR_ENV_KEYS.cloudProvider) || ''
  let cloudProvider: 'alibaba' | 'xiaomi' = 'alibaba'
  if (cloudProviderRaw === 'xiaomi' || (cloudProviderRaw === '' && !alibabaKey && xiaomiKey)) {
    cloudProvider = 'xiaomi'
  }

  // Get config for the selected provider
  const isAlibaba = cloudProvider === 'alibaba'
  const cloudApiKey = isAlibaba ? alibabaKey : xiaomiKey
  const cloudModel = isAlibaba
    ? getVal(ASR_ENV_KEYS.alibabaModel) || 'paraformer-v1'
    : getVal(ASR_ENV_KEYS.xiaomiModel) || 'mimo-v2.5-asr'
  const cloudBaseUrl = isAlibaba
    ? getVal(ASR_ENV_KEYS.alibabaBaseUrl) || 'https://dashscope.aliyuncs.com/api/v1'
    : getVal(ASR_ENV_KEYS.xiaomiBaseUrl) || 'https://api.xiaomimimo.com/v1'

  // Current version only supports cloud mode
  const defaultMode = 'cloud'

  return NextResponse.json({
    success: true,
    data: {
      mode: defaultMode,
      // Local config
      local: {
        whisperModel: getVal(ASR_ENV_KEYS.whisperModel) || 'small',
        whisperDevice: getVal(ASR_ENV_KEYS.whisperDevice) || 'cpu',
        whisperBeamSize: getVal(ASR_ENV_KEYS.whisperBeamSize) || '5',
        whisperComputeType: getVal(ASR_ENV_KEYS.whisperComputeType) || '',
      },
      // Cloud config — single selected provider
      cloud: {
        provider: cloudProvider,
        configured: !!cloudApiKey,
        masked: maskValue(cloudApiKey),
        model: cloudModel,
        baseUrl: cloudBaseUrl,
      },
    },
  })
}

// ─── POST ──────────────────────────────────────────────

const saveSchema = z.object({
  mode: z.enum(['auto', 'local', 'cloud']).optional(),
  // Local
  whisperModel: z.string().optional(),
  whisperDevice: z.string().optional(),
  whisperBeamSize: z.string().optional(),
  whisperComputeType: z.string().optional(),
  // Cloud — single provider
  cloudProvider: z.enum(['alibaba', 'xiaomi']).optional(),
  cloudApiKey: z.string().optional(),
  cloudModel: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = saveSchema.parse(body)

    let envContent = readEnvFile()

    // Helper: only set if value is non-empty
    const setIf = (key: string, value: string | undefined) => {
      if (value !== undefined && value.trim()) {
        envContent = setEnvValue(envContent, key, value.trim())
      }
    }

    // Mode
    setIf(ASR_ENV_KEYS.mode, input.mode)
    // Local
    setIf(ASR_ENV_KEYS.whisperModel, input.whisperModel)
    setIf(ASR_ENV_KEYS.whisperDevice, input.whisperDevice)
    setIf(ASR_ENV_KEYS.whisperBeamSize, input.whisperBeamSize)
    setIf(ASR_ENV_KEYS.whisperComputeType, input.whisperComputeType)
    // Cloud — single provider selection
    setIf(ASR_ENV_KEYS.cloudProvider, input.cloudProvider)
    // Cloud — write API key & model to the correct env var based on selected provider
    if (input.cloudProvider === 'xiaomi') {
      setIf(ASR_ENV_KEYS.xiaomiApiKey, input.cloudApiKey)
      setIf(ASR_ENV_KEYS.xiaomiModel, input.cloudModel)
    } else {
      // default: alibaba
      setIf(ASR_ENV_KEYS.alibabaApiKey, input.cloudApiKey)
      setIf(ASR_ENV_KEYS.alibabaModel, input.cloudModel)
    }

    writeFileSync(ENV_LOCAL_PATH, envContent, 'utf-8')

    // Update process.env for current runtime
    const setProcessEnv = (key: string, value: string | undefined) => {
      if (value !== undefined && value.trim()) {
        process.env[key] = value.trim()
      }
    }
    setProcessEnv(ASR_ENV_KEYS.mode, input.mode)
    setProcessEnv(ASR_ENV_KEYS.whisperModel, input.whisperModel)
    setProcessEnv(ASR_ENV_KEYS.whisperDevice, input.whisperDevice)
    setProcessEnv(ASR_ENV_KEYS.whisperBeamSize, input.whisperBeamSize)
    setProcessEnv(ASR_ENV_KEYS.whisperComputeType, input.whisperComputeType)
    setProcessEnv(ASR_ENV_KEYS.cloudProvider, input.cloudProvider)
    // Cloud — write to correct env var
    if (input.cloudProvider === 'xiaomi') {
      setProcessEnv(ASR_ENV_KEYS.xiaomiApiKey, input.cloudApiKey)
      setProcessEnv(ASR_ENV_KEYS.xiaomiModel, input.cloudModel)
    } else {
      setProcessEnv(ASR_ENV_KEYS.alibabaApiKey, input.cloudApiKey)
      setProcessEnv(ASR_ENV_KEYS.alibabaModel, input.cloudModel)
    }

    return NextResponse.json({
      success: true,
      message: 'ASR 配置已保存到 .env.local，下次请求时生效',
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
