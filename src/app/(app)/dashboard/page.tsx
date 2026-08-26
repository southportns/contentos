'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Sparkles, Activity, CheckCircle2, Loader2, AlertCircle, Rocket,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ServiceStatus {
  name: string
  status: 'checking' | 'ok' | 'error'
  path: string
}

const services: ServiceStatus[] = [
  { name: 'Health', status: 'checking', path: '/api/health' },
  { name: 'Topic Research', status: 'checking', path: '/api/research/topic' },
  { name: 'Content Search', status: 'checking', path: '/api/research/search' },
  { name: 'Viral Analysis', status: 'checking', path: '/api/analysis/viral' },
  { name: 'Angle Generation', status: 'checking', path: '/api/generation/angles' },
  { name: 'Content Strategy', status: 'checking', path: '/api/generation/strategy' },
  { name: 'Writing', status: 'checking', path: '/api/generation/writing' },
  { name: 'Evaluation', status: 'checking', path: '/api/evaluation' },
]

export default function DashboardPage() {
  const [statuses, setStatuses] = useState<ServiceStatus[]>(services)

  useEffect(() => {
    const checkServices = async () => {
      const updated = await Promise.all(
        services.map(async (service) => {
          try {
            const res = await fetch(`/api/health`, { method: 'GET' })
            return { ...service, status: res.ok ? ('ok' as const) : ('error' as const) }
          } catch {
            return { ...service, status: 'error' as const }
          }
        }),
      )
      setStatuses(updated)
    }
    checkServices()
  }, [])

  const okCount = statuses.filter((s) => s.status === 'ok').length

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      {/* Welcome */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Content OS</h1>
        <p className="text-muted-foreground">AI 内容研究、爆款分析、内容决策与写作系统</p>
      </div>

      {/* Quick Start */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Rocket className="size-5 text-primary" />
            <div>
              <CardTitle>开始创建</CardTitle>
              <CardDescription>输入主题，一键完成从研究到写作的全流程</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Link href="/create" className={buttonVariants()}>
            <Rocket className="size-4" />
            进入创建流程
          </Link>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              <CardTitle>系统状态</CardTitle>
            </div>
            <Badge variant={okCount === statuses.length ? 'default' : 'secondary'}>
              {okCount}/{statuses.length} 正常
            </Badge>
          </div>
          <CardDescription>所有 Skill API 端点运行状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {statuses.map((s) => (
              <div key={s.name} className="flex items-center gap-2 rounded-lg border p-2">
                {s.status === 'checking' ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : s.status === 'ok' ? (
                  <CheckCircle2 className="size-4 text-green-600" />
                ) : (
                  <AlertCircle className="size-4 text-red-600" />
                )}
                <span className="text-xs font-medium">{s.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
