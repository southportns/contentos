'use client'

import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDouyinSearch } from '@/hooks/use-douyin-search'

export default function HotPage() {
  const douyin = useDouyinSearch()

  return (
    <Card>
      <CardContent className="p-4">
        {/* Error */}
        {douyin.hotError && !douyin.hotLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="text-sm text-destructive">{douyin.hotError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => douyin.fetchHotSearch()}
            >
              <RefreshCw className="size-3.5" />
              重试
            </Button>
          </div>
        )}

        {/* Loading */}
        {douyin.hotLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              正在获取抖音热搜...
            </span>
          </div>
        )}

        {/* Results */}
        {!douyin.hotLoading && !douyin.hotError && douyin.hotSearch.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无热搜数据
          </div>
        ) : !douyin.hotLoading && !douyin.hotError && douyin.hotSearch.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="flex flex-col gap-1 pr-4">
              {douyin.hotSearch.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    douyin.search(item.word, 20, 'none')
                  }}
                >
                  <span
                    className={`flex size-6 items-center justify-center rounded text-xs font-bold ${
                      i < 3
                        ? 'bg-red-500 text-white'
                        : i < 10
                          ? 'bg-orange-500 text-white'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium">
                    {item.word}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.hot_value && parseInt(item.hot_value) > 10000
                      ? `${(parseInt(item.hot_value) / 10000).toFixed(1)}万`
                      : item.hot_value}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : null}
      </CardContent>
    </Card>
  )
}
