import { describe, it, expect, beforeEach } from 'vitest'
import {
  resolveHumanizationContentSource, buildHumanizationInput,
  mergeHumanizationIntoRefineData, isHumanizationUsingDraft, getHumanizationSourceLabel,
} from '@/lib/workflow/humanization-adapter'
import type { RefineResult, HumanizationState } from '../use-workflow'

interface HumanizationWorkflowLite {
  refineData: RefineResult | null
  humanization: HumanizationState
}

type HumanizationAction =
  | { type: 'SET_STATUS'; status: HumanizationState['status'] }
  | { type: 'SET_RESULT'; result: RefineResult }
  | { type: 'ADOPT' }
  | { type: 'DISMISS' }
  | { type: 'RESET' }
  | { type: 'SET_REFINE_DATA'; data: RefineResult }

function humanizationReducer(prev: HumanizationWorkflowLite, action: HumanizationAction): HumanizationWorkflowLite {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...prev, humanization: { ...prev.humanization, status: action.status, adopted: false } }
    case 'SET_RESULT':
      return { ...prev, humanization: { ...prev.humanization, status: 'success', result: action.result, adopted: false } }
    case 'ADOPT': {
      const result = prev.humanization.result
      if (!result) return prev
      return {
        ...prev,
        refineData: mergeHumanizationIntoRefineData(prev.refineData, result),
        humanization: { ...prev.humanization, adopted: true },
      }
    }
    case 'DISMISS':
      return { ...prev, humanization: { ...prev.humanization, status: 'idle', result: null } }
    case 'RESET':
      return { ...prev, humanization: { status: 'idle', result: null, adopted: false } }
    case 'SET_REFINE_DATA':
      return { ...prev, refineData: action.data }
    default:
      return prev
  }
}

function makeHumanizationResult(overrides: Partial<RefineResult> = {}): RefineResult {
  return {
    content: '真人化后的内容', title: '真人化标题', hook: '真人化钩子', wordCount: 6,
    changes: [{ type: 'humanization', original: 'AI表达', revised: '人话', reason: '去AI味' }],
    summary: '去AI味完成', preservedElements: [{ element: '核心论点', reason: 'strategy' }],
    ...overrides,
  }
}

function makeRefineResult(overrides: Partial<RefineResult> = {}): RefineResult {
  return {
    content: '精修后的正式内容', title: '精修标题', hook: '精修钩子', wordCount: 8,
    changes: [{ type: 'tone_change', original: 'old', revised: 'new', reason: 'test' }],
    summary: 'tone refined', ...overrides,
  }
}

function makeInitialState(): HumanizationWorkflowLite {
  return { refineData: null, humanization: { status: 'idle', result: null, adopted: false } }
}

describe('P0.3.9.3 - Humanization Integration Pipeline', () => {
  let state: HumanizationWorkflowLite
  beforeEach(() => { state = makeInitialState() })

  it('INT-1. Full pipeline: resolve -> build -> generate -> adopt', () => {
    const refineResult = makeRefineResult()
    state = humanizationReducer(state, { type: 'SET_REFINE_DATA', data: refineResult })
    expect(state.refineData?.content).toBe('精修后的正式内容')

    const source = resolveHumanizationContentSource(null, refineResult, '原始初稿')
    expect(source).toBe('精修后的正式内容')
    expect(isHumanizationUsingDraft(null, refineResult)).toBe(false)
    expect(getHumanizationSourceLabel(null, refineResult)).toBe('最新精修结果')

    const input = buildHumanizationInput({
      manualContent: null, manualTitle: null, refineData: refineResult,
      draftContent: '原始初稿', draftTitle: '原始标题', draftHook: '原始钩子',
      persona: 'tech-reviewer', platform: 'xiaohongshu', topic: '数码产品测评',
      selectedAngleTitle: '真实体验',
      approvedStrategy: {
        title: '策略', hook: 'Hook', structure: [],
        keyArguments: ['真实感受', '数据支撑'],
        emotionalArc: { start: '好奇', middle: '惊讶', end: '认可' },
        callToAction: '关注我', suggestedReferences: [], tone: '真诚', estimatedWordCount: 800,
      },
      selectedIssues: [{ id: 'issue-1', section: '开头', issue: 'AI味重', suggestion: '口语化', priority: 'high', selected: true, resolved: true }],
      evaluationWeaknesses: ['口水话多', '缺乏情感'], riskLevel: 'low',
      risks: [{ category: 'authenticity', severity: 'low' }],
    })

    expect(input.mode).toBe('humanize')
    expect(input.content).toBe('精修后的正式内容')
    expect(input.title).toBe('精修标题')
    expect(input.hook).toBe('精修钩子')
    expect(input.persona).toBe('tech-reviewer')
    expect(input.platform).toBe('xiaohongshu')
    expect(input.approvedStrategy?.keyArguments).toEqual(['真实感受', '数据支撑'])
    expect(input.evaluationContext?.suggestions).toHaveLength(1)
    expect(input.riskContext?.risks).toHaveLength(1)

    state = humanizationReducer(state, { type: 'SET_STATUS', status: 'loading' })
    expect(state.humanization.status).toBe('loading')
    expect(state.humanization.result).toBeNull()

    const hResult = makeHumanizationResult()
    state = humanizationReducer(state, { type: 'SET_RESULT', result: hResult })
    expect(state.humanization.status).toBe('success')
    expect(state.humanization.result?.content).toBe('真人化后的内容')
    expect(state.humanization.adopted).toBe(false)

    state = humanizationReducer(state, { type: 'ADOPT' })
    expect(state.humanization.adopted).toBe(true)
    expect(state.refineData?.content).toBe('真人化后的内容')
    expect(state.refineData?.changes).toHaveLength(2)
    expect(state.refineData?.changes[1].type).toBe('humanization')
    expect(state.refineData?.preservedElements).toHaveLength(1)
  })

  it('INT-2. Manual edits take priority over refine data', () => {
    const refineResult = makeRefineResult()
    state = humanizationReducer(state, { type: 'SET_REFINE_DATA', data: refineResult })
    const manualContent = '用户手动修改的内容'
    const source = resolveHumanizationContentSource(manualContent, refineResult, '原始初稿')
    expect(source).toBe(manualContent)
    expect(getHumanizationSourceLabel(manualContent, refineResult)).toBe('当前编辑内容')
    expect(isHumanizationUsingDraft(manualContent, refineResult)).toBe(false)
  })

  it('INT-3. Dismiss preserves original refineData', () => {
    state = humanizationReducer(state, { type: 'SET_REFINE_DATA', data: makeRefineResult() })
    state = humanizationReducer(state, { type: 'SET_RESULT', result: makeHumanizationResult() })
    const originalContent = state.refineData?.content
    state = humanizationReducer(state, { type: 'DISMISS' })
    expect(state.humanization.status).toBe('idle')
    expect(state.humanization.result).toBeNull()
    expect(state.refineData?.content).toBe(originalContent)
    expect(state.humanization.adopted).toBe(false)
  })

  it('INT-4. Reset clears humanization completely', () => {
    state = humanizationReducer(state, { type: 'SET_REFINE_DATA', data: makeRefineResult() })
    state = humanizationReducer(state, { type: 'SET_RESULT', result: makeHumanizationResult() })
    state = humanizationReducer(state, { type: 'ADOPT' })
    expect(state.humanization.adopted).toBe(true)
    state = humanizationReducer(state, { type: 'RESET' })
    expect(state.humanization.status).toBe('idle')
    expect(state.humanization.result).toBeNull()
    expect(state.humanization.adopted).toBe(false)
  })

  it('INT-5. Adopt with null result is a no-op', () => {
    state = humanizationReducer(state, { type: 'SET_REFINE_DATA', data: makeRefineResult() })
    const beforeState = state
    state = humanizationReducer(state, { type: 'ADOPT' })
    expect(state).toEqual(beforeState)
  })

  it('INT-7. SET_STATUS resets adopted flag (adopted must be re-decided each time)', () => {
    state = humanizationReducer(state, { type: 'SET_REFINE_DATA', data: makeRefineResult() })
    state = humanizationReducer(state, { type: 'SET_RESULT', result: makeHumanizationResult() })
    state = humanizationReducer(state, { type: 'ADOPT' })
    expect(state.humanization.adopted).toBe(true)
    state = humanizationReducer(state, { type: 'SET_STATUS', status: 'loading' })
    expect(state.humanization.adopted).toBe(false)
  })

  it('INT-8. SET_RESULT resets adopted flag (new result = new decision required)', () => {
    state = humanizationReducer(state, { type: 'SET_REFINE_DATA', data: makeRefineResult() })
    state = humanizationReducer(state, { type: 'SET_RESULT', result: makeHumanizationResult() })
    state = humanizationReducer(state, { type: 'ADOPT' })
    expect(state.humanization.adopted).toBe(true)
    const newResult = makeHumanizationResult({ content: '第二次真人化结果' })
    state = humanizationReducer(state, { type: 'SET_RESULT', result: newResult })
    expect(state.humanization.adopted).toBe(false)
    expect(state.humanization.result?.content).toBe('第二次真人化结果')
  })

  it('INT-6. Empty manual fallback chain', () => {
    const refineResult = makeRefineResult()
    const src1 = resolveHumanizationContentSource('', refineResult, 'draft')
    expect(src1).toBe(refineResult.content)
    const src2 = resolveHumanizationContentSource('   ', refineResult, 'draft')
    expect(src2).toBe(refineResult.content)
    const src3 = resolveHumanizationContentSource(null, null, '草稿内容')
    expect(src3).toBe('草稿内容')
    expect(isHumanizationUsingDraft(null, null)).toBe(true)
  })
})
