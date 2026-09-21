'use client'

import { useState, useMemo } from 'react'
import { ArrowLeftRight, FileText, BarChart3, Sparkles, UserCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Draft, Evaluation, Humanization, StrategyEvaluation } from '@/generated/prisma'
import { compareDraftVersions } from './draft-version-utils'
import { DraftVersionDiff } from './draft-version-diff'
import { DraftVersionCompareSelector } from './draft-version-compare-selector'

interface DraftVersionCompareProps {
  drafts: Array<Draft & { evaluation: Evaluation | null; humanization: Humanization | null; strategyEvaluation: StrategyEvaluation | null }>
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function EvaluationBadges({ evaluation }: { evaluation: Evaluation | null }) {
  if (!evaluation) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {evaluation.overallScore != null && <Badge variant="secondary" className="text-[10px]">综合 {evaluation.overallScore}</Badge>}
      {evaluation.emotionalImpactScore != null && <Badge variant="outline" className="text-[10px]">情感 {evaluation.emotionalImpactScore}</Badge>}
      {evaluation.noveltyScore != null && <Badge variant="outline" className="text-[10px]">新颖 {evaluation.noveltyScore}</Badge>}
    </div>
  )
}

function StrategyBadges({ strategyEvaluation }: { strategyEvaluation: StrategyEvaluation | null }) {
  if (!strategyEvaluation) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {strategyEvaluation.overallScore != null && <Badge variant="secondary" className="text-[10px]">综合 {strategyEvaluation.overallScore}</Badge>}
      {strategyEvaluation.grade && <Badge variant="outline" className="text-[10px]">等级 {strategyEvaluation.grade}</Badge>}
    </div>
  )
}

export function DraftVersionCompare({ drafts }: DraftVersionCompareProps) {
  if (!drafts || drafts.length < 2) {
    return (<Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ArrowLeftRight className="size-4" />版本对比</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{drafts.length === 0 ? '还没有生成内容版本' : '至少需要两个版本才能进行对比'}</p></CardContent></Card>)
  }
  const [versionA, setVersionA] = useState<number>(drafts[0].version)
  const [versionB, setVersionB] = useState<number>(drafts[1].version)
  const draftA = useMemo(() => drafts.find((d) => d.version === versionA) ?? drafts[0], [drafts, versionA])
  const draftB = useMemo(() => drafts.find((d) => d.version === versionB) ?? drafts[1], [drafts, versionB])
  const diffLines = useMemo(() => compareDraftVersions(draftB.content ?? '', draftA.content ?? ''), [draftA, draftB])
  const addedCount = diffLines.filter((l) => l.type === 'added').length
  const removedCount = diffLines.filter((l) => l.type === 'removed').length
  const unchangedCount = diffLines.filter((l) => l.type === 'unchanged').length
  const handleSwap = () => { setVersionA(versionB); setVersionB(versionA) }
  return (
    <div className="space-y-4">
      <DraftVersionCompareSelector drafts={drafts} versionA={versionA} versionB={versionB} onVersionAChange={setVersionA} onVersionBChange={setVersionB} onSwap={handleSwap} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="size-3.5" />版本 A: v{draftA.version}</CardTitle><div className="text-xs text-muted-foreground">{formatDate(draftA.createdAt)}{draftA.wordCount ? ` · ${draftA.wordCount}字` : ''}</div></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs"><BarChart3 className="size-3 text-muted-foreground" /><span className="text-muted-foreground">评估:</span><EvaluationBadges evaluation={draftA.evaluation} /></div>
            <div className="flex items-center gap-1.5 text-xs"><Sparkles className="size-3 text-muted-foreground" /><span className="text-muted-foreground">策略:</span><StrategyBadges strategyEvaluation={draftA.strategyEvaluation} /></div>
            <div className="flex items-center gap-1.5 text-xs"><UserCircle className="size-3 text-muted-foreground" /><span className="text-muted-foreground">真人化:</span>{draftA.humanization ? <Badge variant={draftA.humanization.adopted ? 'default' : 'secondary'} className="text-[10px]">{draftA.humanization.adopted ? '已采用' : '未采用'}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="size-3.5" />版本 B: v{draftB.version}</CardTitle><div className="text-xs text-muted-foreground">{formatDate(draftB.createdAt)}{draftB.wordCount ? ` · ${draftB.wordCount}字` : ''}</div></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs"><BarChart3 className="size-3 text-muted-foreground" /><span className="text-muted-foreground">评估:</span><EvaluationBadges evaluation={draftB.evaluation} /></div>
            <div className="flex items-center gap-1.5 text-xs"><Sparkles className="size-3 text-muted-foreground" /><span className="text-muted-foreground">策略:</span><StrategyBadges strategyEvaluation={draftB.strategyEvaluation} /></div>
            <div className="flex items-center gap-1.5 text-xs"><UserCircle className="size-3 text-muted-foreground" /><span className="text-muted-foreground">真人化:</span>{draftB.humanization ? <Badge variant={draftB.humanization.adopted ? 'default' : 'secondary'} className="text-[10px]">{draftB.humanization.adopted ? '已采用' : '未采用'}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</div>
          </CardContent>
        </Card>
      </div>
      {versionA !== versionB && <div className="flex flex-wrap gap-3 text-xs"><span className="text-green-600 dark:text-green-400">+ {addedCount} 行新增</span><span className="text-red-600 dark:text-red-400">- {removedCount} 行删除</span><span className="text-muted-foreground">{unchangedCount} 行未变化</span></div>}
      {versionA !== versionB ? (<div><div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5"><ArrowLeftRight className="size-3" />内容对比 (B → A)</div><DraftVersionDiff diffLines={diffLines} /></div>) : (<Card><CardContent className="py-6 text-center text-sm text-muted-foreground">请选择两个不同的版本进行对比</CardContent></Card>)}
    </div>
  )
}
