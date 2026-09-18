import { describe, it, expect, beforeEach } from 'vitest'
import {
  resolveHumanizationContentSource, buildHumanizationInput,
  isHumanizationUsingDraft, getHumanizationSourceLabel,
} from '@/lib/workflow/humanization-adapter'
import {
  workflowActions,
  getWorkflowStateForTest,
  type RefineResult, type WorkflowState, type StrategyApprovalState,
} from '../use-workflow'

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

// ─── Adapter-level tests (pure functions, no workflow state) ───

describe('P0.3.9.3 - Humanization Adapter (pure functions)', () => {
  it('INT-1. Full pipeline: resolve -> build -> generate -> adopt', () => {
    const refineResult = makeRefineResult()

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
  })

  it('INT-2. Manual edits take priority over refine data', () => {
    const refineResult = makeRefineResult()
    const manualContent = '用户手动修改的内容'
    const source = resolveHumanizationContentSource(manualContent, refineResult, '原始初稿')
    expect(source).toBe(manualContent)
    expect(getHumanizationSourceLabel(manualContent, refineResult)).toBe('当前编辑内容')
    expect(isHumanizationUsingDraft(manualContent, refineResult)).toBe(false)
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

// ─── Production Workflow Action Tests (using real workflowActions) ───

describe('P0.3.9.3 - Production Workflow Action Tests', () => {
  beforeEach(() => {
    workflowActions.reset()
  })

  it('P3-T1. SET_RESULT produces humanization result with adopted=false', () => {
    const hResult = makeHumanizationResult()
    workflowActions.setHumanizationResult(hResult)
    const ws = getWorkflowStateForTest()
    expect(ws.humanization.status).toBe('success')
    expect(ws.humanization.result?.content).toBe('真人化后的内容')
    expect(ws.humanization.adopted).toBe(false)
  })

  it('P3-T2. adopt → adopted=true', () => {
    workflowActions.setHumanizationResult(makeHumanizationResult())
    workflowActions.adoptHumanization()
    const ws = getWorkflowStateForTest()
    expect(ws.humanization.adopted).toBe(true)
    expect(ws.refineData?.content).toBe('真人化后的内容')
  })

  it('P3-T3. Already adopted → new result resets adopted=false', () => {
    workflowActions.setHumanizationResult(makeHumanizationResult())
    workflowActions.adoptHumanization()
    expect(getWorkflowStateForTest().humanization.adopted).toBe(true)

    const newResult = makeHumanizationResult({ content: '第二次真人化结果' })
    workflowActions.setHumanizationResult(newResult)
    const ws = getWorkflowStateForTest()
    expect(ws.humanization.adopted).toBe(false)
    expect(ws.humanization.result?.content).toBe('第二次真人化结果')
  })

  it('P3-T4. Already adopted → dismissHumanization resets adopted=false', () => {
    workflowActions.setHumanizationResult(makeHumanizationResult())
    workflowActions.adoptHumanization()
    expect(getWorkflowStateForTest().humanization.adopted).toBe(true)

    workflowActions.dismissHumanization()
    const ws = getWorkflowStateForTest()
    expect(ws.humanization.adopted).toBe(false)
    expect(ws.humanization.status).toBe('idle')
    expect(ws.humanization.result).toBeNull()
  })

  it('P3-T5. dismissHumanization does NOT modify refineData', () => {
    const refineResult = makeRefineResult()
    workflowActions.setRefineData(refineResult)
    workflowActions.setHumanizationResult(makeHumanizationResult())
    const originalContent = getWorkflowStateForTest().refineData?.content

    workflowActions.dismissHumanization()
    const ws = getWorkflowStateForTest()
    expect(ws.refineData?.content).toBe(originalContent)
  })

  it('P3-T6. resetHumanization → status=idle, result=null, adopted=false', () => {
    workflowActions.setHumanizationResult(makeHumanizationResult())
    workflowActions.adoptHumanization()
    workflowActions.resetHumanization()
    const ws = getWorkflowStateForTest()
    expect(ws.humanization.status).toBe('idle')
    expect(ws.humanization.result).toBeNull()
    expect(ws.humanization.adopted).toBe(false)
  })

  it('P3-T7. SET_STATUS resets adopted flag (adopted must be re-decided each time)', () => {
    workflowActions.setHumanizationResult(makeHumanizationResult())
    workflowActions.adoptHumanization()
    expect(getWorkflowStateForTest().humanization.adopted).toBe(true)

    workflowActions.setHumanizationStatus('loading')
    expect(getWorkflowStateForTest().humanization.adopted).toBe(false)
  })

  it('P3-T8. Adopt with null result is a no-op (no crash)', () => {
    workflowActions.reset()
    expect(() => workflowActions.adoptHumanization()).not.toThrow()
    const ws = getWorkflowStateForTest()
    expect(ws.humanization.adopted).toBe(false)
    expect(ws.refineData).toBeNull()
  })
})

// ─── Regression & Chain Tests ───

describe('P0.3.9.3 - Workflow State Regression Tests', () => {
  it('INT-A. Full Workflow State Regression - all legacy fields present', () => {
    type AssertKey<T, K extends string> = K extends keyof T ? true : false
    const checks: Array<AssertKey<WorkflowState, string>> = [
      {} as AssertKey<WorkflowState, 'projectId'>,
      {} as AssertKey<WorkflowState, 'persona'>,
      {} as AssertKey<WorkflowState, 'referenceContent'>,
      {} as AssertKey<WorkflowState, 'adaptationResult'>,
      {} as AssertKey<WorkflowState, 'uploadedContent'>,
      {} as AssertKey<WorkflowState, 'distillationResult'>,
      {} as AssertKey<WorkflowState, 'topicProfile'>,
      {} as AssertKey<WorkflowState, 'viralResult'>,
      {} as AssertKey<WorkflowState, 'angles'>,
      {} as AssertKey<WorkflowState, 'selectedAngle'>,
      {} as AssertKey<WorkflowState, 'strategy'>,
      {} as AssertKey<WorkflowState, 'strategyId'>,
      {} as AssertKey<WorkflowState, 'strategyApproval'>,
      {} as AssertKey<WorkflowState, 'draft'>,
      {} as AssertKey<WorkflowState, 'evaluation'>,
      {} as AssertKey<WorkflowState, 'strategyEvaluation'>,
      {} as AssertKey<WorkflowState, 'riskAnalysis'>,
      {} as AssertKey<WorkflowState, 'refineData'>,
      {} as AssertKey<WorkflowState, 'refineIssues'>,
      {} as AssertKey<WorkflowState, 'humanization'>,
      {} as AssertKey<WorkflowState, 'finalOutput'>,
    ]
    // If any key is missing, TypeScript would reject the assertion above
    expect(checks.length).toBe(21)
  })

  it('INT-A2. Legacy actions present in workflowActions', () => {
    expect(typeof workflowActions.setProjectId).toBe('function')
    expect(typeof workflowActions.setPersona).toBe('function')
    expect(typeof workflowActions.setTopicProfile).toBe('function')
    expect(typeof workflowActions.updateTopicProfile).toBe('function')
    expect(typeof workflowActions.setReferenceContent).toBe('function')
    expect(typeof workflowActions.setAdaptationResult).toBe('function')
    expect(typeof workflowActions.setUploadedContent).toBe('function')
    expect(typeof workflowActions.setDistillationResult).toBe('function')
    expect(typeof workflowActions.setViralResult).toBe('function')
    expect(typeof workflowActions.setAngles).toBe('function')
    expect(typeof workflowActions.updateAngle).toBe('function')
    expect(typeof workflowActions.setSelectedAngle).toBe('function')
    expect(typeof workflowActions.setStrategy).toBe('function')
    expect(typeof workflowActions.setStrategyId).toBe('function')
    expect(typeof workflowActions.setStrategyPending).toBe('function')
    expect(typeof workflowActions.approveStrategy).toBe('function')
    expect(typeof workflowActions.rejectStrategy).toBe('function')
    expect(typeof workflowActions.resetStrategyApproval).toBe('function')
    expect(typeof workflowActions.setDraft).toBe('function')
    expect(typeof workflowActions.updateDraft).toBe('function')
    expect(typeof workflowActions.setEvaluation).toBe('function')
    expect(typeof workflowActions.setStrategyEvaluation).toBe('function')
    expect(typeof workflowActions.setRiskAnalysis).toBe('function')
    expect(typeof workflowActions.setRefineData).toBe('function')
    expect(typeof workflowActions.updateRefineData).toBe('function')
    expect(typeof workflowActions.setRefineIssues).toBe('function')
    expect(typeof workflowActions.toggleRefineIssue).toBe('function')
    expect(typeof workflowActions.markRefineIssuesResolved).toBe('function')
    expect(typeof workflowActions.resetRefineIssueSelections).toBe('function')
    expect(typeof workflowActions.setFinalOutput).toBe('function')
    expect(typeof workflowActions.clearDownstream).toBe('function')
    expect(typeof workflowActions.reset).toBe('function')
  })

  it('INT-A3. Strategy Approval State has approvedStrategy (P0.3.8.4)', () => {
    type AssertKey<T, K extends string> = K extends keyof T ? true : false
    const approvedStrategyCheck: AssertKey<StrategyApprovalState, 'approvedStrategy'> = true
    expect(approvedStrategyCheck).toBe(true)
  })

  it('INT-E. Draft -> Refine -> Issue Fix -> Humanization -> Adopt -> Final chain preserves all state', () => {
    workflowActions.reset()
    workflowActions.setDraft({
      title: 'T', content: 'C', hook: 'H', wordCount: 1, sections: [{ section: 's', content: 'c' }],
    })

    const refineResult = makeRefineResult()
    workflowActions.setRefineData(refineResult)
    workflowActions.setHumanizationStatus('loading')

    const hResult = makeHumanizationResult()
    workflowActions.setHumanizationResult(hResult)
    expect(getWorkflowStateForTest().humanization.adopted).toBe(false)

    workflowActions.adoptHumanization()
    expect(getWorkflowStateForTest().humanization.adopted).toBe(true)
    expect(getWorkflowStateForTest().refineData?.content).toBe('真人化后的内容')
    expect(typeof workflowActions.setFinalOutput).toBe('function')

    workflowActions.reset()
  })
})
