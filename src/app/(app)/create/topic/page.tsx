'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Sparkles, Loader2, Wand2, FileText,
  Heart, MessageCircle, Share2, Bookmark,
  ExternalLink, Library, Search, BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider, SliderControl, SliderTrack, SliderRange, SliderThumb } from '@/components/ui/slider'
import { useTopicResearch } from '@/hooks/use-topic-research'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import type { TopicProfile } from '@/hooks/use-workflow'
import { useContentLibrary } from '@/hooks/use-content-library'
import { PersonaSelector } from '@/components/create/persona-selector'
import { StepDistill } from '@/components/create/step-distill'
import { formatNumber } from '@/components/explorer/shared'

interface ProjectLoadData {
  projectId: string
  projectName: string
  topicProfile: TopicProfile | null
  selectedAngle: {
    id: string
    title: string
    angle: string
    reasoning: string
    targetEmotion: string
    estimatedViralScore: number
    difficulty: 'low' | 'medium' | 'high'
    keyPoints: string[]
    audienceAppeal: string
  } | null
  strategy: {
    title: string
    hook: string
    structure: Array<{
      section: string
      purpose: string
      keyArguments: string[]
      estimatedWords: number
    }>
    keyArguments: string[]
    emotionalArc: { start: string; middle: string; end: string }
    callToAction: string
    suggestedReferences: string[]
    tone: string
    estimatedWordCount: number
  } | null
  draft: {
    title: string
    content: string
    hook: string
    wordCount: number
    sections: Array<{ section: string; content: string }>
  } | null
  evaluation: {
    overallScore: number
    scores: {
      emotionalImpact: number
      logicalClarity: number
      novelty: number
      readability: number
      utility: number
      platformFit: number
    }
    strengths: string[]
    weaknesses: string[]
    suggestions: Array<{
      section: string
      issue: string
      suggestion: string
      priority: 'high' | 'medium' | 'low'
    }>
    emotionalArcAnalysis: { achieved: boolean; analysis: string }
    conclusion: string
  } | null
  strategyEvaluation: {
    platform: string
    overallScore: number
    grade: 'exceptional' | 'strong' | 'good' | 'average' | 'poor'
    scores: Record<string, number>
    platformFit: number
    strategyConsistency: number
    strengths: string[]
    weaknesses: string[]
    criticalIssues: string[]
    improvementPriorities: Array<{
      priority: number
      problem: string
      reason: string
      suggestion: string
    }>
    shareAnalysis: { motivation: string; target: string; context: string }
    aiStyleRisk: number
    authenticityScore: number
    evidenceQuality: number
    confidence: number
    verdict: string
  } | null
  platform: string | null
}

type CreateMode = 'free' | 'adapt' | 'distill'

function TopicPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')
  const topicResearch = useTopicResearch()
  const ws = useWorkflow()
  const library = useContentLibrary()

  // 项目加载相关 state
  const [projectLoading, setProjectLoading] = useState<boolean>(!!projectId)
  const [projectLoaded, setProjectLoaded] = useState<string | null>(null)

  // 从数据库加载已有项目数据
  useEffect(() => {
    if (!projectId || projectLoaded === projectId) return

    let cancelled = false

    async function loadProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`)
        const json = await res.json()

        if (cancelled) return

        if (json.success && json.data) {
          const data = json.data as ProjectLoadData

          // 设置 projectId
          workflowActions.setProjectId(data.projectId)

          // 设置平台
          if (data.platform) {
            workflowActions.updateTopicProfile({ platform: data.platform })
          }

          // 设置主题和相关数据
          if (data.topicProfile) {
            workflowActions.setTopicProfile({
              ...data.topicProfile,
              platform: data.platform || data.topicProfile.platform,
            })
          }

          // 设置选中的角度
          if (data.selectedAngle) {
            workflowActions.setAngles([data.selectedAngle])
            workflowActions.setSelectedAngle(data.selectedAngle)
          }

          // 设置策略
          if (data.strategy) {
            workflowActions.setStrategy(data.strategy)
          }

          // 设置初稿
          if (data.draft) {
            workflowActions.setDraft(data.draft)
          }

          // 设置评估结果
          if (data.evaluation) {
            workflowActions.setEvaluation(data.evaluation)
          }

          // 设置策略评估
          if (data.strategyEvaluation) {
            workflowActions.setStrategyEvaluation(data.strategyEvaluation)
          }

          // 标记已加载
          setProjectLoaded(data.projectId)
        }
      } catch (err) {
        console.error('[TopicPage] Failed to load project:', err)
      } finally {
        if (!cancelled) {
          setProjectLoading(false)
        }
      }
    }

    setProjectLoading(true)
    loadProject()

    return () => {
      cancelled = true
    }
  }, [projectId, projectLoaded])

  const [mode, setMode] = useState<CreateMode>(
    ws.referenceContent ? 'adapt' : ws.uploadedContent ? 'distill' : 'free',
  )
  const [topic, setTopic] = useState(ws.topicProfile?.topic ?? '')
  const [platform, setPlatform] = useState(ws.topicProfile?.platform ?? '')
  const [audienceAge, setAudienceAge] = useState<number[]>(() => {
    const audience = ws.topicProfile?.audience
    if (audience) {
      const match = audience.match(/(\d+)\s*-\s*(\d+)/)
      if (match) {
        return [parseInt(match[1], 10), parseInt(match[2], 10)]
      }
    }
    return [18, 45]
  })

  // Adaptation mode: search within content library
  const [libraryQuery, setLibraryQuery] = useState('')
  const [selectedContentUrl, setSelectedContentUrl] = useState<string | null>(
    ws.referenceContent?.url ?? null,
  )

  const researching = topicResearch.loading

  const handleResearch = useCallback(async () => {
    if (!topic.trim()) return

    const profile = await topicResearch.researchTopic({
      topic,
      platform: platform || undefined,
      audience: `${audienceAge[0]}-${audienceAge[1]}岁`,
    })

    if (profile) {
      const audienceStr = `${audienceAge[0]}-${audienceAge[1]}岁`
      const profileData = {
        ...(profile as unknown as TopicProfile),
        platform: platform || undefined,
        audience: audienceStr,
      }
      workflowActions.setTopicProfile(profileData)

      // Clear all downstream state
      workflowActions.clearDownstream()

      // Save topic to database if we have a projectId
      if (projectId) {
        try {
          await fetch(`/api/projects/${projectId}/topic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic,
              platform: platform || null,
              audience: audienceStr,
              category: profile.category || null,
            }),
          })
        } catch (err) {
          // Non-blocking: topic save failure should not interrupt the workflow
          console.error('[TopicPage] Failed to save topic to database:', err)
        }
      }

      // Navigate to research page
      router.push('/create/research')
    }
  }, [topic, platform, audienceAge, topicResearch, router, projectId])

  const handleStartAdapt = useCallback(() => {
    // Find the selected content from the content library
    const selected = library.contents.find((c) => c.url === selectedContentUrl)
    if (!selected) return

    workflowActions.setReferenceContent(selected)
    workflowActions.clearDownstream()
    router.push('/create/adapt')
  }, [library.contents, selectedContentUrl, router])

  // 如果正在加载项目数据，显示加载状态
  if (projectLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">正在加载创作数据...</p>
      </div>
    )
  }

  // Filter content library for adapt mode
  const filteredContents = library.contents.filter((c) => {
    const matchesQuery =
      !libraryQuery ||
      (c.title?.toLowerCase().includes(libraryQuery.toLowerCase()) ?? false) ||
      (c.content?.toLowerCase().includes(libraryQuery.toLowerCase()) ?? false)
    return matchesQuery
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Mode switcher */}
      <div className="flex gap-2 rounded-lg bg-muted/50 p-1">
        <button
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
            mode === 'free'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`
          }
          onClick={() => setMode('free')}
        >
          <Sparkles className="inline-block size-4 mr-1.5" />
          自由创作
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
            mode === 'distill'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setMode('distill')}
        >
          <BookOpen className="inline-block size-4 mr-1.5" />
          文件提炼
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
            mode === 'adapt'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`
          }
          onClick={() => setMode('adapt')}
        >
          <Wand2 className="inline-block size-4 mr-1.5" />
          对标改编
        </button>
      </div>

      {mode === 'distill' ? (
        <StepDistill />
      ) : mode === 'free' ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
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
            <PersonaSelector
              value={ws.persona}
              onChange={workflowActions.setPersona}
            />
            <div className="flex justify-end">
              <Button onClick={handleResearch} disabled={!topic.trim() || researching}>
                {researching ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    分析主题中...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    开始研究
                  </>
                )}
              </Button>
            </div>
            {topicResearch.error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {topicResearch.error}
              </div>
            )}
          </CardContent>
        </Card>
      ) : library.contents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Library className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">内容库为空</p>
              <p className="text-sm text-muted-foreground">
                先在「内容浏览器」中采集内容，加入内容库后即可选择对标
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/explorer/research')}
            >
              <Search className="size-4" />
              前往内容浏览器
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Library className="size-4" />
              从内容库中选择对标内容
            </div>

            {/* Search within content library */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="搜索标题或内容..."
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Content library list */}
            <ScrollArea className="h-[calc(100vh-22rem)]">
              <div className="flex flex-col gap-2 pr-4">
                {filteredContents.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    未找到匹配的内容
                  </p>
                ) : (
                  filteredContents.map((content, i) => {
                    const isSelected = selectedContentUrl === content.url
                    const metrics = content.metrics
                    const hasMetrics = metrics && (metrics.likes || metrics.comments || metrics.shares || metrics.favorites)
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50 hover:bg-muted/30'
                        }`}
                        onClick={() => setSelectedContentUrl(isSelected ? null : content.url)}
                      >
                        <div className="flex gap-3">
                          {content.cover && (
                            <div className="shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={content.cover}
                                alt={content.title || ''}
                                className="w-14 rounded-lg object-cover aspect-[9/16]"
                                loading="lazy"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              {content.platform === 'douyin' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 32 32" className="shrink-0"><title>tik-tok</title><g fill="currentColor"><path d="M24.562,7.613c-1.508-.983-2.597-2.557-2.936-4.391-.073-.396-.114-.804-.114-1.221h-4.814l-.008,19.292c-.081,2.16-1.859,3.894-4.039,3.894-.677,0-1.315-.169-1.877-.465-1.288-.678-2.169-2.028-2.169-3.582,0-2.231,1.815-4.047,4.046-4.047,.417,0,.816,.069,1.194,.187v-4.914c-.391-.053-.788-.087-1.194-.087-4.886,0-8.86,3.975-8.86,8.86,0,2.998,1.498,5.65,3.783,7.254,1.439,1.01,3.19,1.606,5.078,1.606,4.886,0,8.86-3.975,8.86-8.86V11.357c1.888,1.355,4.201,2.154,6.697,2.154v-4.814c-1.345,0-2.597-.4-3.647-1.085Z" /></g></svg>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  {content.platform}
                                </Badge>
                              )}
                              {content.author && (
                                <span className="text-xs text-muted-foreground">
                                  {content.author}
                                </span>
                              )}
                              {content.transcript?.text && (
                                <Badge variant="outline" className="text-xs">
                                  <FileText className="size-2.5 mr-0.5" />
                                  有文案
                                </Badge>
                              )}
                            </div>
                            <h4 className="text-sm font-medium line-clamp-2">
                              {content.title || '无标题'}
                            </h4>
                            {content.content && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {content.content}
                              </p>
                            )}
                            {hasMetrics && (
                              <div className="flex gap-3 text-xs text-muted-foreground">
                                {metrics?.likes != null && (
                                  <span className="flex items-center gap-0.5">
                                    <Heart className="size-3" /> {formatNumber(metrics.likes)}
                                  </span>
                                )}
                                {metrics?.comments != null && (
                                  <span className="flex items-center gap-0.5">
                                    <MessageCircle className="size-3" /> {formatNumber(metrics.comments)}
                                  </span>
                                )}
                                {metrics?.shares != null && (
                                  <span className="flex items-center gap-0.5">
                                    <Share2 className="size-3" /> {formatNumber(metrics.shares)}
                                  </span>
                                )}
                                {metrics?.favorites != null && (
                                  <span className="flex items-center gap-0.5">
                                    <Bookmark className="size-3" /> {formatNumber(metrics.favorites)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {content.url && (
                            <a
                              href={content.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="size-4 text-muted-foreground" />
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            <PersonaSelector
              value={ws.persona}
              onChange={workflowActions.setPersona}
            />

            <div className="flex items-center justify-between">
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => router.push('/explorer/research')}
              >
                <Search className="size-3" />
                前往内容浏览器采集更多内容
              </Button>
              <Button
                onClick={handleStartAdapt}
                disabled={!selectedContentUrl}
              >
                <Wand2 className="size-4" />
                进入改编创作
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function TopicPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TopicPageInner />
    </Suspense>
  )
}
