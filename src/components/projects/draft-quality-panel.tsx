'use client'

/**
 * P0.5.3 — Draft Quality Panel
 *
 * Displays evaluation results for the active draft:
 * - Overall score with 6-dimension score grid
 * - Strengths, issues, and suggestions
 * - Re-evaluate button
 *
 * Pure presentation: state managed by parent, evaluation triggered via callback.
 */

import { useState, useCallback } from 'react'
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Draft } from '@/generated/prisma'

// ── Types ────────────────────────────────────────────────────────────────

interface ScoreDimension {
  label: string
  value: number
}

interface Suggestion {
  section: string
  issue: string
  suggestion: string
  priority: 'high' | 'medium' | 'low'
}

interface EvaluationData {
  overallScore?: number
  emotionalImpactScore?: number
  logicalClarityScore?: number
  noveltyScore?: number
  readabilityScore?: number
  utilityScore?: number
  platformFitScore?: number
  aiStyleScore?: number
  strengths?: string[]
  issues?: string[]
  suggestions?: Suggestion[]
  conclusion?: string
}

interface DraftQualityPanelProps {
  activeDraft: Draft
  topicId: string
  evaluation: EvaluationData | null
  /** Called when user clicks "重新评估" */
  onEvaluate: () => Promise<void>
  /** Called when user selects issues and clicks "修复选中问题" */
  onRefineSelected: (selectedSuggestions: Suggestion[]) => void
}

// ── Component ────────────────────────────────────────────────────────────

export function DraftQualityPanel({
  activeDraft,
  evaluation,
  onEvaluate,
  onRefineSelected,
}: DraftQualityPanelProps) {
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())

  const handleEvaluate = useCallback(async () => {
    setIsEvaluating(true)
    try {
      await onEvaluate()
    } finally {
      setIsEvaluating(false)
    }
  }, [onEvaluate])

  const toggleSuggestion = useCallback((index: number) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const handleRefineSelected = useCallback(() => {
    const suggestions = evaluation?.suggestions ?? []
    const selected = suggestions.filter((_, i) => selectedSuggestions.has(i))
    onRefineSelected(selected)
  }, [evaluation?.suggestions, selectedSuggestions, onRefineSelected])

  // Build score dimensions from evaluation data
  const dimensions: ScoreDimension[] = evaluation
    ? [
        { label: '情绪', value: evaluation.emotionalImpactScore ?? 0 },
        { label: '逻辑', value: evaluation.logicalClarityScore ?? 0 },
        { label: '新颖', value: evaluation.noveltyScore ?? 0 },
        { label: '可读', value: evaluation.readabilityScore ?? 0 },
        { label: '实用', value: evaluation.utilityScore ?? 0 },
        { label: '平台', value: evaluation.platformFitScore ?? 0 },
      ].filter((d) => d.value > 0)
    : []

  const suggestions = evaluation?.suggestions ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">内容质量</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEvaluate}
            disabled={isEvaluating}
            className="gap-1.5"
          >
            {isEvaluating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {evaluation ? '重新评估' : '开始评估'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Evaluation result or empty state */}
        {!evaluation ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <AlertCircle className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              点击「开始评估」分析当前版本的内容质量
            </p>
          </div>
        ) : (
          <>
            {/* Overall Score */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground mb-1">Overall Score</div>
                <div className="text-3xl font-bold text-foreground">
                  {evaluation.overallScore ?? '-'}
                </div>
              </div>
              {evaluation.aiStyleScore != null && (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-1">AI味评分</div>
                  <div className={cn(
                    'text-lg font-semibold',
                    evaluation.aiStyleScore > 50 ? 'text-amber-500' : 'text-green-500',
                  )}>
                    {evaluation.aiStyleScore}
                  </div>
                </div>
              )}
            </div>

            {/* 6-Dimension Score Grid */}
            {dimensions.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {dimensions.map((dim) => (
                  <div
                    key={dim.label}
                    className="rounded-lg bg-muted/30 p-2 text-center"
                  >
                    <div className="text-xs text-muted-foreground">{dim.label}</div>
                    <div className={cn(
                      'text-sm font-semibold',
                      dim.value >= 70 ? 'text-green-600' :
                      dim.value >= 50 ? 'text-amber-600' : 'text-red-500',
                    )}>
                      {dim.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Issues (selectable for refine) */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">主要问题</div>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <label
                      key={i}
                      className={cn(
                        'flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors',
                        selectedSuggestions.has(i)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/30',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSuggestions.has(i)}
                        onChange={() => toggleSuggestion(i)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{s.section}</div>
                        <div className="text-sm">{s.issue}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          建议：{s.suggestion}
                        </div>
                      </div>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded',
                        s.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                        s.priority === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                        'bg-muted text-muted-foreground',
                      )}>
                        {s.priority === 'high' ? '高' : s.priority === 'medium' ? '中' : '低'}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedSuggestions.size > 0 && (
                  <Button
                    size="sm"
                    onClick={handleRefineSelected}
                    className="w-full"
                  >
                    修复选中问题 ({selectedSuggestions.size})
                  </Button>
                )}
              </div>
            )}

            {/* Strengths */}
            {evaluation.strengths && evaluation.strengths.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-sm font-medium">优点</div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Conclusion */}
            {evaluation.conclusion && (
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground mb-1">总体评价</div>
                <p className="text-sm">{evaluation.conclusion}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}