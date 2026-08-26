'use client'

import { useState } from 'react'
import { Search, FileText, ExternalLink, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkflow } from '@/hooks/use-workflow'
import type { SearchedContent } from '@/hooks/use-workflow'

export default function ExplorerPage() {
  const { contents } = useWorkflow()
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
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">内容浏览器</h1>
          <p className="text-muted-foreground">浏览研究阶段采集的内容</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">还没有内容数据</p>
              <p className="text-sm text-muted-foreground">
                先进行一次主题研究，采集到的内容会在这里展示
              </p>
            </div>
            <a href="/create">
              <Button variant="outline" size="sm">
                <Search className="size-4" />
                前往研究
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">内容浏览器</h1>
        <p className="text-muted-foreground">
          共 {contents.length} 条内容
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2">
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
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Content list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 pr-4">
          {filtered.map((content, i) => (
            <ContentCard key={i} content={content} />
          ))}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              没有匹配的内容
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ContentCard({ content }: { content: SearchedContent }) {
  const [expanded, setExpanded] = useState(false)

  const metrics = content.metrics
  const hasMetrics = metrics && (metrics.likes || metrics.comments || metrics.views)

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
          {content.url && (
            <a href={content.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4 text-muted-foreground" />
            </a>
          )}
        </div>

        {hasMetrics && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            {metrics?.likes != null && (
              <span>👍 {metrics.likes}</span>
            )}
            {metrics?.comments != null && (
              <span>💬 {metrics.comments}</span>
            )}
            {metrics?.views != null && (
              <span>👁 {metrics.views}</span>
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
      </CardContent>
    </Card>
  )
}
