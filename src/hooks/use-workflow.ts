/**
 * @file This file contains the workflow state and actions for content creation.
 * It uses use-sync-external-share for subscription-based state updates.
 */
'use client'

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
  patterns: {
    commonStrengths: string[]
    commonWeaknesses: string[]
    viralFactors: string[]
    avgViralScore: number
    topContents: Array<{ url: string; viralScore: number }>
  }
}

export interface ContentAngle {
  id: string
  title: string
  angle: string
  reasoning: string
  targetEmotion: string
  estimatedViralScore: number
  difficulty: 'low' | 'medium' | 'high'
  keyPoints: string[]
  audienceAppeal: string
}

export interface ContentStrategy {
  title: string
  hook: string
  structure: Array<{
    section: string
    purpose: string
    keyArguments: string[]
    estimatedWords: number
  }>
  keyArguments: string[]
  emotionalArc: { start: string; middle: string; end: string }
  callToAction: string
  suggestedReferences: string[]
  tone: string
  estimatedWordCount: number
}

export interface WritingDraft {
  title: string
  content: string
  hook: string
  wordCount: number
  sections: Array<{ section: string; content: string }>
}

export interface EvaluationResult {
  overallScore: number
  scores: {
    emotionalImpact: number
    logicalClarity: number
    novelty: number
    readability: number
    utility: number
    platformFit: number
  }
  strengths: string[]
  weaknesses: string[]
  suggestions: Array<{
    section: string
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
  emotionalArcAnalysis: { achieved: boolean; analysis: string }
  conclusion: string
}

export interface StrategyEvaluationResult {
  platform: string
  overallScore: number
  grade: 'exceptional' | 'strong' | 'good' | 'average' | 'poor'
  scores: Record<string, number>
  platformFit: number
  strategyConsistency: number
  strengths: string[]
  weaknesses: string[]
  criticalIssues: string[]
  improvementPriorities: Array<{
    priority: number
    problem: string
    reason: string
    suggestion: string
  }>
  shareAnalysis: {
    motivation: string
    target: string
    context: string
  }
  aiStyleRisk: number
  authenticityScore: number
  evidenceQuality: number
  confidence: number
  verdict: string
}

export interface RiskAnalysisResult {
  risks: Array<{
    category: 'political_sensitive' | 'social_sensitive' | 'personal_privacy' | 'misinformation' | 'hate_speech' | 'commercial_compliance' | 'platform_violation' | 'legal_risk'
    severity: 'high' | 'medium' | 'low'
    description: string
    suggestion: string
    quote?: string
  }>
  overallRiskLevel: 'safe' | 'low' | 'medium' | 'high'
  summary: string
}

export interface RefineResult {
  content: string
  title: string
  hook: string
  wordCount: number
  changes: Array<{
    type: string
    original: string
    revised: string
    reason: string
    linkedIssueId?: string
    confidence?: number
  }>
  hookCandidates?: string[]
  titleCandidates?: string[]
  summary: string
  resolvedIssues?: Array<{
    issueId: string
    resolution: string
    changeId?: string
  }>
  unresolvedIssues?: Array<{
    issueId: string
    reason: string
    suggestion: string
  }>
  preservedElements?: Array<{
    element: string
    reason: string
  }>
}

// ─── P0.3.9.2: Evaluation → Refine Issue Feedback Loop ─────────────────────

export interface RefineIssue {
  id: string
  section: string
  issue: string
  suggestion: string
  priority: 'high' | 'medium' | 'low'
  selected: boolean
  resolved: boolean
}

export interface FinalOutput {
  title: string
  content: string
  hook: string
  wordCount: number
  platform?: string
}

export interface Persona {
  id: string
  name: string
  description: string | null
}

export interface AdaptationResult {
  referenceAnalysis: {
    hookType: string
    contentStructure: string[]
    emotionalArc: { start: string; middle: string; end: string }
    keyPoints: string[]
    viralFactors: string[]
    weaknesses: string[]
  }
  adaptedAngles: Array<{
    id: string
    title: string
    angle: string
    reasoning: string
    targetEmotion: string
    keyPoints: string[]
    whatChanged: string
    estimatedViralScore: number
  }>
  strategySuggestion: {
    tone: string
    structure: Array<{ section: string; purpose: string; keyArguments: string[] }>
    hookStrategy: string
    ctaStrategy: string
  }
}

export interface UploadedContent {
  title: string | null
  content: string
  sourceType: string
  fileName: string | null
}

export interface DistillationResult {
  sourceAnalysis: {
    coreTheme: string
    keyInsights: string[]
    contentStructure: string[]
    emotionalArc: { start: string; middle: string; end: string }
    memorableQuotes: string[]
    applicableAngles: string[]
    weaknesses: string[]
  }
  distilledAngles: Array<{
    id: string
    title: string
    angle: string
    reasoning: string
    targetEmotion: string
    keyPoints: string[]
    whatExtracted: string
    estimatedViralScore: number
  }>
  strategySuggestion: {
    tone: string
    structure: Array<{ section: string; purpose: string; keyArguments: string[] }>
    hookStrategy: string
    ctaStrategy: string
  }
}

// ─── P0.3.8.4: Strategy Approval State ────────────────────

export type StrategyApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected'

export interface StrategyApprovalState {
  status: StrategyApprovalStatus
  knowledgeAssisted: boolean
  reviewedAt: number | null
  approvedStrategy: ContentStrategy | null
}

// ─── P0.3.9.3: Humanization State ────────────────────────

export type HumanizationStatus = 'idle' | 'loading' | 'success' | 'error'

export interface HumanizationState {
  status: HumanizationStatus
  result: RefineResult | null
  adopted: boolean
}

// ─── Workflow State ─────────────────────────────────────

export interface WorkflowState {
  projectId: string | null
  persona: Persona | null
  referenceContent: SearchedContent | null
  adaptationResult: AdaptationResult | null
  uploadedContent: UploadedContent | null
  distillationResult: DistillationResult | null
  topicProfile: TopicProfile | null
  viralResult: ViralResult | null
  angles: ContentAngle[]
  selectedAngle: ContentAngle | null
  strategy: ContentStrategy | null
  strategyId: string | null
  strategyApproval: StrategyApprovalState
  draft: WritingDraft | null
  evaluation: EvaluationResult | null
  strategyEvaluation: StrategyEvaluationResult | null
  riskAnalysis: RiskAnalysisResult | null
  refineData: RefineResult | null
  refineIssues: RefineIssue[]
  humanization: HumanizationState
  finalOutput: FinalOutput | null
}

const initialState: WorkflowState = {
  projectId: null,
  persona: null,
  referenceContent: null,
  adaptationResult: null,
  uploadedContent: null,
  distillationResult: null,
  topicProfile: null,
  viralResult: null,
  angles: [],
  selectedAngle: null,
  strategy: null,
  strategyId: null,
  strategyApproval: {
    status: 'none',
    knowledgeAssisted: false,
    reviewedAt: null,
    approvedStrategy: null,
  },
  draft: null,
  evaluation: null,
  strategyEvaluation: null,
  riskAnalysis: null,
  refineData: null,
  refineIssues: [],
  humanization: {
    status: 'idle',
    result: null,
    adopted: false,
  },
  finalOutput: null,
}

const STORAGE_KEY = 'content-os-workflow'

function loadFromStorage(): WorkflowState {
  if (typeof window === 'undefined') return initialState
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as Partial<WorkflowState>
    return {
      ...initialState,
      ...parsed,
      angles: Array.isArray(parsed.angles) ? parsed.angles : [],
    }
  } catch {
    return initialState
  }
}

let state: WorkflowState = loadFromStorage()
const listeners = new Set<() => void>()

function saveToStorage(s: WorkflowState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch (e) {
    console.error('[workflow] Failed to save to localStorage:', e)
  }
}

function setState(updater: (prev: WorkflowState) => WorkflowState) {
  state = updater(state)
  saveToStorage(state)
  listeners.forEach((l) => l())
}

function getSnapshot(): WorkflowState {
  return state
}

function getServerSnapshot(): WorkflowState {
  return initialState
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const workflowActions = {
  setProjectId: (id: string | null) =>
    setState((prev) => ({ ...prev, projectId: id })),

  setPersona: (persona: Persona | null) =>
    setState((prev) => ({ ...prev, persona })),

  setTopicProfile: (profile: TopicProfile) =>
    setState((prev) => ({ ...prev, topicProfile: profile })),

  updateTopicProfile: (patch: Partial<TopicProfile>) =>
    setState((prev) => ({
      ...prev,
      topicProfile: prev.topicProfile ? { ...prev.topicProfile, ...patch } : null,
    })),

  setReferenceContent: (content: SearchedContent | null) =>
    setState((prev) => ({ ...prev, referenceContent: content })),

  setAdaptationResult: (result: AdaptationResult | null) =>
    setState((prev) => ({ ...prev, adaptationResult: result })),

  setUploadedContent: (content: UploadedContent | null) =>
    setState((prev) => ({ ...prev, uploadedContent: content })),

  setDistillationResult: (result: DistillationResult | null) =>
    setState((prev) => ({ ...prev, distillationResult: result })),

  setViralResult: (result: ViralResult) =>
    setState((prev) => ({ ...prev, viralResult: result })),

  setAngles: (angles: ContentAngle[]) =>
    setState((prev) => ({ ...prev, angles })),

  updateAngle: (id: string, patch: Partial<ContentAngle>) =>
    setState((prev) => ({
      ...prev,
      angles: prev.angles.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      selectedAngle: prev.selectedAngle?.id === id ? { ...prev.selectedAngle, ...patch } : prev.selectedAngle,
    })),

  setSelectedAngle: (angle: ContentAngle | null) =>
    setState((prev) => ({ ...prev, selectedAngle: angle })),

  setStrategy: (strategy: ContentStrategy) =>
    setState((prev) => ({ ...prev, strategy })),

  setStrategyId: (id: string | null) =>
    setState((prev) => ({ ...prev, strategyId: id })),

  setStrategyPending: (knowledgeAssisted: boolean) =>
    setState((prev) => ({
      ...prev,
      strategyApproval: {
        status: 'pending',
        knowledgeAssisted,
        reviewedAt: null,
        approvedStrategy: null,
      },
    })),

  approveStrategy: (editedStrategy?: ContentStrategy) =>
    setState((prev) => ({
      ...prev,
      strategy: editedStrategy ?? prev.strategy,
      strategyApproval: {
        ...prev.strategyApproval,
        status: 'approved',
        reviewedAt: Date.now(),
        approvedStrategy: editedStrategy ?? prev.strategy,
      },
    })),

  rejectStrategy: () =>
    setState((prev) => ({
      ...prev,
      strategyApproval: {
        ...prev.strategyApproval,
        status: 'rejected',
        reviewedAt: Date.now(),
      },
    })),

  resetStrategyApproval: () =>
    setState((prev) => ({
      ...prev,
      strategyId: null,
      strategyApproval: {
        status: 'none',
        knowledgeAssisted: false,
        reviewedAt: null,
        approvedStrategy: null,
      },
    })),

  setDraft: (draft: WritingDraft) =>
    setState((prev) => ({ ...prev, draft })),

  updateDraft: (patch: Partial<WritingDraft>) =>
    setState((prev) => ({
      ...prev,
      draft: prev.draft ? { ...prev.draft, ...patch } : null,
    })),

  setEvaluation: (evaluation: EvaluationResult) =>
    setState((prev) => ({ ...prev, evaluation })),

  setStrategyEvaluation: (result: StrategyEvaluationResult) =>
    setState((prev) => ({ ...prev, strategyEvaluation: result })),

  setRiskAnalysis: (result: RiskAnalysisResult) =>
    setState((prev) => ({ ...prev, riskAnalysis: result })),

  setRefineData: (data: RefineResult) =>
    setState((prev) => ({ ...prev, refineData: data })),

  updateRefineData: (patch: Partial<RefineResult>) =>
    setState((prev) => ({
      ...prev,
      refineData: prev.refineData ? { ...prev.refineData, ...patch } : null,
    })),

  setRefineIssues: (issues: RefineIssue[]) =>
    setState((prev) => ({ ...prev, refineIssues: issues })),

  toggleRefineIssue: (id: string) =>
    setState((prev) => ({
      ...prev,
      refineIssues: prev.refineIssues.map((issue) =>
        issue.id === id ? { ...issue, selected: !issue.selected } : issue,
      ),
    })),

  markRefineIssuesResolved: (resolvedIds: string[]) =>
    setState((prev) => {
      const resolvedSet = new Set(resolvedIds)
      return {
        ...prev,
        refineIssues: prev.refineIssues.map((issue) =>
          resolvedSet.has(issue.id) ? { ...issue, resolved: true } : issue,
        ),
      }
    }),

  resetRefineIssueSelections: () =>
    setState((prev) => ({
      ...prev,
      refineIssues: prev.refineIssues.map((issue) => ({
        ...issue,
        selected: issue.priority === 'high',
        resolved: false,
      })),
    })),

  // P0.3.9.3: Humanization actions

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
        refineData: {
          content: humanizationResult.content,
          title: humanizationResult.title,
          hook: humanizationResult.hook,
          wordCount: humanizationResult.content.length,
          changes: [...(baseRefine.changes ?? []), ...(humanizationResult.changes ?? [])],
          hookCandidates: baseRefine.hookCandidates,
          titleCandidates: baseRefine.titleCandidates,
          summary: humanizationResult.summary || baseRefine.summary,
          resolvedIssues: baseRefine.resolvedIssues,
          unresolvedIssues: baseRefine.unresolvedIssues,
          preservedElements: [...(baseRefine.preservedElements ?? []), ...(humanizationResult.preservedElements ?? [])],
        },
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

  setFinalOutput: (output: FinalOutput) =>
    setState((prev) => ({ ...prev, finalOutput: output })),

  clearDownstream: () =>
    setState((prev) => ({
      ...prev,
      angles: [],
      selectedAngle: null,
      strategy: null,
      strategyId: null,
      draft: null,
      evaluation: null,
      strategyEvaluation: null,
      riskAnalysis: null,
      refineData: null,
      refineIssues: [],
      humanization: { status: 'idle', result: null, adopted: false },
      finalOutput: null,
      adaptationResult: null,
      distillationResult: null,
    })),

  reset: () => {
    setState(() => ({ ...initialState }))
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  },
}

export function useWorkflow() {
  const ws = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { ...ws, ...workflowActions }
}
