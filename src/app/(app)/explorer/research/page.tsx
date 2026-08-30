'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, ExternalLink, Loader2, Heart, MessageCircle, Share2, Bookmark,
  Sparkles, Plus, Check, MessageSquare, Clock, FileText, Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import { useContentLibrary } from '@/hooks/use-content-library'
import { useDouyinSearch } from '@/hooks/use-douyin-search'
import type { SearchedContent } from '@/hooks/use-workflow'
import type { PublishTimeFilter } from '@/hooks/use-douyin-search'
import {
  TIME_FILTERS,
  CommentAnalysisView,
  TranscriptView,
  formatNumber,
} from '@/components/explorer/shared'
import { ResearchProgress } from '@/components/explorer/research-progress'

export default function ResearchPage() {
  const { contents } = useContentLibrary()
  const douyin = useDouyinSearch()
  const [researchInput, setResearchInput] = useState('')
  const [researchTimeFilter, setResearchTimeFilter] =
    useState<PublishTimeFilter>('none')

  const handleResearch = useCallback(() => {
    if (!researchInput.trim()) return
    douyin.researchContent(researchInput.trim(), researchTimeFilter)
  }, [douyin, researchInput, researchTimeFilter])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        {/* Input */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            输入主题、对标账号或视频链接
          </div>
          <Textarea
            placeholder={
              '支持以下输入方式：\n' +
              '• 主题关键词：如 "AI替代程序员"、"年轻人为什么不想结婚"\n' +
              '• 抖音视频链接：如 https://www.douyin.com/video/7648778898376854818\n' +
              '• 话题关键词：如 "抖音 短视频运营"'
            }
            value={researchInput}
            onChange={(e) => setResearchInput(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            {/* Time filter */}
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              {TIME_FILTERS.map((tf) => (
                <Button
                  key={tf.value}
                  variant={researchTimeFilter === tf.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setResearchTimeFilter(tf.value)}
                >
                  {tf.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResearchInput('')}
                disabled={!researchInput.trim() || douyin.researchLoading}
              >
                清空
              </Button>
              <Button
                onClick={handleResearch}
                disabled={!researchInput.trim() || douyin.researchLoading}
                size="sm"
              >
                {douyin.researchLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    研究中...
                  </>
                ) : (
                  <>
                    <Search className="size-4" />
                    开始研究
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Error */}
        {douyin.researchError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {douyin.researchError}
          </div>
        )}

        {/* Search notice (搜索状态提示：网络错误、风控等) */}
        {douyin.researchNotice && !douyin.researchError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
            {douyin.researchNotice}
          </div>
        )}

        {/* Progress steps (visible during loading and while background tasks run) */}
        {douyin.researchSteps.length > 0 &&
          douyin.researchSteps.some((s) => s.status === 'active' || s.status === 'pending') && (
          <ResearchProgress steps={douyin.researchSteps} />
        )}

        {/* Loading (no results yet, no progress steps) */}
        {douyin.researchLoading && douyin.researchResults.length === 0 && douyin.researchSteps.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              正在初始化...
            </span>
          </div>
        ) : !douyin.researchLoading && douyin.researchResults.length === 0 && !douyin.researchError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {douyin.researchNotice
                ? '搜索未返回结果，请参考上方提示'
                : '输入主题或链接，开始采集内容'}
            </p>
          </div>
        ) : (
          <>
            {/* Results summary */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                采集到 {douyin.researchResults.length} 条内容
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => douyin.addToWorkflow(douyin.researchResults)}
              >
                <Plus className="size-3.5" />
                {contents.length > 0 ? '更新内容库' : '加入内容库'}
              </Button>
            </div>

            {/* Results list */}
            <ScrollArea className="h-[calc(100vh-14rem)]">
              <div className="flex flex-col gap-3 px-1 py-1">
                {douyin.researchResults.map((content, i) => (
                  <ResearchContentCard
                    key={i}
                    content={content}
                    inLibrary={contents.some((c) => c.url === content.url)}
                    onAdd={() => douyin.addToWorkflow([content])}
                    douyin={douyin}
                  />
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Research Content Card (with add-to-library + comment collection) ──

function ResearchContentCard({
  content,
  inLibrary,
  onAdd,
  douyin,
}: {
  content: SearchedContent
  inLibrary: boolean
  onAdd: () => void
  douyin: ReturnType<typeof useDouyinSearch>
}) {
  const router = useRouter()
  const metrics = content.metrics
  const hasMetrics = metrics && (metrics.likes || metrics.comments || metrics.shares || metrics.favorites)
  const isDouyin = content.platform === 'douyin'
  const awemeId = isDouyin
    ? content.url.match(/\/video\/(\d+)/)?.[1]
    : undefined

  const comments = awemeId ? douyin.collectedComments[awemeId] : undefined
  const commentStat = awemeId ? douyin.commentStatus[awemeId] : undefined
  const analysis = awemeId
    ? douyin.commentAnalysis[awemeId]
    : undefined
  const transcript = awemeId
    ? douyin.transcripts[awemeId]
    : undefined

  return (
    <Card>
      <CardContent className="flex gap-4 p-5">
        {/* Cover image */}
        {content.cover && (
          <div className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={content.cover}
              alt={content.title || ''}
              className="w-24 rounded-lg object-cover aspect-[9/16]"
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {content.platform === 'douyin' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" className="shrink-0"><title>tik-tok</title><g fill="currentColor"><path d="M24.562,7.613c-1.508-.983-2.597-2.557-2.936-4.391-.073-.396-.114-.804-.114-1.221h-4.814l-.008,19.292c-.081,2.16-1.859,3.894-4.039,3.894-.677,0-1.315-.169-1.877-.465-1.288-.678-2.169-2.028-2.169-3.582,0-2.231,1.815-4.047,4.046-4.047,.417,0,.816,.069,1.194,.187v-4.914c-.391-.053-.788-.087-1.194-.087-4.886,0-8.86,3.975-8.86,8.86,0,2.998,1.498,5.65,3.783,7.254,1.439,1.01,3.19,1.606,5.078,1.606,4.886,0,8.86-3.975,8.86-8.86V11.357c1.888,1.355,4.201,2.154,6.697,2.154v-4.814c-1.345,0-2.597-.4-3.647-1.085Z" /></g></svg>
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
            </div>
            <h3 className="text-sm font-medium mt-1 line-clamp-2">
              {content.title || '无标题'}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isDouyin && awemeId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => douyin.extractTranscript(content.url, awemeId)}
                disabled={douyin.transcriptLoading}
                title={transcript ? '已提取' : '下载音频 + Whisper 语音转文字，约30-60秒'}
              >
                {douyin.transcriptLoading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    提取中...
                  </>
                ) : transcript ? (
                  <>
                    <Check className="size-3.5" />
                    文案已提取
                  </>
                ) : (
                  <>
                    <FileText className="size-3.5" />
                    提取文案
                  </>
                )}
              </Button>
            )}
            {isDouyin && awemeId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => douyin.collectComments(awemeId)}
                disabled={douyin.commentsLoading}
              >
                {douyin.commentsLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : comments && comments.length > 0 ? (
                  <Check className="size-3.5" />
                ) : commentStat === 'no-qualified' ? (
                  <MessageSquare className="size-3.5" />
                ) : commentStat === 'error' ? (
                  <MessageSquare className="size-3.5" />
                ) : (
                  <MessageSquare className="size-3.5" />
                )}
                {comments && comments.length > 0
                  ? `评论 ${comments.length} 条`
                  : commentStat === 'no-qualified'
                    ? '无符合条件评论'
                    : commentStat === 'error'
                      ? '评论采集失败'
                      : '采集评论'}
              </Button>
            )}
            {inLibrary ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAdd}
                className="h-7 px-2"
                title="更新内容库中的这条记录（同步最新的文案和评论）"
              >
                <Check className="size-3.5" />
                更新
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAdd}
                className="h-7 px-2"
              >
                <Plus className="size-3.5" />
                收录
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-primary hover:text-primary"
              onClick={() => {
                workflowActions.setReferenceContent(content)
                workflowActions.clearDownstream()
                router.push('/create/adapt')
              }}
              title="将对标内容送入创作系统进行改编"
            >
              <Wand2 className="size-3.5" />
              改编创作
            </Button>
            {content.url && (
              <a href={content.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4 text-muted-foreground" />
              </a>
            )}
          </div>
        </div>

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

        {content.content && (
          <p className="text-xs text-muted-foreground">
            {content.content}
          </p>
        )}

        {/* Transcript error */}
        {douyin.transcriptError && !transcript && (
          <div className="rounded border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
            {douyin.transcriptError}
          </div>
        )}

        {/* Transcript results */}
        {transcript && (
          <TranscriptView transcript={transcript} />
        )}

        {/* Comment error */}
        {commentStat === 'error' && douyin.commentsError && (
          <div className="rounded border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
            {douyin.commentsError}
          </div>
        )}

        {/* No qualified comments */}
        {commentStat === 'no-qualified' && (
          <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
            本视频没有点赞 ≥ 100 的评论，跳过评论分析。
          </div>
        )}

        {/* Comment analysis results */}
        {comments && comments.length > 0 && (
          <CommentAnalysisView comments={comments} analysis={analysis} />
        )}
        </div>
      </CardContent>
    </Card>
  )
}
