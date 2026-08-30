'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StepAdapt } from '@/components/create/step-adapt'
import { useWorkflow } from '@/hooks/use-workflow'

export default function AdaptPage() {
  const router = useRouter()
  const ws = useWorkflow()

  // Guard: if no reference content, redirect to topic input
  useEffect(() => {
    if (!ws.referenceContent) {
      router.replace('/create/topic')
    }
  }, [ws.referenceContent, router])

  if (!ws.referenceContent) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            请先选择一条对标内容
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/create/topic')}
          >
            <ArrowLeft className="size-4" />
            返回主题输入
          </Button>
        </CardContent>
      </Card>
    )
  }

  return <StepAdapt referenceContent={ws.referenceContent} />
}
