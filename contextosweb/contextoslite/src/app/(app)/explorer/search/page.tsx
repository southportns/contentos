'use client'

import { useState, useCallback } from 'react'
import {
  Search, ExternalLink, Loader2, Heart, MessageCircle, Share2, Bookmark,
  Check, MessageSquare, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDouyinSearch } from '@/hooks/use-douyin-search'
import type {
  DouyinContent,
  PublishTimeFilter,
} from '@/hooks/use-douyin-search'
import {
  TIME_FILTERS,
  CommentAnalysisView,
  formatNumber,
} from '@/components/explorer/shared'

export default function SearchPage() {
  const douyin = useDouyinSearch()
  const [douyinQuery, setDouyinQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState<PublishTimeFilter>('none')

  const handleDouyinSearch = useCallback(() => {
    if (!douyinQuery.trim()) return
    douyin.search(douyinQuery.trim(), 20, timeFilter)
  }, [douyin, douyinQuery, timeFilter])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        {/* Search bar */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              placeholder="输入关键词搜索抖音视频..."
              value={douyinQuery}
              onChange={(e) => setDouyinQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDouyinSearch()
              }}
              className="flex-1"
            />
            <Button
              onClick={handleDouyinSearch}
              disabled={!douyinQuery.trim() || douyin.loading}
              size="sm"
            >
              {douyin.loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              搜索
            </Button>
          </div>
          {/* Time filter */}
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted-foreground" />
            {TIME_FILTERS.map((tf) => (
              <Button
                key={tf.value}
                variant={timeFilter === tf.value ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setTimeFilter(tf.value)
                  if (douyinQuery.trim()) {
                    douyin.search(douyinQuery.trim(), 20, tf.value)
                  }
                }}
              >
                {tf.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Error */}
        {douyin.error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {douyin.error}
          </div>
        )}

        {/* Search notice (风控提示) */}
        {douyin.searchNotice && !douyin.error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
            {douyin.searchNotice}
          </div>
        )}

        {/* Results */}
        {douyin.loading && douyin.results.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              正在搜索抖音视频...
            </span>
          </div>
        ) : douyin.results.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Search className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {douyin.searchNotice
                ? '搜索未返回结果，请参考上方提示'
                : '输入关键词开始搜索抖音视频'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-24rem)]">
            <div className="flex flex-col gap-2 pr-4">
              {douyin.results.map((content, i) => (
                <DouyinContentCard
                  key={i}
                  content={content}
                  douyin={douyin}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Douyin Content Card ───────────────────────────────

function DouyinContentCard({
  content,
  douyin,
}: {
  content: DouyinContent
  douyin: ReturnType<typeof useDouyinSearch>
}) {
  const [expanded, setExpanded] = useState(false)
  const metrics = content.metrics
  const hasMetrics = metrics && (metrics.likes || metrics.comments || metrics.shares || metrics.favorites)
  const awemeId = content.awemeId
  const comments = awemeId ? douyin.collectedComments[awemeId] : undefined
  const analysis = awemeId
    ? douyin.commentAnalysis[awemeId]
    : undefined

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex gap-3 p-4">
        {/* Cover image */}
        {content.cover && (
          <div className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={content.cover}
              alt={content.title || ''}
              className="size-20 rounded-lg object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              抖音
            </Badge>
            {content.author && (
              <span className="text-xs text-muted-foreground">
                {content.author}
              </span>
            )}
          </div>

          <p className={`text-sm ${expanded ? '' : 'line-clamp-2'}`}>
            {content.title || content.content || '无描述'}
          </p>

          {!expanded && content.title && content.content && content.title !== content.content && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-primary hover:underline self-start"
            >
              展开
            </button>
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

          <div className="flex items-center gap-2">
            {awemeId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
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
            {content.url && (
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                查看原视频 →
              </a>
            )}
          </div>

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
        </div>
      </CardContent>
    </Card>
  )
}
