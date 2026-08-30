/**
 * Provider Router — ASR Provider 路由
 *
 * 根据用户选择的 Mode（auto / local / cloud）和硬件检测结果，
 * 选择最佳的 ASR Provider 执行转写。
 *
 * 路由策略：
 *  - auto: 检测硬件 → Level A/B/C → Local, Level D → Cloud
 *  - local: 强制使用 Local Provider（Level D 时提示切换 Cloud）
 *  - cloud: 强制使用 Cloud Provider
 *
 * 支持 Failover：当主 Provider 失败时自动切换到备用 Provider。
 *
 * 架构位置: Routing Layer
 */

import type { ASRProvider } from '../domain/asr-provider'
import type {
  TranscriptMode,
  HardwareProfile,
  CapabilityLevel,
  AudioInput,
  ASROptions,
  TranscriptResult,
  ProviderHealth,
} from '../domain/transcript.types'
import {
  getHardwareProfile,
  getCapabilityLevel,
} from './hardware-detector'
import { LocalWhisperProvider } from '../providers/local/local-whisper.provider'
import { CloudAlibabaProvider } from '../providers/cloud/cloud-alibaba.provider'
import { CloudXiaomiProvider } from '../providers/cloud/cloud-xiaomi.provider'
import { getEnvVar } from '@/lib/env/env-loader'

// ─── Provider Registry ──────────────────────────────────

/**
 * Provider 注册表：管理所有可用的 ASR Provider 实例。
 * Provider 按 priority 排序，数字越小优先级越高。
 */
class ProviderRegistry {
  private providers: Map<string, ASRProvider> = new Map()
  private priorities: Map<string, number> = new Map()

  register(provider: ASRProvider, priority: number = 100): void {
    this.providers.set(provider.id, provider)
    this.priorities.set(provider.id, priority)
  }

  get(id: string): ASRProvider | undefined {
    return this.providers.get(id)
  }

  getByMode(mode: 'local' | 'cloud'): ASRProvider[] {
    const list = Array.from(this.providers.values())
      .filter(p => p.mode === mode)
      .sort((a, b) => {
        const pa = this.priorities.get(a.id) ?? 100
        const pb = this.priorities.get(b.id) ?? 100
        return pa - pb
      })
    return list
  }

  getAll(): ASRProvider[] {
    return Array.from(this.providers.values())
  }
}

// ─── Router ─────────────────────────────────────────────

/**
 * 默认 ASR Mode：由环境变量控制
 * 如果配置了云端 API Key，则默认 cloud；否则默认 local
 *
 * 动态从 .env.local 读取，确保 Settings API 保存后立即生效
 */
export function getDefaultMode(): TranscriptMode {
  const cloudProvider = getEnvVar('ASR_CLOUD_PROVIDER') || 'alibaba'
  const alibabaKey = getEnvVar('ALIBABA_ASR_API_KEY')
  const xiaomiKey = getEnvVar('XIAOMI_ASR_API_KEY')
  const hasCloudKey = cloudProvider === 'xiaomi' ? !!xiaomiKey : !!alibabaKey
  if (hasCloudKey) {
    return 'cloud'
  }
  // 回退检查：如果用户没设 ASR_CLOUD_PROVIDER 但任一 key 存在
  if (alibabaKey || xiaomiKey) {
    return 'cloud'
  }
  return 'local'
}

/**
 * Auto Mode 决策：根据硬件能力选择 Provider
 */
export function selectProviderForAuto(
  hw: HardwareProfile,
  level: CapabilityLevel,
  registry: ProviderRegistry,
): ASRProvider {
  // Level A/B/C: 使用 Local
  // Level D: 使用 Cloud
  if (level === 'D') {
    const cloud = registry.getByMode('cloud')[0]
    if (cloud) return cloud
  }

  const local = registry.getByMode('local')[0]
  if (local) return local

  // 回退到 Cloud
  const cloud = registry.getByMode('cloud')[0]
  if (cloud) return cloud

  throw new Error('No ASR provider available')
}

/**
 * 创建默认 Provider Registry
 *
 * 动态从 .env.local 读取 API Key 和 ASR_CLOUD_PROVIDER，
 * 只注册用户选择的单一云 Provider，确保 Settings API 保存后立即生效
 */
function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry()

  // Local providers (always available)
  const localProvider = new LocalWhisperProvider()
  registry.register(localProvider, 100)

  // Cloud — 只注册用户选择的单一 Provider
  const cloudProvider = getEnvVar('ASR_CLOUD_PROVIDER') || 'alibaba'

  if (cloudProvider === 'xiaomi') {
    const xiaomiKey = getEnvVar('XIAOMI_ASR_API_KEY')
    if (xiaomiKey) {
      const xiaomiProvider = new CloudXiaomiProvider()
      registry.register(xiaomiProvider, 50)
      console.log('[provider-router] Registered CloudXiaomiProvider (ASR_CLOUD_PROVIDER=xiaomi)')
    } else {
      console.warn('[provider-router] ASR_CLOUD_PROVIDER=xiaomi but XIAOMI_ASR_API_KEY not set')
    }
  } else {
    // default: alibaba
    const alibabaKey = getEnvVar('ALIBABA_ASR_API_KEY')
    if (alibabaKey) {
      const alibabaProvider = new CloudAlibabaProvider()
      registry.register(alibabaProvider, 50)
      console.log('[provider-router] Registered CloudAlibabaProvider (ASR_CLOUD_PROVIDER=alibaba)')
    } else {
      console.warn('[provider-router] ASR_CLOUD_PROVIDER=alibaba but ALIBABA_ASR_API_KEY not set')
    }
  }

  // 回退检查：如果选定的 Provider 没配置 key，检查另一个
  if (registry.getByMode('cloud').length === 0) {
    const alibabaKey = getEnvVar('ALIBABA_ASR_API_KEY')
    const xiaomiKey = getEnvVar('XIAOMI_ASR_API_KEY')
    if (alibabaKey) {
      const alibabaProvider = new CloudAlibabaProvider()
      registry.register(alibabaProvider, 50)
      console.log('[provider-router] Fallback: Registered CloudAlibabaProvider')
    } else if (xiaomiKey) {
      const xiaomiProvider = new CloudXiaomiProvider()
      registry.register(xiaomiProvider, 50)
      console.log('[provider-router] Fallback: Registered CloudXiaomiProvider')
    } else {
      console.warn('[provider-router] No cloud ASR API keys found in .env.local — only local provider registered')
    }
  }

  return registry
}

// ─── ASR Router ─────────────────────────────────────────

export interface RouterResult {
  provider: ASRProvider
  result: TranscriptResult
}

/**
 * 执行 ASR 路由：
 *  1. 根据 mode 选择 Provider
 *  2. 调用 Provider.transcribe()
 *  3. 失败时尝试 Failover 到备用 Provider
 *
 * @param audio 音频输入
 * @param mode 模式（auto/local/cloud）
 * @param options ASR 选项
 * @param providerPreference 指定 Provider ID（可选）
 */
export async function routeASR(
  audio: AudioInput,
  mode: TranscriptMode,
  options?: ASROptions,
  providerPreference?: string,
): Promise<RouterResult> {
  const registry = createDefaultRegistry()

  console.log(`[provider-router] routeASR: mode=${mode}, providers=${registry.getAll().map(p => p.id).join(', ')}`)

  // 如果用户指定了 Provider，直接使用
  if (providerPreference) {
    const provider = registry.get(providerPreference)
    if (provider) {
      console.log(`[provider-router] Using specified provider: ${provider.id}`)
      const result = await provider.transcribe(audio, options)
      return { provider, result }
    }
    throw new Error(`Provider "${providerPreference}" not found in registry`)
  }

  // 选择主 Provider
  let primaryProvider: ASRProvider

  if (mode === 'auto') {
    const hw = await getHardwareProfile()
    const level = getCapabilityLevel(hw)
    primaryProvider = selectProviderForAuto(hw, level, registry)
    console.log(`[provider-router] auto mode → hardware level=${level}, selected=${primaryProvider.id}`)
  } else if (mode === 'local') {
    const local = registry.getByMode('local')[0]
    if (!local) {
      throw new Error(
        'No local ASR provider available. Please configure cloud mode.',
      )
    }
    primaryProvider = local
    console.log(`[provider-router] local mode → selected=${primaryProvider.id}`)
  } else {
    // cloud
    const cloud = registry.getByMode('cloud')[0]
    if (!cloud) {
      throw new Error(
        'No cloud ASR provider available. Please set ASR_CLOUD_PROVIDER and the corresponding API Key.',
      )
    }
    primaryProvider = cloud
    console.log(`[provider-router] cloud mode → selected=${primaryProvider.id}`)
  }

  // 尝试主 Provider
  try {
    console.log(`[provider-router] Calling primary provider: ${primaryProvider.id}`)
    const result = await primaryProvider.transcribe(audio, options)
    console.log(`[provider-router] Primary provider ${primaryProvider.id} succeeded`)
    return { provider: primaryProvider, result }
  } catch (primaryError) {
    console.error(
      `[provider-router] Primary provider ${primaryProvider.id} FAILED:`,
      primaryError instanceof Error ? primaryError.message : String(primaryError),
    )

    // Failover: 如果主 Provider 失败，尝试备用 Provider
    const fallbackProviders = registry
      .getAll()
      .filter(p => p.id !== primaryProvider.id)

    console.log(`[provider-router] Failover candidates: ${fallbackProviders.map(p => p.id).join(', ')}`)

    for (const fallback of fallbackProviders) {
      try {
        console.log(`[provider-router] Trying fallback: ${fallback.id}`)
        const result = await fallback.transcribe(audio, options)
        console.log(`[provider-router] Fallback ${fallback.id} succeeded`)
        return { provider: fallback, result }
      } catch (fallbackError) {
        console.error(
          `[provider-router] Fallback ${fallback.id} FAILED:`,
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        )
        // 继续尝试下一个
      }
    }

    // 所有 Provider 都失败了
    throw new Error(
      `All ASR providers failed. Primary error: ${
        primaryError instanceof Error ? primaryError.message : String(primaryError)
      }`,
    )
  }
}

/**
 * 获取所有可用 Provider 的健康状态
 */
export async function checkAllProvidersHealth(): Promise<
  Array<{ provider: ASRProvider; health: ProviderHealth }>
> {
  const registry = createDefaultRegistry()
  const results: Array<{ provider: ASRProvider; health: ProviderHealth }> = []

  for (const provider of registry.getAll()) {
    const health = await provider.healthCheck()
    results.push({ provider, health })
  }

  return results
}
