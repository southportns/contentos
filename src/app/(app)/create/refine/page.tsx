'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StepRefine } from '@/components/create/step-refine'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import { useRefine } from '@/hooks/use-refine'
import { evaluationToRefineIssues, riskAnalysisToRefineRiskContext } from '@/lib/workflow/refine-issue-adapter'
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

  // P0.3.9.2: Auto-convert evaluation suggestions to refine issues on mount
  useEffect(() => {
    if (ws.evaluation && ws.refineIssues.length === 0) {
      const issues = evaluationToRefineIssues(ws.evaluation)
      if (issues.length > 0) {
        workflowActions.setRefineIssues(issues)
      }
    }
  }, [ws.evaluation, ws.refineIssues.length])

  const handleRefine = useCallback(
    async (input: {
      content: string
      title: string
      hook: string
      wordCount: number
      mode: 'tone_change' | 'hook_select' | 'title_select' | 'issue_fix'
      toneChange?: { newTone: string }
      hookSelect?: { candidates: string[]; selectedIndex: number }
      titleSelect?: { candidates: string[]; selectedIndex: number }
      platform?: string
      topic?: string
      selectedAngleTitle?: string
      // P0.3.9.2: issue_fix extras
      evaluationContext?: {
        suggestions: Array<{
          id?: string
          section: string
          issue: string
          suggestion: string
          priority: 'high' | 'medium' | 'low'
        }>
        weaknesses: string[]
        scores?: {
          emotionalImpact?: number
          logicalClarity?: number
          novelty?: number
          readability?: number
          utility?: number
          platformFit?: number
        }
      }
      riskContext?: {
        overallRiskLevel?: 'safe' | 'low' | 'medium' | 'high'
        risks: Array<{
          id?: string
          category: string
          description?: string
          suggestion?: string
          severity?: 'high' | 'medium' | 'low'
        }>
      }
      approvedStrategy?: {
        title?: string
        keyArguments?: string[]
        emotionalArc?: { start?: string; middle?: string; end?: string }
        callToAction?: string
        tone?: string
        selectedAngleTitle?: string
      }
    }): Promise<RefineResult | null> => {
      const result = await refineHook.refine(input as Parameters<typeof refineHook.refine>[0])
      if (result) {
        workflowActions.setRefineData(result)

        // P0.3.9.2: Mark resolved issues based on refine output
        if (result.resolvedIssues?.length) {
          const resolvedIds = result.resolvedIssues
            .map((r) => r.issueId)
            .filter((id): id is string => !!id)
          workflowActions.markRefineIssuesResolved(resolvedIds)
        }
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

  // P0.3.9.2: Pre-compute risk context and approved strategy from workflow
  const riskContext = riskAnalysisToRefineRiskContext(ws.riskAnalysis)
  const approvedStrategy = ws.strategy ? {
    title: ws.strategy.title,
    keyArguments: ws.strategy.keyArguments,
    emotionalArc: ws.strategy.emotionalArc,
    callToAction: ws.strategy.callToAction,
    tone: ws.strategy.tone,
    selectedAngleTitle: ws.selectedAngle?.title,
  } : undefined

  if (!ws.draft) {
    return null
  }

  return (
    <StepRefine
      draft={ws.draft}
      refineData={ws.refineData}
      evaluation={ws.evaluation}
      refineIssues={ws.refineIssues}
      riskContext={riskContext}
      approvedStrategy={approvedStrategy}
      onRefine={handleRefine}
      onApplyRefine={handleApplyRefine}
      onToggleIssue={workflowActions.toggleRefineIssue}
      onResetIssueSelections={workflowActions.resetRefineIssueSelections}
      loading={refineHook.loading}
      error={refineHook.error}
      platform={ws.topicProfile?.platform}
      topic={ws.topicProfile?.topic}
      selectedAngleTitle={ws.selectedAngle?.title}
    />
  )
}