import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function ProjectDetailLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <Link
        href="/projects"
        className={buttonVariants({ variant: 'ghost', className: 'w-fit px-2 -ml-2' })}
      >
        <ArrowLeft className="size-4" />
        返回创作
      </Link>

      {/* Header skeleton */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-4 w-64" />
        </CardContent>
      </Card>

      {/* Version history skeleton */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
