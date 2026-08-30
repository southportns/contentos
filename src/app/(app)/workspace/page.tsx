'use client'

import { useWorkflow } from '@/hooks/use-workflow'
import { useContentLibrary } from '@/hooks/use-content-library'
import {
  FolderOpen,
  Sparkles,
  FileText,
  Lightbulb,
  Target,
  PenLine,
  ClipboardCheck,
  ArrowRight,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function WorkspacePage() {
  const {
    topicProfile,
    viralResult,
    angles,
    selectedAngle,
    strategy,
    draft,
    evaluation,
  } = useWorkflow()
  const { contents } = useContentLibrary()

  // If no work in progress, redirect to create
  if (!topicProfile) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">工作台</h1>
          <p className="text-muted-foreground">查看当前创作进度</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FolderOpen className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">还没有进行中的创作</p>
              <p className="text-sm text-muted-foreground">
                开始一次创作后，可以在这里查看完整的工作流状态
              </p>
            </div>
            <Link href="/create" className={cn(buttonVariants())}>
              <Sparkles className="size-4" />
              开始创作
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const steps = [
    {
      icon: Sparkles,
      label: '主题研究',
      status: topicProfile ? 'done' : 'pending',
      detail: topicProfile?.topic,
    },
    {
      icon: FileText,
      label: '内容搜索',
      status: contents.length > 0 ? 'done' : 'pending',
      detail: `${contents.length} 条内容`,
    },
    {
      icon: Lightbulb,
      label: '爆款分析',
      status: viralResult ? 'done' : 'pending',
      detail: viralResult
        ? `平均 ${viralResult.patterns.avgViralScore} 分`
        : '未开始',
    },
    {
      icon: Target,
      label: '角度选择',
      status: selectedAngle ? 'done' : angles.length > 0 ? 'active' : 'pending',
      detail: selectedAngle
        ? selectedAngle.title
        : angles.length > 0
          ? `${angles.length} 个角度待选`
          : '未开始',
    },
    {
      icon: PenLine,
      label: '内容写作',
      status: draft ? 'done' : 'pending',
      detail: draft ? `${draft.wordCount} 字` : '未开始',
    },
    {
      icon: ClipboardCheck,
      label: '内容评估',
      status: evaluation ? 'done' : 'pending',
      detail: evaluation ? `${evaluation.overallScore} 分` : '未开始',
    },
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">工作台</h1>
          <p className="text-muted-foreground">当前创作进度</p>
        </div>
        <Link href="/create" className={cn(buttonVariants({ variant: 'outline' }))}>
          继续创作
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {/* Topic summary */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {topicProfile.topic}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {topicProfile.keywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Workflow steps */}
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <Card key={i} className={cn(
            'transition-opacity',
            step.status === 'pending' && 'opacity-50',
          )}>
            <CardContent className="flex items-center gap-3 p-4">
              <step.icon className={cn(
                'size-5 shrink-0',
                step.status === 'done' ? 'text-green-600' :
                step.status === 'active' ? 'text-primary' :
                'text-muted-foreground',
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{step.label}</span>
                  <Badge
                    variant={step.status === 'done' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {step.status === 'done' ? '完成' : step.status === 'active' ? '进行中' : '待开始'}
                  </Badge>
                </div>
                {step.detail && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {step.detail}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Draft preview */}
      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenLine className="size-4 text-primary" />
              内容初稿
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium mb-1">{draft.title}</div>
            <p className="text-xs text-muted-foreground line-clamp-3">
              {draft.content}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Evaluation preview */}
      {evaluation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-primary" />
              评估结果
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-primary">
                {evaluation.overallScore}
              </span>
              <span className="text-sm text-muted-foreground">综合分</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {evaluation.strengths.map((s) => (
                <Badge key={s} variant="default" className="text-xs">
                  ✓ {s}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {evaluation.weaknesses.map((w) => (
                <Badge key={w} variant="secondary" className="text-xs">
                  ⚠ {w}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
