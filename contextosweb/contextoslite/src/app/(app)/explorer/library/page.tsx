'use client'

import { useState } from 'react'
import {
  FileText, ExternalLink, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkflow } from '@/hooks/use-workflow'
import type { SearchedContent } from '@/hooks/use-workflow'
import { formatNumber } from '@/components/explorer/shared'

export default function LibraryPage() {
  const { contents, removeContent, clearContents } = useWorkflow()
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
                {p}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm('确定清空内容库中的所有内容吗？')) {
                clearContents()
              }
            }}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            清空
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="flex flex-col gap-2 pr-4">
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
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
