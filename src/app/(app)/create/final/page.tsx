'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StepFinal } from '@/components/create/step-final'
import { SaveProjectButton } from '@/components/create/save-project-button'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import type { FinalOutput } from '@/hooks/use-workflow'

export default function FinalPage() {
  const router = useRouter()
  const ws = useWorkflow()

  // Guard: if no draft and no refineData, redirect to generate
  useEffect(() => {
    if (!ws.draft) {
      router.replace('/create/generate')
    }
  }, [ws.draft, router])

  const handleSetFinalOutput = useCallback(
    (output: FinalOutput) => {
      workflowActions.setFinalOutput(output)
    },
    [],
  )

  if (!ws.draft) {
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <StepFinal
        draft={ws.draft}
        refineData={ws.refineData}
        finalOutput={ws.finalOutput}
        onSetFinalOutput={handleSetFinalOutput}
        platform={ws.topicProfile?.platform}
        topic={ws.topicProfile?.topic}
      />
      {ws.finalOutput && (
        <SaveProjectButton
          topicProfile={ws.topicProfile}
          selectedAngle={ws.selectedAngle}
          strategy={ws.strategy}
          draft={ws.finalOutput ? {
            title: ws.finalOutput.title,
            content: ws.finalOutput.content,
            hook: ws.finalOutput.hook,
            wordCount: ws.finalOutput.wordCount,
            sections: [],
          } : ws.draft}
          evaluation={ws.evaluation}
          strategyEvaluation={ws.strategyEvaluation}
          riskAnalysis={ws.riskAnalysis}
          platform={ws.topicProfile?.platform || ''}
          refineData={ws.refineData}
        />
      )}
    </div>
  )
}
