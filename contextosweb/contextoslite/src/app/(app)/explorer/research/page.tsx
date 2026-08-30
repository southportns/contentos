'use client'

import { useState, useCallback } from 'react'
import {
  Search, ExternalLink, Loader2, Heart, MessageCircle, Share2, Bookmark,
  Sparkles, Plus, Check, MessageSquare, Clock, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkflow } from '@/hooks/use-workflow'
import { useDouyinSearch } from '@/hooks/use-douyin-search'
import type { SearchedContent } from '@/hooks/use-workflow'
import type { PublishTimeFilter } from '@/hooks/use-douyin-search'
import {
  TIME_FILTERS,
  CommentAnalysisView,
  TranscriptView,
  formatNumber,
} from '@/components/explorer/shared'

export default function ResearchPage() {
  const { contents } = useWorkflow()
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

        {/* Loading */}
        {douyin.researchLoading && douyin.researchResults.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              正在采集内容数据...
            </span>
          </div>
        ) : douyin.researchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              输入主题或链接，开始采集内容
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
                加入内容库
              </Button>
            </div>

            {/* Results list */}
            <ScrollArea className="h-[calc(100vh-30rem)]">
              <div className="flex flex-col gap-2 pr-4">
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
  const [expanded, setExpanded] = useState(false)
  const metrics = content.metrics
  const hasMetrics = metrics && (metrics.likes || metrics.comments || metrics.shares || metrics.favorites)
  const isDouyin = content.platform === 'douyin'
  const awemeId = isDouyin
    ? content.url.match(/\/video\/(\d+)/)?.[1]
    : undefined

  const comments = awemeId ? douyin.collectedComments[awemeId] : undefined
  const analysis = awemeId
    ? douyin.commentAnalysis[awemeId]
    : undefined
  const transcript = awemeId
    ? douyin.transcripts[awemeId]
    : undefined

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {content.platform}
              </Badge>
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
              >
                {douyin.transcriptLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : transcript ? (
                  <Check className="size-3.5" />
                ) : (
                  <FileText className="size-3.5" />
                )}
                {transcript ? '文案已提取' : '提取文案'}
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
                ) : (
                  <MessageSquare className="size-3.5" />
                )}
                {comments && comments.length > 0
                  ? `评论 ${comments.length} 条`
                  : '采集评论'}
              </Button>
            )}
            {inLibrary ? (
              <Badge variant="outline" className="text-xs">
                <Check className="size-3 mr-0.5" />
                已收录
              </Badge>
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
          <>
            <p className={expanded ? 'text-xs text-muted-foreground' : 'text-xs text-muted-foreground line-clamp-2'}>
              {content.content}
            </p>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline self-start"
            >
              {expanded ? '收起' : '展开'}
            </button>
          </>
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
        {douyin.commentsError && comments === undefined && (
          <div className="rounded border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
            {douyin.commentsError}
          </div>
        )}

        {/* Comment analysis results */}
        {comments && comments.length > 0 && (
          <CommentAnalysisView comments={comments} analysis={analysis} />
        )}
      </CardContent>
    </Card>
  )
}
