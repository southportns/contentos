import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'glm'

export interface AIModel {
  id: string
  provider: ModelProvider
  name: string
}

const defaultProvider: ModelProvider =
  (process.env.AI_PROVIDER as ModelProvider) || 'openai'

function getProvider(provider?: ModelProvider) {
  const p = provider || defaultProvider

  switch (p) {
    case 'openai': {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set')
      }
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    case 'anthropic': {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set')
      }
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    }
    case 'google': {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set')
      }
      return createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      })
    }
    case 'deepseek': {
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is not set')
      }
      return createOpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
      })
    }
    case 'glm': {
      if (!process.env.GLM_API_KEY) {
        throw new Error('GLM_API_KEY is not set')
      }
      return createOpenAI({
        apiKey: process.env.GLM_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      })
    }
    default:
      throw new Error(`Unknown provider: ${p}`)
  }
}

export function getModel(provider?: ModelProvider, modelName?: string) {
  const ai = getProvider(provider)
  const p = provider || defaultProvider
  const model = modelName || process.env.AI_MODEL || getDefaultModel(p)

  return ai(model)
}

function getDefaultModel(provider: ModelProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o'
    case 'anthropic':
      return 'claude-sonnet-4-20250514'
    case 'google':
      return 'gemini-2.0-flash'
    case 'deepseek':
      return 'deepseek-chat'
    case 'glm':
      return 'glm-4'
    default:
      return 'gpt-4o'
  }
}

export const availableProviders: AIModel[] = [
  { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o' },
  { id: 'claude-sonnet-4-20250514', provider: 'anthropic', name: 'Claude Sonnet 4' },
  { id: 'gemini-2.0-flash', provider: 'google', name: 'Gemini 2.0 Flash' },
  { id: 'deepseek-chat', provider: 'deepseek', name: 'DeepSeek Chat' },
  { id: 'glm-4', provider: 'glm', name: 'GLM-4' },
]
