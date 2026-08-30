'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StepGenerate } from '@/components/create/step-generate'
import { SaveProjectButton } from '@/components/create/save-project-button'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import { useContentStrategy } from '@/hooks/use-content-strategy'
import { useWriting } from '@/hooks/use-writing'
import { useEvaluation } from '@/hooks/use-evaluation'
import { useStrategyEvaluation } from '@/hooks/use-strategy-evaluation'
import type {
  ContentStrategy,
  WritingDraft,
  EvaluationResult,
  StrategyEvaluationResult,
} from '@/hooks/use-workflow'

export default function GeneratePage() {
  const router = useRouter()
  const ws = useWorkflow()

  const strategyHook = useContentStrategy()
  const writingHook = useWriting()
  const evalHook = useEvaluation()
  const strategyEvalHook = useStrategyEvaluation()

  const [duration, setDuration] = useState(120)

  // Duration (seconds) → word count (Chinese spoken: ~4.5 chars/sec)
  const wordCount = Math.round(duration * 4.5)

  // Guard: if no selected angle, redirect to angles
  useEffect(() => {
    if (!ws.selectedAngle) {
      router.replace('/create/angles')
    }
  }, [ws.selectedAngle, router])

  const handleGenerate = useCallback(async () => {
    if (!ws.topicProfile || !ws.selectedAngle) return

    // Step A: Strategy
    const strategyResult = await strategyHook.generate({
      topic: ws.topicProfile.topic,
      selectedAngle: {
        id: ws.selectedAngle.id,
        title: ws.selectedAngle.title,
        angle: ws.selectedAngle.angle,
        targetEmotion: ws.selectedAngle.targetEmotion,
        keyPoints: ws.selectedAngle.keyPoints,
      },
      topicProfile: {
        keywords: ws.topicProfile.keywords,
        coreQuestions: ws.topicProfile.coreQuestions,
      },
      platform: ws.topicProfile?.platform || undefined,
      wordCount,
      persona: ws.persona || undefined,
    })
    if (!strategyResult) return
    const strategyData = strategyResult as unknown as ContentStrategy
    workflowActions.setStrategy(strategyData)

    // Step B: Writing
    const writingResult = await writingHook.generate({
      topic: ws.topicProfile.topic,
      strategy: strategyData,
      selectedAngle: {
        title: ws.selectedAngle.title,
        angle: ws.selectedAngle.angle,
        targetEmotion: ws.selectedAngle.targetEmotion,
        keyPoints: ws.selectedAngle.keyPoints,
      },
      platform: ws.topicProfile?.platform || undefined,
      wordCount,
      persona: ws.persona || undefined,
    })
    if (!writingResult) return
    const draftData = writingResult as unknown as WritingDraft
    workflowActions.setDraft(draftData)

    // Step C: Evaluation
    const evalResult = await evalHook.evaluate({
      content: draftData.content,
      title: draftData.title,
      strategy: {
        title: strategyData.title,
        keyArguments: strategyData.keyArguments,
        emotionalArc: strategyData.emotionalArc,
        callToAction: strategyData.callToAction,
      },
      selectedAngle: {
        title: ws.selectedAngle.title,
        targetEmotion: ws.selectedAngle.targetEmotion,
        keyPoints: ws.selectedAngle.keyPoints,
      },
      platform: ws.topicProfile?.platform || undefined,
    })
    if (evalResult) {
      const evalData = evalResult as unknown as EvaluationResult
      workflowActions.setEvaluation(evalData)
    }

    // Step D: Strategy Evaluation (platform-specific)
    const platform = ws.topicProfile?.platform
    if (platform) {
      const strategyEvalResult = await strategyEvalHook.evaluate({
        platform,
        topic: ws.topicProfile.topic,
        angle: {
          title: ws.selectedAngle.title,
          angle: ws.selectedAngle.angle,
          targetEmotion: ws.selectedAngle.targetEmotion,
          keyPoints: ws.selectedAngle.keyPoints,
        },
        strategy: {
          title: strategyData.title,
          hook: strategyData.hook,
          structure: strategyData.structure,
          emotionalArc: strategyData.emotionalArc,
          callToAction: strategyData.callToAction,
          tone: strategyData.tone,
        },
        draft: {
          title: draftData.title,
          content: draftData.content,
          wordCount: draftData.wordCount,
        },
      })
      if (strategyEvalResult) {
        const seData = strategyEvalResult as unknown as StrategyEvaluationResult
        workflowActions.setStrategyEvaluation(seData)
      }
    }
  }, [
    ws.topicProfile,
    ws.selectedAngle,
    ws.persona,
    wordCount,
    strategyHook,
    writingHook,
    evalHook,
    strategyEvalHook,
  ])

  const handleUpdateDraft = useCallback((patch: Partial<WritingDraft>) => {
    workflowActions.updateDraft(patch)
  }, [])

  if (!ws.selectedAngle) {
    return null
  }

  const generating =
    strategyHook.loading ||
    writingHook.loading ||
    evalHook.loading ||
    strategyEvalHook.loading

  const anyError =
    strategyHook.error ||
    writingHook.error ||
    evalHook.error ||
    strategyEvalHook.error

  const loadingLabel = strategyHook.loading
    ? '生成策略中...'
    : writingHook.loading
      ? '写作中...'
      : evalHook.loading
        ? '评估中...'
        : strategyEvalHook.loading
          ? '策略评分中...'
          : ''

  return (
    <div className="flex flex-col gap-4">
      <StepGenerate
        selectedAngle={ws.selectedAngle}
        strategy={ws.strategy}
        draft={ws.draft}
        evaluation={ws.evaluation}
        strategyEvaluation={ws.strategyEvaluation}
        onGenerate={handleGenerate}
        generating={generating}
        duration={duration}
        setDuration={setDuration}
        wordCount={wordCount}
        error={anyError}
        loadingLabel={loadingLabel}
        onUpdateDraft={handleUpdateDraft}
      />
      {ws.draft && (
        <div className="flex items-center justify-end">
          <Button
            onClick={() => router.push('/create/refine')}
            size="sm"
          >
            进入二次精修
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
      {ws.draft && (
        <SaveProjectButton
          topicProfile={ws.topicProfile}
          selectedAngle={ws.selectedAngle}
          strategy={ws.strategy}
          draft={ws.draft}
          evaluation={ws.evaluation}
          strategyEvaluation={ws.strategyEvaluation}
          platform={ws.topicProfile?.platform || ''}
        />
      )}
    </div>
  )
}
