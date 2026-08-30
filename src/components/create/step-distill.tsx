'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Loader2,
  BookOpen,
  Check,
  ChevronRight,
  Lightbulb,
  Target,
  Quote,
  Upload,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PersonaSelector } from '@/components/create/persona-selector'
import { PlatformSelector } from '@/components/create/platform-selector'
import { useDistillation } from '@/hooks/use-distillation'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import type { DistillationResult, ContentAngle, UploadedContent } from '@/hooks/use-workflow'

export function StepDistill() {
  const router = useRouter()
  const ws = useWorkflow()
  const distillation = useDistillation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [userIdea, setUserIdea] = useState('')
  const [selectedAngleId, setSelectedAngleId] = useState<string | null>(null)

  const uploaded = ws.uploadedContent

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError(null)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload/content', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '文件上传失败')
      }

      const result = data.data as UploadedContent
      workflowActions.setUploadedContent(result)
      workflowActions.setDistillationResult(null)
      workflowActions.clearDownstream()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败'
      setUploadError(msg)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFileUpload(file)
      }
      // Reset input so same file can be selected again
      e.target.value = ''
    },
    [handleFileUpload],
  )

  const handleAnalyze = useCallback(async () => {
    if (!uploaded || !userIdea.trim()) return

    const result = await distillation.generate({
      sourceContent: {
        title: uploaded.title,
        content: uploaded.content,
        sourceType: uploaded.sourceType,
        fileName: uploaded.fileName,
      },
      userIdea: userIdea.trim(),
      persona: ws.persona || undefined,
      platform: ws.topicProfile?.platform || undefined,
    })

    if (result) {
      workflowActions.setDistillationResult(result as unknown as DistillationResult)
    }
  }, [uploaded, userIdea, distillation, ws.persona, ws.topicProfile])

  const handleSelectAngle = useCallback(
    (angle: DistillationResult['distilledAngles'][number]) => {
      setSelectedAngleId(angle.id)

      // Convert distilled angle to ContentAngle format
      const contentAngle: ContentAngle = {
        id: angle.id,
        title: angle.title,
        angle: angle.angle,
        reasoning: angle.reasoning,
        targetEmotion: angle.targetEmotion,
        estimatedViralScore: angle.estimatedViralScore,
        difficulty: 'medium',
        keyPoints: angle.keyPoints,
        audienceAppeal: angle.whatExtracted,
      }

      // Set topic profile from uploaded content if not already set
      if (!ws.topicProfile) {
        workflowActions.setTopicProfile({
          topic: uploaded?.title || uploaded?.content.slice(0, 50) || '文件提炼创作',
          category: '提炼创作',
          keywords: [],
          relatedTopics: [],
          coreQuestions: [],
          potentialAngles: [],
          researchQueries: [],
        })
      }

      workflowActions.setAngles([contentAngle])
      workflowActions.setSelectedAngle(contentAngle)

      // Navigate to generate page
      router.push('/create/generate')
    },
    [router, uploaded, ws.topicProfile],
  )

  const result = (distillation.result || ws.distillationResult) as DistillationResult | null

  const contentPreview = useMemo(() => {
    if (!uploaded) return ''
    return uploaded.content.length > 500
      ? uploaded.content.slice(0, 500) + '...'
      : uploaded.content
  }, [uploaded])

  // If no file uploaded yet, show upload UI
  if (!uploaded) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              {uploading ? (
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="text-center">
              <p className="font-medium">
                {uploading ? '正在上传...' : '上传文章、报道或书籍内容'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                支持 .txt、.md、.text 格式，最大 5MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.text"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="size-4" />
              选择文件
            </Button>
            {uploadError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {uploadError}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Uploaded content preview */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {uploaded.sourceType}
            </Badge>
            {uploaded.fileName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="size-3" />
                {uploaded.fileName}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-auto p-0 text-xs"
              onClick={() => {
                workflowActions.setUploadedContent(null)
                workflowActions.setDistillationResult(null)
                setSelectedAngleId(null)
              }}
            >
              重新上传
            </Button>
          </div>
          {uploaded.title && (
            <h3 className="text-sm font-medium line-clamp-2">
              {uploaded.title}
            </h3>
          )}
          <div className="rounded-lg bg-muted/50 p-3 max-h-32 overflow-y-auto">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {contentPreview}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* User idea input */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="userIdea" className="flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" />
              你的创作意图和方向
            </Label>
            <Textarea
              id="userIdea"
              placeholder="例如：我想把这篇文章的核心观点提炼成一个 60 秒的口播稿，用更接地气的语言重新表达..."
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
                  topic: uploaded?.title || uploaded?.content.slice(0, 50) || '文件提炼创作',
                  category: '提炼创作',
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
              disabled={!userIdea.trim() || distillation.loading}
            >
              {distillation.loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  提炼内容 & 生成创作角度...
                </>
              ) : (
                <>
                  <BookOpen className="size-4" />
                  提炼内容 & 生成创作角度
                </>
              )}
            </Button>
          </div>

          {distillation.error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {distillation.error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Distillation result */}
      {result && (
        <div className="flex flex-col gap-4">
          {/* Source analysis */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">内容提炼</h3>
              </div>

              <div className="text-xs">
                <span className="text-muted-foreground">核心主题</span>
                <p className="font-medium mt-0.5">{result.sourceAnalysis.coreTheme}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">情绪曲线</span>
                  <p className="font-medium mt-0.5">
                    {result.sourceAnalysis.emotionalArc.start} →{' '}
                    {result.sourceAnalysis.emotionalArc.middle} →{' '}
                    {result.sourceAnalysis.emotionalArc.end}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">关键洞察</span>
                <ul className="text-xs space-y-1">
                  {result.sourceAnalysis.keyInsights.map((p, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-primary">{i + 1}.</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">内容结构</span>
                <div className="flex flex-wrap gap-1.5">
                  {result.sourceAnalysis.contentStructure.map((s, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {i + 1}. {s}
                    </Badge>
                  ))}
                </div>
              </div>

              {result.sourceAnalysis.memorableQuotes.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Quote className="size-3" /> 值得引用的金句
                  </span>
                  <ul className="text-xs space-y-1">
                    {result.sourceAnalysis.memorableQuotes.map((q, i) => (
                      <li key={i} className="flex gap-1.5">
                        <Quote className="size-3 text-primary shrink-0 mt-0.5" />
                        <span className="italic">{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Sparkles className="size-3" /> 可应用角度
                  </span>
                  <ul className="text-xs space-y-0.5">
                    {result.sourceAnalysis.applicableAngles.map((a, i) => (
                      <li key={i} className="text-green-600 dark:text-green-400">{a}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="size-3" /> 口播化弱点
                  </span>
                  <ul className="text-xs space-y-0.5">
                    {result.sourceAnalysis.weaknesses.map((w, i) => (
                      <li key={i} className="text-amber-600 dark:text-amber-400">{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Distilled angles */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">口播稿创作角度（选择一个继续）</h3>
              </div>

              {result.distilledAngles.map((angle, i) => (
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
                    <span className="text-muted-foreground">提炼内容：</span>
                    <span className="text-foreground">{angle.whatExtracted}</span>
                  </div>

                  <div className="mt-1.5 text-xs">
                    <span className="text-muted-foreground">切入理由：</span>
                    <span className="text-foreground">{angle.reasoning}</span>
                  </div>
                </div>
              ))}

              {selectedAngleId && (
                <div className="flex justify-end pt-1">
                  <Button
                    onClick={() => {
                      const angle = result.distilledAngles.find((a) => a.id === selectedAngleId)
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
        </div>
      )}
    </div>
  )
}
