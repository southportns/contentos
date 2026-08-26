'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

const routeNames: Record<string, string> = {
  dashboard: 'Dashboard',
  create: '创建内容',
  workspace: '工作台',
  research: '研究',
  explorer: '内容浏览',
  projects: '项目',
  settings: '设置',
}

export function AppHeader() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {segments.length === 0 ? (
            <BreadcrumbItem>
              <BreadcrumbPage>首页</BreadcrumbPage>
            </BreadcrumbItem>
          ) : (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">首页</BreadcrumbLink>
              </BreadcrumbItem>
              {segments.map((segment, index) => {
                const isLast = index === segments.length - 1
                const href = `/${segments.slice(0, index + 1).join('/')}`
                const name = routeNames[segment] || segment

                return (
                  <React.Fragment key={href}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{name}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={href}>{name}</BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                )
              })}
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
