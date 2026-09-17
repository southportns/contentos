import { describe, it, expect } from 'vitest'
import {
  resolveHumanizationContentSource, resolveHumanizationTitleSource,
  resolveHumanizationHookSource, buildHumanizationInput,
  mergeHumanizationIntoRefineData, isHumanizationUsingDraft, getHumanizationSourceLabel,
} from '../humanization-adapter'
import type { RefineResult } from '@/hooks/use-workflow'

const draftContent = '原始初稿内容'
const draftTitle = '原始标题'
const draftHook = '原始钩子'
const refineContent = '精修后的内容'
const refineTitle = '精修标题'
const refineHook = '精修钩子'
const manualContent = '用户手动编辑的内容'
const manualTitle = '用户修改的标题'

function makeRefineResult(overrides: Partial<RefineResult> = {}): RefineResult {
  return {
    content: refineContent, title: refineTitle, hook: refineHook,
    wordCount: refineContent.length,
    changes: [{ type: 'tone_change', original: 'old', revised: 'new', reason: 'test' }],
    summary: 'test summary', ...overrides,
  }
}

describe('resolveHumanizationContentSource', () => {
  it('1. should use manual content when available', () => {
    expect(resolveHumanizationContentSource(manualContent, makeRefineResult(), draftContent)).toBe(manualContent)
  })
  it('2. should use refine data when no manual edits', () => {
    expect(resolveHumanizationContentSource(null, makeRefineResult(), draftContent)).toBe(refineContent)
  })
  it('3. should fall back to draft', () => {
    expect(resolveHumanizationContentSource(null, null, draftContent)).toBe(draftContent)
  })
  it('4. should ignore empty manual content', () => {
    expect(resolveHumanizationContentSource('   ', makeRefineResult(), draftContent)).toBe(refineContent)
  })
  it('5. should handle null manual content', () => {
    expect(resolveHumanizationContentSource(null, null, draftContent)).toBe(draftContent)
  })
})

describe('resolveHumanizationTitleSource', () => {
  it('6. should prefer manual title', () => {
    expect(resolveHumanizationTitleSource(manualTitle, makeRefineResult(), draftTitle)).toBe(manualTitle)
  })
  it('7. should use refine title when no manual', () => {
    expect(resolveHumanizationTitleSource(null, makeRefineResult(), draftTitle)).toBe(refineTitle)
  })
})

describe('resolveHumanizationHookSource', () => {
  it('8. should use refine hook when available', () => {
    expect(resolveHumanizationHookSource(makeRefineResult(), draftHook)).toBe(refineHook)
  })
  it('9. should fall back to draft hook', () => {
    expect(resolveHumanizationHookSource(null, draftHook)).toBe(draftHook)
  })
})

describe('buildHumanizationInput', () => {
  it('10. should build input with manual content', () => {
    const input = buildHumanizationInput({
      manualContent, manualTitle, refineData: makeRefineResult(),
      draftContent, draftTitle, draftHook,
      persona: 'test-persona', platform: 'douyin', topic: '测试主题',
    })
    expect(input.content).toBe(manualContent)
    expect(input.title).toBe(manualTitle)
    expect(input.mode).toBe('humanize')
    expect(input.persona).toBe('test-persona')
    expect(input.platform).toBe('douyin')
    expect(input.wordCount).toBe(manualContent.length)
  })
  it('11. should build input using refine data', () => {
    const input = buildHumanizationInput({
      manualContent: null, manualTitle: null, refineData: makeRefineResult(),
      draftContent, draftTitle, draftHook,
    })
    expect(input.content).toBe(refineContent)
    expect(input.title).toBe(refineTitle)
    expect(input.hook).toBe(refineHook)
  })
  it('12. should include approvedStrategy', () => {
    const strategy = {
      title: 'Strategy Title', hook: 'Strategy Hook', structure: [],
      keyArguments: ['arg1', 'arg2'],
      emotionalArc: { start: '平静', middle: '激动', end: '反思' },
      callToAction: '关注我', suggestedReferences: [], tone: '沉静', estimatedWordCount: 500,
    }
    const input = buildHumanizationInput({
      manualContent: null, manualTitle: null, refineData: null,
      draftContent, draftTitle, draftHook, approvedStrategy: strategy,
    })
    expect(input.approvedStrategy).toBeDefined()
    expect(input.approvedStrategy?.keyArguments).toEqual(['arg1', 'arg2'])
    expect(input.approvedStrategy?.callToAction).toBe('关注我')
  })
  it('13. should include evaluation context', () => {
    const input = buildHumanizationInput({
      manualContent: null, manualTitle: null, refineData: null,
      draftContent, draftTitle, draftHook,
      selectedIssues: [{ id: 'eval-0', section: '开头', issue: '不够吸引', suggestion: '加悬念', priority: 'high', selected: true, resolved: false }],
      evaluationWeaknesses: ['弱点1', '弱点2'],
    })
    expect(input.evaluationContext).toBeDefined()
    expect(input.evaluationContext?.suggestions).toHaveLength(1)
    expect(input.evaluationContext?.suggestions[0].issue).toBe('不够吸引')
    expect(input.evaluationContext?.weaknesses).toEqual(['弱点1', '弱点2'])
  })
  it('14. should include risk context', () => {
    const input = buildHumanizationInput({
      manualContent: null, manualTitle: null, refineData: null,
      draftContent, draftTitle, draftHook,
      riskLevel: 'medium', risks: [{ category: 'platform_violation', description: 'test risk', severity: 'low' }],
    })
    expect(input.riskContext).toBeDefined()
    expect(input.riskContext?.overallRiskLevel).toBe('medium')
    expect(input.riskContext?.risks).toHaveLength(1)
    expect(input.riskContext?.risks[0].id).toBe('risk-0')
  })
  it('15. should omit persona when null', () => {
    const input = buildHumanizationInput({
      manualContent: null, manualTitle: null, refineData: null,
      draftContent, draftTitle, draftHook, persona: null,
    })
    expect(input.persona).toBeUndefined()
  })
})

describe('mergeHumanizationIntoRefineData', () => {
  it('16. should merge changes', () => {
    const base = makeRefineResult()
    const hResult: RefineResult = {
      content: 'humanized content', title: 'humanized title', hook: 'humanized hook',
      wordCount: 16, changes: [{ type: 'humanization', original: 'AI', revised: '人话', reason: '去AI味' }],
      summary: 'humanized',
    }
    const merged = mergeHumanizationIntoRefineData(base, hResult)
    expect(merged.content).toBe('humanized content')
    expect(merged.changes).toHaveLength(2)
    expect(merged.changes[1].type).toBe('humanization')
  })
  it('17. should preserve hookCandidates and titleCandidates', () => {
    const base = makeRefineResult({ hookCandidates: ['h1', 'h2'], titleCandidates: ['t1'] })
    const hResult: RefineResult = { content: 'humanized', title: 't', hook: 'h', wordCount: 8, changes: [], summary: '' }
    const merged = mergeHumanizationIntoRefineData(base, hResult)
    expect(merged.hookCandidates).toEqual(['h1', 'h2'])
    expect(merged.titleCandidates).toEqual(['t1'])
  })
  it('18. should handle null base refine data', () => {
    const hResult: RefineResult = {
      content: 'humanized content', title: 'humanized title', hook: 'humanized hook',
      wordCount: 16, changes: [{ type: 'humanization', original: 'old', revised: 'new', reason: 'test' }],
      summary: 'humanized',
    }
    const merged = mergeHumanizationIntoRefineData(null, hResult)
    expect(merged.content).toBe('humanized content')
    expect(merged.changes).toHaveLength(1)
  })
  it('19. should merge preserved elements', () => {
    const base = makeRefineResult({ preservedElements: [{ element: 'CTA', reason: 'keep' }] })
    const hResult: RefineResult = {
      content: 'h', title: 't', hook: 'h', wordCount: 1, changes: [], summary: '',
      preservedElements: [{ element: 'core argument', reason: 'strategy' }],
    }
    const merged = mergeHumanizationIntoRefineData(base, hResult)
    expect(merged.preservedElements).toHaveLength(2)
  })
})

describe('isHumanizationUsingDraft', () => {
  it('20. should return true when no manual or refine', () => {
    expect(isHumanizationUsingDraft(null, null)).toBe(true)
  })
  it('21. should return false when manual exists', () => {
    expect(isHumanizationUsingDraft('edited content', null)).toBe(false)
  })
  it('22. should return false when refine exists', () => {
    expect(isHumanizationUsingDraft(null, makeRefineResult())).toBe(false)
  })
})

describe('getHumanizationSourceLabel', () => {
  it('23. should return current edit label', () => {
    expect(getHumanizationSourceLabel('手动内容', null)).toBe('当前编辑内容')
  })
  it('24. should return refine result label', () => {
    expect(getHumanizationSourceLabel(null, makeRefineResult())).toBe('最新精修结果')
  })
  it('25. should return draft label', () => {
    expect(getHumanizationSourceLabel(null, null)).toBe('原始初稿')
  })
})
