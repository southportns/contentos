'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ChevronRight, Star, ArrowLeftRight, ArrowLeft, GitBranch, ArrowDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Draft, Evaluation, Humanization, StrategyEvaluation } from '@/generated/prisma'
import { getVersionLabel, getVersionBadgeVariant, getChangeTypeLabel, getParentDraft, getChildDrafts, getLineageChain, getActiveDraft } from './draft-version-utils'
import { useActiveDraftSync, broadcastActiveDraftChange } from './use-active-draft-sync'
import { DraftVersionCompare } from './draft-version-compare'
import { DraftVersionRestoreButton } from './draft-version-restore-button'
import { Separator } from '@/components/ui/separator'

interface DraftVersionHistoryProps {
  drafts: Array<Draft & {
    evaluation: Evaluation | null
    humanization: Humanization | null
    strategyEvaluation: StrategyEvaluation | null
    parentDraftId?: string | null
  }>
  activeDraftId?: string | null
  topicId?: string
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

export function DraftVersionHistory({ drafts, activeDraftId, topicId }: DraftVersionHistoryProps) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'detail' | 'compare'>('detail')
  const [selectedVersion, setSelectedVersion] = useState<number>(() => {
    // P0.4.8 — Initialize selected version to the active draft's version
    if (activeDraftId && drafts.length > 0) {
      const active = drafts.find(d => d.id === activeDraftId)
      if (active) return active.version
    }
    return drafts[0]?.version ?? 1
  })
  // P0.4.9 — Local active draft state (synced from server or remote tabs)
  const [localActiveDraftId, setLocalActiveDraftId] = useState<string | null | undefined>(activeDraftId)

  // P0.4.9 — Sync server prop to local state (server is source of truth)
  // Intentional: per React docs for syncing props that can also be
  // updated by external systems (BroadcastChannel from other tabs)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalActiveDraftId(activeDraftId)
  }, [activeDraftId])

  // P0.4.9 — Listen for active draft changes from other tabs
  const { sourceId } = useActiveDraftSync({
    topicId,
    currentDraftId: localActiveDraftId,
    onRemoteChange: (draftId) => {
      setLocalActiveDraftId(draftId)
      const newActiveDraft = drafts.find(d => d.id === draftId)
      if (newActiveDraft) {
        setSelectedVersion(newActiveDraft.version)
      }
      // P0.4.9.1: If draft not found (remote Restore case),
      // the useEffect below will sync selectedVersion after router.refresh()
      router.refresh()
    },
  })

  // P0.4.9.1 — Sync selectedVersion when localActiveDraftId changes and
  // the corresponding draft is available in the drafts array.
  // Handles the remote Restore case: the new draft may not be in `drafts`
  // when onRemoteChange fires, but after router.refresh() updates props.
  // Intentional: guarded by selectedVersion inequality check to prevent loops
  useEffect(() => {
    if (!localActiveDraftId) return
    const activeDraft = drafts.find(d => d.id === localActiveDraftId)
    if (activeDraft && selectedVersion !== activeDraft.version) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedVersion(activeDraft.version)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, localActiveDraftId])

  // P0.4.8 — Track whether "set as current" is in progress
  const [settingActive, setSettingActive] = useState(false)

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.version === selectedVersion) ?? drafts[0],
    [drafts, selectedVersion]
  )

  // P0.4.5 — Build a map from draft ID to version number for lineage display
  const versionById = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of drafts) {
      map.set(d.id, d.version)
    }
    return map
  }, [drafts])

  // P0.4.7 — Lineage relationships
  const parentDraft = useMemo(
    () => selectedDraft ? getParentDraft(selectedDraft, drafts) : null,
    [selectedDraft, drafts]
  )
  const childDrafts = useMemo(
    () => selectedDraft ? getChildDrafts(selectedDraft, drafts) : [],
    [selectedDraft, drafts]
  )
  const lineageChain = useMemo(
    () => selectedDraft ? getLineageChain(selectedDraft, drafts) : [],
    [selectedDraft, drafts]
  )
  const childCountsById = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of drafts) {
      if (d.parentDraftId) {
        map.set(d.parentDraftId, (map.get(d.parentDraftId) ?? 0) + 1)
      }
    }
    return map
  }, [drafts])

  // P0.4.8 — Active draft resolution (P0.4.9: use local state)
  const activeDraft = useMemo(
    () => getActiveDraft(drafts, localActiveDraftId),
    [drafts, localActiveDraftId]
  )

  const handleRestoreSuccess = (newVersion: number) => {
    // Set the new version immediately; router.refresh() will refetch data
    setSelectedVersion(newVersion)
    router.refresh()
  }

  // P0.4.8 — Set a draft as the current working version
  const handleSetActiveDraft = async (draftId: string) => {
    if (!topicId) return
    setSettingActive(true)
    try {
      const { setActiveDraft } = await import('@/lib/services/server-actions')
      const result = await setActiveDraft(topicId, draftId)
      if (result.success) {
        // P0.4.9: Update local state immediately for responsive UI
        setLocalActiveDraftId(draftId)
        // P0.4.9: Auto-select the new active draft's version
        const newActiveDraft = drafts.find(d => d.id === draftId)
        if (newActiveDraft) {
          setSelectedVersion(newActiveDraft.version)
        }
        // P0.4.9: Broadcast to other tabs ONLY after DB success
        broadcastActiveDraftChange(topicId, draftId, sourceId)
        router.refresh()
      } else {
        console.error('[P0.4.8] setActiveDraft failed:', result.error)
      }
    } finally {
      setSettingActive(false)
    }
  }

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
                    {/* P0.4.8 — Active Draft indicator */}
                    {activeDraft && draft.id === activeDraft.id && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">当前</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{formatDate(draft.createdAt)}</span>
                    {draft.wordCount && <span className="text-xs text-muted-foreground">{draft.wordCount}字</span>}
                  </div>
                  {/* P0.4.5/P0.4.6 — Lineage + Evolution indicator */}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {draft.changeType === 'INITIAL' ? (
                      <span>{getChangeTypeLabel(draft.changeType)}</span>
                    ) : draft.parentDraftId && versionById.has(draft.parentDraftId) ? (
                      <span>{getChangeTypeLabel(draft.changeType)} · 由 v{versionById.get(draft.parentDraftId)} 创建</span>
                    ) : (
                      <span>{getChangeTypeLabel(draft.changeType)}</span>
                    )}
                  </div>
                  {/* P0.4.7 — Branch hint in version list */}
                  {(childCountsById.get(draft.id) ?? 0) > 0 && (
                    <div className="text-xs text-blue-500 mt-0.5 flex items-center gap-1">
                      <GitBranch className="size-3" />
                      {childCountsById.get(draft.id)} 个派生版本
                    </div>
                  )}
                  {/* P0.4.8 — Set as active draft button */}
                  {activeDraft && draft.id !== activeDraft.id && topicId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] px-1.5 mt-0.5 text-blue-600 hover:text-blue-700"
                      onClick={(e) => { e.stopPropagation(); handleSetActiveDraft(draft.id) }}
                      disabled={settingActive}
                    >
                      设为当前版本
                    </Button>
                  )}
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
            {/* P0.4.6 — Version Evolution Metadata */}
            <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground">版本演化</h4>
              <div className="text-xs text-muted-foreground">
                类型：{getChangeTypeLabel(selectedDraft.changeType)}
              </div>
              {selectedDraft.changeReason && (
                <div className="text-xs text-muted-foreground">
                  原因：{selectedDraft.changeReason}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {selectedDraft.parentDraftId && versionById.has(selectedDraft.parentDraftId) ? (
                  <span>来源：由 v{versionById.get(selectedDraft.parentDraftId)} 创建</span>
                ) : (
                  <span>初始版本</span>
                )}
              </div>
            </div>
            {/* P0.4.7 — Lineage Explorer */}
            <div className="rounded-lg bg-muted/30 p-3 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">版本谱系</h4>
              {/* Lineage chain visualization */}
              {lineageChain.length > 1 && (
                <div className="flex flex-col items-center gap-0.5 py-1">
                  {lineageChain.map((ancestor, idx) => (
                    <div key={ancestor.id} className="flex flex-col items-center">
                      <button
                        onClick={() => setSelectedVersion(ancestor.version)}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded',
                          ancestor.version === selectedDraft.version
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer'
                        )}
                      >
                        v{ancestor.version}
                      </button>
                      {idx < lineageChain.length - 1 && (
                        <ArrowDown className="size-3 text-muted-foreground my-0.5" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Parent navigation */}
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  {parentDraft ? (
                    <button
                      onClick={() => setSelectedVersion(parentDraft.version)}
                      className="text-blue-600 hover:underline cursor-pointer"
                    >
                      ← 来源版本：v{parentDraft.version} ({getChangeTypeLabel(parentDraft.changeType)})
                    </button>
                  ) : selectedDraft.parentDraftId ? (
                    <span className="text-muted-foreground">来源版本已不存在</span>
                  ) : (
                    <span>初始版本</span>
                  )}
                </div>
              </div>
              {/* Child navigation */}
              {childDrafts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">派生版本</div>
                  <div className="flex flex-wrap gap-1.5">
                    {childDrafts.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => setSelectedVersion(child.version)}
                        className="text-xs px-2 py-1 rounded-md bg-background border hover:bg-accent transition-colors cursor-pointer"
                      >
                        v{child.version} · {getChangeTypeLabel(child.changeType)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* No children state */}
              {childDrafts.length === 0 && (
                <div className="text-xs text-muted-foreground">暂无派生版本</div>
              )}
            </div>
            <div className="rounded-lg bg-muted/30 p-4"><p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{selectedDraft.content}</p></div>
            <EvaluationSection evaluation={selectedDraft.evaluation} />
            <StrategyEvaluationSection strategyEvaluation={selectedDraft.strategyEvaluation} />
            <HumanizationSection humanization={selectedDraft.humanization} />
            {selectedDraft.evaluation == null && selectedDraft.strategyEvaluation == null && selectedDraft.humanization == null && (
              <p className="text-sm text-muted-foreground text-center py-2">暂无分析数据</p>
            )}
            <Separator />
            <div className="flex justify-end">
              <DraftVersionRestoreButton
                draftId={selectedDraft.id}
                version={selectedDraft.version}
                onRestoreSuccess={handleRestoreSuccess}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
