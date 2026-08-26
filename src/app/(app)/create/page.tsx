'use client'

import { useState, useCallback } from 'react'
import { Sparkles, RotateCcw, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider, SliderControl, SliderTrack, SliderRange, SliderThumb } from '@/components/ui/slider'
import { useTopicResearch } from '@/hooks/use-topic-research'
import { useViralAnalysis } from '@/hooks/use-viral-analysis'
import { useAngleGeneration } from '@/hooks/use-angle-generation'
import { useContentStrategy } from '@/hooks/use-content-strategy'
import { useWriting } from '@/hooks/use-writing'
import { useEvaluation } from '@/hooks/use-evaluation'
import { workflowActions, useWorkflow } from '@/hooks/use-workflow'
import { StepHeader } from '@/components/create/step-header'
import { StepResearch } from '@/components/create/step-research'
import { StepViral } from '@/components/create/step-viral'
import { StepAngles } from '@/components/create/step-angles'
import { StepGenerate } from '@/components/create/step-generate'
import { ProgressSteps } from '@/components/create/progress-steps'
import type { ProgressStep } from '@/components/create/progress-steps'
import type {
  TopicProfile,
  SearchedContent,
  ViralResult,
  ContentAngle,
  ContentStrategy,
  WritingDraft,
  EvaluationResult,
} from '@/hooks/use-workflow'

export default function CreatePage() {
  // Form state
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('')
  const [audienceAge, setAudienceAge] = useState<number[]>([18, 45])
  const [duration, setDuration] = useState(120) // seconds

  // Duration (seconds) → word count (Chinese spoken: ~4.5 chars/sec)
  const wordCount = Math.round(duration * 4.5)

  // Workflow data (local state, driven by hooks)
  const [topicProfile, setTopicProfileState] = useState<TopicProfile | null>(null)
  const [contents, setContentsState] = useState<SearchedContent[]>([])
  const [viralResult, setViralResultState] = useState<ViralResult | null>(null)
  const [angles, setAnglesState] = useState<ContentAngle[]>([])
  const [selectedAngle, setSelectedAngleState] = useState<ContentAngle | null>(null)
  const [strategy, setStrategyState] = useState<ContentStrategy | null>(null)
  const [draft, setDraftState] = useState<WritingDraft | null>(null)
  const [evaluation, setEvaluationState] = useState<EvaluationResult | null>(null)

  // Step visibility: which step card is expanded
  const [activeStep, setActiveStep] = useState(0) // 0=input, 1=research, 2=viral, 3=angles, 4=generate

  // Hooks
  const topicResearch = useTopicResearch()
  const viralAnalysis = useViralAnalysis()
  const angleGen = useAngleGeneration()
  const strategyHook = useContentStrategy()
  const writingHook = useWriting()
  const evalHook = useEvaluation()

  // Persist to global store for cross-page access
  useWorkflow()

  // ── Step 0 → 1: Research ──────────────────────────
  const [searching, setSearching] = useState(false)
  const handleResearch = useCallback(async () => {
    if (!topic.trim()) return
    const profile = await topicResearch.researchTopic({
      topic,
      platform: platform || undefined,
      audience: `${audienceAge[0]}-${audienceAge[1]}岁`,
    })
    if (profile) {
      const profileData = profile as TopicProfile
      setTopicProfileState(profileData)
      workflowActions.setTopicProfile(profileData)
      setContentsState([])
      setActiveStep(1)

      // Auto-start content search
      setSearching(true)
      try {
        const results = await topicResearch.searchContents(
          profileData.researchQueries,
          `topic-${Date.now()}`,
        )
        const contentData = (results || []) as SearchedContent[]
        setContentsState(contentData)
        workflowActions.setContents(contentData)
      } finally {
        setSearching(false)
      }
    }
  }, [topic, platform, audienceAge, topicResearch])

  // ── Step 2: Viral Analysis ─────────────────────────
  const handleViral = useCallback(async () => {
    if (contents.length === 0) return
    const result = await viralAnalysis.analyze(contents)
    if (result) {
      const viralData = result as unknown as ViralResult
      setViralResultState(viralData)
      workflowActions.setViralResult(viralData)
      setActiveStep(3)
    }
  }, [contents, viralAnalysis])

  // ── Skip viral analysis (no search results) ────────
  const handleSkipViral = useCallback(() => {
    setActiveStep(3)
  }, [])

  // ── Step 3: Angle Generation ──────────────────────
  const handleGenerateAngles = useCallback(async () => {
    if (!topicProfile) return
    const result = await angleGen.generate({
      topic: topicProfile.topic,
      topicProfile: {
        category: topicProfile.category,
        keywords: topicProfile.keywords,
        coreQuestions: topicProfile.coreQuestions,
        potentialAngles: topicProfile.potentialAngles,
      },
      viralPatterns: viralResult
        ? {
            commonStrengths: viralResult.patterns.commonStrengths,
            viralFactors: viralResult.patterns.viralFactors,
            avgViralScore: viralResult.patterns.avgViralScore,
          }
        : undefined,
      count: 5,
    })
    if (result && result.length > 0) {
      const angleData = result as unknown as ContentAngle[]
      setAnglesState(angleData)
      workflowActions.setAngles(angleData)
    }
  }, [topicProfile, viralResult, angleGen])

  // ── Step 4: Generate all (strategy → writing → eval) ──
  const handleGenerateAll = useCallback(async () => {
    if (!topicProfile || !selectedAngle) return

    // Step A: Strategy
    const strategyResult = await strategyHook.generate({
      topic: topicProfile.topic,
      selectedAngle: {
        id: selectedAngle.id,
        title: selectedAngle.title,
        angle: selectedAngle.angle,
        targetEmotion: selectedAngle.targetEmotion,
        keyPoints: selectedAngle.keyPoints,
      },
      topicProfile: {
        keywords: topicProfile.keywords,
        coreQuestions: topicProfile.coreQuestions,
      },
      platform: platform || undefined,
      wordCount,
    })
    if (!strategyResult) return
    const strategyData = strategyResult as unknown as ContentStrategy
    setStrategyState(strategyData)
    workflowActions.setStrategy(strategyData)

    // Step B: Writing
    const writingResult = await writingHook.generate({
      topic: topicProfile.topic,
      strategy: strategyData,
      selectedAngle: {
        title: selectedAngle.title,
        angle: selectedAngle.angle,
        targetEmotion: selectedAngle.targetEmotion,
        keyPoints: selectedAngle.keyPoints,
      },
      platform: platform || undefined,
      wordCount,
    })
    if (!writingResult) return
    const draftData = writingResult as unknown as WritingDraft
    setDraftState(draftData)
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
        title: selectedAngle.title,
        targetEmotion: selectedAngle.targetEmotion,
        keyPoints: selectedAngle.keyPoints,
      },
      platform: platform || undefined,
    })
    if (evalResult) {
      const evalData = evalResult as unknown as EvaluationResult
      setEvaluationState(evalData)
      workflowActions.setEvaluation(evalData)
    }
  }, [topicProfile, selectedAngle, platform, wordCount, strategyHook, writingHook, evalHook])

  // ── Reset everything ──────────────────────────────
  const handleReset = useCallback(() => {
    topicResearch.reset()
    viralAnalysis.reset()
    angleGen.reset()
    strategyHook.reset()
    writingHook.reset()
    evalHook.reset()
    setTopicProfileState(null)
    setContentsState([])
    setViralResultState(null)
    setAnglesState([])
    setSelectedAngleState(null)
    setStrategyState(null)
    setDraftState(null)
    setEvaluationState(null)
    setTopic('')
    setPlatform('')
    setAudienceAge([18, 45])
    setDuration(120)
    setActiveStep(0)
    workflowActions.reset()
  }, [topicResearch, viralAnalysis, angleGen, strategyHook, writingHook, evalHook])

  // ── Select angle ──────────────────────────────────
  const handleSelectAngle = useCallback((angle: ContentAngle | null) => {
    setSelectedAngleState(angle)
    workflowActions.setSelectedAngle(angle)
  }, [])

  // Derived loading states
  const researching = topicResearch.loading || searching
  const analyzing = viralAnalysis.loading
  const generatingAngles = angleGen.loading
  const generatingAll = strategyHook.loading || writingHook.loading || evalHook.loading
  const anyError = topicResearch.error || viralAnalysis.error || angleGen.error || strategyHook.error || writingHook.error || evalHook.error

  // ── Progress bar steps ────────────────────────────
  const progressSteps: ProgressStep[] = [
    {
      id: 1,
      label: '主题研究',
      status: topicProfile
        ? 'done'
        : researching
          ? 'loading'
          : activeStep === 0
            ? 'active'
            : 'pending',
    },
    {
      id: 2,
      label: '爆款分析',
      status: viralResult
        ? 'done'
        : analyzing
          ? 'loading'
          : activeStep === 1 && contents.length > 0
            ? 'active'
            : activeStep >= 3 && !viralResult
              ? 'skipped'
              : 'pending',
    },
    {
      id: 3,
      label: '角度选择',
      status: selectedAngle
        ? 'done'
        : generatingAngles
          ? 'loading'
          : angles.length > 0
            ? 'active'
            : activeStep >= 3
              ? 'active'
              : 'pending',
    },
    {
      id: 4,
      label: '生成内容',
      status: draft
        ? 'done'
        : generatingAll && writingHook.loading
          ? 'loading'
          : selectedAngle
            ? 'active'
            : 'pending',
    },
    {
      id: 5,
      label: '评估',
      status: evaluation
        ? 'done'
        : generatingAll && evalHook.loading
          ? 'loading'
          : draft
            ? 'active'
            : 'pending',
    },
  ]

  // ── Step click handler ─────────────────────────────
  const handleStepClick = useCallback((stepId: number) => {
    // Only allow navigating to steps that have been reached
    if (stepId === 1 && topicProfile) setActiveStep(0) // view research input
    if (stepId === 1) setActiveStep(1) // view research results
    if (stepId === 2 && (viralResult || (contents.length > 0 && activeStep >= 1))) setActiveStep(1) // view viral step
    if (stepId === 3 && activeStep >= 3) setActiveStep(3) // view angles
    if (stepId === 4 && selectedAngle) setActiveStep(3) // view generate
    if (stepId === 5 && draft) setActiveStep(3) // view eval
  }, [topicProfile, viralResult, contents.length, activeStep, selectedAngle, draft])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">创建内容</h1>
          <p className="text-sm text-muted-foreground">从主题到成品，一气呵成</p>
        </div>
        {activeStep > 0 && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="size-4" />
            重新开始
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="sticky top-14 z-10 py-1">
        <ProgressSteps steps={progressSteps} onStepClick={handleStepClick} />
      </div>

      {/* Step 0: Topic Input */}
      {activeStep === 0 && (
        <Card>
          <StepHeader step={0} title="输入主题" active done={false} />
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="topic">主题</Label>
              <Textarea
                id="topic"
                placeholder="例如：我们一生都在追求被爱的过程"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <Label>目标平台</Label>
                <Select value={platform} onValueChange={(v) => setPlatform(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择平台..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="抖音短视频">抖音短视频</SelectItem>
                    <SelectItem value="小红书">小红书</SelectItem>
                    <SelectItem value="公众号">公众号</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <Label>目标受众年龄段</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{audienceAge[0]} 岁</span>
                    <span>~</span>
                    <span>{audienceAge[1]} 岁</span>
                  </div>
                  <Slider
                    value={audienceAge}
                    onValueChange={(v) => setAudienceAge(Array.isArray(v) ? [...v] : [v, v])}
                    min={10}
                    max={70}
                    step={1}
                  >
                    <SliderControl>
                      <SliderTrack>
                        <SliderRange />
                      </SliderTrack>
                      <SliderThumb index={0} />
                      <SliderThumb index={1} />
                    </SliderControl>
                  </Slider>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleResearch} disabled={!topic.trim() || researching}>
                {researching ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {topicResearch.loading ? '分析主题中...' : '搜索内容中...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    开始研究
                  </>
                )}
              </Button>
            </div>
            {anyError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {anyError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Research Results */}
      {topicProfile && activeStep >= 1 && (
        <StepResearch
          topicProfile={topicProfile}
          contents={contents}
          searching={searching}
          onAnalyze={handleViral}
          onSkip={handleSkipViral}
          analyzing={analyzing}
          error={viralAnalysis.error}
        />
      )}

      {/* Step 2: Viral Analysis Results */}
      {viralResult && activeStep >= 3 && (
        <StepViral
          viralResult={viralResult}
          onGenerateAngles={handleGenerateAngles}
          generatingAngles={generatingAngles}
          error={angleGen.error}
        />
      )}

      {/* Skipped viral analysis → show generate angles button directly */}
      {!viralResult && activeStep >= 3 && angles.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4" />
              基于主题画像生成内容角度
            </div>
            <Button onClick={handleGenerateAngles} disabled={generatingAngles} size="sm">
              {generatingAngles ? (
                <><Loader2 className="size-4 animate-spin" />生成中...</>
              ) : (
                <><Sparkles className="size-4" />生成角度</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {angleGen.error && !viralResult && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" />{angleGen.error}
        </div>
      )}

      {/* Step 3: Angle Selection */}
      {angles.length > 0 && activeStep >= 3 && (
        <StepAngles
          angles={angles}
          selectedAngle={selectedAngle}
          onSelect={handleSelectAngle}
        />
      )}

      {/* Step 4: Generate Content + Evaluation */}
      {selectedAngle && activeStep >= 3 && (
        <StepGenerate
          selectedAngle={selectedAngle}
          strategy={strategy}
          draft={draft}
          evaluation={evaluation}
          onGenerate={handleGenerateAll}
          generating={generatingAll}
          platform={platform}
          setPlatform={setPlatform}
          duration={duration}
          setDuration={setDuration}
          wordCount={wordCount}
          error={strategyHook.error || writingHook.error || evalHook.error}
          loadingLabel={
            strategyHook.loading ? '生成策略中...' : writingHook.loading ? '写作中...' : '评估中...'
          }
        />
      )}
    </div>
  )
}
