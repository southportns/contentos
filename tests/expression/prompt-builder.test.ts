/**
 * Expression Engine — Prompt Builder Tests
 *
 * Tests that prompts are correctly constructed with ExpressionPlan data.
 * These tests do NOT call LLMs — they only verify prompt construction.
 * @see docs/P0.1_HUMAN_EXPRESSION_ENGINE_PROMPT.md §28.3
 */
import { describe, it, expect } from 'vitest'
import { WRITING_PROMPT } from '@/skills/writing/prompts'
import { EXPRESSION_PLANNING_PROMPT } from '@/skills/expression-planning/prompts'
import { EXPRESSION_AUDIT_PROMPT } from '@/skills/expression-audit/prompts'
import { EXPRESSION_REWRITE_PROMPT } from '@/skills/expression-rewrite/prompts'
import { VALID_EXPRESSION_PLAN } from './fixtures'
import type { ExpressionPlanningInput } from '@/skills/expression-planning/schema'
import type { ExpressionAuditInput } from '@/skills/expression-audit/schema'
import type { ExpressionRewriteInput } from '@/skills/expression-rewrite/schema'
import type { ExpressionAudit } from '@/lib/expression/types'

const mockStrategy = {
  title: '测试标题',
  hook: '测试钩子',
  structure: [
    {
      section: '开头',
      purpose: '引入',
      keyArguments: ['论点1'],
      estimatedWords: 200,
    },
  ],
  keyArguments: ['论点1'],
  emotionalArc: { start: 'calm', middle: 'reflective', end: 'restrained' },
  callToAction: '关注我',
  tone: '口语',
  estimatedWordCount: 1000,
}

const mockSelectedAngle = {
  title: '测试角度',
  angle: '测试论点',
  targetEmotion: '共鸣',
  keyPoints: ['要点1'],
}

describe('Writing Skill — ExpressionPlan Injection', () => {
  it('should include ExpressionPlan content in the writing prompt', () => {
    const prompt = WRITING_PROMPT(
      '测试主题',
      mockStrategy,
      mockSelectedAngle,
      'douyin',
      undefined,
      undefined,
      undefined,
      VALID_EXPRESSION_PLAN,
    )

    // Verify ExpressionPlan content is present
    expect(prompt).toContain('表达蓝图')
    expect(prompt).toContain('思维路径')
    expect(prompt).toContain('observation')
    expect(prompt).toContain('contradiction')
    expect(prompt).toContain('情绪曲线')
    expect(prompt).toContain('节奏参数')
    expect(prompt).toContain('禁止伪造作者真实经历')
    expect(prompt).toContain('请严格遵守上方表达蓝图中的思维路径')
  })

  it('should not include ExpressionPlan content when not provided', () => {
    const prompt = WRITING_PROMPT(
      '测试主题',
      mockStrategy,
      mockSelectedAngle,
    )

    expect(prompt).not.toContain('表达蓝图')
    expect(prompt).not.toContain('思维路径')
  })
})

describe('Expression Planning — Prompt Construction', () => {
  it('should include topic and angle in the planning prompt', () => {
    const input: ExpressionPlanningInput = {
      topic: '测试主题',
      selectedAngle: mockSelectedAngle,
      strategy: {
        title: '测试策略',
        hook: '钩子',
        callToAction: '行动号召',
        tone: '口语',
        keyArguments: ['论点1'],
      },
    }

    const prompt = EXPRESSION_PLANNING_PROMPT(input)

    expect(prompt).toContain('测试主题')
    expect(prompt).toContain('测试角度')
    expect(prompt).toContain('测试策略')
    expect(prompt).toContain('行动号召')
  })
})

describe('Expression Audit — Prompt Construction', () => {
  it('should include ExpressionPlan in the audit prompt when provided', () => {
    const input: ExpressionAuditInput = {
      draft: '这是测试内容。',
      title: '测试标题',
      expressionPlan: VALID_EXPRESSION_PLAN,
      strategy: {
        title: '测试策略',
        keyArguments: ['论点1'],
        callToAction: '行动号召',
      },
    }

    const prompt = EXPRESSION_AUDIT_PROMPT(input)

    expect(prompt).toContain('测试内容')
    expect(prompt).toContain('表达蓝图')
    expect(prompt).toContain('observation')
    expect(prompt).toContain('禁止伪造作者真实经历')
  })

  it('should show "未提供 ExpressionPlan" when not provided', () => {
    const input: ExpressionAuditInput = {
      draft: '测试内容',
    }

    const prompt = EXPRESSION_AUDIT_PROMPT(input)

    expect(prompt).toContain('未提供 ExpressionPlan')
  })
})

describe('Expression Rewrite — Prompt Construction', () => {
  it('should include audit issues in the rewrite prompt', () => {
    const audit: ExpressionAudit = {
      version: '1.0',
      overallScore: 55,
      dimensions: {
        naturalness: 50,
        voiceConsistency: 60,
        specificity: 45,
        rhythm: 55,
        thoughtAuthenticity: 58,
        emotionalAuthenticity: 52,
      },
      issues: [
        {
          id: 'issue-1',
          type: 'formulaic',
          severity: 'high',
          location: { paragraphIndex: 0, quote: '首先' },
          diagnosis: '模板化开头',
          rewriteInstruction: '替换为场景开头',
        },
      ],
      pass: false,
    }

    const input: ExpressionRewriteInput = {
      draft: '测试内容',
      audit,
      expressionPlan: VALID_EXPRESSION_PLAN,
    }

    const prompt = EXPRESSION_REWRITE_PROMPT(input)

    expect(prompt).toContain('issue-1')
    expect(prompt).toContain('formulaic')
    expect(prompt).toContain('模板化开头')
    expect(prompt).toContain('替换为场景开头')
    expect(prompt).toContain('55')
  })
})
