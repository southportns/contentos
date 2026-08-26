'use client'

import {
  FileText, Tag, HelpCircle, Lightbulb, Globe, ExternalLink,
  Loader2, Sparkles, Flame, AlertCircle, ArrowRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StepHeader } from './step-header'
import type { TopicProfile, SearchedContent } from '@/hooks/use-workflow'

const platformLabels: Record<string, string> = {
  xiaohongshu: '小红书', douyin: '抖音', weibo: '微博', zhihu: '知乎',
  wechat: '公众号', bilibili: 'B站', toutiao: '头条', web: '网页',
}

interface StepResearchProps {
  topicProfile: TopicProfile
  contents: SearchedContent[]
  searching: boolean
  onAnalyze: () => void
  onSkip: () => void
  analyzing: boolean
  error: string | null
}

export function StepResearch({
  topicProfile, contents, searching, onAnalyze, onSkip, analyzing, error,
}: StepResearchProps) {
  return (
    <Card>
      <StepHeader step={1} title="主题研究" active={false} done />
      <CardContent className="flex flex-col gap-4">
        {/* Profile summary */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="size-4 text-muted-foreground" />
            <span className="font-medium">{topicProfile.category}</span>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tag className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">关键词</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topicProfile.keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <HelpCircle className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">核心问题</span>
            </div>
            <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              {topicProfile.coreQuestions.map((q) => <li key={q}>• {q}</li>)}
            </ul>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">潜在角度</span>
            </div>
            <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              {topicProfile.potentialAngles.map((a) => <li key={a}>• {a}</li>)}
            </ul>
          </div>
        </div>

        {/* Search results */}
        <Separator />
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-primary" />
          <span className="text-sm font-medium">内容搜索结果</span>
          <Badge variant="secondary" className="text-xs">{contents.length} 条</Badge>
          {searching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>

        {contents.length > 0 && (
          <ScrollArea className="max-h-[300px]">
            <div className="flex flex-col gap-2">
              {contents.map((content, i) => (
                <div key={`${content.url}-${i}`} className="flex flex-col gap-1 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {platformLabels[content.platform] || content.platform}
                      </Badge>
                      <span className="text-sm font-medium truncate">{content.title || content.url}</span>
                    </div>
                    <a href={content.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    </a>
                  </div>
                  {content.content && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{content.content}</p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Next: viral analysis or skip */}
        {!searching && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {contents.length > 0 ? (
                  <><Flame className="size-4" />下一步：分析这些内容的爆款潜力</>
                ) : (
                  <><AlertCircle className="size-4 text-yellow-600" />未搜索到内容，可跳过直接生成角度</>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onSkip}>
                  跳过 <ArrowRight className="size-3.5" />
                </Button>
                {contents.length > 0 && (
                  <Button onClick={onAnalyze} disabled={analyzing} size="sm">
                    {analyzing ? (
                      <><Loader2 className="size-4 animate-spin" />分析中...</>
                    ) : (
                      <><Sparkles className="size-4" />爆款分析</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />{error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
