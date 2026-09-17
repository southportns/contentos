import { describe, it, expect } from 'vitest'
import {
  evaluationToRefineIssues,
  selectedIssuesToEvaluationContext,
  riskAnalysisToRefineRiskContext,
  toggleIssueSelection,
  markIssuesResolved,
  getSelectedIssues,
} from '../refine-issue-adapter'
import type { EvaluationResult, RiskAnalysisResult } from '@/hooks/use-workflow'

// ─── Test Fixtures ──────────────────────────────────────────

function createMockEvaluation(overrides?: Partial<EvaluationResult>): EvaluationResult {
  return {
    overallScore: 75,
    scores: {
      emotionalImpact: 70,
      logicalClarity: 80,
      novelty: 75,
      readability: 85,
      utility: 78,
      platformFit: 72,
    },
    strengths: ['逻辑清晰', '内容实用'],
    weaknesses: ['开头不够吸引人', '情绪递进不明显'],
    suggestions: [
      {
        section: '开头',
        issue: '开头吸引力不足',
        suggestion: '增加悬念感或冲突感开场',
        priority: 'high',
      },
      {
        section: '中段',
        issue: '情绪递进较弱',
        suggestion: '加强中段情绪过渡，使用更强烈的对比',
        priority: 'medium',
      },
      {
        section: '结尾',
        issue: 'CTA 不明确',
        suggestion: '增加明确的行动号召',
        priority: 'low',
      },
    ],
    emotionalArcAnalysis: { achieved: false, analysis: '情绪弧线未完全达成' },
    conclusion: '整体不错，但开头需要加强',
    ...overrides,
  }
}

function createMockRiskAnalysis(): RiskAnalysisResult {
  return {
    overallRiskLevel: 'low',
    summary: '整体风险较低',
    risks: [
      {
        category: 'misinformation',
        severity: 'medium',
        description: '部分数据未标注来源',
        suggestion: '补充数据来源说明',
      },
      {
        category: 'platform_violation',
        severity: 'low',
        description: '标题可能有标题党倾向',
        suggestion: '调整标题措辞',
      },
    ],
  }
}

// ─── Tests ──────────────────────────────────────────────────

describe('evaluationToRefineIssues', () => {
  it('should convert evaluation suggestions to RefineIssue[]', () => {
    const evaluation = createMockEvaluation()
    const issues = evaluationToRefineIssues(evaluation)

    expect(issues).toHaveLength(3)
    expect(issues[0]).toEqual({
      id: 'eval-0',
      section: '开头',
      issue: '开头吸引力不足',
      suggestion: '增加悬念感或冲突感开场',
      priority: 'high',
      selected: true,  // high priority defaults to selected
      resolved: false,
    })
    expect(issues[1]).toEqual({
      id: 'eval-1',
      section: '中段',
      issue: '情绪递进较弱',
      suggestion: '加强中段情绪过渡，使用更强烈的对比',
      priority: 'medium',
      selected: false,  // medium priority defaults to not selected
      resolved: false,
    })
    expect(issues[2]).toEqual({
      id: 'eval-2',
      section: '结尾',
      issue: 'CTA 不明确',
      suggestion: '增加明确的行动号召',
      priority: 'low',
      selected: false,  // low priority defaults to not selected
      resolved: false,
    })
  })

  it('should return empty array for null evaluation', () => {
    const issues = evaluationToRefineIssues(null)
    expect(issues).toEqual([])
  })

  it('should return empty array for evaluation with no suggestions', () => {
    const evaluation = createMockEvaluation({ suggestions: [] })
    const issues = evaluationToRefineIssues(evaluation)
    expect(issues).toEqual([])
  })

  it('should generate stable IDs based on index', () => {
    const evaluation = createMockEvaluation()
    const issues = evaluationToRefineIssues(evaluation)

    expect(issues[0].id).toBe('eval-0')
    expect(issues[1].id).toBe('eval-1')
    expect(issues[2].id).toBe('eval-2')
  })

  it('should preserve priority field correctly', () => {
    const evaluation = createMockEvaluation()
    const issues = evaluationToRefineIssues(evaluation)

    expect(issues[0].priority).toBe('high')
    expect(issues[1].priority).toBe('medium')
    expect(issues[2].priority).toBe('low')
  })

  it('should preserve section and issue fields correctly', () => {
    const evaluation = createMockEvaluation()
    const issues = evaluationToRefineIssues(evaluation)

    expect(issues[0].section).toBe('开头')
    expect(issues[0].issue).toBe('开头吸引力不足')
    expect(issues[0].suggestion).toBe('增加悬念感或冲突感开场')
  })

  it('should handle single high-priority suggestion', () => {
    const evaluation = createMockEvaluation({
      suggestions: [
        { section: 'A', issue: '问题A', suggestion: '建议A', priority: 'high' },
      ],
    })
    const issues = evaluationToRefineIssues(evaluation)

    expect(issues).toHaveLength(1)
    expect(issues[0].selected).toBe(true)
  })

  it('should handle all medium-priority suggestions (none selected by default)', () => {
    const evaluation = createMockEvaluation({
      suggestions: [
        { section: 'A', issue: '问题A', suggestion: '建议A', priority: 'medium' },
        { section: 'B', issue: '问题B', suggestion: '建议B', priority: 'medium' },
      ],
    })
    const issues = evaluationToRefineIssues(evaluation)

    expect(issues[0].selected).toBe(false)
    expect(issues[1].selected).toBe(false)
  })
})

describe('selectedIssuesToEvaluationContext', () => {
  it('should build evaluation context from selected issues', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    // Manually select all for testing
    const allSelected = issues.map((i) => ({ ...i, selected: true }))

    const ctx = selectedIssuesToEvaluationContext(allSelected)

    expect(ctx).not.toBeNull()
    expect(ctx!.suggestions).toHaveLength(3)
    expect(ctx!.suggestions[0].id).toBe('eval-0')
    expect(ctx!.suggestions[0].issue).toBe('开头吸引力不足')
    expect(ctx!.suggestions[0].priority).toBe('high')
  })

  it('should return null when no issues are selected', () => {
    const ctx = selectedIssuesToEvaluationContext([])
    expect(ctx).toBeNull()
  })

  it('should only include selected issues', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    // eval-0 is selected by default (high priority), eval-1 and eval-2 are not
    const ctx = selectedIssuesToEvaluationContext(issues)

    expect(ctx).not.toBeNull()
    expect(ctx!.suggestions).toHaveLength(1)
    expect(ctx!.suggestions[0].id).toBe('eval-0')
  })
})

describe('riskAnalysisToRefineRiskContext', () => {
  it('should convert risk analysis to refine risk context', () => {
    const riskAnalysis = createMockRiskAnalysis()
    const ctx = riskAnalysisToRefineRiskContext(riskAnalysis)

    expect(ctx).not.toBeNull()
    expect(ctx!.overallRiskLevel).toBe('low')
    expect(ctx!.risks).toHaveLength(2)
    expect(ctx!.risks[0].id).toBe('risk-0')
    expect(ctx!.risks[0].category).toBe('misinformation')
    expect(ctx!.risks[0].severity).toBe('medium')
    expect(ctx!.risks[1].id).toBe('risk-1')
  })

  it('should return null for null risk analysis', () => {
    const ctx = riskAnalysisToRefineRiskContext(null)
    expect(ctx).toBeNull()
  })

  it('should handle risk analysis with no risks', () => {
    const riskAnalysis: RiskAnalysisResult = {
      overallRiskLevel: 'safe',
      summary: '无风险',
      risks: [],
    }
    const ctx = riskAnalysisToRefineRiskContext(riskAnalysis)

    expect(ctx).not.toBeNull()
    expect(ctx!.overallRiskLevel).toBe('safe')
    expect(ctx!.risks).toEqual([])
  })
})

describe('toggleIssueSelection', () => {
  it('should toggle issue selection by id', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    // eval-0 is selected (high), eval-1 is not (medium)
    expect(issues[0].selected).toBe(true)
    expect(issues[1].selected).toBe(false)

    const updated = toggleIssueSelection(issues, 'eval-0')
    expect(updated[0].selected).toBe(false)
    expect(updated[1].selected).toBe(false)

    const updated2 = toggleIssueSelection(updated, 'eval-1')
    expect(updated2[0].selected).toBe(false)
    expect(updated2[1].selected).toBe(true)
  })

  it('should not mutate the original array', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    const original = [...issues]
    toggleIssueSelection(issues, 'eval-0')

    expect(issues[0].selected).toBe(original[0].selected)
  })
})

describe('markIssuesResolved', () => {
  it('should mark specified issues as resolved', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    const updated = markIssuesResolved(issues, ['eval-0', 'eval-2'])

    expect(updated[0].resolved).toBe(true)
    expect(updated[1].resolved).toBe(false)
    expect(updated[2].resolved).toBe(true)
  })

  it('should handle empty resolved ids', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    const updated = markIssuesResolved(issues, [])

    expect(updated.every((i) => !i.resolved)).toBe(true)
  })

  it('should not affect other issue properties', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    const updated = markIssuesResolved(issues, ['eval-0'])

    expect(updated[0].id).toBe('eval-0')
    expect(updated[0].issue).toBe('开头吸引力不足')
    expect(updated[0].selected).toBe(true)
  })
})

describe('getSelectedIssues', () => {
  it('should return only selected issues', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    // Only eval-0 is selected by default
    const selected = getSelectedIssues(issues)

    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('eval-0')
  })

  it('should return empty array when no issues are selected', () => {
    const issues = evaluationToRefineIssues(
      createMockEvaluation({
        suggestions: [
          { section: 'A', issue: '问题A', suggestion: '建议A', priority: 'low' },
        ],
      }),
    )
    const selected = getSelectedIssues(issues)

    expect(selected).toEqual([])
  })

  it('should return multiple selected issues', () => {
    const issues = evaluationToRefineIssues(createMockEvaluation())
    const allSelected = issues.map((i) => ({ ...i, selected: true }))
    const selected = getSelectedIssues(allSelected)

    expect(selected).toHaveLength(3)
  })
})