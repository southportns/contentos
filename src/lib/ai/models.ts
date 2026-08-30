import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'glm'
  | 'qwen'
  | 'hunyuan'
  | 'moonshot'
  | 'minimax'
  | 'doubao'
  | 'mimo'

export interface AIModel {
  id: string
  provider: ModelProvider
  name: string
}

// ─── Provider config table ─────────────────────────────
// All Chinese providers below use OpenAI-compatible APIs via createOpenAI.

interface ProviderConfig {
  envKey: string
  baseURL: string
  defaultModel: string
}

const PROVIDER_CONFIG: Record<ModelProvider, ProviderConfig | null> = {
  openai: {
    envKey: 'OPENAI_API_KEY',
    baseURL: '', // default
    defaultModel: 'gpt-4o',
  },
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    baseURL: '', // uses createAnthropic, not createOpenAI
    defaultModel: 'claude-sonnet-4-20250514',
  },
  google: {
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    baseURL: '', // uses createGoogleGenerativeAI
    defaultModel: 'gemini-2.0-flash',
  },
  deepseek: {
    envKey: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  glm: {
    envKey: 'GLM_API_KEY',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4',
  },
  qwen: {
    envKey: 'QWEN_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
  },
  hunyuan: {
    envKey: 'HUNYUAN_API_KEY',
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    defaultModel: 'hunyuan-turbvlatest',
  },
  moonshot: {
    envKey: 'MOONSHOT_API_KEY',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-128k',
  },
  minimax: {
    envKey: 'MINIMAX_API_KEY',
    baseURL: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
  },
  doubao: {
    envKey: 'DOUBAO_API_KEY',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-32k',
  },
  mimo: {
    envKey: 'MIMO_API_KEY',
    baseURL: 'https://api.mimo.xiaomi.com/v1',
    defaultModel: 'mimo-7b',
  },
}

function getDefaultProvider(): ModelProvider {
  return (process.env.AI_PROVIDER as ModelProvider) || 'openai'
}

function getProvider(provider?: ModelProvider) {
  const p = provider || getDefaultProvider()
  const cfg = PROVIDER_CONFIG[p]

  if (!cfg) {
    throw new Error(`Unknown provider: ${p}`)
  }

  const apiKey = process.env[cfg.envKey]
  if (!apiKey) {
    throw new Error(`${cfg.envKey} is not set`)
  }

  // Special cases: non-OpenAI SDK providers
  switch (p) {
    case 'anthropic':
      return createAnthropic({ apiKey })
    case 'google':
      return createGoogleGenerativeAI({ apiKey })
    default:
      // All other providers use OpenAI-compatible API
      return createOpenAI({
        apiKey,
        baseURL: process.env[`${p.toUpperCase()}_BASE_URL`] || cfg.baseURL,
      })
  }
}

export function getModel(provider?: ModelProvider, modelName?: string) {
  const ai = getProvider(provider)
  const p = provider || getDefaultProvider()
  const cfg = PROVIDER_CONFIG[p]
  const model = modelName || process.env.AI_MODEL || cfg?.defaultModel || 'gpt-4o'

  return ai(model)
}

export const availableProviders: AIModel[] = [
  { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o' },
  { id: 'claude-sonnet-4-20250514', provider: 'anthropic', name: 'Claude Sonnet 4' },
  { id: 'gemini-2.0-flash', provider: 'google', name: 'Gemini 2.0 Flash' },
  { id: 'deepseek-chat', provider: 'deepseek', name: 'DeepSeek Chat' },
  { id: 'glm-4', provider: 'glm', name: 'GLM-4' },
  { id: 'qwen-plus', provider: 'qwen', name: '通义千问' },
  { id: 'hunyuan-turbvlatest', provider: 'hunyuan', name: '腾讯混元' },
  { id: 'moonshot-v1-128k', provider: 'moonshot', name: 'Kimi' },
  { id: 'abab6.5s-chat', provider: 'minimax', name: 'MiniMax' },
  { id: 'doubao-pro-32k', provider: 'doubao', name: '豆包' },
  { id: 'mimo-7b', provider: 'mimo', name: '小米 MiMo' },
]
