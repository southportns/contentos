import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const features = [
  {
    title: '主题研究',
    description: '输入一个主题，系统自动完成互联网内容研究，理解话题全貌。',
    status: 'P0',
  },
  {
    title: '爆款分析',
    description: '分析为什么内容能够传播，从 Hook、情绪、共鸣、结构等维度拆解。',
    status: 'P0',
  },
  {
    title: '用户洞察',
    description: '从评论和互动中提炼用户真正关心什么，发现真实需求和情绪。',
    status: 'P0',
  },
  {
    title: '角度生成',
    description: '基于研究结果生成 3~5 个值得写的内容切入角度，并评分推荐。',
    status: 'P0',
  },
  {
    title: 'AI 写作',
    description: '基于策略生成初稿，支持 AI Rewrite、Continue、Improve。',
    status: 'P0',
  },
  {
    title: '内容评估',
    description: '多维度评分，检测 AI 味，优化传播潜力。',
    status: 'P0',
  },
]

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <span className="text-lg font-semibold">Content OS</span>
          <Badge variant="secondary" className="ml-2">
            v0.1.0
          </Badge>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'default' }))}>
          进入工作台
          <ArrowRight className="size-4" />
        </Link>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <Badge variant="outline">AI 内容研究与写作操作系统</Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          帮你找到值得写的内容，
          <br />
          并告诉你为什么值得写。
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          不是简单的 AI Writer。而是从选题 → 内容研究 → 爆款拆解 → 观点提炼 → 写作 → 评估的完整内容生产系统。
        </p>
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'default', size: 'lg' }))}
          >
            开始创作
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/research"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
          >
            了解更多
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <Badge variant="secondary">{feature.status}</Badge>
                </div>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        Content OS — 研究驱动的内容生产闭环
      </footer>
    </div>
  )
}
