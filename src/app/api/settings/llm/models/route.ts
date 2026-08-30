import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Provider model list endpoints ─────────────────────
// All providers here use OpenAI-compatible /v1/models endpoint

const PROVIDER_ENDPOINTS: Record<string, { url: string; headerName: string }> = {
  openai: { url: 'https://api.openai.com/v1/models', headerName: 'Authorization' },
  deepseek: { url: 'https://api.deepseek.com/v1/models', headerName: 'Authorization' },
  glm: { url: 'https://open.bigmodel.cn/api/paas/v4/models', headerName: 'Authorization' },
  anthropic: { url: 'https://api.anthropic.com/v1/models', headerName: 'x-api-key' },
  google: { url: '', headerName: '' }, // Google doesn't have a public models list endpoint
  qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models', headerName: 'Authorization' },
  hunyuan: { url: 'https://api.hunyuan.cloud.tencent.com/v1/models', headerName: 'Authorization' },
  moonshot: { url: 'https://api.moonshot.cn/v1/models', headerName: 'Authorization' },
  minimax: { url: 'https://api.minimax.chat/v1/models', headerName: 'Authorization' },
  doubao: { url: 'https://ark.cn-beijing.volces.com/api/v3/models', headerName: 'Authorization' },
  mimo: { url: 'https://api.mimo.xiaomi.com/v1/models', headerName: 'Authorization' },
}

// ─── Env key map ───────────────────────────────────────

const ENV_KEY_MAP: Record<string, string> = {
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

// ─── Static fallback models ────────────────────────────

const FALLBACK_MODELS: Record<string, string[]> = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1-preview',
    'o1-mini',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  google: [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-2.0-flash-exp',
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  glm: [
    'glm-4-plus',
    'glm-4',
    'glm-4-flash',
    'glm-4-long',
    'glm-4v-plus',
  ],
  qwen: [
    'qwen-max',
    'qwen-plus',
    'qwen-turbo',
    'qwen-long',
    'qwen-vl-max',
    'qwen-coder-plus',
  ],
  hunyuan: [
    'hunyuan-turbvlatest',
    'hunyuan-standard',
    'hunyuan-lite',
    'hunyuan-vision',
  ],
  moonshot: [
    'moonshot-v1-8k',
    'moonshot-v1-32k',
    'moonshot-v1-128k',
    'moonshot-v1-auto',
  ],
  minimax: [
    'abab6.5s-chat',
    'abab6.5-chat',
    'abab5.5-chat',
    'abab5.5s-chat',
  ],
  doubao: [
    'doubao-pro-32k',
    'doubao-pro-4k',
    'doubao-lite-32k',
    'doubao-lite-4k',
    'doubao-1k-pro',
  ],
  mimo: [
    'mimo-7b',
    'mimo-7b-rl',
  ],
}

// ─── Schema ─────────────────────────────────────────────

const schema = z.object({
  provider: z.enum([
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
  ]),
  apiKey: z.string().optional(),
})

// ─── POST: fetch models from provider ───────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { provider, apiKey } = schema.parse(body)

    // For Google, always return static list
    if (provider === 'google' || !PROVIDER_ENDPOINTS[provider]?.url) {
      return NextResponse.json({
        success: true,
        data: { models: FALLBACK_MODELS[provider] || [], source: 'static' },
      })
    }

    // Get API key from request body or process.env
    const key = apiKey || process.env[ENV_KEY_MAP[provider]] || ''

    if (!key) {
      return NextResponse.json({
        success: true,
        data: { models: FALLBACK_MODELS[provider] || [], source: 'static' },
      })
    }

    const endpoint = PROVIDER_ENDPOINTS[provider]
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (provider === 'anthropic') {
      headers['x-api-key'] = key
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers[endpoint.headerName] = `Bearer ${key}`
    }

    try {
      const res = await fetch(endpoint.url, { headers, signal: AbortSignal.timeout(10000) })

      if (!res.ok) {
        return NextResponse.json({
          success: true,
          data: { models: FALLBACK_MODELS[provider] || [], source: 'static' },
          warning: `Provider API returned ${res.status}, using static list`,
        })
      }

      const json = await res.json()

      // Extract model IDs — all OpenAI-compatible providers use { data: [{ id: "..." }] }
      let models: string[] = []

      if (provider === 'anthropic') {
        models = (json.data || [])
          .map((m: { id?: string }) => m.id)
          .filter(Boolean) as string[]
      } else if (provider === 'glm') {
        // GLM may nest differently
        models = (json.data || json?.data?.list || [])
          .map((m: { id?: string; model?: string }) => m.id || m.model)
          .filter(Boolean) as string[]
      } else {
        // OpenAI-compatible: { data: [{ id: "..." }] }
        models = (json.data || [])
          .map((m: { id?: string }) => m.id)
          .filter(Boolean) as string[]
      }

      if (models.length === 0) {
        models = FALLBACK_MODELS[provider] || []
        return NextResponse.json({
          success: true,
          data: { models, source: 'static' },
          warning: 'API returned empty list, using static fallback',
        })
      }

      return NextResponse.json({
        success: true,
        data: { models, source: 'api' },
      })
    } catch (fetchError) {
      return NextResponse.json({
        success: true,
        data: { models: FALLBACK_MODELS[provider] || [], source: 'static' },
        warning: `Failed to fetch from API: ${fetchError instanceof Error ? fetchError.message : 'unknown'}`,
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
