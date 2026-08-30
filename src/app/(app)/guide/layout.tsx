'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Server } from 'lucide-react'

import { cn } from '@/lib/utils'

const subNavItems = [
  { title: '使用指导', href: '/guide', icon: BookOpen },
  { title: '本地部署', href: '/guide/deployment', icon: Server },
]

export default function GuideLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] max-w-3xl flex-col">
      {/* 二级导航 — 固定在顶部，不随滚动 */}
      <nav className="flex shrink-0 items-center gap-1 border-b px-6 pt-4">
        {subNavItems.map((item) => {
          const isActive =
            item.href === '/guide'
              ? pathname === '/guide'
              : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-4" />
              {item.title}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  )
}
