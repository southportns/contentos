'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Loader2, AlertCircle, PenLine, Sparkles, Wand2, Target,
  ChevronDown, ChevronRight, Check, Save, X, Edit3, RotateCcw,
} from 'lucide-react'
// Note: PenLine is still used in the content preview header icon
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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

const TONE_PRESETS = [
  '温柔治愈',
  '犀利直接',
  '幽默风趣',
  '理性克制',
  '感性共鸣',
  '活力激昂',
  '娓娓道来',
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
  { id: 'tone_change', label: '语气修改', icon: Sparkles },
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

  // Derived values: 优先使用手动编辑后的内容，其次 refineData，最后 draft
  const appliedContent = manualContent ?? refineData?.content ?? draft.content
  const appliedTitle = manualTitle ?? refineData?.title ?? draft.title
  const appliedHook = refineData?.hook ?? draft.hook

  // 防御性处理：确保候选项为字符串数组
  const hookCandidates = useMemo(
    () => (refineData?.hookCandidates ?? []).map(safeString).filter((s) => s.length > 0),
    [refineData],
  )
  const titleCandidates = useMemo(
    () => (refineData?.titleCandidates ?? []).map(safeString).filter((s) => s.length > 0),
    [refineData],
  )

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
    await onRefine({
      content: appliedContent,
      title: appliedTitle,
      hook: appliedHook,
      wordCount: appliedContent.length,
      mode: 'hook_select',
      platform,
      topic,
      selectedAngleTitle,
    })
  }, [appliedContent, appliedTitle, appliedHook, onRefine, platform, topic, selectedAngleTitle])

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
  }, [hookCandidates, selectedHookIdx, appliedContent, appliedTitle, appliedHook, onRefine, platform, topic, selectedAngleTitle])

  const handleGenerateTitles = useCallback(async () => {
    await onRefine({
      content: appliedContent,
      title: appliedTitle,
      hook: appliedHook,
      wordCount: appliedContent.length,
      mode: 'title_select',
      platform,
      topic,
      selectedAngleTitle,
    })
  }, [appliedContent, appliedTitle, appliedHook, onRefine, platform, topic, selectedAngleTitle])

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
      <CardContent className="flex flex-col gap-4">
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
            <div className="text-xs font-medium">语气修改</div>
            <p className="text-xs text-muted-foreground">
              输入语气修改提示词，AI 将按提示词重新生成内容，不改变总体内容方向
            </p>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">快捷预设（点击填入）</Label>
              <div className="flex flex-wrap gap-2">
                {TONE_PRESETS.map((preset) => (
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
              <Label className="text-xs">语气修改提示词</Label>
              <Textarea
                value={newTone}
                onChange={(e) => setNewTone(e.target.value)}
                placeholder="输入详细的语气修改提示词，例如：把语气改成温柔治愈风，多用口语化表达，像朋友聊天一样，偶尔加些感叹和吐槽"
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
                重新生成
              </Button>
            </div>
          </div>
        )}

        {activeMode === 'hook_select' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-xs font-medium">黄金三秒钩子</div>
            <p className="text-xs text-muted-foreground">
              确定前3秒的钩子内容，抓住用户注意力
            </p>
            {hookCandidates.length === 0 ? (
              <div className="flex justify-end">
                <Button
                  onClick={handleGenerateHooks}
                  disabled={loading}
                  size="sm"
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Target className="size-3.5" />}
                  生成钩子候选
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {hookCandidates.map((hook, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedHookIdx(i)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all',
                        selectedHookIdx === i
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:bg-muted',
                      )}
                    >
                      <div className={cn(
                        'flex size-5 items-center justify-center rounded-full border text-xs font-bold',
                        selectedHookIdx === i
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}>
                        {selectedHookIdx === i ? <Check className="size-3" /> : i + 1}
                      </div>
                      <span>{hook}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    onClick={handleGenerateHooks}
                    disabled={loading}
                    variant="ghost"
                    size="sm"
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    重新生成
                  </Button>
                  <Button
                    onClick={handleApplyHook}
                    disabled={loading}
                    size="sm"
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    应用选中钩子
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {activeMode === 'title_select' && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-xs font-medium">短视频标题选定</div>
            <p className="text-xs text-muted-foreground">
              选择最合适的短视频标题
            </p>
            {titleCandidates.length === 0 ? (
              <div className="flex justify-end">
                <Button
                  onClick={handleGenerateTitles}
                  disabled={loading}
                  size="sm"
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  生成标题候选
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {titleCandidates.map((title, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedTitleIdx(i)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all',
                        selectedTitleIdx === i
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:bg-muted',
                      )}
                    >
                      <div className={cn(
                        'flex size-5 items-center justify-center rounded-full border text-xs font-bold',
                        selectedTitleIdx === i
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}>
                        {selectedTitleIdx === i ? <Check className="size-3" /> : i + 1}
                      </div>
                      <span className="font-medium">{title}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    onClick={handleGenerateTitles}
                    disabled={loading}
                    variant="ghost"
                    size="sm"
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    重新生成
                  </Button>
                  <Button
                    onClick={handleApplyTitle}
                    disabled={loading}
                    size="sm"
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    应用选中标题
                  </Button>
                </div>
              </>
            )}
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
