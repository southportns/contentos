'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Search, ExternalLink, Loader2, Heart, MessageCircle, Share2, Bookmark,
  Check, MessageSquare, Clock, X, Plus, Library, Sparkles, Filter, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useDouyinSearch } from '@/hooks/use-douyin-search'
import { useContentLibrary } from '@/hooks/use-content-library'
import type {
  DouyinContent,
  PublishTimeFilter,
} from '@/hooks/use-douyin-search'
import {
  TIME_FILTERS,
  CommentAnalysisView,
  formatNumber,
} from '@/components/explorer/shared'

// ─── Like filter presets ──────────────────────────────
const LIKE_FILTERS = [
  { label: '不限', value: null as number | null },
  { label: '1k+', value: 1000 },
  { label: '1w+', value: 10000 },
  { label: '10w+', value: 100000 },
  { label: '50w+', value: 500000 },
]

export default function SearchPage() {
  const douyin = useDouyinSearch()
  const library = useContentLibrary()
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [timeFilter, setTimeFilter] = useState<PublishTimeFilter>('none')
  const [searchCount, setSearchCount] = useState(20)
  const [minLikes, setMinLikes] = useState<number | null>(null)
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())
  const tagInputRef = useRef<HTMLInputElement>(null)

  // ── Tag input handlers ──
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (!trimmed || tags.includes(trimmed)) return
    setTags([...tags, trimmed])
    setTagInput('')
    tagInputRef.current?.focus()
  }, [tagInput, tags])

  const removeTag = useCallback((tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }, [tags])

  // ── Search handler ──
  const handleSearch = useCallback(() => {
    if (tags.length === 0) return
    douyin.search({
      keywords: tags,
      count: searchCount,
      options: {
        publishTime: timeFilter,
        minLikes,
      },
    })
    setSelectedUrls(new Set())
  }, [douyin, tags, searchCount, timeFilter, minLikes])

  // ── Selection handlers ──
  const toggleSelect = useCallback((url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedUrls(new Set(douyin.results.map((r) => r.url)))
  }, [douyin.results])

  const clearSelection = useCallback(() => {
    setSelectedUrls(new Set())
  }, [])

  // ── Batch add to library ──
  const [batchSaving, setBatchSaving] = useState(false)
  const handleBatchAddToLibrary = useCallback(async () => {
    if (selectedUrls.size === 0) return
    setBatchSaving(true)
    try {
      const selected = douyin.results.filter((r) => selectedUrls.has(r.url))
      const items = selected.map((c) => ({
        platform: c.platform,
        url: c.url,
        title: c.title,
        content: c.content,
        author: c.author,
        cover: c.cover ?? null,
        publishedAt: c.publishedAt ?? null,
        metrics: c.metrics,
      }))
      await library.addContents(items as never)
      setSelectedUrls(new Set())
    } catch {
      // Error handled by library hook
    } finally {
      setBatchSaving(false)
    }
  }, [douyin.results, selectedUrls, library])

  // ── Batch extract transcript & add to library ──
  const [batchTranscriptLoading, setBatchTranscriptLoading] = useState(false)
  const [batchTranscriptProgress, setBatchTranscriptProgress] = useState<{ current: number; total: number; currentTitle: string } | null>(null)
  const handleBatchExtractTranscript = useCallback(async () => {
    if (selectedUrls.size === 0) return
    setBatchTranscriptLoading(true)
    setBatchTranscriptProgress({ current: 0, total: selectedUrls.size, currentTitle: '' })
    try {
      const selected = douyin.results.filter((r) => selectedUrls.has(r.url))
      const items = []
      let successCount = 0
      let failCount = 0

      for (let i = 0; i < selected.length; i++) {
        const c = selected[i]
        const title = c.title || c.content || '无标题'
        setBatchTranscriptProgress({ current: i, total: selected.length, currentTitle: title })

        // 获取文案
        let transcript: { text: string; language: string; duration: number; model: string } | null = null
        if (c.awemeId) {
          // 检查是否已有缓存的 transcript
          const cached = douyin.transcripts[c.awemeId]
          if (cached) {
            transcript = {
              text: cached.text,
              language: cached.language,
              duration: cached.duration,
              model: cached.model,
            }
          } else {
            try {
              const result = await douyin.extractTranscript(c.url, c.awemeId)
              if (result) {
                transcript = {
                  text: result.text,
                  language: result.language,
                  duration: result.duration,
                  model: result.model,
                }
              }
            } catch {
              // 文案提取失败，继续处理下一条
            }
          }
        }

        if (transcript) {
          successCount++
        } else {
          failCount++
        }

        items.push({
          platform: c.platform,
          url: c.url,
          title: c.title,
          content: c.content,
          author: c.author,
          cover: c.cover ?? null,
          publishedAt: c.publishedAt ?? null,
          metrics: c.metrics,
          transcript: transcript ?? null,
        })
      }

      setBatchTranscriptProgress({ current: selected.length, total: selected.length, currentTitle: `成功 ${successCount} 条，失败 ${failCount} 条` })

      // 将带文案的内容加入内容库
      await library.addContents(items as never)
      setSelectedUrls(new Set())
    } catch {
      // Error handled by library hook
    } finally {
      setBatchTranscriptLoading(false)
      setBatchTranscriptProgress(null)
    }
  }, [douyin, selectedUrls, library])

  const hasResults = douyin.results.length > 0
  const allSelected = hasResults && selectedUrls.size === douyin.results.length

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        {/* ── Multi-tag search input ── */}
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex gap-2">
            <div className="flex-1 flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[40px]">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 pr-1.5"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                ref={tagInputRef}
                placeholder={tags.length === 0 ? '输入标签后回车，支持多个标签同时搜索...' : '继续添加标签...'}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
                    removeTag(tags[tags.length - 1])
                  }
                }}
                className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={tags.length === 0 || douyin.loading}
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

          {/* ── Filter bar ── */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
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
                  }}
                >
                  {tf.label}
                </Button>
              ))}
            </div>

            {/* Count selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">数量</span>
              {[10, 20, 30, 50].map((n) => (
                <Button
                  key={n}
                  variant={searchCount === n ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSearchCount(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>

          {/* Like filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">点赞筛选</span>
            {LIKE_FILTERS.map((lf) => (
              <Button
                key={lf.label}
                variant={minLikes === lf.value ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setMinLikes(lf.value)}
              >
                {lf.label}
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

        {/* Search notice */}
        {douyin.searchNotice && !douyin.error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
            {douyin.searchNotice}
          </div>
        )}

        {/* ── Batch action bar (visible when items selected) ── */}
        {selectedUrls.size > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-primary" />
              <span>已选 {selectedUrls.size} / {douyin.results.length} 条</span>
              {library.contents.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <FileText className="size-3" />
                  内容库 {library.contents.length} 篇
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {batchTranscriptProgress && (
                <span className="text-xs text-muted-foreground">
                  {batchTranscriptProgress.current}/{batchTranscriptProgress.total}
                  {batchTranscriptProgress.currentTitle && ` · ${batchTranscriptProgress.currentTitle.slice(0, 20)}`}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearSelection}
                disabled={batchTranscriptLoading}
              >
                取消选择
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleBatchExtractTranscript}
                disabled={batchTranscriptLoading || batchSaving}
              >
                {batchTranscriptLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileText className="size-3.5" />
                )}
                获取文案并加入内容库
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleBatchAddToLibrary}
                disabled={batchSaving || batchTranscriptLoading}
              >
                {batchSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Library className="size-3.5" />
                )}
                加入内容库
              </Button>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {douyin.loading && douyin.results.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              正在搜索抖音视频{tags.length > 1 ? `（${tags.length} 个标签）` : ''}...
            </span>
          </div>
        ) : !hasResults ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Search className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {douyin.searchNotice
                ? '搜索未返回结果，请参考上方提示'
                : '输入标签开始搜索抖音视频'}
            </p>
          </div>
        ) : (
          <>
            {/* Select all bar */}
            {!douyin.loading && (
              <div className="flex items-center justify-between px-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={allSelected ? clearSelection : selectAll}
                >
                  {allSelected ? (
                    <>
                      <X className="size-3.5" />
                      取消全选
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      全选
                    </>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  共 {douyin.results.length} 条结果
                </span>
              </div>
            )}
            <ScrollArea className="h-[calc(100vh-22rem)]">
              <div className="flex flex-col gap-2 px-1 py-1">
                {douyin.results.map((content, i) => (
                  <DouyinContentCard
                    key={i}
                    content={content}
                    douyin={douyin}
                    selected={selectedUrls.has(content.url)}
                    onToggleSelect={() => toggleSelect(content.url)}
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

// ─── Douyin Content Card ───────────────────────────────

function DouyinContentCard({
  content,
  douyin,
  selected,
  onToggleSelect,
}: {
  content: DouyinContent
  douyin: ReturnType<typeof useDouyinSearch>
  selected: boolean
  onToggleSelect: () => void
}) {
  const metrics = content.metrics
  const hasMetrics = metrics && (metrics.likes || metrics.comments || metrics.shares || metrics.favorites)
  const awemeId = content.awemeId
  const comments = awemeId ? douyin.collectedComments[awemeId] : undefined
  const commentStat = awemeId ? douyin.commentStatus[awemeId] : undefined
  const analysis = awemeId
    ? douyin.commentAnalysis[awemeId]
    : undefined

  return (
    <Card className={`w-[808px] h-[120px] p-0 overflow-hidden ${selected ? 'border-primary ring-1 ring-primary/30' : ''}`}>
      <CardContent className="flex items-center gap-3 p-0 pl-[5px] pr-[8px] w-full h-full">
        {/* Checkbox */}
        <div className="flex items-center shrink-0">
          <button
            onClick={onToggleSelect}
            className={`flex size-5 items-center justify-center rounded border-2 transition-colors ${
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/30 hover:border-primary/50'
            }`}
          >
            {selected && <Check className="size-3" />}
          </button>
        </div>

        {/* Cover image */}
        {content.cover && (
          <div className="shrink-0 flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={content.cover}
              alt={content.title || ''}
              className="w-14 h-[100px] rounded-lg object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* Row 1: author + platform */}
          <div className="flex items-center gap-1.5">
            {content.platform === 'douyin' || !content.platform ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 32 32" className="shrink-0"><title>tik-tok</title><g fill="currentColor"><path d="M24.562,7.613c-1.508-.983-2.597-2.557-2.936-4.391-.073-.396-.114-.804-.114-1.221h-4.814l-.008,19.292c-.081,2.16-1.859,3.894-4.039,3.894-.677,0-1.315-.169-1.877-.465-1.288-.678-2.169-2.028-2.169-3.582,0-2.231,1.815-4.047,4.046-4.047,.417,0,.816,.069,1.194,.187v-4.914c-.391-.053-.788-.087-1.194-.087-4.886,0-8.86,3.975-8.86,8.86,0,2.998,1.498,5.65,3.783,7.254,1.439,1.01,3.19,1.606,5.078,1.606,4.886,0,8.86-3.975,8.86-8.86V11.357c1.888,1.355,4.201,2.154,6.697,2.154v-4.814c-1.345,0-2.597-.4-3.647-1.085Z" /></g></svg>
            ) : (
              <Badge variant="secondary" className="text-xs h-4 px-1">
                {content.platform}
              </Badge>
            )}
            {content.author && (
              <span className="text-xs font-medium text-foreground/80 truncate">
                {content.author}
              </span>
            )}
          </div>

          {/* Row 2: title */}
          <p className="text-sm line-clamp-2 leading-snug">
            {content.title || content.content || '无描述'}
          </p>

          {/* Row 3: metrics + actions inline */}
          <div className="flex items-center justify-between gap-2">
            {/* Metrics */}
            {hasMetrics ? (
              <div className="flex gap-2 text-xs text-muted-foreground">
                {metrics?.likes != null && (
                  <span className={`flex items-center gap-0.5 ${metrics.likes >= 10000 ? 'text-orange-500 font-medium' : ''}`}>
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
            ) : (
              <span />
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {awemeId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => douyin.collectComments(awemeId)}
                  disabled={douyin.commentsLoading}
                >
                  {douyin.commentsLoading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : comments && comments.length > 0 ? (
                    <Check className="size-3" />
                  ) : (
                    <MessageSquare className="size-3" />
                  )}
                  {comments && comments.length > 0
                    ? `${comments.length}`
                    : commentStat === 'no-qualified'
                      ? '无'
                      : commentStat === 'error'
                        ? '失败'
                        : '评论'}
                </Button>
              )}
              {content.url && (
                <a
                  href={content.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  原视频
                </a>
              )}
            </div>
          </div>

          {/* Comment error */}
          {commentStat === 'error' && douyin.commentsError && (
            <div className="rounded border border-destructive/20 bg-destructive/5 p-1.5 text-xs text-destructive">
              {douyin.commentsError}
            </div>
          )}

          {/* No qualified comments */}
          {commentStat === 'no-qualified' && (
            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-1.5 text-xs text-amber-600 dark:text-amber-400">
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
