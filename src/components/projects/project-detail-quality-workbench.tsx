'use client'

/**
 * P0.5.3 — Project Detail Quality Workbench
 *
 * Orchestrates the full quality & optimization workflow on the Project Detail page:
 * - Evaluation panel (with persistence + upsert)
 * - Evaluation → Refine conversion
 * - Evaluation → Refine → New Draft Version (atomic)
 * - Humanization preview (no draft created)
 * - Humanization adopt → New Draft Version (atomic)
 * - Cross-tab broadcast after draft-creating operations
 * - Dirty editor protection via useActiveDraftSync
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { Draft } from '@/generated/prisma'
import { DraftQualityPanel } from './draft-quality-panel'
import { DraftHumanizationPanel } from './draft-humanization-panel'
import { broadcastActiveDraftChange, useActiveDraftSync } from './use-active-draft-sync'

// ── Types ────────────────────────────────────────────────────────────────

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

interface ProjectDetailQualityWorkbenchProps {
  activeDraft: Draft
  allDrafts: Draft[]
  topicId: string
  topicTitle?: string
  selectedAngleTitle?: string
  platform?: string
  /** Whether the editor has unsaved changes */
  isEditorDirty?: boolean
}

// ── Component ────────────────────────────────────────────────────────────

export function ProjectDetailQualityWorkbench({
  activeDraft,
  allDrafts,
  topicId,
  topicTitle,
  selectedAngleTitle,
  platform,
  isEditorDirty,
}: ProjectDetailQualityWorkbenchProps) {
  const router = useRouter()
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null)
  const [isRefining, setIsRefining] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)

  // Cross-tab sync for dirty editor protection
  const { sourceId } = useActiveDraftSync({
    topicId,
    currentDraftId: activeDraft.id,
    onRemoteChange: (draftId) => {
      if (isEditorDirty) {
        // Dirty editor — don't silently overwrite, let user decide
        return
      }
      router.refresh()
    },
  })

  // ── Evaluate ────────────────────────────────────────

  const handleEvaluate = useCallback(async () => {
    const { evaluateActiveDraft } = await import('@/lib/services/server-actions')
    const result = await evaluateActiveDraft({
      draftId: activeDraft.id,
      topicId,
      content: activeDraft.content,
      title: activeDraft.title ?? '',
      platform,
    })

    if (result.success && result.evaluation) {
      const ev = result.evaluation
      setEvaluation({
        overallScore: ev.overallScore ?? undefined,
        emotionalImpactScore: ev.emotionalImpactScore ?? undefined,
        logicalClarityScore: ev.logicalClarityScore ?? undefined,
        noveltyScore: ev.noveltyScore ?? undefined,
        readabilityScore: ev.readabilityScore ?? undefined,
        utilityScore: ev.utilityScore ?? undefined,
        platformFitScore: ev.platformFitScore ?? undefined,
        aiStyleScore: ev.aiStyleScore ?? undefined,
        strengths: (ev.strengths as string[]) ?? [],
        issues: (ev.issues as string[]) ?? [],
        conclusion: ev.conclusion ?? undefined,
      })
    }
  }, [activeDraft.id, activeDraft.content, activeDraft.title, topicId, platform])

  // ── Refine (Evaluation Issues → Refine → New Draft) ─

  const handleRefineSelected = useCallback(async (selectedSuggestions: Suggestion[]) => {
    if (selectedSuggestions.length === 0) return

    setIsRefining(true)
    setRefineError(null)

    try {
      const { refineActiveDraft } = await import('@/lib/services/server-actions')
      const result = await refineActiveDraft({
        sourceDraftId: activeDraft.id,
        topicId,
        content: activeDraft.content,
        title: activeDraft.title ?? '',
        hook: activeDraft.content.split('\n')[0] ?? '',
        wordCount: activeDraft.wordCount ?? activeDraft.content.length,
        outline: activeDraft.outline,
        topic: topicTitle,
        selectedAngleTitle,
        platform,
        evaluationContext: {
          suggestions: selectedSuggestions.map((s, i) => ({
            id: `issue_${i}`,
            section: s.section,
            issue: s.issue,
            suggestion: s.suggestion,
            priority: s.priority,
          })),
          weaknesses: evaluation?.issues ?? [],
        },
        changeReason: `AI 精修 ${selectedSuggestions.length} 个问题`,
      })

      if (result.success && result.draft) {
        // Broadcast to other tabs
        broadcastActiveDraftChange(topicId, result.draft.id, sourceId)
        // Refresh this tab
        router.refresh()
        // Clear evaluation stale state
        setEvaluation(null)
      } else {
        setRefineError(result.error ?? '精修失败')
      }
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : '精修失败，请稍后重试')
    } finally {
      setIsRefining(false)
    }
  }, [activeDraft, topicId, topicTitle, selectedAngleTitle, platform, evaluation?.issues, sourceId, router])

  return (
    <div className="space-y-4">
      {/* Refine loading indicator */}
      {isRefining && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 flex items-center gap-2">
          <Loader2 className="size-4 text-blue-600 dark:text-blue-400 animate-spin" />
          <span className="text-sm text-blue-800 dark:text-blue-200">
            AI 正在精修中，完成后将创建新版本...
          </span>
        </div>
      )}

      {/* Refine error */}
      {refineError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
          <p className="text-sm text-red-800 dark:text-red-200">{refineError}</p>
        </div>
      )}

      {/* Quality Panel (Evaluation) */}
      <DraftQualityPanel
        activeDraft={activeDraft}
        topicId={topicId}
        evaluation={evaluation}
        onEvaluate={handleEvaluate}
        onRefineSelected={handleRefineSelected}
      />

      {/* Humanization Panel */}
      <DraftHumanizationPanel
        activeDraft={activeDraft}
        topicId={topicId}
        platform={platform}
      />
    </div>
  )
}