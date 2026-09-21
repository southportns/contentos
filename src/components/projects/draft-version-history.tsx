'use client'

import { useState, useMemo } from 'react'
import { FileText, ChevronRight, Star, ArrowLeftRight, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Draft, Evaluation, Humanization, StrategyEvaluation } from '@/generated/prisma'
import { getVersionLabel, getVersionBadgeVariant } from './draft-version-utils'
import { DraftVersionCompare } from './draft-version-compare'

interface DraftVersionHistoryProps {
  drafts: Array<Draft & {
    evaluation: Evaluation | null
    humanization: Humanization | null
    strategyEvaluation: StrategyEvaluation | null
  }>
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function ScoreRow({ label, score }: { label: string; score: number | null }) {
  if (score == null) return null
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{score}</span>
    </div>
  )
}

function EvaluationSection({ evaluation }: { evaluation: Evaluation | null }) {
  if (!evaluation) return null
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <Star className="size-3.5 text-amber-500" />
        评估分数
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/30 p-3">
        <ScoreRow label="综合" score={evaluation.overallScore} />
        <ScoreRow label="情感冲击" score={evaluation.emotionalImpactScore} />
        <ScoreRow label="逻辑清晰" score={evaluation.logicalClarityScore} />
        <ScoreRow label="新颖度" score={evaluation.noveltyScore} />
        <ScoreRow label="可读性" score={evaluation.readabilityScore} />
        <ScoreRow label="平台适配" score={evaluation.platformFitScore} />
      </div>
    </div>
  )
}

function StrategyEvaluationSection({ strategyEvaluation }: { strategyEvaluation: StrategyEvaluation | null }) {
  if (!strategyEvaluation) return null
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">策略评估</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/30 p-3">
        <ScoreRow label="综合" score={strategyEvaluation.overallScore} />
        {strategyEvaluation.grade && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">等级</span>
            <span className="font-medium">{strategyEvaluation.grade}</span>
          </div>
        )}
        {strategyEvaluation.platformFit != null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">平台</span>
            <span className="font-medium">{strategyEvaluation.platformFit}</span>
          </div>
        )}
        {strategyEvaluation.strategyConsistency != null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">一致性</span>
            <span className="font-medium">{strategyEvaluation.strategyConsistency}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function HumanizationSection({ humanization }: { humanization: Humanization | null }) {
  if (!humanization) return null
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">真人化</h4>
      <div className="rounded-lg bg-muted/30 p-3">
        <Badge variant={humanization.adopted ? 'default' : 'secondary'}>
          {humanization.adopted ? '已采用' : '未采用'}
        </Badge>
      </div>
    </div>
  )
}

export function DraftVersionHistory({ drafts }: DraftVersionHistoryProps) {
  const [viewMode, setViewMode] = useState<'detail' | 'compare'>('detail')
  const [selectedVersion, setSelectedVersion] = useState<number>(drafts[0]?.version ?? 1)

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.version === selectedVersion) ?? drafts[0],
    [drafts, selectedVersion]
  )

  const canCompare = drafts.length >= 2

  if (!drafts || drafts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">版本历史</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">还没有生成内容版本</p>
        </CardContent>
      </Card>
    )
  }

  if (viewMode === 'compare') {
    return (
      <div className="space-y-3">
        <button onClick={() => setViewMode('detail')} className={cn('flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors')}>
          <ArrowLeft className="size-4" />
          返回版本详情
        </button>
        <DraftVersionCompare drafts={drafts} />
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>版本历史</span>
            <Badge variant="secondary" className="text-xs">{drafts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col">
            {drafts.map((draft, index) => (
              <button key={draft.id} onClick={() => setSelectedVersion(draft.version)} className={cn('flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50', 'border-l-2', selectedVersion === draft.version ? 'border-l-primary bg-accent/30' : 'border-l-transparent', index !== drafts.length - 1 && 'border-b')}>
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">v{draft.version}</span>
                    <Badge variant={getVersionBadgeVariant(draft.status)} className="text-[10px] px-1.5 py-0">{getVersionLabel(draft.version, draft.status)}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{formatDate(draft.createdAt)}</span>
                    {draft.wordCount && <span className="text-xs text-muted-foreground">{draft.wordCount}字</span>}
                  </div>
                </div>
                {selectedVersion === draft.version && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            ))}
          </div>
          {canCompare && (
            <div className="border-t p-3">
              <button onClick={() => setViewMode('compare')} className={cn('w-full flex items-center justify-center gap-2 rounded-md px-3 py-2', 'text-sm font-medium transition-colors', 'bg-primary text-primary-foreground hover:bg-primary/90')}>
                <ArrowLeftRight className="size-4" />
                版本对比
              </button>
            </div>
          )}
        </CardContent>
      </Card>
      {selectedDraft && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span>v{selectedDraft.version}</span>
                <Badge variant={getVersionBadgeVariant(selectedDraft.status)}>{getVersionLabel(selectedDraft.version, selectedDraft.status)}</Badge>
              </CardTitle>
              {selectedVersion === drafts[0]?.version && (
                <Badge variant="default" className="gap-1"><Star className="size-3" />最新</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedDraft.title && <div><h3 className="text-lg font-semibold leading-snug">{selectedDraft.title}</h3></div>}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>创建 {new Intl.DateTimeFormat('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).format(selectedDraft.createdAt)}</span>
              {selectedDraft.wordCount && <span>{selectedDraft.wordCount} 字</span>}
            </div>
            <div className="rounded-lg bg-muted/30 p-4"><p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{selectedDraft.content}</p></div>
            <EvaluationSection evaluation={selectedDraft.evaluation} />
            <StrategyEvaluationSection strategyEvaluation={selectedDraft.strategyEvaluation} />
            <HumanizationSection humanization={selectedDraft.humanization} />
            {selectedDraft.evaluation == null && selectedDraft.strategyEvaluation == null && selectedDraft.humanization == null && (
              <p className="text-sm text-muted-foreground text-center py-2">暂无分析数据</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
