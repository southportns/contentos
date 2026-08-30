'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StepResearch } from '@/components/create/step-research'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import { useAngleGeneration } from '@/hooks/use-angle-generation'
import type { TopicProfile, ContentAngle } from '@/hooks/use-workflow'

export default function ResearchPage() {
  const router = useRouter()
  const ws = useWorkflow()
  const angleGen = useAngleGeneration()

  const [generatingAngles, setGeneratingAngles] = useState(false)

  // Guard: if no topic profile, redirect to topic input
  useEffect(() => {
    if (!ws.topicProfile) {
      router.replace('/create/topic')
    }
  }, [ws.topicProfile, router])

  const handleContinue = useCallback(async () => {
    if (!ws.topicProfile) return
    setGeneratingAngles(true)

    try {
      const result = await angleGen.generate({
        topic: ws.topicProfile.topic,
        topicProfile: {
          category: ws.topicProfile.category,
          keywords: ws.topicProfile.keywords,
          coreQuestions: ws.topicProfile.coreQuestions,
          potentialAngles: ws.topicProfile.potentialAngles,
        },
        count: 5,
      })

      if (result && result.length > 0) {
        const angleData = result as unknown as ContentAngle[]
        workflowActions.setAngles(angleData)
        router.push('/create/angles')
      }
    } finally {
      setGeneratingAngles(false)
    }
  }, [ws.topicProfile, angleGen, router])

  const handleUpdateTopicProfile = useCallback((patch: Partial<TopicProfile>) => {
    if (!ws.topicProfile) return
    workflowActions.updateTopicProfile(patch)
  }, [ws.topicProfile])

  if (!ws.topicProfile) {
    return null
  }

  return (
    <StepResearch
      topicProfile={ws.topicProfile}
      onContinue={handleContinue}
      onUpdateTopicProfile={handleUpdateTopicProfile}
      generatingAngles={generatingAngles || angleGen.loading}
      error={angleGen.error}
    />
  )
}
