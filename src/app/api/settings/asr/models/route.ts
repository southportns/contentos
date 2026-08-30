/**
 * ASR Models API — 拉取阿里云百炼可用 ASR 模型列表
 *
 * POST: 使用 API Key 从百炼 /v1/models 接口拉取模型，
 *       过滤出 ASR 相关模型供用户选择
 *
 * 架构位置: Application Layer (API Route)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── .env.local read ─────────────────────────────────

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

// ─── Static fallback ASR models ───────────────────────

const FALLBACK_ASR_MODELS = [
  'paraformer-v1',
  'qwen-audio-3.0-asr-flash',
  'qwen3-asr-flash-2026-02-10',
  'fun-asr-flash-2026-06-15',
]

// ─── ASR model filter ─────────────────────────────────
// 百炼 /v1/models 返回所有模型，需要过滤出 ASR 相关的

const ASR_KEYWORDS = ['asr', 'speech', 'transcription', 'paraformer', 'fun-asr']

function isAsrModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return ASR_KEYWORDS.some((kw) => lower.includes(kw))
}

// ─── Schema ───────────────────────────────────────────

const schema = z.object({
  apiKey: z.string().optional(),
})

// ─── POST: fetch ASR models from DashScope ────────────

const DASHSCOPE_MODELS_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { apiKey } = schema.parse(body)

    // Get API key from request body or .env.local / process.env
    const envContent = readEnvFile()
    const fileKey = getEnvValue(envContent, 'ALIBABA_ASR_API_KEY')
    const key = apiKey || fileKey || process.env.ALIBABA_ASR_API_KEY || ''

    if (!key) {
      return NextResponse.json({
        success: true,
        data: { models: FALLBACK_ASR_MODELS, source: 'static' as const },
        warning: '未配置 API Key，显示静态模型列表',
      })
    }

    try {
      const res = await fetch(DASHSCOPE_MODELS_URL, {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        return NextResponse.json({
          success: true,
          data: { models: FALLBACK_ASR_MODELS, source: 'static' as const },
          warning: `百炼 API 返回 ${res.status}，使用静态列表`,
        })
      }

      const json = await res.json()

      // OpenAI-compatible: { data: [{ id: "..." }] }
      const allModels: string[] = (json.data || [])
        .map((m: { id?: string }) => m.id)
        .filter(Boolean)

      // Filter ASR-related models
      const asrModels = allModels.filter(isAsrModel)

      if (asrModels.length === 0) {
        return NextResponse.json({
          success: true,
          data: { models: FALLBACK_ASR_MODELS, source: 'static' as const },
          warning: 'API 返回的模型列表中未找到 ASR 模型，使用静态列表',
        })
      }

      return NextResponse.json({
        success: true,
        data: { models: asrModels, source: 'api' as const },
      })
    } catch (fetchError) {
      return NextResponse.json({
        success: true,
        data: { models: FALLBACK_ASR_MODELS, source: 'static' as const },
        warning: `拉取模型失败: ${fetchError instanceof Error ? fetchError.message : 'unknown'}`,
      })
    }
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
