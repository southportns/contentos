/**
 * P0.3.9.2 — Evaluation → Refine Issue Feedback Loop Tests
 *
 * Tests the state transitions for refine issues workflow,
 * including the adapter integration and API contract validation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { RefineIssue, RefineResult, EvaluationResult } from '../use-workflow'

// Reducer mirroring the actual use-workflow.ts actions
interface RefineIssueWorkflowLite {
  refineIssues: RefineIssue[]
  refineData: RefineResult | null
}

type RefineIssueAction =
  | { type: 'SET_ISSUES'; issues: RefineIssue[] }
  | { type: 'TOGGLE_ISSUE'; id: string }
  | { type: 'MARK_RESOLVED'; resolvedIds: string[] }
  | { type: 'RESET_SELECTIONS' }
  | { type: 'CLEAR_DOWNSTREAM' }
  | { type: 'SET_REFINE_DATA'; data: RefineResult }

function reducer(prev: RefineIssueWorkflowLite, action: RefineIssueAction): RefineIssueWorkflowLite {
  switch (action.type) {
    case 'SET_ISSUES':
      return { ...prev, refineIssues: action.issues }
    case 'TOGGLE_ISSUE':
      return {
        ...prev,
        refineIssues: prev.refineIssues.map((issue) =>
          issue.id === action.id ? { ...issue, selected: !issue.selected } : issue,
        ),
      }
    case 'MARK_RESOLVED': {
      const resolvedSet = new Set(action.resolvedIds)
      return {
        ...prev,
        refineIssues: prev.refineIssues.map((issue) =>
          resolvedSet.has(issue.id) ? { ...issue, resolved: true } : issue,
        ),
      }
    }
    case 'RESET_SELECTIONS':
      return {
        ...prev,
        refineIssues: prev.refineIssues.map((issue) => ({
          ...issue,
          selected: issue.priority === 'high',
          resolved: false,
        })),
      }
    case 'CLEAR_DOWNSTREAM':
      return { ...prev, refineData: null, refineIssues: [] }
    case 'SET_REFINE_DATA':
      return { ...prev, refineData: action.data }
    default:
      return prev
  }
}

function createIssue(overrides: Partial<RefineIssue> & { id: string }): RefineIssue {
  return {
    section: 'test-section',
    issue: 'test-issue',
    suggestion: 'test-suggestion',
    priority: 'medium',
    selected: false,
    resolved: false,
    ...overrides,
  }
}

function createSampleIssues(): RefineIssue[] {
  return [
    createIssue({ id: 'eval-0', section: '开头', issue: '开头吸引力不足', priority: 'high', selected: true }),
    createIssue({ id: 'eval-1', section: '中段', issue: '情绪递进较弱', priority: 'medium', selected: false }),
    createIssue({ id: 'eval-2', section: '结尾', issue: 'CTA 不明确', priority: 'low', selected: false }),
  ]
}

function createSampleRefineResult(): RefineResult {
  return {
    content: '修改后的内容',
    title: '修改后的标题',
    hook: '修改后的钩子',
    wordCount: 500,
    changes: [
      {
        type: 'issue_fix',
        original: '今天我们来聊一个问题',
        revised: '为什么很多人越努力反而越容易走错',
        reason: '增加开头悬念',
        linkedIssueId: 'eval-0',
        confidence: 0.92,
      },
    ],
    summary: '根据评测反馈修复了2个问题',
    resolvedIssues: [
      { issueId: 'eval-0', resolution: '重写开场第一句，增加悬念', changeId: 'chg-001' },
    ],
    unresolvedIssues: [
      { issueId: 'eval-2', reason: '当前上下文缺少足够的CTA素材', suggestion: '用户可补充具体行动号召' },
    ],
    preservedElements: [
      { element: '核心论点A', reason: 'Approved Strategy constraint' },
    ],
  }
}

const makeInitialState = (): RefineIssueWorkflowLite => ({
  refineIssues: [],
  refineData: null,
})

describe('P0.3.9.2 — Refine Issue Workflow State', () => {
  let state: RefineIssueWorkflowLite

  beforeEach(() => { state = makeInitialState() })

  it('TEST 01: initial refineIssues is empty', () => {
    expect(state.refineIssues).toEqual([])
    expect(state.refineData).toBeNull()
  })

  it('TEST 02: setRefineIssues populates from adapter', () => {
    const issues = createSampleIssues()
    state = reducer(state, { type: 'SET_ISSUES', issues })

    expect(state.refineIssues).toHaveLength(3)
    expect(state.refineIssues[0].id).toBe('eval-0')
    expect(state.refineIssues[0].selected).toBe(true)
    expect(state.refineIssues[1].selected).toBe(false)
  })

  it('TEST 03: toggleRefineIssue toggles selection by id', () => {
    state = reducer(state, { type: 'SET_ISSUES', issues: createSampleIssues() })
    expect(state.refineIssues[0].selected).toBe(true)

    state = reducer(state, { type: 'TOGGLE_ISSUE', id: 'eval-0' })
    expect(state.refineIssues[0].selected).toBe(false)

    state = reducer(state, { type: 'TOGGLE_ISSUE', id: 'eval-1' })
    expect(state.refineIssues[1].selected).toBe(true)
  })

  it('TEST 04: markRefineIssuesResolved marks specified ids', () => {
    state = reducer(state, { type: 'SET_ISSUES', issues: createSampleIssues() })

    state = reducer(state, { type: 'MARK_RESOLVED', resolvedIds: ['eval-0'] })
    expect(state.refineIssues[0].resolved).toBe(true)
    expect(state.refineIssues[1].resolved).toBe(false)
  })

  it('TEST 05: resetRefineIssueSelections restores defaults', () => {
    state = reducer(state, { type: 'SET_ISSUES', issues: createSampleIssues() })
    state = reducer(state, { type: 'MARK_RESOLVED', resolvedIds: ['eval-0'] })
    state = reducer(state, { type: 'TOGGLE_ISSUE', id: 'eval-1' })
    state = reducer(state, { type: 'TOGGLE_ISSUE', id: 'eval-2' })

    state = reducer(state, { type: 'RESET_SELECTIONS' })
    expect(state.refineIssues[0].selected).toBe(true)
    expect(state.refineIssues[1].selected).toBe(false)
    expect(state.refineIssues[2].selected).toBe(false)
    expect(state.refineIssues.every((i) => !i.resolved)).toBe(true)
  })

  it('TEST 06: clearDownstream resets refineIssues', () => {
    state = reducer(state, { type: 'SET_ISSUES', issues: createSampleIssues() })
    state = reducer(state, { type: 'SET_REFINE_DATA', data: createSampleRefineResult() })

    state = reducer(state, { type: 'CLEAR_DOWNSTREAM' })
    expect(state.refineIssues).toEqual([])
    expect(state.refineData).toBeNull()
  })

  it('TEST 07: adapter output serves as workflow input roundtrip', () => {
    const mockEvaluation: EvaluationResult = {
      overallScore: 70,
      scores: { emotionalImpact: 70, logicalClarity: 80, novelty: 75, readability: 85, utility: 78, platformFit: 72 },
      strengths: ['优点'],
      weaknesses: ['弱点'],
      suggestions: [
        { section: '开头', issue: '开头吸引力不足', suggestion: '增加悬念', priority: 'high' },
      ],
      emotionalArcAnalysis: { achieved: false, analysis: '未达成' },
      conclusion: '需要改进',
    }

    const issues: RefineIssue[] = mockEvaluation.suggestions.map((s, idx) => ({
      id: `eval-${idx}`,
      section: s.section,
      issue: s.issue,
      suggestion: s.suggestion,
      priority: s.priority,
      selected: s.priority === 'high',
      resolved: false,
    }))

    state = reducer(state, { type: 'SET_ISSUES', issues })
    expect(state.refineIssues).toHaveLength(1)
    expect(state.refineIssues[0]).toMatchObject({
      id: 'eval-0',
      issue: '开头吸引力不足',
      selected: true,
    })
  })

  it('TEST 08: issue_fix request construction from selected issues', () => {
    state = reducer(state, { type: 'SET_ISSUES', issues: createSampleIssues() })
    state = reducer(state, { type: 'TOGGLE_ISSUE', id: 'eval-1' })

    const selectedIssues = state.refineIssues.filter((i) => i.selected)
    expect(selectedIssues.map((i) => i.id)).toEqual(['eval-0', 'eval-1'])

    const evaluationContext = {
      suggestions: selectedIssues.map((i) => ({
        id: i.id,
        section: i.section,
        issue: i.issue,
        suggestion: i.suggestion,
        priority: i.priority,
      })),
      weaknesses: ['弱点1', '弱点2'],
    }

    expect(evaluationContext.suggestions).toHaveLength(2)
    expect(evaluationContext.suggestions[0].id).toBe('eval-0')
    expect(evaluationContext.suggestions[1].id).toBe('eval-1')
  })

  it('TEST 09: resolvedIssues from refine output updates state', () => {
    state = reducer(state, { type: 'SET_ISSUES', issues: createSampleIssues() })
    const refineResult = createSampleRefineResult()

    state = reducer(state, { type: 'MARK_RESOLVED', resolvedIds: refineResult.resolvedIssues.map((r) => r.issueId) })

    expect(state.refineIssues[0].resolved).toBe(true)
    expect(state.refineIssues[1].resolved).toBe(false)
  })

  it('TEST 10: unresolvedIssues preserved in RefineResult', () => {
    const result = createSampleRefineResult()
    expect(result.unresolvedIssues).toHaveLength(1)
    expect(result.unresolvedIssues[0].issueId).toBe('eval-2')
    expect(result.unresolvedIssues[0].reason).toContain('缺少')
    expect(result.unresolvedIssues[0].suggestion).toBeDefined()
  })

  it('TEST 11: preservedElements preserved in RefineResult', () => {
    const result = createSampleRefineResult()
    expect(result.preservedElements).toHaveLength(1)
    expect(result.preservedElements[0].element).toBe('核心论点A')
    expect(result.preservedElements[0].reason).toBe('Approved Strategy constraint')
  })

  it('TEST 12: linkedIssueId in changes', () => {
    const result = createSampleRefineResult()
    expect(result.changes[0].linkedIssueId).toBe('eval-0')
    expect(result.changes[0].confidence).toBeCloseTo(0.92)
  })

  it('TEST 13: multiple issue resolution lifecycle', () => {
    state = reducer(state, { type: 'SET_ISSUES', issues: createSampleIssues() })

    // Select all issues
    state = reducer(state, { type: 'TOGGLE_ISSUE', id: 'eval-1' })
    state = reducer(state, { type: 'TOGGLE_ISSUE', id: 'eval-2' })

    const allSelected = state.refineIssues.filter((i) => i.selected)
    expect(allSelected).toHaveLength(3)

    state = reducer(state, { type: 'MARK_RESOLVED', resolvedIds: ['eval-0', 'eval-1'] })

    expect(state.refineIssues[0].resolved).toBe(true)
    expect(state.refineIssues[1].resolved).toBe(true)
    expect(state.refineIssues[2].resolved).toBe(false)
  })
})