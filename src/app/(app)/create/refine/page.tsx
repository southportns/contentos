'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StepRefine } from '@/components/create/step-refine'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import { useRefine } from '@/hooks/use-refine'
import {
  evaluationToRefineIssues,
  riskAnalysisToRefineRiskContext,
} from '@/lib/workflow/refine-issue-adapter'
import { buildHumanizationInput } from '@/lib/workflow/humanization-adapter'
import type { RefineResult, HumanizationStatus } from '@/hooks/use-workflow'

type RefineMode = 'tone_change' | 'hook_select' | 'title_select' | 'issue_fix' | 'humanize'

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

  const riskContext = riskAnalysisToRefineRiskContext(ws.riskAnalysis)
  const approvedStrategy = ws.strategy ? {
    title: ws.strategy.title,
    keyArguments: ws.strategy.keyArguments,
    emotionalArc: ws.strategy.emotionalArc,
    callToAction: ws.strategy.callToAction,
    tone: ws.strategy.tone,
    selectedAngleTitle: ws.selectedAngle?.title,
  } : undefined

  const handleRefine = useCallback(
    async (input: {
      content: string
      title: string
      hook: string
      wordCount: number
      mode: RefineMode
      toneChange?: { newTone: string }
      hookSelect?: { candidates: string[]; selectedIndex: number }
      titleSelect?: { candidates: string[]; selectedIndex: number }
      platform?: string
      topic?: string
      selectedAngleTitle?: string
      evaluationContext?: {
        suggestions: Array<{ id?: string; section: string; issue: string; suggestion: string; priority: 'high' | 'medium' | 'low' }>
        weaknesses: string[]
        scores?: { emotionalImpact?: number; logicalClarity?: number; novelty?: number; readability?: number; utility?: number; platformFit?: number }
      }
      riskContext?: { overallRiskLevel?: 'safe' | 'low' | 'medium' | 'high'; risks: Array<{ id?: string; category: string; description?: string; suggestion?: string; severity?: 'high' | 'medium' | 'low' }> }
      approvedStrategy?: { title?: string; keyArguments?: string[]; emotionalArc?: { start?: string; middle?: string; end?: string }; callToAction?: string; tone?: string; selectedAngleTitle?: string }
      persona?: string
    }): Promise<RefineResult | null> => {
      const result = await refineHook.refine(input as Parameters<typeof refineHook.refine>[0])
      if (result) {
        workflowActions.setRefineData(result)
        if (input.mode === 'issue_fix' && result.resolvedIssues?.length) {
          const resolvedIds = result.resolvedIssues.map((r) => r.issueId).filter((id): id is string => !!id)
          workflowActions.markRefineIssuesResolved(resolvedIds)
        }
      }
      return result
    },
    [refineHook],
  )

  // P0.3.9.3: Handle humanize generation
  const handleHumanize = useCallback(
    async (params: { manualContent: string | null; manualTitle: string | null }) => {
      workflowActions.setHumanizationStatus('loading' as HumanizationStatus)
      try {
        const { manualContent, manualTitle } = params
        const humanizationInput = buildHumanizationInput({
          manualContent,
          manualTitle,
          refineData: ws.refineData,
          draftContent: ws.draft?.content ?? '',
          draftTitle: ws.draft?.title ?? '',
          draftHook: ws.draft?.hook ?? '',
          persona: ws.persona?.name ?? undefined,
          platform: ws.topicProfile?.platform,
          topic: ws.topicProfile?.topic,
          selectedAngleTitle: ws.selectedAngle?.title,
          approvedStrategy: ws.strategyApproval.approvedStrategy ?? ws.strategy ?? null,
          evaluationWeaknesses: ws.evaluation?.weaknesses,
          selectedIssues: ws.refineIssues.filter((i) => i.selected),
          riskLevel: ws.riskAnalysis?.overallRiskLevel ?? null,
          risks: ws.riskAnalysis?.risks.map((r) => ({
            category: r.category, description: r.description, suggestion: r.suggestion, severity: r.severity,
          })),
        })
        const result = await refineHook.refine(humanizationInput as Parameters<typeof refineHook.refine>[0])
        if (result) {
          workflowActions.setHumanizationResult(result)
          return result
        } else {
          workflowActions.setHumanizationStatus('error' as HumanizationStatus)
          return null
        }
      } catch {
        workflowActions.setHumanizationStatus('error' as HumanizationStatus)
        return null
      }
    },
    [refineHook, ws.refineData, ws.draft, ws.persona, ws.topicProfile, ws.selectedAngle, ws.strategyApproval.approvedStrategy, ws.strategy, ws.evaluation, ws.refineIssues, ws.riskAnalysis],
  )

  // P0.3.9.3: Adopt humanization result
  const handleAdoptHumanization = useCallback(() => {
    workflowActions.adoptHumanization()
  }, [])

  // P0.3.9.3: Keep current version (dismiss humanization)
  const handleDismissHumanization = useCallback(() => {
    workflowActions.dismissHumanization()
  }, [])

  const handleApplyRefine = useCallback(
    (data: RefineResult) => {
      workflowActions.setRefineData(data)
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
      evaluation={ws.evaluation}
      refineIssues={ws.refineIssues}
      riskContext={riskContext}
      approvedStrategy={approvedStrategy}
      humanization={ws.humanization}
      persona={ws.persona}
      onRefine={handleRefine}
      onApplyRefine={handleApplyRefine}
      onToggleIssue={workflowActions.toggleRefineIssue}
      onResetIssueSelections={workflowActions.resetRefineIssueSelections}
      onHumanize={handleHumanize}
      onAdoptHumanization={handleAdoptHumanization}
      onDismissHumanization={handleDismissHumanization}
      loading={refineHook.loading}
      error={refineHook.error}
      platform={ws.topicProfile?.platform}
      topic={ws.topicProfile?.topic}
      selectedAngleTitle={ws.selectedAngle?.title}
    />
  )
}
