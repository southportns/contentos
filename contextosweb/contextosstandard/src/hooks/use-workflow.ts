'use client'

import { useSyncExternalStore } from 'react'

// ── Types ─────────────────────────────────────────────

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
  publishedAt: string | null
  metrics: {
    likes: number | null
    comments: number | null
    shares: number | null
    favorites: number | null
    views: number | null
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
  }>
  hookCandidates?: string[]
  titleCandidates?: string[]
  summary: string
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

export interface WorkflowState {
  // Project association
  projectId: string | null

  // Persona association
  persona: Persona | null

  // Step 1: Research
  topicProfile: TopicProfile | null
  contents: SearchedContent[]

  // Step 2: Analysis
  viralResult: ViralResult | null

  // Step 3: Angles
  angles: ContentAngle[]
  selectedAngle: ContentAngle | null

  // Step 4: Strategy
  strategy: ContentStrategy | null

  // Step 5: Writing
  draft: WritingDraft | null

  // Step 6: Evaluation
  evaluation: EvaluationResult | null

  // Step 7: Strategy Evaluation
  strategyEvaluation: StrategyEvaluationResult | null

  // Step 8: Refine
  refineData: RefineResult | null

  // Step 9: Final Output
  finalOutput: FinalOutput | null
}

// ── Store ─────────────────────────────────────────────

const initialState: WorkflowState = {
  projectId: null,
  persona: null,
  topicProfile: null,
  contents: [],
  viralResult: null,
  angles: [],
  selectedAngle: null,
  strategy: null,
  draft: null,
  evaluation: null,
  strategyEvaluation: null,
  refineData: null,
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
      // Ensure array fields are always arrays even if localStorage has null/garbage
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
  } catch {
    // ignore
  }
}

function setState(updater: (prev: WorkflowState) => WorkflowState) {
  state = updater(state)
  saveToStorage(state)
  listeners.forEach((l) => l())
}

// ── External Store API ───────────────────────────────

function getSnapshot(): WorkflowState {
  return state
}

function getServerSnapshot(): WorkflowState {
  return initialState
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ── Actions (stable references) ─────────────────────

export const workflowActions = {
  getContents: () => state.contents,

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

  setContents: (contents: SearchedContent[]) =>
    setState((prev) => ({ ...prev, contents })),

  removeContent: (url: string) =>
    setState((prev) => ({
      ...prev,
      contents: prev.contents.filter((c) => c.url !== url),
    })),

  clearContents: () =>
    setState((prev) => ({ ...prev, contents: [] })),

  setViralResult: (result: ViralResult) =>
    setState((prev) => ({ ...prev, viralResult: result })),

  setAngles: (angles: ContentAngle[]) =>
    setState((prev) => ({ ...prev, angles })),

  updateAngle: (id: string, patch: Partial<ContentAngle>) =>
    setState((prev) => ({
      ...prev,
      angles: prev.angles.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      selectedAngle:
        prev.selectedAngle?.id === id
          ? { ...prev.selectedAngle, ...patch }
          : prev.selectedAngle,
    })),

  setSelectedAngle: (angle: ContentAngle | null) =>
    setState((prev) => ({ ...prev, selectedAngle: angle })),

  setStrategy: (strategy: ContentStrategy) =>
    setState((prev) => ({ ...prev, strategy })),

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

  setRefineData: (data: RefineResult) =>
    setState((prev) => ({ ...prev, refineData: data })),

  updateRefineData: (patch: Partial<RefineResult>) =>
    setState((prev) => ({
      ...prev,
      refineData: prev.refineData ? { ...prev.refineData, ...patch } : null,
    })),

  setFinalOutput: (output: FinalOutput) =>
    setState((prev) => ({ ...prev, finalOutput: output })),

  clearDownstream: () =>
    setState((prev) => ({
      ...prev,
      angles: [],
      selectedAngle: null,
      strategy: null,
      draft: null,
      evaluation: null,
      strategyEvaluation: null,
      refineData: null,
      finalOutput: null,
    })),

  reset: () => {
    setState(() => ({ ...initialState }))
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  },
}

// ── Hook ─────────────────────────────────────────────

export function useWorkflow() {
  const ws = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { ...ws, ...workflowActions }
}
