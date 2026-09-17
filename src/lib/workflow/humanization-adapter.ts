/*
 * P0.3.9.3 - Humanization Adapter
 *
 * Determines the correct content source for humanization and provides
 * helpers for strategy/issue preservation logic. Pure functions only -
 * no side effects, no React dependency.
 */

import type { RefineResult, ContentStrategy, RefineIssue } from '@/hooks/use-workflow'

export interface HumanizationInput {
  content: string
  title: string
  hook: string
  wordCount: number
  mode: 'humanize'
  persona?: string
  platform?: string
  topic?: string
  selectedAngleTitle?: string
  approvedStrategy?: {
    title?: string
    keyArguments?: string[]
    emotionalArc?: { start?: string; middle?: string; end?: string }
    callToAction?: string
    tone?: string
    selectedAngleTitle?: string
  }
  evaluationContext?: {
    suggestions: Array<{
      id?: string
      section: string
      issue: string
      suggestion: string
      priority: 'high' | 'medium' | 'low'
    }>
    weaknesses: string[]
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
}

export function resolveHumanizationContentSource(
  manualContent: string | null,
  refineData: RefineResult | null,
  draftContent: string,
): string {
  if (manualContent && manualContent.trim().length > 0) return manualContent
  if (refineData?.content && refineData.content.trim().length > 0) return refineData.content
  return draftContent
}

export function resolveHumanizationTitleSource(
  manualTitle: string | null,
  refineData: RefineResult | null,
  draftTitle: string,
): string {
  if (manualTitle && manualTitle.trim().length > 0) return manualTitle
  if (refineData?.title && refineData.title.trim().length > 0) return refineData.title
  return draftTitle
}

export function resolveHumanizationHookSource(
  refineData: RefineResult | null,
  draftHook: string,
): string {
  if (refineData?.hook && refineData.hook.trim().length > 0) return refineData.hook
  return draftHook
}

export function buildHumanizationInput(params: {
  manualContent: string | null
  manualTitle: string | null
  refineData: RefineResult | null
  draftContent: string
  draftTitle: string
  draftHook: string
  persona?: string | null
  platform?: string
  topic?: string
  selectedAngleTitle?: string
  approvedStrategy?: ContentStrategy | null
  evaluationWeaknesses?: string[]
  selectedIssues?: RefineIssue[]
  riskLevel?: 'safe' | 'low' | 'medium' | 'high' | null
  risks?: Array<{ category: string; description?: string; suggestion?: string; severity?: 'high' | 'medium' | 'low' }>
}): HumanizationInput {
  const {
    manualContent, manualTitle, refineData, draftContent, draftTitle, draftHook,
    persona, platform, topic, selectedAngleTitle, approvedStrategy,
    evaluationWeaknesses, selectedIssues, riskLevel, risks,
  } = params

  const content = resolveHumanizationContentSource(manualContent, refineData, draftContent)
  const title = resolveHumanizationTitleSource(manualTitle, refineData, draftTitle)
  const hook = resolveHumanizationHookSource(refineData, draftHook)

  const input: HumanizationInput = { content, title, hook, wordCount: content.length, mode: 'humanize' }

  if (persona) input.persona = persona
  if (platform) input.platform = platform
  if (topic) input.topic = topic
  if (selectedAngleTitle) input.selectedAngleTitle = selectedAngleTitle

  if (approvedStrategy) {
    input.approvedStrategy = {
      title: approvedStrategy.title, keyArguments: approvedStrategy.keyArguments,
      emotionalArc: approvedStrategy.emotionalArc, callToAction: approvedStrategy.callToAction,
      tone: approvedStrategy.tone,
    }
  }

  if (selectedIssues?.length || evaluationWeaknesses?.length) {
    input.evaluationContext = {
      suggestions: (selectedIssues ?? []).map((issue) => ({
        id: issue.id, section: issue.section, issue: issue.issue,
        suggestion: issue.suggestion, priority: issue.priority,
      })),
      weaknesses: evaluationWeaknesses ?? [],
    }
  }

  if (riskLevel || risks?.length) {
    input.riskContext = {
      overallRiskLevel: riskLevel ?? undefined,
      risks: (risks ?? []).map((r, idx) => ({
        id: `risk-${idx}`, category: r.category,
        description: r.description, suggestion: r.suggestion, severity: r.severity,
      })),
    }
  }

  return input
}

export function mergeHumanizationIntoRefineData(
  baseRefineData: RefineResult | null,
  humanizationResult: RefineResult,
): RefineResult {
  const base = baseRefineData ?? {
    content: humanizationResult.content, title: humanizationResult.title,
    hook: humanizationResult.hook, wordCount: humanizationResult.content.length,
    changes: [], summary: '',
  }
  return {
    content: humanizationResult.content, title: humanizationResult.title,
    hook: humanizationResult.hook, wordCount: humanizationResult.content.length,
    changes: [...(base.changes ?? []), ...(humanizationResult.changes ?? [])],
    hookCandidates: base.hookCandidates, titleCandidates: base.titleCandidates,
    summary: humanizationResult.summary || base.summary,
    resolvedIssues: base.resolvedIssues, unresolvedIssues: base.unresolvedIssues,
    preservedElements: [...(base.preservedElements ?? []), ...(humanizationResult.preservedElements ?? [])],
  }
}

export function isHumanizationUsingDraft(manualContent: string | null, refineData: RefineResult | null): boolean {
  return !manualContent?.trim() && !refineData?.content?.trim()
}

export function getHumanizationSourceLabel(manualContent: string | null, refineData: RefineResult | null): string {
  if (manualContent && manualContent.trim().length > 0) return '当前编辑内容'
  if (refineData?.content && refineData.content.trim().length > 0) return '最新精修结果'
  return '原始初稿'
}
