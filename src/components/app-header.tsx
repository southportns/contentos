'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

/**
 * 路由段 → 显示名映射。
 *
 * 对于在不同父路径下有不同含义的同名段（如 `research`），
 * 使用「完整路径 → 名称」优先匹配，再用单段名兜底。
 */
const fullPathNames: Record<string, string> = {
  // /create/* — 创作流程步骤
  '/create/topic': '主题输入',
  '/create/research': '主题研究',
  '/create/angles': '角度选择',
  '/create/generate': '生成内容',
  '/create/refine': '二次精修',
  '/create/final': '终稿输出',
  // /explorer/* — 内容浏览器子页
  '/explorer/research': '账号研究',
  '/explorer/search': '话题搜索',
  '/explorer/hot': '抖音热搜',
  '/explorer/library': '内容库',
  // /guide/*
  '/guide/deployment': '本地部署',
}

const segmentNames: Record<string, string> = {
  create: '创建内容',
  workspace: '工作台',
  topic: '主题输入',
  research: '账号研究',
  viral: '爆款分析',
  angles: '角度选择',
  generate: '生成内容',
  refine: '二次精修',
  final: '终稿输出',
  explorer: '内容浏览器',
  search: '话题搜索',
  hot: '抖音热搜',
  library: '内容库',
  projects: '创作',
  settings: '设置',
  personas: '人设管理',
  diagnostics: '环境检测',
  dashboard: '仪表盘',
  guide: '使用指导',
  deployment: '本地部署',
}

export function AppHeader() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  return (
    <header className="flex h-14 items-center gap-3 border-b px-6">
      <Breadcrumb>
        <BreadcrumbList>
          {segments.length === 0 ? (
            <BreadcrumbItem>
              <BreadcrumbPage>首页</BreadcrumbPage>
            </BreadcrumbItem>
          ) : (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href="/projects">首页</BreadcrumbLink>
              </BreadcrumbItem>
              {segments.map((segment, index) => {
                const isLast = index === segments.length - 1
                const href = `/${segments.slice(0, index + 1).join('/')}`
                // 优先用完整路径匹配，再用单段名兜底
                const name = fullPathNames[href] || segmentNames[segment] || segment

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
