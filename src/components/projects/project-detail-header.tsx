import { Calendar, Globe, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Project, Topic } from '@/generated/prisma'

interface ProjectDetailHeaderProps {
  project: Project & { topics: Topic[] }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function ProjectDetailHeader({ project }: ProjectDetailHeaderProps) {
  const topic = project.topics?.[0]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">{project.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <span>创建 {formatDate(project.createdAt)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <span>更新 {formatDate(project.updatedAt)}</span>
          </div>
        </div>

        {topic && (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground">主题：</span>
              <span className="text-foreground">{topic.topic || '未设置'}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topic.platform && (
                <Badge variant="secondary" className="gap-1">
                  <Globe className="size-3" />
                  {topic.platform}
                </Badge>
              )}
              {topic.audience && (
                <Badge variant="outline" className="gap-1">
                  <Users className="size-3" />
                  {topic.audience}
                </Badge>
              )}
              {topic.contentType && (
                <Badge variant="outline">{topic.contentType}</Badge>
              )}
            </div>
          </div>
        )}

        {!topic && (
          <p className="text-sm text-muted-foreground italic">这个创作还没有主题</p>
        )}
      </CardContent>
    </Card>
  )
}
