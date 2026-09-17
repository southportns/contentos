'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Loader2, AlertCircle, PenLine, Sparkles, Wand2, Target,
  ChevronDown, ChevronRight, Check, Save, X, Edit3, RotateCcw,
  ArrowUp, ClipboardCheck, CircleCheck, CircleAlert, Circle,
  Heart, User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ProgressBar, useProgress } from '@/components/ui/progress-bar'
import { StepHeader } from './step-header'
import { MarkdownRenderer } from './markdown-renderer'
import { cn } from '@/lib/utils'
import type { WritingDraft, RefineResult, EvaluationResult, RefineIssue, HumanizationState, Persona } from '@/hooks/use-workflow'
import { getHumanizationSourceLabel } from '@/lib/workflow/humanization-adapter'

type RefineMode = 'tone_change' | 'hook_select' | 'title_select' | 'issue_fix'

interface RefineRiskContext {
  overallRiskLevel?: 'safe' | 'low' | 'medium' | 'high'
  risks: Array<{
    id?: string
    category: string
    description?: string
    suggestion?: string
    severity?: 'high' | 'medium' | 'low'
  }>
}

interface RefineApprovedStrategyContext {
  title?: string
  keyArguments?: string[]
  emotionalArc?: { start?: string; middle?: string; end?: string }
  callToAction?: string
  tone?: string
  selectedAngleTitle?: string
}

interface IssueFixEvaluationContext {
  suggestions: Array<{
    id?: string
    section: string
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
  weaknesses: string[]
  scores?: {
    emotionalImpact?: number
    logicalClarity?: number
    novelty?: number
    readability?: number
    utility?: number
    platformFit?: number
  }
}

interface StepRefineProps {
  draft: WritingDraft
  refineData: RefineResult | null
  evaluation: EvaluationResult | null
  refineIssues: RefineIssue[]
  riskContext?: RefineRiskContext | null
  approvedStrategy?: RefineApprovedStrategyContext
  humanization: HumanizationState
  persona?: Persona | null
  onRefine: (input: {
    content: string
    title: string
    hook: string
    wordCount: number
    mode: RefineMode
    toneChange?: { newTone: string }
    hookSelect?: { candidates: string[]; selectedIndex: number }
    titleSelect?: { candidates: string[]; selectedIndex: number }
    platform?: string
    topic?: string
    selectedAngleTitle?: string
    evaluationContext?: IssueFixEvaluationContext
    riskContext?: RefineRiskContext
    approvedStrategy?: RefineApprovedStrategyContext
  }) => Promise<RefineResult | null>
  onApplyRefine: (data: RefineResult) => void
  onToggleIssue: (id: string) => void
  onResetIssueSelections: () => void
  onHumanize: (params: { manualContent: string | null; manualTitle: string | null }) => Promise<RefineResult | null>
  onAdoptHumanization: () => void
  onDismissHumanization: () => void
  loading: boolean
  error: string | null
  platform?: string
  topic?: string
  selectedAngleTitle?: string
}

const LOCAL_EDIT_PRESETS = [
  '开头再吸引人一点',
  '结尾加点行动号召',
  '把第二段改得更口语化',
  '精简掉冗余表达',
  '加点情绪色彩',
  '节奏感更强一些',
  '把数据部分说得更通俗',
]

function safeString(val: unknown): string {
  if (typeof val === 'string') return val
  if (val == null) return ''
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.title === 'string') return obj.title
    if (typeof obj.hook === 'string') return obj.hook
    if (typeof obj.value === 'string') return obj.value
    try { return JSON.stringify(obj) } catch { return String(val) }
  }
  return String(val)
}

const MODE_TABS: Array<{ id: RefineMode; label: string; icon: typeof Wand2 }> = [
  { id: 'tone_change', label: '局部调整', icon: Sparkles },
  { id: 'hook_select', label: '黄金三秒', icon: Target },
  { id: 'title_select', label: '标题选定', icon: Wand2 },
  { id: 'issue_fix', label: 'AI 问题修复', icon: ClipboardCheck },
]

export function StepRefine({
  draft, refineData, evaluation, refineIssues, riskContext, approvedStrategy,
  humanization, persona, onRefine, onApplyRefine, onToggleIssue, onResetIssueSelections,
  onHumanize, onAdoptHumanization, onDismissHumanization, loading, error, platform, topic, selectedAngleTitle,
}: StepRefineProps) {
  const [activeMode, setActiveMode] = useState<RefineMode>('tone_change')
  const [newTone, setNewTone] = useState('')
  const [editingContent, setEditingContent] = useState(false)
  const [editContentValue, setEditContentValue] = useState('')
  const [editTitleValue, setEditTitleValue] = useState('')
  const [selectedHookIdx, setSelectedHookIdx] = useState(0)
  const [selectedTitleIdx, setSelectedTitleIdx] = useState(0)
  const [expandedChanges, setExpandedChanges] = useState<string | null>(null)
  const [manualContent, setManualContent] = useState<string | null>(null)
  const [manualTitle, setManualTitle] = useState<string | null>(null)
  const [humanizationExpanded, setHumanizationExpanded] = useState(true)

  const [autoHookCandidates, setAutoHookCandidates] = useState<string[]>([])
  const [autoTitleCandidates, setAutoTitleCandidates] = useState<string[]>([])
  const [autoHookLoading, setAutoHookLoading] = useState(false)
  const [autoTitleLoading, setAutoTitleLoading] = useState(false)
  const [autoHookError, setAutoHookError] = useState<string | null>(null)
  const [autoTitleError, setAutoTitleError] = useState<string | null>(null)
  const autoRunStarted = useRef(false)

  const { progress: combinedProgress, stage: combinedStage, reset: resetCombinedProgress, complete: completeCombinedProgress } = useProgress(autoHookLoading && !autoTitleLoading, 150_000)
  const { progress: titleProgress, stage: titleStage, reset: resetTitleProgress, complete: completeTitleProgress } = useProgress(autoTitleLoading, 90_000)

  const [hookCollapsed, setHookCollapsed] = useState(false)
  const [titleCollapsed, setTitleCollapsed] = useState(false)

  const appliedContent = manualContent ?? refineData?.content ?? draft.content
  const appliedTitle = manualTitle ?? refineData?.title ?? draft.title
  const appliedHook = refineData?.hook ?? draft.hook

  const hookCandidates = useMemo(() => {
    const fromAuto = autoHookCandidates.map(safeString).filter((s) => s.length > 0)
    if (fromAuto.length > 0) return fromAuto
    return (refineData?.hookCandidates ?? []).map(safeString).filter((s) => s.length > 0)
  }, [refineData, autoHookCandidates])

  const titleCandidates = useMemo(() => {
    const fromAuto = autoTitleCandidates.map(safeString).filter((s) => s.length > 0)
    if (fromAuto.length > 0) return fromAuto
    return (refineData?.titleCandidates ?? []).map(safeString).filter((s) => s.length > 0)
  }, [refineData, autoTitleCandidates])

  const selectedIssues = useMemo(() => refineIssues.filter((i) => i.selected), [refineIssues])
  const humanizationSourceLabel = useMemo(() => getHumanizationSourceLabel(manualContent, refineData), [manualContent, refineData])

  const autoGenerateHooks = useCallback(async () => {
    setAutoHookLoading(true)
    setAutoHookError(null)
    resetCombinedProgress()
    try {
      const res = await fetch('/api/generation/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: appliedContent, title: appliedTitle, hook: appliedHook,
          wordCount: appliedContent.length, mode: 'hook_and_title_select',
          platform, topic, selectedAngleTitle,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '生成失败')
      completeCombinedProgress()
      const hooks = (data.data?.hookCandidates ?? []).map(safeString).filter((s: string) => s.length > 0)
      const titles = (data.data?.titleCandidates ?? []).map(safeString).filter((s: string) => s.length > 0)
      setAutoHookCandidates(hooks)
      setAutoTitleCandidates(titles)
      setAutoTitleLoading(false)
    } catch (err) {
      setAutoHookError(err instanceof Error ? err.message : '未知错误')
      setAutoTitleError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setAutoHookLoading(false)
    }
  }, [appliedContent, appliedTitle, appliedHook, platform, topic, selectedAngleTitle, resetCombinedProgress, completeCombinedProgress])

  const autoGenerateTitles = useCallback(async () => {
    setAutoTitleLoading(true)
    setAutoTitleError(null)
    resetTitleProgress()
    try {
      const res = await fetch('/api/generation/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: appliedContent, title: appliedTitle, hook: appliedHook,
          wordCount: appliedContent.length, mode: 'title_select',
          platform, topic, selectedAngleTitle,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '生成标题失败')
      completeTitleProgress()
      const candidates = (data.data?.titleCandidates ?? []).map(safeString).filter((s: string) => s.length > 0)
      setAutoTitleCandidates(candidates)
    } catch (err) {
      setAutoTitleError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setAutoTitleLoading(false)
    }
  }, [appliedContent, appliedTitle, appliedHook, platform, topic, selectedAngleTitle, resetTitleProgress, completeTitleProgress])

  useEffect(() => {
    if (autoRunStarted.current) return
    const hasExistingHooks = (refineData?.hookCandidates ?? []).length > 0
    const hasExistingTitles = (refineData?.titleCandidates ?? []).length > 0
    if (hasExistingHooks && hasExistingTitles) return
    autoRunStarted.current = true
    autoGenerateHooks()
  }, [autoGenerateHooks, refineData?.hookCandidates, refineData?.titleCandidates])

  const autoLoading = autoHookLoading || autoTitleLoading

  const handleStartEdit = useCallback(() => {
    setEditContentValue(appliedContent)
    setEditTitleValue(appliedTitle)
    setEditingContent(true)
  }, [appliedContent, appliedTitle])

  const handleSaveEdit = useCallback(() => {
    setManualContent(editContentValue)
    setManualTitle(editTitleValue)
    setEditingContent(false)
  }, [editContentValue, editTitleValue])

  const handleCancelEdit = useCallback(() => { setEditingContent(false) }, [])

  const handleToneChange = useCallback(async () => {
    if (!newTone.trim()) return
    await onRefine({
      content: appliedContent, title: appliedTitle, hook: appliedHook,
      wordCount: appliedContent.length, mode: 'tone_change',
      toneChange: { newTone: newTone.trim() }, platform, topic, selectedAngleTitle,
    })
  }, [appliedContent, appliedTitle, appliedHook, newTone, onRefine, platform, topic, selectedAngleTitle])

  const handleGenerateHooks = useCallback(async () => {
    setAutoHookCandidates([])
    await autoGenerateHooks()
  }, [autoGenerateHooks])

  const handleApplyHook = useCallback(async () => {
    const selectedHook = hookCandidates[selectedHookIdx]
    if (!selectedHook) return
    await onRefine({
      content: appliedContent, title: appliedTitle, hook: appliedHook,
      wordCount: appliedContent.length, mode: 'hook_select',
      hookSelect: { candidates: hookCandidates, selectedIndex: selectedHookIdx },
      platform, topic, selectedAngleTitle,
    })
    setHookCollapsed(true)
  }, [hookCandidates, selectedHookIdx, appliedContent, appliedTitle, appliedHook, onRefine, platform, topic, selectedAngleTitle])

  const handleGenerateTitles = useCallback(async () => {
    setAutoTitleCandidates([])
    await autoGenerateTitles()
  }, [autoGenerateTitles])

  const handleApplyTitle = useCallback(async () => {
    const selectedTitle = titleCandidates[selectedTitleIdx]
    if (!selectedTitle) return
    await onRefine({
      content: appliedContent, title: appliedTitle, hook: appliedHook,
      wordCount: appliedContent.length, mode: 'title_select',
      titleSelect: { candidates: titleCandidates, selectedIndex: selectedTitleIdx },
      platform, topic, selectedAngleTitle,
    })
    setTitleCollapsed(true)
  }, [titleCandidates, selectedTitleIdx, appliedContent, appliedTitle, appliedHook, onRefine, platform, topic, selectedAngleTitle])

  const handleIssueFix = useCallback(async () => {
    if (selectedIssues.length === 0) return
    const evalContext: IssueFixEvaluationContext = {
      suggestions: selectedIssues.map((issue) => ({
        id: issue.id, section: issue.section, issue: issue.issue,
        suggestion: issue.suggestion, priority: issue.priority,
      })),
      weaknesses: evaluation?.weaknesses ?? [],
      scores: evaluation ? {
        emotionalImpact: evaluation.scores.emotionalImpact,
        logicalClarity: evaluation.scores.logicalClarity,
        novelty: evaluation.scores.novelty,
        readability: evaluation.scores.readability,
        utility: evaluation.scores.utility,
        platformFit: evaluation.scores.platformFit,
      } : undefined,
    }
    const strategyCtx: RefineApprovedStrategyContext | undefined = approvedStrategy ? {
      title: approvedStrategy.title, keyArguments: approvedStrategy.keyArguments,
      emotionalArc: approvedStrategy.emotionalArc, callToAction: approvedStrategy.callToAction,
      tone: approvedStrategy.tone, selectedAngleTitle: approvedStrategy.selectedAngleTitle,
    } : undefined
    const riskCtx: RefineRiskContext | undefined = riskContext ? {
      overallRiskLevel: riskContext.overallRiskLevel, risks: riskContext.risks,
    } : undefined
    await onRefine({
      content: appliedContent, title: appliedTitle, hook: appliedHook,
      wordCount: appliedContent.length, mode: 'issue_fix',
      platform, topic, selectedAngleTitle,
      evaluationContext: evalContext, riskContext: riskCtx, approvedStrategy: strategyCtx,
    })
  }, [selectedIssues, evaluation, approvedStrategy, riskContext, appliedContent, appliedTitle, appliedHook, onRefine, platform, topic, selectedAngleTitle])

  const handleHumanize = useCallback(async () => {
    await onHumanize({ manualContent, manualTitle })
  }, [onHumanize, manualContent, manualTitle])

  const handleApplyRefine = useCallback(() => {
    onApplyRefine({
      content: appliedContent, title: appliedTitle, hook: appliedHook,
      wordCount: appliedContent.length, changes: refineData?.changes || [],
      summary: refineData?.summary || (manualContent !== null ? '手动编辑' : '未修改'),
      hookCandidates: hookCandidates, titleCandidates: titleCandidates,
    })
  }, [appliedContent, appliedTitle, appliedHook, refineData, hookCandidates, titleCandidates, onApplyRefine, manualContent])

  return (
    <Card>
      <StepHeader step={5} title="初稿二次精修" active={true} done={false} />
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {MODE_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveMode(tab.id)} className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all', activeMode === tab.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted')}>
                <Icon className="size-3.5" />{tab.label}
              </button>
            )
          })}
        </div>

        {evaluation && refineIssues.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <div className="flex items-center gap-2">
              <CircleAlert className="size-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium">AI 评估发现的问题</span>
              <Badge variant="outline" className="text-xs">{refineIssues.filter((i) => i.selected).length}/{refineIssues.length} 已选</Badge>
            </div>
            <p className="text-xs text-muted-foreground">选择需要修复的问题，然后点击下方按钮一键修复。已解决的问题会标记为绿色。</p>
            <div className="flex flex-col gap-1.5">
              {refineIssues.map((issue) => (
                <button key={issue.id} onClick={() => onToggleIssue(issue.id)} disabled={issue.resolved} className={cn('flex items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition-all', issue.resolved ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30' : issue.selected ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border bg-background hover:bg-muted')}>
                  <div className="mt-0.5">
                    {issue.resolved ? <CircleCheck className="size-4 text-green-500" /> : issue.selected ? <Check className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground" />}
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium', issue.resolved && 'line-through text-muted-foreground')}>{issue.issue}</span>
                      <Badge variant={issue.priority === 'high' ? 'destructive' : issue.priority === 'medium' ? 'default' : 'secondary'} className="text-[10px] h-4">{issue.priority}</Badge>
                    </div>
                    {issue.suggestion && <span className="text-xs text-muted-foreground line-clamp-2">{issue.suggestion}</span>}
                    {issue.section && <span className="text-[10px] text-muted-foreground">段落: {issue.section}</span>}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onResetIssueSelections}>
                <RotateCcw className="size-3" />重置选择
              </Button>
              <Button onClick={handleIssueFix} disabled={loading || selectedIssues.length === 0} size="sm">
                {loading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                修复选中问题 ({selectedIssues.length})
              </Button>
            </div>
            {refineData?.resolvedIssues && refineData.resolvedIssues.length > 0 && (
              <div className="flex flex-col gap-1 pt-2 border-t border-amber-200/50 dark:border-amber-800/50">
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <CircleCheck className="size-3.5" />已解决 {refineData.resolvedIssues.length} 个问题
                </div>
                <div className="flex flex-col gap-0.5">
                  {refineData.resolvedIssues.map((r, i) => (
                    <div key={i} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{r.issueId}:</span> {r.resolution}</div>
                  ))}
                </div>
              </div>
            )}
            {refineData?.unresolvedIssues && refineData.unresolvedIssues.length > 0 && (
              <div className="flex flex-col gap-1 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <CircleAlert className="size-3.5" />未解决 {refineData.unresolvedIssues.length} 个问题
                </div>
                <div className="flex flex-col gap-0.5">
                  {refineData.unresolvedIssues.map((r, i) => (
                    <div key={i} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{r.issueId}:</span> {r.reason}</div>
                  ))}
                </div>
              </div>
            )}
            {refineData?.preservedElements && refineData.preservedElements.length > 0 && (
              <div className="flex flex-col gap-1 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                  <Heart className="size-3.5" />已保留元素
                </div>
                <div className="flex flex-col gap-0.5">
                  {refineData.preservedElements.map((p, i) => (
                    <div key={i} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{p.element}:</span> {p.reason}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(autoLoading || hookCandidates.length > 0 || titleCandidates.length > 0 || autoHookError || autoTitleError) && (
          <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ArrowUp className="size-4 text-primary" />
                <span className="text-sm font-medium">AI 智能推荐</span>
                {autoLoading && <Badge variant="secondary" className="text-xs"><Loader2 className="mr-1 size-3 animate-spin" />生成中...</Badge>}
              </div>
              {autoLoading && <ProgressBar progress={autoTitleLoading ? titleProgress : combinedProgress} stage={autoTitleLoading ? titleStage : combinedStage} variant="primary" />}
            </div>
            <div className="flex flex-col gap-2">
              {autoTitleLoading && <ProgressBar progress={titleProgress} stage={titleStage} variant="primary" className="pb-1" />}
              {titleCollapsed ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
                  <div className="flex items-center gap-2">
                    <Wand2 className="size-3.5 text-primary" /><span className="text-xs font-medium">已应用标题：</span><span className="text-sm font-medium">{appliedTitle}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setTitleCollapsed(false)}><ChevronDown className="size-3.5" />展开</Button>
                </div>
              ) : autoTitleLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wand2 className="size-3.5 text-primary" /><Loader2 className="size-3 animate-spin" />正在生成标题候选...</div>
              ) : autoTitleError ? (
                <div className="flex items-center gap-2 text-xs text-destructive"><AlertCircle className="size-3" />{autoTitleError}<Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={autoGenerateTitles}>重试</Button></div>
              ) : titleCandidates.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><Wand2 className="size-3.5 text-primary" /><span className="text-xs font-medium">标题候选</span></div>
                    {titleCollapsed === false && <Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={() => setTitleCollapsed(true)}><ChevronDown className="size-3" />收起</Button>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {titleCandidates.map((title, i) => (
                      <button key={i} onClick={() => setSelectedTitleIdx(i)} className={cn('flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-all', selectedTitleIdx === i ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border bg-background hover:bg-muted')}>
                        <div className={cn('flex size-4 items-center justify-center rounded-full border text-[10px] font-bold', selectedTitleIdx === i ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                          {selectedTitleIdx === i ? <Check className="size-2.5" /> : i + 1}
                        </div>
                        <span className="font-medium">{title}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-end">
                    <Button onClick={handleApplyTitle} disabled={loading} size="sm" className="h-7">
                      {loading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}应用选中标题
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              {autoHookLoading && !autoTitleLoading && <ProgressBar progress={combinedProgress} stage={combinedStage} variant="primary" className="pb-1" />}
              {hookCollapsed ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
                  <div className="flex items-center gap-2"><Target className="size-3.5 text-primary" /><span className="text-xs font-medium">已应用钩子：</span><span className="text-sm font-medium">{appliedHook}</span></div>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setHookCollapsed(false)}><ChevronDown className="size-3.5" />展开</Button>
                </div>
              ) : autoHookLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Target className="size-3.5 text-primary" /><Loader2 className="size-3 animate-spin" />正在生成钩子候选...</div>
              ) : autoHookError ? (
                <div className="flex items-center gap-2 text-xs text-destructive"><AlertCircle className="size-3" />{autoHookError}<Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={autoGenerateHooks}>重试</Button></div>
              ) : hookCandidates.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><Target className="size-3.5 text-primary" /><span className="text-xs font-medium">黄金三秒钩子候选</span></div>
                    {hookCollapsed === false && <Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={() => setHookCollapsed(true)}><ChevronDown className="size-3" />收起</Button>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {hookCandidates.map((hook, i) => (
                      <button key={i} onClick={() => setSelectedHookIdx(i)} className={cn('flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-all', selectedHookIdx === i ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border bg-background hover:bg-muted')}>
                        <div className={cn('flex size-4 items-center justify-center rounded-full border text-[10px] font-bold', selectedHookIdx === i ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                          {selectedHookIdx === i ? <Check className="size-2.5" /> : i + 1}
                        </div>
                        <span>{hook}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-end">
                    <Button onClick={handleApplyHook} disabled={loading} size="sm" className="h-7">
                      {loading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}应用选中钩子
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><PenLine className="size-4 text-primary" /><span className="text-sm font-medium">当前内容</span></div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{appliedContent.length} 字</Badge>
            {editingContent ? (
              <>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}><X className="size-3.5" />取消</Button>
                <Button size="sm" onClick={handleSaveEdit}><Save className="size-3.5" />保存</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={handleStartEdit}><Edit3 className="size-3.5" />编辑</Button>
            )}
          </div>
        </div>
        {editingContent ? (
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-col gap-1"><Label className="text-xs">标题</Label><Input value={editTitleValue} onChange={(e) => setEditTitleValue(e.target.value)} className="text-sm font-medium" /></div>
            <div className="flex flex-col gap-1"><Label className="text-xs">正文</Label><Textarea value={editContentValue} onChange={(e) => setEditContentValue(e.target.value)} className="min-h-[200px] text-sm font-sans" /></div>
            <div className="text-xs text-muted-foreground text-right">{editContentValue.length} 字</div>
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium mb-2">{appliedTitle}</div>
            <MarkdownRenderer content={appliedContent} className="text-sm" />
          </div>
        )}

        {activeMode === 'tone_change' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-xs font-medium">局部调整</div>
            <p className="text-xs text-muted-foreground">输入局部修改提示词，AI 将按提示词对内容进行局部调整，不改变总体内容方向</p>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">快捷提示词（点击填入）</Label>
              <div className="flex flex-wrap gap-2">
                {LOCAL_EDIT_PRESETS.map((preset) => (
                  <button key={preset} onClick={() => setNewTone(preset)} className={cn('rounded-full border px-3 py-1 text-xs transition-all', newTone === preset ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>{preset}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">局部修改提示词</Label>
              <Textarea value={newTone} onChange={(e) => setNewTone(e.target.value)} placeholder="输入局部修改提示词" className="min-h-[80px] text-sm" />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleToneChange} disabled={loading || !newTone.trim()} size="sm">
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}局部调整
              </Button>
            </div>
          </div>
        )}

        {activeMode === 'hook_select' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-xs font-medium">黄金三秒钩子</div>
            <p className="text-xs text-muted-foreground">钩子候选已在上方自动生成，可在上方选择并应用。</p>
            <div className="flex justify-end">
              <Button onClick={handleGenerateHooks} disabled={loading || autoHookLoading} variant="ghost" size="sm">
                {loading || autoHookLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}重新生成钩子
              </Button>
            </div>
          </div>
        )}

        {activeMode === 'title_select' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-xs font-medium">短视频标题选定</div>
            <p className="text-xs text-muted-foreground">标题候选已在上方自动生成，可在上方选择并应用。</p>
            <div className="flex justify-end">
              <Button onClick={handleGenerateTitles} disabled={loading || autoTitleLoading} variant="ghost" size="sm">
                {loading || autoTitleLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}重新生成标题
              </Button>
            </div>
          </div>
        )}

        {error && <div className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" />{error}</div>}

        {refineData && refineData.changes.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><span className="text-sm font-medium">修改记录</span><Badge variant="secondary" className="text-xs">{refineData.changes.length} 处</Badge></div>
            <div className="flex flex-col gap-1.5">
              {refineData.changes.map((change, i) => {
                const key = `${change.type}-${i}`
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <button className="flex items-center gap-2 text-left" onClick={() => setExpandedChanges(expandedChanges === key ? null : key)}>
                      {expandedChanges === key ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      <Badge variant="secondary" className="text-xs">{change.type}</Badge>
                      <span className="text-sm">{change.revised.slice(0, 40)}{change.revised.length > 40 ? '...' : ''}</span>
                    </button>
                    {expandedChanges === key && (
                      <div className="ml-6 flex flex-col gap-0.5 text-xs text-muted-foreground">
                        <div><span className="font-medium text-foreground">原文：</span> {change.original}</div>
                        <div><span className="font-medium text-foreground">修改后：</span> {change.revised}</div>
                        <div><span className="font-medium text-foreground">原因：</span> {change.reason}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <Separator />
        <div className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-800 dark:bg-violet-950/20">
          <div className="flex items-center gap-2"><Sparkles className="size-4 text-violet-600 dark:text-violet-400" /><span className="text-sm font-medium">真人化表达</span></div>
          <p className="text-xs text-muted-foreground">让文字更像真人自然表达，减少 AI 味。保留原意，不改变核心内容。</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {persona && <div className="flex items-center gap-1"><User className="size-3" /><span>Persona: <span className="font-medium text-foreground">{persona.name}</span></span></div>}
            {platform && <div className="flex items-center gap-1"><Badge variant="outline" className="text-[10px] h-4">{platform}</Badge><span>来源: <span className="font-medium text-foreground">{humanizationSourceLabel}</span></span></div>}
            {!persona && !platform && <div className="flex items-center gap-1"><span>来源: <span className="font-medium text-foreground">{humanizationSourceLabel}</span></span></div>}
          </div>
          <div className="flex items-center gap-2">
            {humanization.status === 'idle' && <Button onClick={handleHumanize} disabled={loading} size="sm" variant="outline" className="border-violet-300 dark:border-violet-700"><Sparkles className="size-3.5" />生成真人化版本</Button>}
            {humanization.status === 'loading' && <Button disabled size="sm" variant="outline"><Loader2 className="size-3.5 animate-spin" />正在真人化...</Button>}
            {humanization.status === 'success' && <Button onClick={handleHumanize} disabled={loading} size="sm" variant="outline" className="border-violet-300 dark:border-violet-700"><RotateCcw className="size-3.5" />重新生成真人化版本</Button>}
            {humanization.status === 'error' && <Button onClick={handleHumanize} disabled={loading} size="sm" variant="outline" className="border-violet-300 dark:border-violet-700"><RotateCcw className="size-3.5" />重试真人化</Button>}
            {humanization.adopted && <Badge variant="default" className="text-xs bg-violet-600"><Check className="mr-1 size-3" />已采用</Badge>}
          </div>
          {humanization.status === 'success' && humanization.result && (
            <div className="flex flex-col gap-3 mt-1 rounded-lg border border-violet-200 bg-background p-3 dark:border-violet-800">
              <button onClick={() => setHumanizationExpanded(!humanizationExpanded)} className="flex items-center gap-2 text-left">
                {humanizationExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                <span className="text-xs font-medium">真人化结果</span>
              </button>
              {humanizationExpanded && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">原稿内容</div>
                      <div className="text-xs text-muted-foreground rounded border border-muted p-2 max-h-24 overflow-y-auto">
                        {humanization.result.changes.length > 0 ? humanization.result.changes.filter((c) => c.type === 'humanization').map((c, i) => (
                          <div key={i} className="py-0.5"><span className="line-through text-destructive/70">{c.original}</span></div>
                        )) : <span>完整内容已更新</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="text-[10px] font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">真人化表达</div>
                      <div className="text-sm font-medium rounded border border-violet-200 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/30 p-3 max-h-48 overflow-y-auto">
                        <MarkdownRenderer content={humanization.result.content} className="text-sm" />
                      </div>
                    </div>
                  </div>
                  {humanization.result.changes.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">修改详情</div>
                      <div className="flex flex-col gap-1">
                        {humanization.result.changes.map((change, i) => (
                          <div key={i} className="flex flex-col gap-0.5 text-xs rounded border-border border p-2">
                            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px] h-4">{change.type}</Badge><span className="text-muted-foreground">{change.reason}</span></div>
                            {change.original && change.revised && (
                              <div className="flex flex-col gap-0.5 mt-1">
                                <div className="text-destructive/70 line-through">{change.original}</div>
                                <div className="text-green-700 dark:text-green-400">{change.revised}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!humanization.adopted && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button variant="ghost" size="sm" onClick={onDismissHumanization}><X className="size-3" />保留当前版本</Button>
                      <Button size="sm" onClick={onAdoptHumanization} className="bg-violet-600 hover:bg-violet-700"><Check className="size-3" />采用此版本</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <Separator />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">确认精修结果，进入终稿输出</div>
          <Button onClick={handleApplyRefine} size="sm"><Check className="size-3.5" />确认精修完成</Button>
        </div>
      </CardContent>
    </Card>
  )
}
