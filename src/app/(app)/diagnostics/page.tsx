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
  category: 'ai' | 'tool' | 'database'
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
