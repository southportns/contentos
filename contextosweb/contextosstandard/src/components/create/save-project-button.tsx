'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkflow } from '@/hooks/use-workflow'
import type {
  ContentStrategy,
  WritingDraft,
  EvaluationResult,
  StrategyEvaluationResult,
  ContentAngle,
  TopicProfile,
  RefineResult,
} from '@/hooks/use-workflow'

interface SaveProjectButtonProps {
  topicProfile: TopicProfile | null
  selectedAngle: ContentAngle | null
  strategy: ContentStrategy | null
  draft: WritingDraft | null
  evaluation: EvaluationResult | null
  strategyEvaluation: StrategyEvaluationResult | null
  platform: string
  refineData?: RefineResult | null
  projectId?: string | null
}

export function SaveProjectButton({
  topicProfile,
  selectedAngle,
  strategy,
  draft,
  evaluation,
  strategyEvaluation,
  platform,
  refineData,
  projectId,
}: SaveProjectButtonProps) {
  const router = useRouter()
  const ws = useWorkflow()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = !!(topicProfile && selectedAngle && strategy && draft)
  const effectiveProjectId = projectId ?? ws.projectId

  const handleSave = useCallback(async () => {
    if (!topicProfile || !selectedAngle || !strategy || !draft) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: effectiveProjectId || undefined,
          topic: topicProfile.topic,
          platform: platform || null,
          audience: topicProfile.audience || null,
          category: topicProfile.category || null,
          keywords: topicProfile.keywords,
          coreQuestions: topicProfile.coreQuestions,
          selectedAngle: {
            id: selectedAngle.id,
            title: selectedAngle.title,
            angle: selectedAngle.angle,
            reasoning: selectedAngle.reasoning,
            targetEmotion: selectedAngle.targetEmotion,
            estimatedViralScore: selectedAngle.estimatedViralScore,
            difficulty: selectedAngle.difficulty,
            keyPoints: selectedAngle.keyPoints,
            audienceAppeal: selectedAngle.audienceAppeal,
          },
          strategy: {
            title: strategy.title,
            hook: strategy.hook,
            structure: strategy.structure,
            keyArguments: strategy.keyArguments,
            emotionalArc: strategy.emotionalArc,
            callToAction: strategy.callToAction,
            tone: strategy.tone,
            estimatedWordCount: strategy.estimatedWordCount,
          },
          draft: {
            title: draft.title,
            content: draft.content,
            hook: draft.hook,
            wordCount: draft.wordCount,
          },
          evaluation: evaluation
            ? {
                overallScore: evaluation.overallScore,
                scores: evaluation.scores,
                strengths: evaluation.strengths,
                weaknesses: evaluation.weaknesses,
                suggestions: evaluation.suggestions,
                emotionalArcAnalysis: evaluation.emotionalArcAnalysis,
                conclusion: evaluation.conclusion,
              }
            : undefined,
          strategyEvaluation: strategyEvaluation
            ? {
                platform: strategyEvaluation.platform,
                overallScore: strategyEvaluation.overallScore,
                grade: strategyEvaluation.grade,
                scores: strategyEvaluation.scores,
                platformFit: strategyEvaluation.platformFit,
                strategyConsistency: strategyEvaluation.strategyConsistency,
                strengths: strategyEvaluation.strengths,
                weaknesses: strategyEvaluation.weaknesses,
                criticalIssues: strategyEvaluation.criticalIssues,
                improvementPriorities: strategyEvaluation.improvementPriorities,
                shareAnalysis: strategyEvaluation.shareAnalysis,
                aiStyleRisk: strategyEvaluation.aiStyleRisk,
                authenticityScore: strategyEvaluation.authenticityScore,
                evidenceQuality: strategyEvaluation.evidenceQuality,
                confidence: strategyEvaluation.confidence,
                verdict: strategyEvaluation.verdict,
              }
            : undefined,
          refineChanges: refineData?.changes,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '保存失败')
      }

      setSaved(true)
      // Navigate to projects page after a short delay
      setTimeout(() => {
        router.push('/projects')
      }, 1200)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [
    topicProfile,
    selectedAngle,
    strategy,
    draft,
    evaluation,
    strategyEvaluation,
    platform,
    refineData,
    effectiveProjectId,
    router,
  ])

  if (saved) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
        <CheckCircle2 className="size-4" />
        {effectiveProjectId ? '更新成功！正在跳转...' : '保存成功！正在跳转...'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleSave}
        disabled={!canSave || saving}
        className="w-full"
        size="lg"
      >
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {effectiveProjectId ? '更新中...' : '保存中...'}
          </>
        ) : (
          <>
            <Save className="size-4" />
            {effectiveProjectId ? '更新创作' : '保存为创作'}
          </>
        )}
      </Button>
      {!canSave && (
        <p className="text-center text-xs text-muted-foreground">
          需要完成策略生成和写作后才能保存
        </p>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
