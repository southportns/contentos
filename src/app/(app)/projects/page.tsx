import { redirect } from 'next/navigation'
import { FolderPlus, FileText, ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getProjects } from '@/lib/services/server-actions'
import { CreateProjectButton } from '@/components/projects/create-project-button'

export const dynamic = 'force-dynamic'

async function ProjectsPage() {
  const projects = await getProjects()

  if (!projects || projects.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">项目</h1>
          <p className="text-muted-foreground">管理你的内容创作项目</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FolderPlus className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">还没有项目</p>
              <p className="text-sm text-muted-foreground">创建一个项目开始你的内容创作</p>
            </div>
            <CreateProjectButton />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">项目</h1>
          <p className="text-muted-foreground">管理你的内容创作项目</p>
        </div>
        <CreateProjectButton />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{project.name}</CardTitle>
                <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                  {project.status === 'active' ? '活跃' : '已归档'}
                </Badge>
              </div>
              <CardDescription>
                {project.description || '暂无描述'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {project.topics?.length || 0} 个主题
                </span>
                <a
                  href={`/create?projectId=${project.id}`}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                >
                  进入
                  <ArrowRight className="size-3.5" />
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function ProjectsPageWrapper() {
  // If database is not configured, redirect to create
  // This page is a server component that queries DB directly
  return <ProjectsFallback />
}

function ProjectsFallback() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">项目</h1>
        <p className="text-muted-foreground">管理你的内容创作项目</p>
      </div>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <FolderPlus className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">数据库未连接</p>
            <p className="text-sm text-muted-foreground">
              配置 DATABASE_URL 后可使用项目管理功能
            </p>
          </div>
          <a href="/create" className={cn(buttonVariants())}>
            <FileText className="size-4" />
            前往创建内容
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
