'use client'

import { useState, useMemo } from 'react'
import { FileText, ChevronRight, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Draft, Evaluation, Humanization, StrategyEvaluation } from '@/generated/prisma'

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

function getVersionLabel(version: number, status: string): string {
  if (status === 'FINAL') return 'FINAL'
  if (status === 'HUMANIZED') return 'HUMANIZED'
  if (version === 1) return 'ORIGINAL'
  return 'DRAFT'
}

function getVersionBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'FINAL') return 'default'
  if (status === 'HUMANIZED') return 'secondary'
  return 'outline'
}

export function DraftVersionHistory({ drafts }: DraftVersionHistoryProps) {
  // Default to latest version (first in the list since ordered DESC)
  const [selectedVersion, setSelectedVersion] = useState<number>(
    drafts[0]?.version ?? 1
  )

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.version === selectedVersion) ?? drafts[0],
    [drafts, selectedVersion]
  )

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

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Version List */}
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>版本历史</span>
            <Badge variant="secondary" className="text-xs">
              {drafts.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col">
            {drafts.map((draft, index) => (
              <button
                key={draft.id}
                onClick={() => setSelectedVersion(draft.version)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                  'border-l-2',
                  selectedVersion === draft.version
                    ? 'border-l-primary bg-accent/30'
                    : 'border-l-transparent',
                  index !== drafts.length - 1 && 'border-b'
                )}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">v{draft.version}</span>
                    <Badge variant={getVersionBadgeVariant(draft.status)} className="text-[10px] px-1.5 py-0">
                      {getVersionLabel(draft.version, draft.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(draft.createdAt)}
                    </span>
                    {draft.wordCount && (
                      <span className="text-xs text-muted-foreground">
                        {draft.wordCount}字
                      </span>
                    )}
                  </div>
                </div>
                {selectedVersion === draft.version && (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected Version Detail */}
      {selectedDraft && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span>v{selectedDraft.version}</span>
                <Badge variant={getVersionBadgeVariant(selectedDraft.status)}>
                  {getVersionLabel(selectedDraft.version, selectedDraft.status)}
                </Badge>
              </CardTitle>
              {selectedVersion === drafts[0]?.version && (
                <Badge variant="default" className="gap-1">
                  <Star className="size-3" />
                  最新
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
            {selectedDraft.title && (
              <div>
                <h3 className="text-lg font-semibold leading-snug">
                  {selectedDraft.title}
                </h3>
              </div>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>创建 {new Intl.DateTimeFormat('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }).format(selectedDraft.createdAt)}</span>
              {selectedDraft.wordCount && (
                <span>{selectedDraft.wordCount} 字</span>
              )}
            </div>

            {/* Content */}
            <div className="rounded-lg bg-muted/30 p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                {selectedDraft.content}
              </p>
            </div>

            {/* Evaluation */}
            {selectedDraft.evaluation && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">评估分数</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {selectedDraft.evaluation.overallScore != null && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="text-xs text-muted-foreground">综合</span>
                      <span className="text-sm font-medium">{selectedDraft.evaluation.overallScore}</span>
                    </div>
                  )}
                  {selectedDraft.evaluation.emotionalImpactScore != null && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="text-xs text-muted-foreground">情感冲击</span>
                      <span className="text-sm font-medium">{selectedDraft.evaluation.emotionalImpactScore}</span>
                    </div>
                  )}
                  {selectedDraft.evaluation.logicalClarityScore != null && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="text-xs text-muted-foreground">逻辑清晰</span>
                      <span className="text-sm font-medium">{selectedDraft.evaluation.logicalClarityScore}</span>
                    </div>
                  )}
                  {selectedDraft.evaluation.noveltyScore != null && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="text-xs text-muted-foreground">新颖度</span>
                      <span className="text-sm font-medium">{selectedDraft.evaluation.noveltyScore}</span>
                    </div>
                  )}
                  {selectedDraft.evaluation.readabilityScore != null && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="text-xs text-muted-foreground">可读性</span>
                      <span className="text-sm font-medium">{selectedDraft.evaluation.readabilityScore}</span>
                    </div>
                  )}
                  {selectedDraft.evaluation.platformFitScore != null && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="text-xs text-muted-foreground">平台适配</span>
                      <span className="text-sm font-medium">{selectedDraft.evaluation.platformFitScore}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Strategy Evaluation */}
            {selectedDraft.strategyEvaluation && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">策略评估</div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {selectedDraft.strategyEvaluation.overallScore != null && (
                    <span className="rounded-md bg-muted/50 px-2.5 py-1">
                      综合: <strong>{selectedDraft.strategyEvaluation.overallScore}</strong></span>
                  )}
                  {selectedDraft.strategyEvaluation.grade && (
                    <span className="rounded-md bg-muted/50 px-2.5 py-1">
                      等级: <strong>{selectedDraft.strategyEvaluation.grade}</strong></span>
                  )}
                  {selectedDraft.strategyEvaluation.platformFit != null && (
                    <span className="rounded-md bg-muted/50 px-2.5 py-1">
                      平台: <strong>{selectedDraft.strategyEvaluation.platformFit}</strong></span>
                  )}
                  {selectedDraft.strategyEvaluation.strategyConsistency != null && (
                    <span className="rounded-md bg-muted/50 px-2.5 py-1">
                      一致性: <strong>{selectedDraft.strategyEvaluation.strategyConsistency}</strong></span>
                  )}
                </div>
              </div>
            )}

            {/* Humanization Status */}
            {selectedDraft.humanization && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">真人化</span>
                  <Badge variant={selectedDraft.humanization.adopted ? 'default' : 'secondary'}>
                    {selectedDraft.humanization.adopted ? '已采用' : '未采用'}
                  </Badge>
                </div>
              </div>
            )}

            {/* No analysis message */}
            {!selectedDraft.evaluation && !selectedDraft.strategyEvaluation && !selectedDraft.humanization && (
              <p className="text-xs text-muted-foreground italic">暂无分析数据</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
