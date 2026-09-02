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
import { useRiskAnalysis } from '@/hooks/use-risk-analysis'
import type {
  ContentStrategy,
  WritingDraft,
  EvaluationResult,
  StrategyEvaluationResult,
  RiskAnalysisResult,
} from '@/hooks/use-workflow'

/** Pipeline phase tracking for multi-step generation */
type PipelinePhase = 'idle' | 'strategy' | 'writing' | 'evaluation' | 'done'

const PHASE_CONFIG: Record<PipelinePhase, { label: string; startPct: number; endPct: number }> = {
  idle:        { label: '准备中...',      startPct: 0,   endPct: 0   },
  strategy:    { label: '生成策略中...',   startPct: 5,   endPct: 25  },
  writing:     { label: '写作中...',       startPct: 25,  endPct: 55  },
  evaluation:  { label: '评估 & 风控中...', startPct: 55,  endPct: 95  },
  done:        { label: '完成',           startPct: 100, endPct: 100 },
}

export default function GeneratePage() {
  const router = useRouter()
  const ws = useWorkflow()

  const strategyHook = useContentStrategy()
  const writingHook = useWriting()
  const evalHook = useEvaluation()
  const strategyEvalHook = useStrategyEvaluation()
  const riskAnalysisHook = useRiskAnalysis()

  const [duration, setDuration] = useState(120)
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>('idle')

  // Calculate current progress from phase + loading states
  const currentPhaseConfig = PHASE_CONFIG[pipelinePhase]
  let progressPercent = currentPhaseConfig.startPct
  if (pipelinePhase === 'evaluation') {
    // Within evaluation phase, track parallel task completion
    const tasks = [evalHook, strategyEvalHook, riskAnalysisHook]
    const completed = tasks.filter(t => !t.loading && t.result).length
    const total = tasks.length
    const evalProgress = total > 0 ? completed / total : 0
    progressPercent = currentPhaseConfig.startPct + evalProgress * (currentPhaseConfig.endPct - currentPhaseConfig.startPct)
  } else {
    // For strategy/writing phases, use midpoint of the range as active progress
    progressPercent = (currentPhaseConfig.startPct + currentPhaseConfig.endPct) / 2
  }
  const loadingLabel = currentPhaseConfig.label

  // Duration (seconds) → word count
  // Chinese spoken: ~4.5 chars/sec base rate, +20% to account for
  // filler words (气口、语气词) that get cut during video editing
  const WORDS_PER_SECOND = 4.5 * 1.2 // = 5.4
  const wordCount = Math.round(duration * WORDS_PER_SECOND)

  // Guard: if no selected angle, redirect to angles
  useEffect(() => {
    if (!ws.selectedAngle) {
      router.replace('/create/angles')
    }
  }, [ws.selectedAngle, router])

  const handleGenerate = useCallback(async () => {
    if (!ws.topicProfile || !ws.selectedAngle) return

    // Step A: Strategy
    setPipelinePhase('strategy')
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
    if (!strategyResult) {
      setPipelinePhase('idle')
      return
    }
    const strategyData = strategyResult as unknown as ContentStrategy
    workflowActions.setStrategy(strategyData)

    // Step B: Writing
    setPipelinePhase('writing')
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
    if (!writingResult) {
      setPipelinePhase('idle')
      return
    }
    const draftData = writingResult as unknown as WritingDraft
    workflowActions.setDraft(draftData)

    // Step C + D + E: Evaluation, Strategy Evaluation, and Risk Analysis in parallel
    // All three only depend on draft + strategy, so they can run concurrently
    // Using allSettled so one failure doesn't block the others
    setPipelinePhase('evaluation')
    const platform = ws.topicProfile?.platform
    const [evalSettled, strategyEvalSettled, riskSettled] = await Promise.allSettled([
      evalHook.evaluate({
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
      }),
      platform
        ? strategyEvalHook.evaluate({
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
        : Promise.resolve(null),
      riskAnalysisHook.analyze({
        content: draftData.content,
        title: draftData.title,
        platform: ws.topicProfile?.platform || undefined,
      }),
    ])

    // Each step is independent — a failure in one doesn't affect the others
    if (evalSettled.status === 'fulfilled' && evalSettled.value) {
      workflowActions.setEvaluation(evalSettled.value as unknown as EvaluationResult)
    }
    if (strategyEvalSettled.status === 'fulfilled' && strategyEvalSettled.value) {
      workflowActions.setStrategyEvaluation(strategyEvalSettled.value as unknown as StrategyEvaluationResult)
    }
    if (riskSettled.status === 'fulfilled' && riskSettled.value) {
      workflowActions.setRiskAnalysis(riskSettled.value as unknown as RiskAnalysisResult)
    }

    setPipelinePhase('done')
  }, [
    ws.topicProfile,
    ws.selectedAngle,
    ws.persona,
    wordCount,
    strategyHook,
    writingHook,
    evalHook,
    strategyEvalHook,
    riskAnalysisHook,
  ])

  const handleUpdateDraft = useCallback((patch: Partial<WritingDraft>) => {
    workflowActions.updateDraft(patch)
  }, [])

  if (!ws.selectedAngle) {
    return null
  }

  const generating = pipelinePhase !== 'idle' && pipelinePhase !== 'done'

  const anyError =
    strategyHook.error ||
    writingHook.error ||
    evalHook.error ||
    strategyEvalHook.error ||
    riskAnalysisHook.error

  return (
    <div className="flex flex-col gap-4">
      <StepGenerate
        selectedAngle={ws.selectedAngle}
        strategy={ws.strategy}
        draft={ws.draft}
        evaluation={ws.evaluation}
        strategyEvaluation={ws.strategyEvaluation}
        riskAnalysis={ws.riskAnalysis}
        onGenerate={handleGenerate}
        generating={generating}
        loadingLabel={loadingLabel}
        progressPercent={generating ? progressPercent : undefined}
        duration={duration}
        setDuration={setDuration}
        wordCount={wordCount}
        error={anyError}
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
