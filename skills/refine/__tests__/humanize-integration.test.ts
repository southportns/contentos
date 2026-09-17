/**
 * P0.3.9.3 Hardening — Humanize Prompt Integration Tests
 *
 * Verifies that REFINE_HUMANIZE_PROMPT correctly includes
 * Strategy, Evaluation, and Risk context blocks when provided.
 */
import { describe, it, expect } from 'vitest'
import { REFINE_HUMANIZE_PROMPT } from '../prompts'
import type { RefineApprovedStrategyContext, RefineEvaluationContext, RefineRiskContext } from '../schema'

describe('REFINE_HUMANIZE_PROMPT — Context Propagation', () => {
  const baseParams = {
    content: '测试内容：短视频口播稿示例文本。',
    title: '测试标题',
    hook: '这是钩子',
    platform: '抖音',
    persona: '专业博主',
    topic: '健康饮食',
    selectedAngleTitle: '轻食搭配',
  }

  it('includes strategy block when approvedStrategy is provided', () => {
    const strategy: RefineApprovedStrategyContext = {
      title: '健康饮食轻食指南',
      keyArguments: ['轻食不等于节食', '营养均衡最重要'],
      emotionalArc: { start: '好奇', middle: '认同', end: '行动' },
      callToAction: '立即收藏这份食谱',
      tone: '亲切专业',
    }
    const prompt = REFINE_HUMANIZE_PROMPT({ ...baseParams, approvedStrategy: strategy })

    expect(prompt).toContain('已审批策略')
    expect(prompt).toContain('轻食不等于节食')
    expect(prompt).toContain('营养均衡最重要')
    expect(prompt).toContain('好奇')
    expect(prompt).toContain('行动')
    expect(prompt).toContain('立即收藏这份食谱')
    expect(prompt).toContain('亲切专业')
  })

  it('includes evaluation block when evaluationContext is provided', () => {
    const evalContext: RefineEvaluationContext = {
      suggestions: [
        { id: 'ev1', section: '开头', issue: '缺乏钩子', suggestion: '加入悬念', priority: 'high' },
        { id: 'ev2', section: '结尾', issue: '行动号召弱', suggestion: '加强语气', priority: 'medium' },
      ],
      weaknesses: ['结构松散', '信息密度低'],
    }
    const prompt = REFINE_HUMANIZE_PROMPT({ ...baseParams, evaluationContext: evalContext })

    expect(prompt).toContain('已修复问题')
    expect(prompt).toContain('缺乏钩子')
    expect(prompt).toContain('行动号召弱')
    expect(prompt).toContain('结构松散')
    expect(prompt).toContain('信息密度低')
    expect(prompt).toContain('不得重新引入')
  })

  it('includes risk block when riskContext is provided', () => {
    const riskCtx: RefineRiskContext = {
      overallRiskLevel: 'medium',
      risks: [
        { id: 'r1', category: '健康声明', description: '夸大功效', severity: 'high' },
        { id: 'r2', category: '版权', description: '引用未注明出处', severity: 'medium' },
      ],
    }
    const prompt = REFINE_HUMANIZE_PROMPT({ ...baseParams, riskContext: riskCtx })

    expect(prompt).toContain('已知风险')
    expect(prompt).toContain('健康声明')
    expect(prompt).toContain('夸大功效')
    expect(prompt).toContain('版权')
    expect(prompt).toContain('总体风险等级：medium')
    expect(prompt).toContain('不得放大或新增')
  })

  it('omits strategy/eval/risk blocks when not provided', () => {
    const prompt = REFINE_HUMANIZE_PROMPT(baseParams)

    expect(prompt).not.toContain('已审批策略')
    expect(prompt).not.toContain('已修复问题')
    expect(prompt).not.toContain('已知风险')
    // But the "严格禁止" rules section should still exist as general guardrails
    expect(prompt).toContain('去 AI 味执行规则')
    expect(prompt).toContain('严格禁止')
  })

  it('includes all three blocks simultaneously when all contexts provided', () => {
    const strategy: RefineApprovedStrategyContext = {
      keyArguments: ['论点A'],
      tone: '温暖',
    }
    const evalContext: RefineEvaluationContext = {
      suggestions: [{ section: '结构', issue: '段落过长', suggestion: '拆分', priority: 'low' }],
      weaknesses: ['节奏慢'],
    }
    const riskCtx: RefineRiskContext = {
      overallRiskLevel: 'low',
      risks: [{ category: '敏感话题', severity: 'high' }],
    }
    const prompt = REFINE_HUMANIZE_PROMPT({
      ...baseParams,
      approvedStrategy: strategy,
      evaluationContext: evalContext,
      riskContext: riskCtx,
    })

    // All three blocks must be present
    expect(prompt).toContain('已审批策略')
    expect(prompt).toContain('论点A')
    expect(prompt).toContain('已修复问题')
    expect(prompt).toContain('段落过长')
    expect(prompt).toContain('已知风险')
    expect(prompt).toContain('敏感话题')
  })

  it('includes strict prohibition rules referencing all context types', () => {
    const prompt = REFINE_HUMANIZE_PROMPT(baseParams)

    // The prohibition section should reference all three context types
    expect(prompt).toContain('策略审批要素')
    expect(prompt).toContain('已修复的问题段落')
    expect(prompt).toContain('Risk Analysis')
  })

  it('passes topic and selectedAngleTitle into prompt header', () => {
    const prompt = REFINE_HUMANIZE_PROMPT(baseParams)

    expect(prompt).toContain('健康饮食')
    expect(prompt).toContain('轻食搭配')
    expect(prompt).toContain('抖音')
    expect(prompt).toContain('专业博主')
  })
})
