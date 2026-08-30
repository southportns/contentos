'use client'

import { useState, useCallback } from 'react'
import { MessageSquare, ThumbsUp, FileText, Copy, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  DouyinComment,
  CommentAnalysisResult,
  PublishTimeFilter,
  VideoTranscript,
} from '@/hooks/use-douyin-search'

// ─── Time filter options ───────────────────────────────

export const TIME_FILTERS: { label: string; value: PublishTimeFilter }[] = [
  { label: '全部时间', value: 'none' },
  { label: '一天内', value: '1d' },
  { label: '一周内', value: '7d' },
  { label: '半个月内', value: '14d' },
  { label: '一个月内', value: '30d' },
]

// ─── Comment Analysis View ────────────────────────────

export function CommentAnalysisView({
  comments,
  analysis,
}: {
  comments: DouyinComment[]
  analysis?: CommentAnalysisResult
}) {
  const [showAll, setShowAll] = useState(false)
  const displayComments = showAll ? comments : comments.slice(0, 5)

  return (
    <div className="mt-2 rounded-lg border border-muted bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium flex items-center gap-1">
          <MessageSquare className="size-3.5" />
          评论分析 ({comments.length} 条)
        </span>
        <span className="text-xs text-muted-foreground">
          ≥100 赞 · 按热度排序
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        已采集点赞数≥100的评论，按点赞数由高到低排列（上限100条）
      </p>

      {/* Analysis summary */}
      {analysis && (
        <div className="flex flex-col gap-2 mb-3">
          {/* Sentiment bar */}
          {analysis.sentiment.positive +
            analysis.sentiment.neutral +
            analysis.sentiment.negative >
            0 && (
            <div className="flex gap-1 h-2 rounded-full overflow-hidden">
              {analysis.sentiment.positive > 0 && (
                <div
                  className="bg-green-500"
                  style={{ width: `${analysis.sentiment.positive}%` }}
                />
              )}
              {analysis.sentiment.neutral > 0 && (
                <div
                  className="bg-gray-400"
                  style={{ width: `${analysis.sentiment.neutral}%` }}
                />
              )}
              {analysis.sentiment.negative > 0 && (
                <div
                  className="bg-red-500"
                  style={{ width: `${analysis.sentiment.negative}%` }}
                />
              )}
            </div>
          )}

          {/* Keywords */}
          {analysis.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {analysis.keywords.map((kw, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-xs"
                >
                  {kw}
                </Badge>
              ))}
            </div>
          )}

          {/* Top comments */}
          {analysis.topComments.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ThumbsUp className="size-3" />
                热点评论
              </span>
              {analysis.topComments.map((c, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded bg-background/50 p-1.5"
                >
                  <Badge variant="outline" className="text-xs shrink-0">
                    {c.diggCount > 0 ? formatNumber(c.diggCount) : '0'}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground">
                      {c.nickname}:
                    </span>
                    <p className="text-xs">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All comments */}
      <div className="flex flex-col gap-1">
        {displayComments.map((c, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded bg-background/30 p-1.5"
          >
            <Badge variant="outline" className="text-xs shrink-0">
              {c.diggCount > 0 ? formatNumber(c.diggCount) : '0'}
            </Badge>
            <div className="flex-1 min-w-0">
              <span className="text-xs text-muted-foreground">
                {c.nickname}:
              </span>
              <p className="text-xs">{c.text}</p>
            </div>
          </div>
        ))}
      </div>

      {comments.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-primary hover:underline mt-1 self-start"
        >
          {showAll ? '收起' : `展开全部 ${comments.length} 条评论`}
        </button>
      )}
    </div>
  )
}

// ─── Transcript View ─────────────────────────────────

export function TranscriptView({
  transcript,
}: {
  transcript: VideoTranscript
}) {
  const [showSegments, setShowSegments] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(transcript.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [transcript.text])

  const durationStr = formatDuration(transcript.duration)

  return (
    <div className="mt-2 rounded-lg border border-muted bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium flex items-center gap-1">
          <FileText className="size-3.5" />
          口播文案
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {transcript.language}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {durationStr}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
            {copied ? '已复制' : '复制'}
          </Button>
        </div>
      </div>

      {/* 全文文案 */}
      <p className="text-sm whitespace-pre-wrap leading-relaxed">
        {transcript.text}
      </p>

      {/* 分段时间戳 */}
      {transcript.segments.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowSegments(!showSegments)}
            className="text-xs text-primary hover:underline"
          >
            {showSegments
              ? '收起分段时间戳'
              : `查看分段时间戳 (${transcript.segments.length} 段)`}
          </button>
          {showSegments && (
            <div className="mt-1 flex flex-col gap-1 max-h-60 overflow-y-auto">
              {transcript.segments.map((seg, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded bg-background/30 p-1.5"
                >
                  <Badge variant="outline" className="text-xs shrink-0 font-mono">
                    {formatTimestamp(seg.start)}
                  </Badge>
                  <p className="text-xs flex-1">{seg.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 text-xs text-muted-foreground">
        模型: {transcript.model}
      </div>
    </div>
  )
}

// ─── Utils ─────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function formatNumber(n: number): string {
  if (n >= 10000) {
    return `${(n / 10000).toFixed(1)}万`
  }
  return n.toString()
}
