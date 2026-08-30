/**
 * Env Loader — 动态读取 .env.local
 *
 * Next.js dev server 在启动时加载 .env.local 到 process.env，
 * 但运行时通过 ASR/LLM Settings API 修改 .env.local 后，
 * process.env 在不同 API route 进程中可能不会同步更新。
 *
 * 此模块在每次调用时从文件重新读取，确保获取最新配置。
 *
 * 架构位置: Infrastructure Layer
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ENV_LOCAL_PATH = join(process.cwd(), '.env.local')

/**
 * 从 .env.local 读取指定 key 的值。
 * 如果文件中不存在，回退到 process.env。
 *
 * 支持 KEY=, KEY=val, KEY="val", KEY="" (empty quoted) 格式。
 */
export function getEnvVar(key: string): string | undefined {
  // 先从 .env.local 文件读取（运行时最新）
  const fileVal = readEnvFileValue(key)
  if (fileVal !== undefined) {
    return fileVal
  }
  // 回退到 process.env（启动时加载的值）
  return process.env[key]
}

/**
 * 批量读取多个环境变量
 */
export function getEnvVars(keys: string[]): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const key of keys) {
    result[key] = getEnvVar(key)
  }
  return result
}

/**
 * 解析 .env.local 文件中的一行
 */
function parseEnvLine(line: string): { key: string; value: string } | null {
  // Support: KEY=, KEY=val, KEY="val", KEY="" (empty quoted)
  const match = line.match(/^([A-Z_]+)=(?:"([^"]*)"|([^\s].*|))$/)
  if (!match) return null
  return { key: match[1], value: match[2] ?? match[3] ?? '' }
}

/**
 * 从 .env.local 文件读取指定 key 的值
 */
function readEnvFileValue(key: string): string | undefined {
  try {
    if (!existsSync(ENV_LOCAL_PATH)) return undefined
    const content = readFileSync(ENV_LOCAL_PATH, 'utf-8')
    for (const line of content.split('\n')) {
      const parsed = parseEnvLine(line.trim())
      if (parsed && parsed.key === key) {
        return parsed.value
      }
    }
    return undefined
  } catch {
    return undefined
  }
}
