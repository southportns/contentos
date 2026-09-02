import Link from 'next/link'
import { FolderPlus, FileText, Pencil, Trash2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getProjects } from '@/lib/services/server-actions'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { CreateProjectButton } from '@/components/projects/create-project-button'
import { DeleteProjectButton } from '@/components/projects/delete-project-button'

export const dynamic = 'force-dynamic'

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default async function ProjectsPage() {
  // If database is not configured, show fallback
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">创作</h1>
          <p className="text-muted-foreground">管理你的内容创作记录</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FolderPlus className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">数据库未连接</p>
              <p className="text-sm text-muted-foreground">
                配置 DATABASE_URL 后可使用创作管理功能
              </p>
            </div>
            <Link href="/" className={cn(buttonVariants())}>
              <FileText className="size-4" />
              返回主页
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const projects = await getProjects()

  if (!projects || projects.length === 0) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">创作</h1>
          <p className="text-muted-foreground">管理你的内容创作记录</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FolderPlus className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">还没有创作</p>
              <p className="text-sm text-muted-foreground">创建一个新创作开始你的内容写作</p>
            </div>
            <CreateProjectButton />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">创作</h1>
          <p className="text-muted-foreground">管理你的内容创作记录</p>
        </div>
        <CreateProjectButton />
      </div>

      {/* 列表表头 */}
      <div className="flex items-center gap-4 rounded-lg border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <span className="w-8 shrink-0 text-center">序号</span>
        <span className="w-40 shrink-0">创建时间</span>
        <span className="flex-1 min-w-0">主题概览</span>
        <span className="w-24 shrink-0 text-right">操作</span>
      </div>

      {/* 列表项 */}
      <div className="flex flex-col gap-1.5">
        {projects.map((project, index) => (
          <div
            key={project.id}
            className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
          >
            {/* 序号 */}
            <span className="w-8 shrink-0 text-center text-sm text-muted-foreground">
              {index + 1}
            </span>

            {/* 创建时间 */}
            <span className="w-40 shrink-0 text-sm text-muted-foreground">
              {formatDate(project.createdAt)}
            </span>

            {/* 主题概览 */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              {(() => {
                const topic = project.topics[0]
                if (!topic) {
                  return (
                    <span className="text-sm text-muted-foreground italic">
                      尚未设定主题
                    </span>
                  )
                }
                // 优先级：draft.title（口播稿标题） > angle.title（角度标题） > topic.topic（原始主题）
                const latestDraft = topic.drafts?.[0]
                const approvedAngle = topic.angles?.find((a) => a.status === 'APPROVED') || topic.angles?.[0]
                const displayText = latestDraft?.title || approvedAngle?.title || topic.topic || '未命名创作'
                return (
                  <>
                    <span
                      className="block truncate text-sm text-foreground"
                      title={displayText}
                    >
                      {displayText.length > 40 ? displayText.slice(0, 40) + '…' : displayText}
                    </span>
                    {topic.platform && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {topic.platform}
                      </Badge>
                    )}
                    {topic.audience && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {topic.audience}
                      </Badge>
                    )}
                  </>
                )
              })()}
            </div>

            {/* 操作 */}
            <div className="flex w-24 shrink-0 items-center justify-end gap-1">
              <Link
                href={`/create?projectId=${project.id}`}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
                aria-label="编辑创作"
              >
                <Pencil className="size-4" />
              </Link>
              <DeleteProjectButton
                projectId={project.id}
                projectName={project.name}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
