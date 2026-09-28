'use client'

/**
 * P0.5.3 — Draft Humanization Panel
 *
 * Provides AI味 detection and humanization preview/adopt workflow:
 * - Button to preview humanization (does NOT create draft)
 * - Side-by-side comparison of original vs humanized
 * - Display AI-style score and humanized score
 * - Changes list and detected issues
 * - Adopt / Dismiss actions
 *
 * Critical rule: Preview does NOT create a draft. Only "采用" creates a new
 * HUMANIZATION draft version.
 */

import { useState, useCallback } from 'react'
import { Sparkles, Loader2, Check, X, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Draft } from '@/generated/prisma'

// ── Types ────────────────────────────────────────────────────────────────

interface HumanizationChange {
  original: string
  revised: string
  reason: string
  type: string
}

interface HumanizationIssue {
  type: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

interface HumanizationPreview {
  content: string
  title?: string
  changes: HumanizationChange[]
  issues: HumanizationIssue[]
  aiStyleScore: number
  humanizedScore: number
}

interface DraftHumanizationPanelProps {
  activeDraft: Draft
  topicId: string
  platform?: string
}

// ── Component ────────────────────────────────────────────────────────────

export function DraftHumanizationPanel({
  activeDraft,
  platform,
}: DraftHumanizationPanelProps) {
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [preview, setPreview] = useState<HumanizationPreview | null>(null)
  const [isAdopting, setIsAdopting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = useCallback(async () => {
    setIsPreviewing(true)
    setError(null)
    try {
      const { previewHumanization } = await import('@/lib/services/server-actions')
      const result = await previewHumanization({
        content: activeDraft.content,
        title: activeDraft.title ?? undefined,
        platform,
      })

      if (result.success && result.content) {
        setPreview({
          content: result.content,
          title: result.title,
          changes: result.changes ?? [],
          issues: result.issues ?? [],
          aiStyleScore: result.aiStyleScore ?? 0,
          humanizedScore: result.humanizedScore ?? 0,
        })
      } else {
        setError(result.error ?? '预览失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '预览失败，请稍后重试')
    } finally {
      setIsPreviewing(false)
    }
  }, [activeDraft.content, activeDraft.title, platform])

  const handleAdopt = useCallback(async () => {
    if (!preview) return
    setIsAdopting(true)
    setError(null)
    try {
      const { adoptHumanizedDraft } = await import('@/lib/services/server-actions')
      const result = await adoptHumanizedDraft({
        sourceDraftId: activeDraft.id,
        topicId: activeDraft.topicId,
        content: preview.content,
        title: preview.title,
        aiStyleScore: preview.aiStyleScore,
        humanizedScore: preview.humanizedScore,
        changes: preview.changes,
        issues: preview.issues,
      })

      if (result.success) {
        // Clear preview after successful adopt
        setPreview(null)
        // Parent will handle router.refresh() via cross-tab sync or page refresh
        window.location.reload()
      } else {
        setError(result.error ?? '采用失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '采用失败，请稍后重试')
    } finally {
      setIsAdopting(false)
    }
  }, [preview, activeDraft.id, activeDraft.topicId])

  const handleDismiss = useCallback(() => {
    setPreview(null)
  }, [])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">人性化</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreview}
            disabled={isPreviewing || isAdopting}
            className="gap-1.5"
          >
            {isPreviewing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {preview ? '重新生成' : '生成去AI味版本'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Empty state */}
        {!preview && !error && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Sparkles className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-1">
              检测并去除 AI 味表达，让文案更自然
            </p>
            <p className="text-xs text-muted-foreground">
              预览不会修改原文，确认满意后可一键采用
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Preview result */}
        {preview && (
          <>
            {/* Scores */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground mb-1">AI味评分</div>
                <div className={cn(
                  'text-2xl font-bold',
                  preview.aiStyleScore > 50 ? 'text-amber-500' : 'text-green-500',
                )}>
                  {preview.aiStyleScore}
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
              <div className="flex-1 text-right">
                <div className="text-xs text-muted-foreground mb-1">人性化评分</div>
                <div className="text-2xl font-bold text-green-600">
                  {preview.humanizedScore}
                </div>
              </div>
            </div>

            {/* Changes detected */}
            {preview.changes.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-sm font-medium">
                  检测到 {preview.changes.length} 处模板化表达
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border p-2">
                  {preview.changes.slice(0, 5).map((change, i) => (
                    <div key={i} className="text-xs space-y-0.5">
                      <div className="flex items-start gap-1">
                        <span className="text-red-500 line-through shrink-0 max-w-[40%] truncate">
                          {change.original.slice(0, 30)}
                        </span>
                        <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                        <span className="text-green-600 shrink-0 max-w-[40%] truncate">
                          {change.revised.slice(0, 30)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {preview.changes.length > 5 && (
                    <div className="text-xs text-muted-foreground">
                      还有 {preview.changes.length - 5} 处...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Content preview */}
            <div className="space-y-1.5">
              <div className="text-sm font-medium">人性化预览</div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                {preview.content.slice(0, 500)}
                {preview.content.length > 500 && '...'}
              </div>
            </div>

            {/* Adopt / Dismiss buttons */}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAdopt}
                disabled={isAdopting}
                className="flex-1 gap-1.5"
              >
                {isAdopting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                采用人性化版本
              </Button>
              <Button
                variant="outline"
                onClick={handleDismiss}
                disabled={isAdopting}
                className="gap-1.5"
              >
                <X className="size-3.5" />
                取消
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}