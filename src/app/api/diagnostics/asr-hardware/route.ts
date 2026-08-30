/**
 * ASR Hardware Detection API — 硬件检测
 *
 * 检测本机 GPU/VRAM/CUDA 能力，确定 ASR Provider 健康状态。
 * 用于 Diagnostics 页面展示硬件能力评估和 Provider 可用性。
 *
 * 架构位置: Application Layer (API Route)
 */

import { NextResponse } from 'next/server'
import { detectHardware, getCapabilityLevel } from '@/modules/transcript/routing/hardware-detector'
import { checkAllProvidersHealth } from '@/modules/transcript/routing/provider-router'
import { getDefaultMode } from '@/modules/transcript/routing/provider-router'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Types ─────────────────────────────────────────────

interface HardwareCheckResult {
  timestamp: string
  hardware: {
    os: string
    cpu: string
    ramGB: number
    gpu?: string
    vramGB?: number
    cudaAvailable: boolean
    cudaVersion?: string
  }
  capabilityLevel: 'A' | 'B' | 'C' | 'D'
  levelDescription: string
  recommendedMode: 'local' | 'cloud'
  defaultMode: 'auto' | 'local' | 'cloud'
  asrMode: string
  providers: Array<{
    id: string
    mode: 'local' | 'cloud'
    displayName: string
    healthy: boolean
    message?: string
    latencyMs?: number
  }>
}

const LEVEL_DESCRIPTIONS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '高性能 GPU — 可运行双模型并行识别（Fun-ASR + GLM-ASR）',
  B: '中等 GPU — 可运行单模型识别（Fun-ASR）',
  C: '低配置设备 — CPU 推理可用但较慢，建议使用云端',
  D: '不适合本地推理 — 请使用云端 ASR',
}

export async function GET() {
  try {
    const hardware = await detectHardware()
    const level = getCapabilityLevel(hardware)
    const providerHealth = await checkAllProvidersHealth()
    const defaultMode = getDefaultMode()
    const asrMode = process.env.ASR_MODE || 'auto'

    const recommendedMode: 'local' | 'cloud' =
      level === 'D' ? 'cloud' : 'local'

    const result: HardwareCheckResult = {
      timestamp: new Date().toISOString(),
      hardware,
      capabilityLevel: level,
      levelDescription: LEVEL_DESCRIPTIONS[level],
      recommendedMode,
      defaultMode,
      asrMode,
      providers: providerHealth.map(({ provider, health }) => ({
        id: provider.id,
        mode: provider.mode,
        displayName: provider.displayName,
        healthy: health.healthy,
        message: health.message,
        latencyMs: health.latencyMs,
      })),
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
