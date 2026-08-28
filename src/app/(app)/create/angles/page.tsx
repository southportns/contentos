'use client'

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { StepAngles } from '@/components/create/step-angles'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import type { ContentAngle } from '@/hooks/use-workflow'

export default function AnglesPage() {
  const router = useRouter()
  const ws = useWorkflow()

  // Guard: if no topic profile, redirect to topic input
  useEffect(() => {
    if (!ws.topicProfile) {
      router.replace('/create/topic')
    }
  }, [ws.topicProfile, router])

  const handleSelect = useCallback(
    (angle: ContentAngle | null) => {
      workflowActions.setSelectedAngle(angle)
    },
    [],
  )

  const handleContinue = useCallback(() => {
    if (!ws.selectedAngle) return
    router.push('/create/generate')
  }, [router, ws.selectedAngle])

  const handleUpdateAngle = useCallback((id: string, patch: Partial<ContentAngle>) => {
    workflowActions.updateAngle(id, patch)
  }, [])

  if (!ws.topicProfile) {
    return null
  }

  if (ws.angles.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        还没有生成内容角度，请先回到上一步生成角度。
      </div>
    )
  }

  return (
    <StepAngles
      angles={ws.angles}
      selectedAngle={ws.selectedAngle}
      onSelect={handleSelect}
      onContinue={handleContinue}
      onUpdateAngle={handleUpdateAngle}
    />
  )
}
