'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Settings,
  FolderKanban,
  Home,
  UserCircle,
  Activity,
  BookOpen,
  Compass,
  Sparkles,
  Flame,
  TrendingUp,
  FileText,
  ChevronRight,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useContentLibrary } from '@/hooks/use-content-library'

const navItems = [
  { title: '主页', href: '/', icon: Home },
  { title: '人设管理', href: '/personas', icon: UserCircle },
  { title: '创作', href: '/projects', icon: FolderKanban },
  { title: '内容浏览器', href: '/explorer', icon: Compass, hasSub: true },
  { title: '使用指导', href: '/guide', icon: BookOpen },
  { title: '环境检测', href: '/diagnostics', icon: Activity },
  { title: '设置', href: '/settings', icon: Settings },
]

const explorerSubItems = [
  { title: '账号研究', href: '/explorer/research', icon: Sparkles },
  { title: '话题搜索', href: '/explorer/search', icon: Flame },
  { title: '抖音热搜', href: '/explorer/hot', icon: TrendingUp },
  { title: '内容库', href: '/explorer/library', icon: FileText },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { contents } = useContentLibrary()

  return (
    <Sidebar collapsible="none">
      <SidebarHeader className="px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/projects" />}
              tooltip="Content OS"
            >
              <Image
                src="/logo.png"
                alt="Content OS"
                width={120}
                height={36}
                className="h-8 w-auto object-contain"
                priority
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="justify-start">
        <SidebarGroup className="px-1 py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 px-2">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(`${item.href}/`))
                const isExplorerActive =
                  item.hasSub && pathname.startsWith('/explorer')

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                      {item.hasSub && (
                        <ChevronRight
                          className={cn(
                            'ml-auto size-4 transition-transform duration-200',
                            isExplorerActive && 'rotate-90',
                          )}
                        />
                      )}
                    </SidebarMenuButton>

                    {/* 二级导航 */}
                    {item.hasSub && isExplorerActive && (
                      <SidebarMenuSub className="mt-0.5 gap-0.5">
                        {explorerSubItems.map((sub) => {
                          const isSubActive = pathname === sub.href
                          const isLibrary = sub.href === '/explorer/library'
                          return (
                            <SidebarMenuSubItem key={sub.href}>
                              <SidebarMenuSubButton
                                render={<Link href={sub.href} />}
                                isActive={isSubActive}
                              >
                                <sub.icon className="size-3.5" />
                                <span>{sub.title}</span>
                                {isLibrary && contents.length > 0 && (
                                  <Badge variant="secondary" className="ml-auto h-4 min-w-4 px-1 text-xs tabular-nums">
                                    {contents.length}
                                  </Badge>
                                )}
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

    </Sidebar>
  )
}
