use client'

import { useSyncExternalStore } from 'react'

// ─── Types ─────────────────────────────────────────────

export interface TopicProfile {
  topic: string
  category: string
  keywords: string[]
  relatedTopics: string[]
  coreQuestions: string[]
  audience?: string
  platform?: string
  potentialAngles: string[]
  researchQueries: string[]
}

export interface SearchedContent {
  platform: string
  url: string
  title: string | null
  content: string | null
  author: string | null
  cover?: string | null
  publishedAt: string | null
  metrics: {
    likes: number | null
    comments: number | null
    shares: number | null
    favorites: number | null
    views: number | null
  } | null
  transcript?: {
    text: string
    language: string
    duration: number
    model: string
  } | null
  collectedComments?: {
    text: string
    nickname: string
    diggCount: number
    createTime: string | null
  }[] | null
  commentAnalysis?: {
    topComments: {
      text: string
      nickname: string
      diggCount: number
      createTime: string | null
    }[]
    keywords: string[]
    sentiment: {
      positive: number
      neutral: number
      negative: number
    }
    summary: string
  } | null
}

export interface ViralResult {
  analyses: Array<{
    url: string
    platform: string
    viralScore: number
    emotionScore: number
    controversyScore: number
    noveltyScore: number
    utilityScore: number
    summary: string
    strengths: string[]
    weaknesses: string[]
    keyFactors: string[]
  }>
}

export interface AngleProfile {
  title: string
  angle: string
  rationale: string
  targetAudience: string
  emotionalTrigger: string
  viralMechanism: string
  suggestedHooks: string[]
  riskNote?: string
  relatedViralURLs: string[]
}

export interface ContentStrategy {
  title: string
  hook: string
  structure: string[]
  keyArguments: string[]
  emotionalArc: { start: string; middle: string; end: string }
  callToAction: string
  suggestedReferences: string[]
  tone: string
  estimatedWordCount: number
}

export interface WritingDraft {
  content: string
  title: string
  hook: string
  wordCount: number
}

export interface RefineResult {
  content: string
  title: string
  hook: string
  wordCount: number
  changes: Array<{
    type: string
    original?: string
    revised?: string
    reason: string
    linkedIssueId?: string
    confidence?: number
  }>
  hookCandidates?: string[]
  titleCandidates?: string[]
  summary?: string
  resolvedIssues?: Array<{
    issueId: string
    resolution: string
    changeId?: string
  }>
  unresolvedIssues?: Array<{
    issueId: string
    reason: string
    suggestion?: string
  }>
  preservedElements?: Array<{
    element: string
    reason: string
  }>
}

export interface EvaluationResult {
  scores: {
    emotionalImpact: number
    logicalClarity: number
    novelty: number
    readability: number
    utility: number
    platformFit: number
  }
  suggestions: Array<{
    id?: string
    section: string
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
  weaknesses: string[]
}

export interface RefineIssue {
  id: string
  section: string
  issue: string
  suggestion: string
  priority: 'high' | 'medium' | 'low'
  selected: boolean
  resolved: boolean
}

export interface RiskAnalysis {
  overallRiskLevel: 'safe' | 'low' | 'medium' | 'high'
  risks: Array<{
    id: string
    category: string
    description?: string
    suggestion?: string
    severity: 'high' | 'medium' | 'low'
  }>
}

export interface Persona {
  id?: string
  name: string
  bio: string
  toneStyle: string
  vocabulary: string
  createdAt?: string
}

// P0.3.8.4: Strategy approval state
export type StrategyApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected'

export interface StrategyApprovalState {
  status: StrategyApprovalStatus
  approvedStrategy: ContentStrategy | null
  rejectionReason?: string
  pendingAt: string | null
  decidedAt: string | null
}

// P0.3.9.3: Humanization state
export type HumanizationStatus = 'idle' | 'loading' | 'success' | 'error'

export interface HumanizationState {
  status: HumanizationStatus
  result: RefineResult | null
  adopted: boolean
}

// ─── State Shape ──────────────────────────────────────

export interface WorkflowState {
  draft: WritingDraft | null
  refineData: RefineResult | null
  evaluation: EvaluationResult | null
  refineIssues: RefineIssue[]
  humanization: HumanizationState
  strategy: ContentStrategy | null
  strategyApproval: StrategyApprovalState
  persona: Persona | null
  topicProfile: TopicProfile | null
  selectedAngle: AngleProfile | null
  riskAnalysis: RiskAnalysis | null
  error: string | null
}

// ─── Actions ──────────────────────────────────────────

export type WorkflowAction =
  | { type: 'SET_DRAFT'; draft: WritingDraft }
  | { type: 'SET_REFINE_DATA'; data: RefineResult | null }
  | { type: 'SET_EVALUATION'; evaluation: EvaluationResult | null }
  | { type: 'SET_REFINE_ISSUES'; issues: RefineIssue[] }
  | { type: 'TOGGLE_REFINE_ISSUE'; id: string }
  | { type: 'RESET_REFINE_ISSUES_SELECTIONS' }
  | { type: 'SET_HUMANIZATION_STATUS'; status: HumanizationStatus }
  | { type: 'SET_HUMANIZATION_RESULT'; result: RefineResult }
  | { type: 'ADOPT_HUMANIZATION' }
  | { type: 'DISMISS_HUMANIZATION' }
  | { type: 'RESET_HUMANIZATION' }
  | { type: 'SET_STRATEGY'; strategy: ContentStrategy | null }
  | { type: 'SET_STRATEGY_APPROVAL_PENDING'; strategy: ContentStrategy }
  | { type: 'APPROVE_STRATEGY'; strategy?: ContentStrategy }
  | { type: 'REJECT_STRATEGY'; reason?: string }
  | { type: 'RESET_STRATEGY_APPROVAL' }
  | { type: 'SET_PERSONA'; persona: Persona | null }
  | { type: 'SET_TOPIC_PROFILE'; profile: TopicProfile | null }
  | { type: 'SET_SELECTED_ANGLE'; angle: AngleProfile | null }
  | { type: 'SET_RISK_ANALYSIS'; analysis: RiskAnalysis | null }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' }

// ─── Store Implementation ────────────────────────────

type Listener = () => void

let state: WorkflowState = {
  draft: null,
  refineData: null,
  evaluation: null,
  refineIssues: [],
  humanization: { status: 'idle', result: null, adopted: false },
  strategy: null,
  strategyApproval: { status: 'none', approvedStrategy: null, pendingAt: null, decidedAt: null },
  persona: null,
  topicProfile: null,
  selectedAngle: null,
  riskAnalysis: null,
  error: null,
}

const listeners = new Set<Listener>()

function getState(): WorkflowState {
  return state
}

function setState(next: WorkflowState): void {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ─── Hook ─────────────────────────────────────────────

export function useWorkflow(): WorkflowState {
  return useSyncExternalStore(subscribe, getState, getState)
}

// ─── Actions (External API) ───────────────────────────

export const workflowActions = {
  setDraft: (draft: WritingDraft) => setState({ ...state, draft }),

  setRefineData: (data: RefineResult | null) => setState({ ...state, refineData: data }),

  setEvaluation: (evaluation: EvaluationResult | null) => setState({ ...state, evaluation }),

  setRefineIssues: (issues: RefineIssue[]) => setState({ ...state, refineIssues: issues }),

  toggleRefineIssue: (id: string) =>
    setState({
      ...state,
      refineIssues: state.refineIssues.map((i) =>
        i.id === id ? { ...i, selected: !i.selected } : i
      ),
    }),

  resetRefineIssueSelections: () =>
    setState({
      ...state,
      refineIssues: state.refineIssues.map((i) => ({ ...i, selected: false })),
    }),

  // P0.3.9.3: Humanization actions (with adopted reset hardening)

  setHumanizationStatus: (status: HumanizationStatus) =>
    setState((prev) => ({
      ...prev,
      humanization: { ...prev.humanization, status, adopted: false },
    })),

  setHumanizationResult: (result: RefineResult) =>
    setState((prev) => ({
      ...prev,
      humanization: { ...prev.humanization, status: 'success', result, adopted: false },
    })),

  adoptHumanization: () =>
    setState((prev) => {
      const humanizationResult = prev.humanization.result
      if (!humanizationResult) return prev
      const baseRefine = prev.refineData ?? {
        content: humanizationResult.content,
        title: humanizationResult.title,
        hook: humanizationResult.hook,
        wordCount: humanizationResult.content.length,
        changes: [],
        summary: '',
      }
      return {
        ...prev,
        refineData: mergeHumanizationIntoRefineData(baseRefine, humanizationResult),
        humanization: { ...prev.humanization, adopted: true },
      }
    }),

  dismissHumanization: () =>
    setState((prev) => ({
      ...prev,
      humanization: { ...prev.humanization, status: 'idle', result: null },
    })),

  resetHumanization: () =>
    setState((prev) => ({
      ...prev,
      humanization: { status: 'idle', result: null, adopted: false },
    })),

  setStrategy: (strategy: ContentStrategy | null) => setState({ ...state, strategy }),

  // P0.3.8.4: Strategy approval gate actions

  setStrategyApprovalPending: (strategy: ContentStrategy) =>
    setState((prev) => ({
      ...prev,
      strategyApproval: {
        status: 'pending',
        approvedStrategy: null,
        rejectionReason: undefined,
        pendingAt: new Date().toISOString(),
        decidedAt: null,
      },
      strategy,
    })),

  approveStrategy: (strategy?: ContentStrategy) =>
    setState((prev) => ({
      ...prev,
      strategyApproval: {
        status: 'approved',
        approvedStrategy: strategy ?? prev.strategy ?? null,
        rejectionReason: undefined,
        pendingAt: prev.strategyApproval.pendingAt,
        decidedAt: new Date().toISOString(),
      },
    })),

  rejectStrategy: (reason?: string) =>
    setState((prev) => ({
      ...prev,
      strategyApproval: {
        status: 'rejected',
        approvedStrategy: null,
        rejectionReason: reason,
        pendingAt: prev.strategyApproval.pendingAt,
        decidedAt: new Date().toISOString(),
      },
    })),

  resetStrategyApproval: () =>
    setState((prev) => ({
      ...prev,
      strategyApproval: {
        status: 'none',
        approvedStrategy: null,
        pendingAt: null,
        decidedAt: null,
      },
    })),

  setPersona: (persona: Persona | null) => setState({ ...state, persona }),
  setTopicProfile: (profile: TopicProfile | null) => setState({ ...state, topicProfile: profile }),
  setSelectedAngle: (angle: AngleProfile | null) => setState({ ...state, selectedAngle: angle }),
  setRiskAnalysis: (analysis: RiskAnalysis | null) => setState({ ...state, riskAnalysis: analysis }),
  setError: (error: string | null) => setState({ ...state, error }),
  reset: () =>
    setState({
      draft: null,
      refineData: null,
      evaluation: null,
      refineIssues: [],
      humanization: { status: 'idle', result: null, adopted: false },
      strategy: null,
      strategyApproval: { status: 'none', approvedStrategy: null, pendingAt: null, decidedAt: null },
      persona: null,
      topicProfile: null,
      selectedAngle: null,
      riskAnalysis: null,
      error: null,
    }),
}

// ─── Helpers ──────────────────────────────────────────

function mergeHumanizationIntoRefineData(
  baseRefineData: RefineResult | null,
  humanizationResult: RefineResult,
): RefineResult {
  const base = baseRefineData ?? {
    content: humanizationResult.content,
    title: humanizationResult.title,
    hook: humanizationResult.hook,
    wordCount: humanizationResult.content.length,
    changes: [],
    summary: '',
  }
  return {
    content: humanizationResult.content,
    title: humanizationResult.title,
    hook: humanizationResult.hook,
    wordCount: humanizationResult.content.length,
    changes: [...(base.changes ?? []), ...(humanizationResult.changes ?? [])],
    hookCandidates: base.hookCandidates,
    titleCandidates: base.titleCandidates,
    summary: humanizationResult.summary || base.summary,
    resolvedIssues: base.resolvedIssues,
    unresolvedIssues: base.unresolvedIssues,
    preservedElements: [...(base.preservedElements ?? []), ...(humanizationResult.preservedElements ?? [])],
  }
}
