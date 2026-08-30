'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Loader2,
  Wand2,
  Check,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PersonaSelector } from '@/components/create/persona-selector'
import { PlatformSelector } from '@/components/create/platform-selector'
import { useAdaptation } from '@/hooks/use-adaptation'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import type { AdaptationResult, ContentAngle, SearchedContent } from '@/hooks/use-workflow'

interface StepAdaptProps {
  referenceContent: SearchedContent
}

export function StepAdapt({ referenceContent }: StepAdaptProps) {
  const router = useRouter()
  const ws = useWorkflow()
  const adaptation = useAdaptation()

  const [userIdea, setUserIdea] = useState('')
  const [selectedAngleId, setSelectedAngleId] = useState<string | null>(null)

  const refText = useMemo(() => {
    return (
      referenceContent.transcript?.text ||
      referenceContent.content ||
      referenceContent.title ||
      '无内容'
    )
  }, [referenceContent])

  const handleAnalyze = useCallback(async () => {
    if (!userIdea.trim()) return

    const result = await adaptation.generate({
      referenceContent: {
        title: referenceContent.title,
        content: referenceContent.content,
        transcript: referenceContent.transcript?.text ?? null,
        platform: referenceContent.platform,
        author: referenceContent.author,
        url: referenceContent.url,
        metrics: referenceContent.metrics,
      },
      userIdea: userIdea.trim(),
      persona: ws.persona || undefined,
      platform: ws.topicProfile?.platform || undefined,
    })

    if (result) {
      workflowActions.setAdaptationResult(result as unknown as AdaptationResult)
    }
  }, [adaptation, referenceContent, userIdea, ws.persona, ws.topicProfile])

  const handleSelectAngle = useCallback(
    (angle: AdaptationResult['adaptedAngles'][number]) => {
      setSelectedAngleId(angle.id)

      // Convert adapted angle to ContentAngle format
      const contentAngle: ContentAngle = {
        id: angle.id,
        title: angle.title,
        angle: angle.angle,
        reasoning: angle.reasoning,
        targetEmotion: angle.targetEmotion,
        estimatedViralScore: angle.estimatedViralScore,
        difficulty: 'medium',
        keyPoints: angle.keyPoints,
        audienceAppeal: angle.whatChanged,
      }

      // Set topic profile from reference content if not already set
      if (!ws.topicProfile) {
        workflowActions.setTopicProfile({
          topic: referenceContent.title || referenceContent.content?.slice(0, 50) || '对标改编',
          category: '改编创作',
          keywords: [],
          relatedTopics: [],
          coreQuestions: [],
          potentialAngles: [],
          researchQueries: [],
          platform: referenceContent.platform,
        })
      }

      workflowActions.setAngles([contentAngle])
      workflowActions.setSelectedAngle(contentAngle)

      // Navigate to generate page
      router.push('/create/generate')
    },
    [router, referenceContent, ws.topicProfile],
  )

  // Use final result, or fall back to workflow state, or use partial for incremental display
  const result = (adaptation.result || ws.adaptationResult) as AdaptationResult | null
  const partial = adaptation.partial

  // Show analysis card when we have it (from partial or final result)
  const analysisData = result?.referenceAnalysis || partial?.referenceAnalysis
  const strategyData = result?.strategySuggestion || partial?.strategySuggestion
  const anglesData = result?.adaptedAngles || partial?.adaptedAngles
  const showAnalysis = !!analysisData
  const showAngles = !!anglesData
  const isLoadingAngles = adaptation.loading && !showAngles && !!showAnalysis

  return (
    <div className="flex flex-col gap-4">
      {/* Reference content preview */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {referenceContent.platform}
            </Badge>
            {referenceContent.author && (
              <span className="text-xs text-muted-foreground">
                {referenceContent.author}
              </span>
            )}
          </div>
          {referenceContent.title && (
            <h3 className="text-sm font-medium line-clamp-2">
              {referenceContent.title}
            </h3>
          )}
          <div className="rounded-lg bg-muted/50 p-3 max-h-32 overflow-y-auto">
            <p className="text-xs text-muted-foreground line-clamp-4">
              {refText}
            </p>
          </div>
          {referenceContent.metrics && (
            <div className="flex gap-3 text-xs text-muted-foreground">
              {referenceContent.metrics.likes != null && (
                <span>❤️ {referenceContent.metrics.likes}</span>
              )}
              {referenceContent.metrics.comments != null && (
                <span>💬 {referenceContent.metrics.comments}</span>
              )}
              {referenceContent.metrics.shares != null && (
                <span>🔁 {referenceContent.metrics.shares}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User idea input */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="userIdea" className="flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" />
              你的想法和改编方向
            </Label>
            <Textarea
              id="userIdea"
              placeholder="例如：我想从这个角度重新解读，结合我自己的经历，换成更接地气的表达方式..."
              value={userIdea}
              onChange={(e) => setUserIdea(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <PlatformSelector
            value={ws.topicProfile?.platform || ''}
            onChange={(platform) => {
              if (ws.topicProfile) {
                workflowActions.updateTopicProfile({ platform })
              } else {
                workflowActions.setTopicProfile({
                  topic: referenceContent.title || referenceContent.content?.slice(0, 50) || '对标改编',
                  category: '改编创作',
                  keywords: [],
                  relatedTopics: [],
                  coreQuestions: [],
                  potentialAngles: [],
                  researchQueries: [],
                  platform,
                })
              }
            }}
          />

          <PersonaSelector
            value={ws.persona}
            onChange={workflowActions.setPersona}
          />

          <div className="flex justify-end">
            <Button
              onClick={handleAnalyze}
              disabled={!userIdea.trim() || adaptation.loading}
            >
              {adaptation.loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {adaptation.phase === 'analyzing' ? '分析对标内容中...' : '生成改编方向中...'}
                </>
              ) : (
                <>
                  <Wand2 className="size-4" />
                  分析对标 & 生成改编方向
                </>
              )}
            </Button>
          </div>

          {adaptation.error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {adaptation.error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis result — shows as soon as Phase A completes */}
      {showAnalysis && analysisData && (
        <div className="flex flex-col gap-4">
          {/* Reference analysis */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">对标内容拆解</h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">钩子类型</span>
                  <p className="font-medium mt-0.5">{analysisData.hookType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">情绪曲线</span>
                  <p className="font-medium mt-0.5">
                    {analysisData.emotionalArc.start} →{' '}
                    {analysisData.emotionalArc.middle} →{' '}
                    {analysisData.emotionalArc.end}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">内容结构</span>
                <div className="flex flex-wrap gap-1.5">
                  {analysisData.contentStructure.map((s, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {i + 1}. {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">核心观点</span>
                <ul className="text-xs space-y-1">
                  {analysisData.keyPoints.map((p, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-primary">{i + 1}.</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="size-3" /> 爆款因子
                  </span>
                  <ul className="text-xs space-y-0.5">
                    {analysisData.viralFactors.map((f, i) => (
                      <li key={i} className="text-green-600 dark:text-green-400">{f}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="size-3" /> 可改进点
                  </span>
                  <ul className="text-xs space-y-0.5">
                    {analysisData.weaknesses.map((w, i) => (
                      <li key={i} className="text-amber-600 dark:text-amber-400">{w}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Strategy suggestion */}
              {strategyData && (
                <div className="border-t pt-3 mt-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="size-3.5 text-primary" />
                    <span className="text-xs font-medium">改编策略建议</span>
                  </div>
                  <div className="text-xs space-y-1.5">
                    <div><span className="text-muted-foreground">语调：</span>{strategyData.tone}</div>
                    <div><span className="text-muted-foreground">钩子策略：</span>{strategyData.hookStrategy}</div>
                    <div><span className="text-muted-foreground">CTA 策略：</span>{strategyData.ctaStrategy}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Adapted angles — shows when Phase B completes, or loading indicator */}
          {showAngles && anglesData ? (
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">改编方向（选择一个继续）</h3>
                </div>

                {anglesData.map((angle, i) => (
                  <div
                    key={angle.id}
                    className={`rounded-lg border p-3 cursor-pointer transition-all ${
                      selectedAngleId === angle.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    }`}
                    onClick={() => handleSelectAngle(angle)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <h4 className="text-sm font-medium">{angle.title}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {angle.angle}
                        </p>
                      </div>
                      {selectedAngleId === angle.id && (
                        <Check className="size-4 text-primary shrink-0" />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {angle.targetEmotion}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        预估分数 {angle.estimatedViralScore}
                      </Badge>
                    </div>

                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">改编差异：</span>
                      <span className="text-foreground">{angle.whatChanged}</span>
                    </div>

                    <div className="mt-1.5 text-xs">
                      <span className="text-muted-foreground">改编理由：</span>
                      <span className="text-foreground">{angle.reasoning}</span>
                    </div>
                  </div>
                ))}

                {selectedAngleId && (
                  <div className="flex justify-end pt-1">
                    <Button
                      onClick={() => {
                        const angle = anglesData.find((a) => a.id === selectedAngleId)
                        if (angle) handleSelectAngle(angle)
                      }}
                      size="sm"
                    >
                      进入创作
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : isLoadingAngles ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 p-8">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">正在生成改编方向...</span>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  )
}
