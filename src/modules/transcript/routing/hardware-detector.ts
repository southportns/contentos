/**
 * Hardware Detector — 硬件检测器
 *
 * 检测本机硬件能力，用于 Auto Mode 决策。
 * V1.0 只做基础检测，不依赖 GPU 库。
 *
 * 架构位置: Routing Layer
 */

import { platform, totalmem, cpus } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
import type { HardwareProfile, CapabilityLevel } from '../domain/transcript.types'

/**
 * 检测本机硬件配置
 */
export async function detectHardware(): Promise<HardwareProfile> {
  const os = platform()
  const ramGB = Math.round((totalmem() / (1024 ** 3)) * 10) / 10
  const cpuModel = cpus()[0]?.model || 'Unknown'

  // 尝试检测 GPU（通过 nvidia-smi）
  let gpu: string | undefined
  let vramGB: number | undefined
  let cudaAvailable = false
  let cudaVersion: string | undefined

  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits',
    ], { timeout: 3_000, encoding: 'utf-8' })

    const lines = stdout.trim().split('\n')
    if (lines.length > 0 && lines[0]) {
      const parts = lines[0].split(', ').map(s => s.trim())
      gpu = parts[0]
      vramGB = parts[1] ? Math.round(parseInt(parts[1]) / 1024 * 10) / 10 : undefined
      cudaAvailable = true
      if (parts[2]) {
        cudaVersion = parts[2]
      }
    }
  } catch {
    // nvidia-smi 不可用 — 没有 NVIDIA GPU 或驱动未安装
  }

  return {
    os: os,
    cpu: cpuModel,
    ramGB,
    gpu,
    vramGB,
    cudaAvailable,
    cudaVersion,
  }
}

/**
 * 根据硬件配置确定本地 ASR 能力等级
 *
 * Level A: 高性能 GPU（≥8GB VRAM）— 可运行双模型
 * Level B: 中等 GPU（≥4GB VRAM）— 可运行单模型
 * Level C: 低配置设备 — CPU 推理可用但较慢
 * Level D: 不适合本地推理
 */
export function getCapabilityLevel(hw: HardwareProfile): CapabilityLevel {
  if (hw.cudaAvailable && hw.vramGB) {
    if (hw.vramGB >= 8) return 'A'
    if (hw.vramGB >= 4) return 'B'
  }

  // CPU 推理：需要足够内存
  if (hw.ramGB >= 8) return 'C'

  return 'D'
}

/**
 * 获取缓存硬件配置（避免每次请求都检测）
 */
let cachedHardware: { profile: HardwareProfile; timestamp: number } | null = null
const HW_CACHE_MS = 60_000 // 1 min cache

export async function getHardwareProfile(): Promise<HardwareProfile> {
  if (cachedHardware && Date.now() - cachedHardware.timestamp < HW_CACHE_MS) {
    return cachedHardware.profile
  }

  const profile = await detectHardware()
  cachedHardware = { profile, timestamp: Date.now() }
  return profile
}
