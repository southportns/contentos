'use client'

import { usePathname } from 'next/navigation'

const PAGE_META: Record<
  string,
  { title: string; description: string }
> = {
  '/explorer/research': {
    title: '账号研究',
    description: '输入主题或链接，采集内容数据并深度分析评论区',
  },
  '/explorer/search': {
    title: '话题搜索',
    description: '搜索抖音视频，支持按发布时间筛选',
  },
  '/explorer/hot': {
    title: '抖音热搜',
    description: '实时抖音热搜榜，点击词条快速搜索相关视频',
  },
  '/explorer/library': {
    title: '内容库',
    description: '已采集的内容集合，支持搜索和按平台筛选',
  },
}

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const meta = PAGE_META[pathname] ?? {
    title: '内容浏览器',
    description: '研究内容、搜索抖音视频、查看热搜榜、深度分析评论区',
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{meta.title}</h1>
        <p className="text-muted-foreground">{meta.description}</p>
      </div>

      {children}
    </div>
  )
}
