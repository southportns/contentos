import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { getProjectDetail } from '@/lib/services/server-actions'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { DraftVersionHistory } from '@/components/projects/draft-version-history'
import { DraftEditor } from '@/components/projects/draft-editor'
import type { Topic, Draft, Evaluation, Humanization, StrategyEvaluation, Angle, ContentStrategy } from '@/generated/prisma'

export const dynamic = 'force-dynamic'

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params

  // Handle missing project ID
  if (!id) {
    notFound()
  }

  // Handle database not configured
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">创作详情</h1>
          <p className="text-muted-foreground">数据库未连接</p>
        </div>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">配置 DATABASE_URL 后可使用创作详情功能</p>
          <Link href="/projects" className={buttonVariants({ variant: 'outline', className: 'mt-4' })}>
            <ArrowLeft className="size-4" />
            返回创作
          </Link>
        </div>
      </div>
    )
  }

  const project = await getProjectDetail(id)

  // Handle project not found
  if (!project) {
    notFound()
  }

  const topic = project.topics?.[0] as (Topic & {
    angles: Angle[]
    strategy: ContentStrategy | null
    activeDraft: Draft | null
    drafts: Array<Draft & {
      evaluation: Evaluation | null
      humanization: Humanization | null
      strategyEvaluation: StrategyEvaluation | null
    }>
  }) | undefined

  const drafts = topic?.drafts ?? []

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      {/* Back navigation */}
      <Link
        href="/projects"
        className={buttonVariants({ variant: 'ghost', className: 'w-fit px-2 -ml-2' })}
      >
        <ArrowLeft className="size-4" />
        返回创作
      </Link>

      {/* Project Header */}
      <ProjectDetailHeader project={project} />

      {/* Show link to create if no topic */}
      {!topic && (
        <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
          <p className="text-muted-foreground">这个创作还没有主题</p>
          <Link
            href={`/create?projectId=${project.id}`}
            className={buttonVariants({ variant: 'default' })}
          >
            开始创作
          </Link>
        </div>
      )}

      {/* P0.5.1 — Active Draft Editor (only show if there is an active draft) */}
      {topic && (() => {
        const activeDraft = topic.activeDraft
        if (!activeDraft) return null
        return (
          <DraftEditor
            activeDraft={activeDraft}
            allDrafts={drafts}
            topicId={topic.id}
          />
        )
      })()}

      {/* Version History (only show if topic exists) */}
      {topic && (
        <DraftVersionHistory
          drafts={drafts}
          activeDraftId={topic.activeDraftId}
          topicId={topic.id}
        />
      )}

      {/* Edit shortcut */}
      {topic && drafts.length > 0 && (
        <div className="flex justify-end">
          <Link
            href={`/create?projectId=${project.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Pencil className="size-3.5" />
            继续创作
          </Link>
        </div>
      )}
    </div>
  )
}
