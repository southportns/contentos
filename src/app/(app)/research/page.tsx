'use client'

import { useWorkflow } from '@/hooks/use-workflow'
import { useContentLibrary } from '@/hooks/use-content-library'
import { Sparkles, Search, FileText, ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function ResearchPage() {
  const { topicProfile, viralResult } = useWorkflow()
  const { contents } = useContentLibrary()

  if (!topicProfile) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">研究</h1>
          <p className="text-muted-foreground">查看当前主题的研究成果</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Search className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">还没有研究数据</p>
              <p className="text-sm text-muted-foreground">
                输入一个主题开始研究，结果会在这里展示
              </p>
            </div>
            <Link href="/create" className={cn(buttonVariants())}>
              <Sparkles className="size-4" />
              开始研究
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">研究</h1>
          <p className="text-muted-foreground">当前主题的研究成果</p>
        </div>
        <Link href="/explorer" className={cn(buttonVariants({ variant: 'outline' }))}>
          浏览全部内容
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {/* Topic Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            主题画像
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <span className="font-medium">{topicProfile.topic}</span>
            {topicProfile.category && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {topicProfile.category}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topicProfile.keywords.map((kw) => (
              <Badge key={kw} variant="outline" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
          {topicProfile.coreQuestions.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">核心问题：</span>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                {topicProfile.coreQuestions.map((q, i) => (
                  <li key={i} className="text-muted-foreground">{q}</li>
                ))}
              </ul>
            </div>
          )}
          {topicProfile.researchQueries.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">搜索词：</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {topicProfile.researchQueries.map((q, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {q}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contents summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            采集内容
            <Badge variant="secondary" className="ml-auto">
              {contents.length} 条
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contents.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无采集内容</p>
          ) : (
            <div className="flex flex-col gap-2">
              {contents.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs">{c.platform}</Badge>
                  <span className="truncate flex-1">{c.title || '无标题'}</span>
                </div>
              ))}
              {contents.length > 5 && (
                <Link href="/explorer" className="text-xs text-primary hover:underline">
                  查看全部 {contents.length} 条 →
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Viral analysis summary */}
      {viralResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              爆款分析
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-primary">
                {viralResult.patterns.avgViralScore}
              </span>
              <span className="text-sm text-muted-foreground">平均爆款分</span>
            </div>
            {viralResult.patterns.viralFactors.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">传播关键因素：</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {viralResult.patterns.viralFactors.map((f, i) => (
                    <Badge key={i} variant="default" className="text-xs">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
