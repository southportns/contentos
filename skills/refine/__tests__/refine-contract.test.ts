/**
 * P0.3.9.1 — Refine Contract Tests
 *
 * Tests the extended RefineInput/RefineOutput contracts including:
 * - All legacy modes remain backward-compatible
 * - New modes (issue_fix, humanize) are accepted
 * - Structured contexts (evaluation, risk, approvedStrategy) parse correctly
 * - Validation rejects invalid values
 * - Output schema supports new fields
 */

import { describe, it, expect } from 'vitest'
import {
  refineInputSchema,
  refineOutputSchema,
} from '../schema'

// ─── Fixtures ──────────────────────────────────────────────────────────────

const BASE_INPUT = {
  content: '这是一段测试口播稿内容，用于验证 schema 契约。',
  title: '测试标题',
  hook: '测试钩子',
  wordCount: 100,
}

// ─── TEST 1-4: Legacy modes pass schema ───────────────────────────────────

describe('P0.3.9.1 — Legacy Mode Compatibility', () => {
  it('TEST 01: tone_change input passes schema', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'tone_change',
      toneChange: { newTone: '让语气更口语化' },
    })
    expect(result.success).toBe(true)
  })

  it('TEST 02: hook_select input passes schema', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'hook_select',
      hookSelect: { candidates: ['钩子1', '钩子2', '钩子3'], selectedIndex: 0 },
    })
    expect(result.success).toBe(true)
  })

  it('TEST 03: title_select input passes schema', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'title_select',
      titleSelect: { candidates: ['标题1', '标题2', '标题3'], selectedIndex: 1 },
    })
    expect(result.success).toBe(true)
  })

  it('TEST 04: hook_and_title_select input passes schema', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'hook_and_title_select',
    })
    expect(result.success).toBe(true)
  })
})

// ─── TEST 5-6: New modes pass schema ──────────────────────────────────────

describe('P0.3.9.1 — New Modes', () => {
  it('TEST 05: issue_fix input passes schema', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'issue_fix',
      evaluationContext: {
        suggestions: [
          {
            section: '开头',
            issue: '钩子吸引力不足',
            suggestion: '增加悬念感',
            priority: 'high',
          },
        ],
        weaknesses: ['开头平淡'],
      },
    })
    expect(result.success).toBe(true)
  })

  it('TEST 06: humanize input passes schema', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'humanize',
      persona: '科技博主',
    })
    expect(result.success).toBe(true)
  })
})

// ─── TEST 7-9: Structured contexts parse correctly ────────────────────────

describe('P0.3.9.1 — Structured Contexts', () => {
  it('TEST 07: evaluationContext parses correctly', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'issue_fix',
      evaluationContext: {
        suggestions: [
          {
            id: 'sug-001',
            section: '开头',
            issue: '钩子吸引力不足',
            suggestion: '增加悬念感',
            priority: 'high',
          },
          {
            id: 'sug-002',
            section: '结尾',
            issue: '缺乏行动号召',
            suggestion: '添加具体引导',
            priority: 'medium',
          },
        ],
        weaknesses: ['开头平淡', '结尾仓促'],
        scores: {
          emotionalImpact: 72,
          logicalClarity: 85,
          novelty: 60,
          readability: 78,
          utility: 80,
          platformFit: 90,
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.evaluationContext?.suggestions).toHaveLength(2)
      expect(result.data.evaluationContext?.weaknesses).toHaveLength(2)
      expect(result.data.evaluationContext?.scores?.emotionalImpact).toBe(72)
    }
  })

  it('TEST 08: riskContext parses correctly', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'issue_fix',
      riskContext: {
        overallRiskLevel: 'medium',
        risks: [
          {
            id: 'risk-001',
            category: 'misinformation',
            description: '数据引用未标注来源',
            suggestion: '标注数据来源',
            severity: 'medium',
          },
        ],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.riskContext?.overallRiskLevel).toBe('medium')
      expect(result.data.riskContext?.risks).toHaveLength(1)
      expect(result.data.riskContext?.risks[0]?.category).toBe('misinformation')
    }
  })

  it('TEST 09: approvedStrategy parses correctly', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'issue_fix',
      approvedStrategy: {
        title: '已审批标题',
        keyArguments: ['论点A', '论点B'],
        emotionalArc: {
          start: '好奇',
          middle: '认同',
          end: '行动',
        },
        callToAction: '点击关注了解更多',
        tone: '专业但亲切',
        selectedAngleTitle: '反常识角度',
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.approvedStrategy?.keyArguments).toHaveLength(2)
      expect(result.data.approvedStrategy?.emotionalArc?.start).toBe('好奇')
      expect(result.data.approvedStrategy?.callToAction).toBe('点击关注了解更多')
    }
  })
})

// ─── TEST 10: Old request without new context still passes ─────────────────

describe('P0.3.9.1 — Backward Compatibility', () => {
  it('TEST 10: old request without new context still passes', () => {
    const result = refineInputSchema.safeParse({
      content: '原始内容',
      title: '原始标题',
      hook: '原始钩子',
      wordCount: 200,
      mode: 'tone_change',
      toneChange: { newTone: '更口语化' },
      platform: 'douyin',
      topic: '测试主题',
      selectedAngleTitle: '测试角度',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.evaluationContext).toBeUndefined()
      expect(result.data.riskContext).toBeUndefined()
      expect(result.data.approvedStrategy).toBeUndefined()
      expect(result.data.persona).toBeUndefined()
    }
  })
})

// ─── TEST 11-13: Validation rejects invalid values ─────────────────────────

describe('P0.3.9.1 — Validation Rejection', () => {
  it('TEST 11: invalid priority is rejected', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'issue_fix',
      evaluationContext: {
        suggestions: [
          {
            section: '开头',
            issue: '问题',
            suggestion: '建议',
            priority: 'critical' as any, // invalid
          },
        ],
        weaknesses: [],
      },
    })
    expect(result.success).toBe(false)
  })

  it('TEST 12: invalid riskLevel is rejected', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'issue_fix',
      riskContext: {
        overallRiskLevel: 'extreme' as any, // invalid
        risks: [],
      },
    })
    expect(result.success).toBe(false)
  })

  it('TEST 13: invalid mode is rejected', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'unknown_mode' as any,
    })
    expect(result.success).toBe(false)
  })
})

// ─── TEST 14-16: Output schema supports new fields ─────────────────────────

describe('P0.3.9.1 — Output Contract Extensions', () => {
  const BASE_OUTPUT = {
    content: '精修后内容',
    title: '精修后标题',
    hook: '精修后钩子',
    wordCount: 150,
    changes: [
      {
        type: 'tone_change',
        original: '原文片段',
        revised: '修改片段',
        reason: '修改原因',
      },
    ],
    summary: '精修总结',
  }

  it('TEST 14: output changes can hold linkedIssueId and confidence', () => {
    const result = refineOutputSchema.safeParse({
      ...BASE_OUTPUT,
      changes: [
        {
          type: 'issue_fix',
          original: '原文',
          revised: '修改后',
          reason: '修复问题',
          linkedIssueId: 'sug-001',
          confidence: 0.85,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.changes[0]?.linkedIssueId).toBe('sug-001')
      expect(result.data.changes[0]?.confidence).toBe(0.85)
    }
  })

  it('TEST 15: resolvedIssues schema is correct', () => {
    const result = refineOutputSchema.safeParse({
      ...BASE_OUTPUT,
      resolvedIssues: [
        {
          issueId: 'sug-001',
          resolution: '已修复钩子吸引力问题',
          changeId: 'chg-001',
        },
        {
          issueId: 'sug-002',
          resolution: '已补充行动号召',
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.resolvedIssues).toHaveLength(2)
      expect(result.data.resolvedIssues?.[0]?.issueId).toBe('sug-001')
      expect(result.data.resolvedIssues?.[0]?.changeId).toBe('chg-001')
    }
  })

  it('TEST 16: unresolvedIssues schema is correct', () => {
    const result = refineOutputSchema.safeParse({
      ...BASE_OUTPUT,
      unresolvedIssues: [
        {
          issueId: 'sug-003',
          reason: '修改会破坏已审批的核心策略',
          suggestion: '建议人工调整或重新生成',
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.unresolvedIssues).toHaveLength(1)
      expect(result.data.unresolvedIssues?.[0]?.issueId).toBe('sug-003')
    }
  })

  it('TEST 17: preservedElements schema is correct', () => {
    const result = refineOutputSchema.safeParse({
      ...BASE_OUTPUT,
      preservedElements: [
        { element: '核心论点A', reason: '已审批策略明确要求保留' },
        { element: '情绪弧线: 好奇→认同→行动', reason: 'approvedStrategy.emotionalArc 约束' },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.preservedElements).toHaveLength(2)
      expect(result.data.preservedElements?.[0]?.element).toBe('核心论点A')
    }
  })
})

// ─── Bonus: Full new-mode input with all contexts ─────────────────────────

describe('P0.3.9.1 — Full Issue Fix Input', () => {
  it('TEST 18: full issue_fix input with all contexts passes', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'issue_fix',
      evaluationContext: {
        suggestions: [
          {
            id: 'sug-001',
            section: '开头',
            issue: '钩子吸引力不足',
            suggestion: '增加悬念感',
            priority: 'high',
          },
        ],
        weaknesses: ['开头平淡'],
        scores: { emotionalImpact: 60, logicalClarity: 80 },
      },
      riskContext: {
        overallRiskLevel: 'low',
        risks: [
          {
            id: 'risk-001',
            category: 'platform_violation',
            description: '可能违反平台规则',
            suggestion: '调整措辞',
            severity: 'low',
          },
        ],
      },
      approvedStrategy: {
        title: '已审批标题',
        keyArguments: ['论点A'],
        emotionalArc: { start: '好奇', middle: '认同', end: '行动' },
        callToAction: '关注我',
        tone: '亲切',
        selectedAngleTitle: '反常识',
      },
      platform: 'douyin',
      topic: '测试主题',
      persona: '科技博主',
    })
    expect(result.success).toBe(true)
  })

  it('TEST 19: humanize with all optional fields passes', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'humanize',
      persona: '知心姐姐',
      platform: 'xiaohongshu',
      topic: '情感话题',
      selectedAngleTitle: '共鸣型',
    })
    expect(result.success).toBe(true)
  })

  it('TEST 20: empty evaluationContext suggestions is valid', () => {
    const result = refineInputSchema.safeParse({
      ...BASE_INPUT,
      mode: 'issue_fix',
      evaluationContext: {
        suggestions: [],
        weaknesses: [],
      },
    })
    expect(result.success).toBe(true)
  })
})
