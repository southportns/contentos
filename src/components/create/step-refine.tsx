'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Loader2, AlertCircle, PenLine, Sparkles, Wand2, Target,
  ChevronDown, ChevronRight, Check, Save, X, Edit3, RotateCcw,
  ArrowUp,
} from 'lucide-react'
// Note: PenLine is still used in the content preview header icon
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
import type { WritingDraft, RefineResult } from '@/hooks/use-workflow'

type RefineMode = 'tone_change' | 'hook_select' | 'title_select'

interface StepRefineProps {
  draft: WritingDraft
  refineData: RefineResult | null
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
  }) => Promise<RefineResult | null>
  onApplyRefine: (data: RefineResult) => void
  loading: boolean
  error: string | null
  platform?: string
  topic?: string
  selectedAngleTitle?: string
}

/**
 * 局部调整快捷提示词预设
 */
const LOCAL_EDIT_PRESETS = [
  '开头再吸引人一点',
  '结尾加点行动号召',
  '把第二段改得更口语化',
  '精简掉冗余表达',
  '加点情绪色彩',
  '节奏感更强一些',
  '把数据部分说得更通俗',
]

/**
 * 防御性处理：LLM 可能返回对象数组而非字符串数组
 * 将任意值安全地转为字符串
 */
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
    try {
      return JSON.stringify(obj)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

const MODE_TABS: Array<{ id: RefineMode; label: string; icon: typeof Wand2 }> = [
  { id: 'tone_change', label: '局部调整', icon: Sparkles },
  { id: 'hook_select', label: '黄金三秒', icon: Target },
  { id: 'title_select', label: '标题选定', icon: Wand2 },
]

export function StepRefine({
  draft,
  refineData,
  onRefine,
  onApplyRefine,
  loading,
  error,
  platform,
  topic,
  selectedAngleTitle,
}: StepRefineProps) {
  const [activeMode, setActiveMode] = useState<RefineMode>('tone_change')
  const [newTone, setNewTone] = useState('')
  const [editingContent, setEditingContent] = useState(false)
  const [editContentValue, setEditContentValue] = useState('')
  const [editTitleValue, setEditTitleValue] = useState('')
  const [selectedHookIdx, setSelectedHookIdx] = useState(0)
  const [selectedTitleIdx, setSelectedTitleIdx] = useState(0)
  const [expandedChanges, setExpandedChanges] = useState<string | null>(null)
  // 用于手动编辑保存后的本地内容覆盖
  const [manualContent, setManualContent] = useState<string | null>(null)
  const [manualTitle, setManualTitle] = useState<string | null>(null)

  // ── Auto-run states: 独立管理黄金三秒和标题选定的自动生成 ──
  // 由于 onRefine 回调会把结果存到全局 store 并互相覆盖，
  // 自动运行时在组件内部独立管理候选项，避免冲突。
  const [autoHookCandidates, setAutoHookCandidates] = useState<string[]>([])
  const [autoTitleCandidates, setAutoTitleCandidates] = useState<string[]>([])
  const [autoHookLoading, setAutoHookLoading] = useState(false)
  const [autoTitleLoading, setAutoTitleLoading] = useState(false)
  const [autoHookError, setAutoHookError] = useState<string | null>(null)
  const [autoTitleError, setAutoTitleError] = useState<string | null>(null)
  // 标记是否已自动运行过（防止 StrictMode 双调用重复请求）
  const autoRunStarted = useRef(false)

  // 进度条：钩子+标题合并生成（预估 2.5 分钟）
  const { progress: combinedProgress, stage: combinedStage, reset: resetCombinedProgress, complete: completeCombinedProgress } = useProgress(
    autoHookLoading && !autoTitleLoading,
    150_000,
  )
  // 进度条：单独标题生成（预估 1.5 分钟）
  const { progress: titleProgress, stage: titleStage, reset: resetTitleProgress, complete: completeTitleProgress } = useProgress(
    autoTitleLoading,
    90_000,
  )

  // 折叠状态：应用选中的标题/钩子后折叠收起
  const [hookCollapsed, setHookCollapsed] = useState(false)
  const [titleCollapsed, setTitleCollapsed] = useState(false)

  // Derived values: 优先使用手动编辑后的内容，其次 refineData，最后 draft
  const appliedContent = manualContent ?? refineData?.content ?? draft.content
  const appliedTitle = manualTitle ?? refineData?.title ?? draft.title
  const appliedHook = refineData?.hook ?? draft.hook

  // 防御性处理：确保候选项为字符串数组
  // 优先使用自动生成的候选项，其次使用 refineData 中的候选项
  const hookCandidates = useMemo(
    () => {
      const fromAuto = autoHookCandidates.map(safeString).filter((s) => s.length > 0)
      if (fromAuto.length > 0) return fromAuto
      return (refineData?.hookCandidates ?? []).map(safeString).filter((s) => s.length > 0)
    },
    [refineData, autoHookCandidates],
  )
  const titleCandidates = useMemo(
    () => {
      const fromAuto = autoTitleCandidates.map(safeString).filter((s) => s.length > 0)
      if (fromAuto.length > 0) return fromAuto
      return (refineData?.titleCandidates ?? []).map(safeString).filter((s) => s.length > 0)
    },
    [refineData, autoTitleCandidates],
  )

  // ── Auto-run: 进入精修后自动生成钩子和标题候选 ──
  // 使用合并模式单次调用，大幅减少等待时间
  const autoGenerateHooks = useCallback(async () => {
    setAutoHookLoading(true)
    setAutoHookError(null)
    resetCombinedProgress()
    try {
      const res = await fetch('/api/generation/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: appliedContent,
          title: appliedTitle,
          hook: appliedHook,
          wordCount: appliedContent.length,
          mode: 'hook_and_title_select',
          platform,
          topic,
          selectedAngleTitle,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '生成失败')
      // 标记进度完成
      completeCombinedProgress()
      // 同时设置钩子和标题候选项
      const hooks = (data.data?.hookCandidates ?? []).map(safeString).filter((s: string) => s.length > 0)
      const titles = (data.data?.titleCandidates ?? []).map(safeString).filter((s: string) => s.length > 0)
      setAutoHookCandidates(hooks)
      setAutoTitleCandidates(titles)
      // 标题生成完成
      setAutoTitleLoading(false)
    } catch (err) {
      setAutoHookError(err instanceof Error ? err.message : '未知错误')
      setAutoTitleError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setAutoHookLoading(false)
    }
  }, [appliedContent, appliedTitle, appliedHook, platform, topic, selectedAngleTitle, resetCombinedProgress, completeCombinedProgress])

  // 保留单独生成标题的函数（用于"重新生成"按钮）
  const autoGenerateTitles = useCallback(async () => {
    setAutoTitleLoading(true)
    setAutoTitleError(null)
    resetTitleProgress()
    try {
      const res = await fetch('/api/generation/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: appliedContent,
          title: appliedTitle,
          hook: appliedHook,
          wordCount: appliedContent.length,
          mode: 'title_select',
          platform,
          topic,
          selectedAngleTitle,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '生成标题失败')
      // 标记进度完成
      completeTitleProgress()
      const candidates = (data.data?.titleCandidates ?? []).map(safeString).filter((s: string) => s.length > 0)
      setAutoTitleCandidates(candidates)
    } catch (err) {
      setAutoTitleError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setAutoTitleLoading(false)
    }
  }, [appliedContent, appliedTitle, appliedHook, platform, topic, selectedAngleTitle, resetTitleProgress, completeTitleProgress])

  // 自动运行：组件挂载时且没有已存在的候选项时触发
  // 使用合并模式单次调用生成钩子和标题，避免两次 LLM 调用
  useEffect(() => {
    if (autoRunStarted.current) return
    // 如果已经有候选项（从 refineData 恢复），不需要自动生成
    const hasExistingHooks = (refineData?.hookCandidates ?? []).length > 0
    const hasExistingTitles = (refineData?.titleCandidates ?? []).length > 0
    if (hasExistingHooks && hasExistingTitles) return
    autoRunStarted.current = true
    // 单次调用同时生成钩子和标题
    autoGenerateHooks()
  }, [autoGenerateHooks, refineData?.hookCandidates, refineData?.titleCandidates])

  const autoLoading = autoHookLoading || autoTitleLoading

  // 局部修改模式：直接在当前内容里编辑和保存
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

  const handleCancelEdit = useCallback(() => {
    setEditingContent(false)
  }, [])

  const handleToneChange = useCallback(async () => {
    if (!newTone.trim()) return
    await onRefine({
      content: appliedContent,
      title: appliedTitle,
      hook: appliedHook,
      wordCount: appliedContent.length,
      mode: 'tone_change',
      toneChange: { newTone: newTone.trim() },
      platform,
      topic,
      selectedAngleTitle,
    })
  }, [appliedContent, appliedTitle, appliedHook, newTone, onRefine, platform, topic, selectedAngleTitle])

  const handleGenerateHooks = useCallback(async () => {
    // 手动重新生成时，同步更新自动状态
    setAutoHookCandidates([])
    await autoGenerateHooks()
  }, [autoGenerateHooks])

  const handleApplyHook = useCallback(async () => {
    const selectedHook = hookCandidates[selectedHookIdx]
    if (!selectedHook) return
    await onRefine({
      content: appliedContent,
      title: appliedTitle,
      hook: appliedHook,
      wordCount: appliedContent.length,
      mode: 'hook_select',
      hookSelect: { candidates: hookCandidates, selectedIndex: selectedHookIdx },
      platform,
      topic,
      selectedAngleTitle,
    })
    // 应用成功后折叠
    setHookCollapsed(true)
  }, [hookCandidates, selectedHookIdx, appliedContent, appliedTitle, appliedHook, onRefine, platform, topic, selectedAngleTitle])

  const handleGenerateTitles = useCallback(async () => {
    // 手动重新生成时，同步更新自动状态
    setAutoTitleCandidates([])
    await autoGenerateTitles()
  }, [autoGenerateTitles])

  const handleApplyTitle = useCallback(async () => {
    const selectedTitle = titleCandidates[selectedTitleIdx]
    if (!selectedTitle) return
    await onRefine({
      content: appliedContent,
      title: appliedTitle,
      hook: appliedHook,
      wordCount: appliedContent.length,
      mode: 'title_select',
      titleSelect: { candidates: titleCandidates, selectedIndex: selectedTitleIdx },
      platform,
      topic,
      selectedAngleTitle,
    })
    // 应用成功后折叠
    setTitleCollapsed(true)
  }, [titleCandidates, selectedTitleIdx, appliedContent, appliedTitle, appliedHook, onRefine, platform, topic, selectedAngleTitle])

  const handleApplyRefine = useCallback(() => {
    onApplyRefine({
      content: appliedContent,
      title: appliedTitle,
      hook: appliedHook,
      wordCount: appliedContent.length,
      changes: refineData?.changes || [],
      summary: refineData?.summary || (manualContent !== null ? '手动编辑' : '未修改'),
      hookCandidates: hookCandidates,
      titleCandidates: titleCandidates,
    })
  }, [appliedContent, appliedTitle, appliedHook, refineData, hookCandidates, titleCandidates, onApplyRefine, manualContent])

  return (
    <Card>
      <StepHeader step={5} title="初稿二次精修" active={true} done={false} />
      <CardContent className="flex flex-col gap-3">
        {/* Mode tabs */}
        <div className="flex flex-wrap gap-2">
          {MODE_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMode(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                  activeMode === tab.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Auto-generated results: 标题选定 + 黄金三秒 */}
        {(autoLoading || hookCandidates.length > 0 || titleCandidates.length > 0 || autoHookError || autoTitleError) && (
          <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ArrowUp className="size-4 text-primary" />
                <span className="text-sm font-medium">AI 智能推荐</span>
                {autoLoading && (
                  <Badge variant="secondary" className="text-xs">
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    生成中...
                  </Badge>
                )}
              </div>
              {/* 总进度条 */}
              {autoLoading && (
                <ProgressBar
                  progress={autoTitleLoading ? titleProgress : combinedProgress}
                  stage={autoTitleLoading ? titleStage : combinedStage}
                  variant="primary"
                />
              )}
            </div>

            {/* 标题候选 */}
            <div className="flex flex-col gap-2">
              {/* 单独生成标题时的进度条 */}
              {autoTitleLoading && (
                <ProgressBar
                  progress={titleProgress}
                  stage={titleStage}
                  variant="primary"
                  className="pb-1"
                />
              )}
              {titleCollapsed ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
                  <div className="flex items-center gap-2">
                    <Wand2 className="size-3.5 text-primary" />
                    <span className="text-xs font-medium">已应用标题：</span>
                    <span className="text-sm font-medium">{appliedTitle}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setTitleCollapsed(false)}
                  >
                    <ChevronDown className="size-3.5" />
                    展开
                  </Button>
                </div>
              ) : autoTitleLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wand2 className="size-3.5 text-primary" />
                  <Loader2 className="size-3 animate-spin" />
                  正在生成标题候选...
                </div>
              ) : autoTitleError ? (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="size-3" />
                  {autoTitleError}
                  <Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={autoGenerateTitles}>
                    重试
                  </Button>
                </div>
              ) : titleCandidates.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Wand2 className="size-3.5 text-primary" />
                      <span className="text-xs font-medium">标题候选</span>
                    </div>
                    {titleCollapsed === false && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-xs"
                        onClick={() => setTitleCollapsed(true)}
                      >
                        <ChevronDown className="size-3" />
                        收起
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {titleCandidates.map((title, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedTitleIdx(i)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-all',
                          selectedTitleIdx === i
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                            : 'border-border bg-background hover:bg-muted',
                        )}
                      >
                        <div className={cn(
                          'flex size-4 items-center justify-center rounded-full border text-[10px] font-bold',
                          selectedTitleIdx === i
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}>
                          {selectedTitleIdx === i ? <Check className="size-2.5" /> : i + 1}
                        </div>
                        <span className="font-medium">{title}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-end">
                    <Button
                      onClick={handleApplyTitle}
                      disabled={loading}
                      size="sm"
                      className="h-7"
                    >
                      {loading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      应用选中标题
                    </Button>
                  </div>
                </>
              ) : null}
            </div>

            {/* 钩子候选 */}
            <div className="flex flex-col gap-2">
              {/* 钩子+标题合并生成时的进度条（仅在合并模式加载钩子时显示） */}
              {autoHookLoading && !autoTitleLoading && (
                <ProgressBar
                  progress={combinedProgress}
                  stage={combinedStage}
                  variant="primary"
                  className="pb-1"
                />
              )}
              {hookCollapsed ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
                  <div className="flex items-center gap-2">
                    <Target className="size-3.5 text-primary" />
                    <span className="text-xs font-medium">已应用钩子：</span>
                    <span className="text-sm font-medium">{appliedHook}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setHookCollapsed(false)}
                  >
                    <ChevronDown className="size-3.5" />
                    展开
                  </Button>
                </div>
              ) : autoHookLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Target className="size-3.5 text-primary" />
                  <Loader2 className="size-3 animate-spin" />
                  正在生成钩子候选...
                </div>
              ) : autoHookError ? (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="size-3" />
                  {autoHookError}
                  <Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={autoGenerateHooks}>
                    重试
                  </Button>
                </div>
              ) : hookCandidates.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Target className="size-3.5 text-primary" />
                      <span className="text-xs font-medium">黄金三秒钩子候选</span>
                    </div>
                    {hookCollapsed === false && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-xs"
                        onClick={() => setHookCollapsed(true)}
                      >
                        <ChevronDown className="size-3" />
                        收起
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {hookCandidates.map((hook, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedHookIdx(i)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-all',
                          selectedHookIdx === i
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                            : 'border-border bg-background hover:bg-muted',
                        )}
                      >
                        <div className={cn(
                          'flex size-4 items-center justify-center rounded-full border text-[10px] font-bold',
                          selectedHookIdx === i
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}>
                          {selectedHookIdx === i ? <Check className="size-2.5" /> : i + 1}
                        </div>
                        <span>{hook}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-end">
                    <Button
                      onClick={handleApplyHook}
                      disabled={loading}
                      size="sm"
                      className="h-7"
                    >
                      {loading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      应用选中钩子
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Content preview / editor */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="size-4 text-primary" />
            <span className="text-sm font-medium">当前内容</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {appliedContent.length} 字
            </Badge>
            {editingContent ? (
              <>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  <X className="size-3.5" />
                  取消
                </Button>
                <Button size="sm" onClick={handleSaveEdit}>
                  <Save className="size-3.5" />
                  保存
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={handleStartEdit}>
                <Edit3 className="size-3.5" />
                编辑
              </Button>
            )}
          </div>
        </div>
        {editingContent ? (
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">标题</Label>
              <Input
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                className="text-sm font-medium"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">正文</Label>
              <Textarea
                value={editContentValue}
                onChange={(e) => setEditContentValue(e.target.value)}
                className="min-h-[200px] text-sm font-sans"
              />
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {editContentValue.length} 字
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium mb-2">{appliedTitle}</div>
            <MarkdownRenderer content={appliedContent} className="text-sm" />
          </div>
        )}

        {/* Mode-specific UI */}
        {activeMode === 'tone_change' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-xs font-medium">局部调整</div>
            <p className="text-xs text-muted-foreground">
              输入局部修改提示词，AI 将按提示词对内容进行局部调整，不改变总体内容方向
            </p>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">快捷提示词（点击填入）</Label>
              <div className="flex flex-wrap gap-2">
                {LOCAL_EDIT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setNewTone(preset)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-all',
                      newTone === preset
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">局部修改提示词</Label>
              <Textarea
                value={newTone}
                onChange={(e) => setNewTone(e.target.value)}
                placeholder="输入局部修改提示词，例如：开头再吸引人一点，加点悬念；结尾加一句行动号召；把第二段改得更口语化"
                className="min-h-[80px] text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleToneChange}
                disabled={loading || !newTone.trim()}
                size="sm"
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                局部调整
              </Button>
            </div>
          </div>
        )}

        {activeMode === 'hook_select' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-xs font-medium">黄金三秒钩子</div>
            <p className="text-xs text-muted-foreground">
              钩子候选已在上方自动生成，可在上方选择并应用。如需重新生成，点击下方按钮。
            </p>
            <div className="flex justify-end">
              <Button
                onClick={handleGenerateHooks}
                disabled={loading || autoHookLoading}
                variant="ghost"
                size="sm"
              >
                {loading || autoHookLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                重新生成钩子
              </Button>
            </div>
          </div>
        )}

        {activeMode === 'title_select' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-xs font-medium">短视频标题选定</div>
            <p className="text-xs text-muted-foreground">
              标题候选已在上方自动生成，可在上方选择并应用。如需重新生成，点击下方按钮。
            </p>
            <div className="flex justify-end">
              <Button
                onClick={handleGenerateTitles}
                disabled={loading || autoTitleLoading}
                variant="ghost"
                size="sm"
              >
                {loading || autoTitleLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                重新生成标题
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />{error}
          </div>
        )}

        {/* Changes log */}
        {refineData && refineData.changes.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="text-sm font-medium">修改记录</span>
              <Badge variant="secondary" className="text-xs">{refineData.changes.length} 处</Badge>
            </div>
            <div className="flex flex-col gap-1.5">
              {refineData.changes.map((change, i) => {
                const key = `${change.type}-${i}`
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <button
                      className="flex items-center gap-2 text-left"
                      onClick={() => setExpandedChanges(expandedChanges === key ? null : key)}
                    >
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

        {/* Apply button */}
        <Separator />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            确认精修结果，进入终稿输出
          </div>
          <Button onClick={handleApplyRefine} size="sm">
            <Check className="size-3.5" />
            确认精修完成
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
