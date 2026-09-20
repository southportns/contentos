import Link from 'next/link'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function ProjectNotFound() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <Link
        href="/projects"
        className={buttonVariants({ variant: 'ghost', className: 'w-fit px-2 -ml-2' })}
      >
        <ArrowLeft className="size-4" />
        返回创作
      </Link>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">创作不存在</p>
            <p className="text-sm text-muted-foreground">
              该创作可能已被删除或链接无效
            </p>
          </div>
          <Link href="/projects" className={buttonVariants()}>
            <ArrowLeft className="size-4" />
            返回创作
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
