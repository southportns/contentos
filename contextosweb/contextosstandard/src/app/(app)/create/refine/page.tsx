'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StepRefine } from '@/components/create/step-refine'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import { useRefine } from '@/hooks/use-refine'
import type { RefineResult } from '@/hooks/use-workflow'

export default function RefinePage() {
  const router = useRouter()
  const ws = useWorkflow()
  const refineHook = useRefine()

  // Guard: if no draft, redirect to generate
  useEffect(() => {
    if (!ws.draft) {
      router.replace('/create/generate')
    }
  }, [ws.draft, router])

  const handleRefine = useCallback(
    async (input: {
      content: string
      title: string
      hook: string
      wordCount: number
      mode: 'tone_change' | 'hook_select' | 'title_select'
      toneChange?: { newTone: string }
      hookSelect?: { candidates: string[]; selectedIndex: number }
      titleSelect?: { candidates: string[]; selectedIndex: number }
      platform?: string
      topic?: string
      selectedAngleTitle?: string
    }): Promise<RefineResult | null> => {
      const result = await refineHook.refine(input)
      if (result) {
        workflowActions.setRefineData(result)
      }
      return result
    },
    [refineHook],
  )

  const handleApplyRefine = useCallback(
    (data: RefineResult) => {
      workflowActions.setRefineData(data)
      // Navigate to final output
      router.push('/create/final')
    },
    [router],
  )

  if (!ws.draft) {
    return null
  }

  return (
    <StepRefine
      draft={ws.draft}
      refineData={ws.refineData}
      onRefine={handleRefine}
      onApplyRefine={handleApplyRefine}
      loading={refineHook.loading}
      error={refineHook.error}
      platform={ws.topicProfile?.platform}
      topic={ws.topicProfile?.topic}
      selectedAngleTitle={ws.selectedAngle?.title}
    />
  )
}
