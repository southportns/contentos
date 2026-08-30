'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Database,
  Key,
  Server,
  Globe,
  Cpu,
  Cloud,
  HardDrive,
  Zap,
  AudioWaveform,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface EnvCheck {
  key: string
  label: string
  category: 'ai' | 'tool' | 'database' | 'asr'
  level: 'required' | 'optional'
  isActiveProvider: boolean
  configured: boolean
  maskedValue: string | null
}

interface DebugEnvResult {
  timestamp: string
  nodeEnv: string
  aiProvider: string
  aiModel: string
  appUrl: string
  envChecks: EnvCheck[]
  database: {
    configured: boolean
    connected: boolean
    error?: string
  }
  overallStatus: 'ok' | 'warning' | 'error'
  summary: {
    total: number
    configured: number
    missing: number
    requiredMissing: number
  }
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<DebugEnvResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/debug-env')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: DebugEnvResult = await res.json()
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to fetch')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/debug-env')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: DebugEnvResult = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  const statusConfig = {
    ok: {
      icon: CheckCircle2,
      label: '正常运行',
      color: 'text-green-600',
      bg: 'bg-green-500/10',
      badge: 'default' as const,
    },
    warning: {
      icon: AlertCircle,
      label: '部分配置缺失',
      color: 'text-amber-600',
      bg: 'bg-amber-500/10',
      badge: 'secondary' as const,
    },
    error: {
      icon: XCircle,
      label: '关键配置缺失',
      color: 'text-red-600',
      bg: 'bg-red-500/10',
      badge: 'destructive' as const,
    },
  }

  const aiKeys = data?.envChecks.filter((e) => e.category === 'ai') ?? []
  const toolKeys = data?.envChecks.filter((e) => e.category === 'tool') ?? []
  const asrKeys = data?.envChecks.filter((e) => e.category === 'asr') ?? []
  const dbKey = data?.envChecks.find((e) => e.category === 'database')

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">运行环境检测</h1>
          <p className="text-muted-foreground">检查系统环境变量与数据库连接状态</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchDiagnostics}
          disabled={loading}
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Overall Status */}
      {loading && !data && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12">
            <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">正在检测环境...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="ring-red-500/30">
          <CardContent className="flex items-center gap-3 py-4 text-red-600">
            <XCircle className="size-5 shrink-0" />
            <span className="text-sm">检测失败: {error}</span>
          </CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          {/* Overall status banner */}
          <Card className={`ring-1 ${data.overallStatus === 'ok' ? 'ring-green-500/20 bg-green-500/5' : 'ring-red-500/20 bg-red-500/5'}`}>
            <CardContent className="flex items-center gap-4 py-6">
              <div className={`flex size-12 items-center justify-center rounded-full ${statusConfig[data.overallStatus].bg}`}>
                {(() => {
                  const Icon = statusConfig[data.overallStatus].icon
                  return <Icon className={`size-6 ${statusConfig[data.overallStatus].color}`} />
                })()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">
                    {statusConfig[data.overallStatus].label}
                  </span>
                  <Badge variant={statusConfig[data.overallStatus].badge}>
                    {data.summary.requiredMissing === 0 ? '环境配置通过' : `${data.summary.requiredMissing} 项必需缺失`}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {data.overallStatus === 'ok'
                    ? '所有必需配置已就绪，系统运行正常。'
                    : '存在必需配置缺失，请配置 .env.local 文件后重试。'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* System Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="size-4" />
                系统信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">运行环境</div>
                  <div className="text-sm font-medium mt-0.5">{data.nodeEnv}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">AI Provider</div>
                  <div className="text-sm font-medium mt-0.5">{data.aiProvider}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">AI Model</div>
                  <div className="text-sm font-medium mt-0.5">{data.aiModel}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">App URL</div>
                  <div className="text-sm font-medium mt-0.5 truncate">{data.appUrl}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Provider Keys */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="size-4" />
                AI 模型配置
              </CardTitle>
              <CardDescription>
                配置任意一个 AI 模型 API Key 即可，当前使用 <span className="font-medium text-foreground">{data.aiProvider}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {aiKeys.map((item, idx) => (
                <div key={item.key}>
                  {idx > 0 && <Separator className="my-2" />}
                  <EnvCheckRow item={item} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Research Tools */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="size-4" />
                研究工具配置
              </CardTitle>
              <CardDescription>网页搜索与内容抓取（DuckDuckGo + Jina Reader，无需 API Key）</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {toolKeys.map((item, idx) => (
                <div key={item.key}>
                  {idx > 0 && <Separator className="my-2" />}
                  <EnvCheckRow item={item} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ASR Environment Config */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AudioWaveform className="size-4" />
                口播稿识别配置 (ASR)
              </CardTitle>
              <CardDescription>
                语音识别模式与 API Key 配置。当前模式: <span className="font-medium text-foreground">{data.envChecks.find(e => e.key === 'ASR_MODE')?.maskedValue || 'auto'}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {asrKeys.map((item, idx) => (
                <div key={item.key}>
                  {idx > 0 && <Separator className="my-2" />}
                  <EnvCheckRow item={item} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ASR Hardware Detection */}
          <ASRHardwareCard />

          {/* Database */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4" />
                数据库状态
              </CardTitle>
              <CardDescription>SQLite 数据库连接配置（必需）</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {dbKey && <EnvCheckRow item={dbKey} />}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {data.database.connected ? (
                    <CheckCircle2 className="size-5 text-green-600" />
                  ) : (
                    <XCircle className="size-5 text-red-600" />
                  )}
                  <div>
                    <div className="text-sm font-medium">
                      数据库连接
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {data.database.connected
                        ? '连接成功'
                        : data.database.error
                          ? data.database.error
                          : '连接失败'}
                    </div>
                  </div>
                </div>
                <Badge variant={data.database.connected ? 'default' : 'destructive'}>
                  {data.database.connected ? '已连接' : '未连接'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Last checked */}
          <p className="text-center text-xs text-muted-foreground">
            最后检测时间: {new Date(data.timestamp).toLocaleString('zh-CN')}
          </p>
        </>
      )}
    </div>
  )
}

function EnvCheckRow({ item }: { item: EnvCheck }) {
  // Determine display status:
  // - required + not configured → red (error)
  // - required + configured → green
  // - optional + not configured → gray (informational)
  // - optional + configured → green
  const isError = item.level === 'required' && !item.configured
  const isOptionalMissing = item.level === 'optional' && !item.configured

  const Icon = item.configured
    ? CheckCircle2
    : isError
      ? XCircle
      : AlertCircle

  const iconColor = item.configured
    ? 'text-green-600'
    : isError
      ? 'text-red-600'
      : 'text-muted-foreground'

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-3">
        <Icon className={`size-5 shrink-0 ${iconColor}`} />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{item.label}</span>
            {item.isActiveProvider && (
              <Badge variant="default" className="text-xs">
                当前使用
              </Badge>
            )}
            {item.level === 'optional' && !item.configured && (
              <Badge variant="outline" className="text-xs">
                可选
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {item.maskedValue || '未配置'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="text-xs text-muted-foreground">{item.key}</code>
        <Badge
          variant={item.configured ? 'default' : isError ? 'destructive' : 'secondary'}
        >
          {item.configured ? '已配置' : isOptionalMissing ? '未配置' : '缺失'}
        </Badge>
      </div>
    </div>
  )
}

// ─── ASR Hardware Detection Card ─────────────────────

interface ASRHardwareData {
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

const LEVEL_STYLES: Record<string, { color: string; bg: string; icon: typeof Cpu }> = {
  A: { color: 'text-green-600', bg: 'bg-green-500/10', icon: Cpu },
  B: { color: 'text-blue-600', bg: 'bg-blue-500/10', icon: Cpu },
  C: { color: 'text-amber-600', bg: 'bg-amber-500/10', icon: HardDrive },
  D: { color: 'text-red-600', bg: 'bg-red-500/10', icon: Cloud },
}

function ASRHardwareCard() {
  const [data, setData] = useState<ASRHardwareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/diagnostics/asr-hardware')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to fetch')
      setData(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            ASR 硬件检测
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 py-6">
          <RefreshCw className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">正在检测硬件...</span>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="ring-red-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            ASR 硬件检测
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 py-4 text-red-600">
          <XCircle className="size-5 shrink-0" />
          <span className="text-sm">检测失败: {error}</span>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const levelStyle = LEVEL_STYLES[data.capabilityLevel]
  const LevelIcon = levelStyle.icon

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            ASR 硬件检测
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
        <CardDescription>
          检测本机 AI 能力，用于 Auto Mode 自动选择 ASR Provider
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Capability Level Banner */}
        <div className={`flex items-center gap-4 rounded-lg ${levelStyle.bg} p-4`}>
          <div className={`flex size-10 items-center justify-center rounded-full ${levelStyle.bg}`}>
            <LevelIcon className={`size-5 ${levelStyle.color}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${levelStyle.color}`}>
                Level {data.capabilityLevel}
              </span>
              <Badge variant={data.recommendedMode === 'local' ? 'default' : 'secondary'}>
                {data.recommendedMode === 'local' ? '推荐本地' : '推荐云端'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.levelDescription}
            </p>
          </div>
        </div>

        {/* Hardware Details */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">OS</div>
            <div className="text-sm font-medium mt-0.5">{data.hardware.os}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">RAM</div>
            <div className="text-sm font-medium mt-0.5">{data.hardware.ramGB} GB</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">GPU</div>
            <div className="text-sm font-medium mt-0.5">
              {data.hardware.gpu || '未检测到'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">VRAM</div>
            <div className="text-sm font-medium mt-0.5">
              {data.hardware.vramGB ? `${data.hardware.vramGB} GB` : '—'}
            </div>
          </div>
        </div>

        {/* CUDA Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {data.hardware.cudaAvailable ? (
              <CheckCircle2 className="size-4 text-green-600" />
            ) : (
              <XCircle className="size-4 text-muted-foreground" />
            )}
            <span className="text-sm">
              CUDA {data.hardware.cudaAvailable ? `可用 (${data.hardware.cudaVersion || 'installed'})` : '不可用'}
            </span>
          </div>
          <Badge variant={data.hardware.cudaAvailable ? 'default' : 'secondary'}>
            {data.hardware.cudaAvailable ? 'GPU 加速' : 'CPU 模式'}
          </Badge>
        </div>

        <Separator />

        {/* ASR Mode Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AudioWaveform className="size-4 text-muted-foreground" />
            <span className="text-sm">当前 ASR 模式</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{data.asrMode}</Badge>
            {data.asrMode === 'auto' && (
              <span className="text-xs text-muted-foreground">
                → 将自动选择 {data.recommendedMode === 'local' ? '本地' : '云端'}
              </span>
            )}
          </div>
        </div>

        <Separator />

        {/* Provider Health */}
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Provider 健康状态</div>
          {data.providers.length === 0 ? (
            <p className="text-xs text-muted-foreground">无可用 Provider</p>
          ) : (
            data.providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  {p.healthy ? (
                    <CheckCircle2 className="size-4 text-green-600" />
                  ) : (
                    <XCircle className="size-4 text-red-600" />
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{p.displayName}</span>
                      <Badge variant="outline" className="text-xs">
                        {p.mode === 'cloud' ? '☁️ 云端' : '🖥️ 本地'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.message || (p.healthy ? '可用' : '不可用')}
                      {p.latencyMs != null && ` · ${p.latencyMs}ms`}
                    </div>
                  </div>
                </div>
                <Badge variant={p.healthy ? 'default' : 'destructive'}>
                  {p.healthy ? '可用' : '不可用'}
                </Badge>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
