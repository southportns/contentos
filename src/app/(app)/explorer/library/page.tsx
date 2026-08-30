'use client'

import { useState } from 'react'
import {
  FileText, ExternalLink, Trash2,
  Heart, MessageCircle, Share2, Bookmark,
  ChevronDown, MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useContentLibrary } from '@/hooks/use-content-library'
import type { SearchedContent } from '@/hooks/use-workflow'
import {
  formatNumber,
  CommentAnalysisView,
  TranscriptView,
} from '@/components/explorer/shared'
import type {
  DouyinComment,
  CommentAnalysisResult,
  VideoTranscript,
} from '@/hooks/use-douyin-search'

export default function LibraryPage() {
  const { contents, removeContent, clearAll } = useContentLibrary()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const platforms = Array.from(
    new Set(contents.map((c) => c.platform)),
  )

  const filtered = contents.filter((c) => {
    const matchesQuery = !query ||
      (c.title?.toLowerCase().includes(query.toLowerCase()) ?? false) ||
      (c.content?.toLowerCase().includes(query.toLowerCase()) ?? false)
    const matchesPlatform = filter === 'all' || c.platform === filter
    return matchesQuery && matchesPlatform
  })

  if (contents.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <FileText className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">内容库为空</p>
            <p className="text-sm text-muted-foreground">
              在&ldquo;账号研究&rdquo;中采集内容，加入内容库后这里展示
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="搜索标题或内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <div className="flex gap-1">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              全部
            </Button>
            {platforms.map((p) => (
              <Button
                key={p}
                variant={filter === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(p)}
              >
                {p === 'douyin' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 32 32" className="shrink-0"><title>tik-tok</title><g fill="currentColor"><path d="M24.562,7.613c-1.508-.983-2.597-2.557-2.936-4.391-.073-.396-.114-.804-.114-1.221h-4.814l-.008,19.292c-.081,2.16-1.859,3.894-4.039,3.894-.677,0-1.315-.169-1.877-.465-1.288-.678-2.169-2.028-2.169-3.582,0-2.231,1.815-4.047,4.046-4.047,.417,0,.816,.069,1.194,.187v-4.914c-.391-.053-.788-.087-1.194-.087-4.886,0-8.86,3.975-8.86,8.86,0,2.998,1.498,5.65,3.783,7.254,1.439,1.01,3.19,1.606,5.078,1.606,4.886,0,8.86-3.975,8.86-8.86V11.357c1.888,1.355,4.201,2.154,6.697,2.154v-4.814c-1.345,0-2.597-.4-3.647-1.085Z" /></g></svg>
                ) : (
                  p
                )}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm('确定清空内容库中的所有内容吗？')) {
                clearAll()
              }
            }}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            清空
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="flex flex-col gap-2 px-1 py-1">
            {filtered.map((content, i) => (
              <ContentCard
                key={i}
                content={content}
                onDelete={() => removeContent(content.url)}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// ─── Library Content Card ──────────────────────────────

function ContentCard({
  content,
  onDelete,
}: {
  content: SearchedContent
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const metrics = content.metrics
  const hasMetrics = metrics && (metrics.likes || metrics.comments || metrics.shares || metrics.favorites)

  // 将 SearchedContent 上附带的评论数据还原为 CommentAnalysisView 需要的格式
  const comments: DouyinComment[] | undefined = content.collectedComments?.map((c) => ({
    text: c.text,
    nickname: c.nickname,
    diggCount: c.diggCount,
    createTime: c.createTime,
  }))
  const hasComments = comments && comments.length > 0

  // 将 SearchedContent 上附带的 transcript 还原为 TranscriptView 需要的格式
  const transcript: VideoTranscript | undefined = content.transcript
    ? {
        awemeId: content.url,
        text: content.transcript.text,
        language: content.transcript.language,
        duration: content.transcript.duration,
        model: content.transcript.model,
        segments: [],
      }
    : undefined

  // 还原评论分析数据
  const analysis: CommentAnalysisResult | undefined = content.commentAnalysis
    ? {
        topComments: content.commentAnalysis.topComments.map((c) => ({
          text: c.text,
          nickname: c.nickname,
          diggCount: c.diggCount,
          createTime: c.createTime,
        })),
        keywords: content.commentAnalysis.keywords,
        sentiment: content.commentAnalysis.sentiment,
        summary: content.commentAnalysis.summary,
      }
    : undefined

  return (
    <Card>
      <CardContent className="flex gap-3 p-4">
        {/* Cover image */}
        {content.cover && (
          <div className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={content.cover}
              alt={content.title || ''}
              className="w-20 rounded-lg object-cover aspect-[9/16]"
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
              {confirmDelete ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      onDelete()
                      setConfirmDelete(false)
                    }}
                  >
                    确认删除
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmDelete(false)}
                  >
                    取消
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                  {content.url && (
                    <a href={content.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-4 text-muted-foreground" />
                    </a>
                  )}
                </>
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

          {/* 口播文案 — 折叠按钮 */}
          {transcript && (
            <div className="flex flex-col gap-0">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors self-start"
              >
                <FileText className="size-3.5" />
                口播文案
                <ChevronDown
                  className={`size-3.5 transition-transform ${showTranscript ? 'rotate-180' : ''}`}
                />
              </button>
              {showTranscript && (
                <TranscriptView transcript={transcript} />
              )}
            </div>
          )}

          {/* 评论分析 — 折叠按钮 */}
          {hasComments && comments && (
            <div className="flex flex-col gap-0">
              <button
                onClick={() => setShowComments(!showComments)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors self-start"
              >
                <MessageSquare className="size-3.5" />
                评论分析 ({comments.length} 条)
                <ChevronDown
                  className={`size-3.5 transition-transform ${showComments ? 'rotate-180' : ''}`}
                />
              </button>
              {showComments && (
                <CommentAnalysisView comments={comments} analysis={analysis} />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
