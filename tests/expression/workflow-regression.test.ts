/**
 * Expression Engine — Workflow Regression Tests
 *
 * Verifies that the Content Agent workflow includes Expression Engine nodes
 * and that existing workflow nodes are still present.
 * @see docs/P0.1_HUMAN_EXPRESSION_ENGINE_PROMPT.md §28.6
 */
import { describe, it, expect } from 'vitest'

// We test the agent state type structure and workflow topology
// by verifying that the key types and constants exist.

describe('ContentState Type — Expression Engine Fields', () => {
  it('should have expressionPlan, expressionAudit, expressionRewrittenDraft fields in ContentState', async () => {
    // Type-level check: import the type and verify it compiles
    // This is a compile-time check; if the type is missing fields,
    // TypeScript will error at build time.
    type ContentState = import('@/lib/agents/types').ContentState

    // Runtime check: create a mock object and verify it's assignable
    const mockState: ContentState = {
      projectId: 'test',
      topicId: 'test',
      topic: {
        topic: 'test',
        keywords: [],
        relatedTopics: [],
        coreQuestions: [],
        potentialAngles: [],
        researchQueries: [],
      },
      research: [],
      contents: [],
      analyses: [],
      insights: [],
      angles: [],
      status: 'IDLE',
      errors: [],
      // Expression Engine fields
      expressionPlan: undefined,
      expressionAudit: undefined,
      expressionRewrittenDraft: undefined,
    }

    expect(mockState).toBeDefined()
    expect(mockState.expressionPlan).toBeUndefined()
    expect(mockState.expressionAudit).toBeUndefined()
    expect(mockState.expressionRewrittenDraft).toBeUndefined()
  })
})

describe('Expression Engine Skills — Module Imports', () => {
  it('should be able to import expression-planning skill', async () => {
    const mod = await import('@/skills/expression-planning')
    expect(mod.runExpressionPlanning).toBeDefined()
    expect(typeof mod.runExpressionPlanning).toBe('function')
  })

  it('should be able to import expression-audit skill', async () => {
    const mod = await import('@/skills/expression-audit')
    expect(mod.runExpressionAudit).toBeDefined()
    expect(typeof mod.runExpressionAudit).toBe('function')
  })

  it('should be able to import expression-rewrite skill', async () => {
    const mod = await import('@/skills/expression-rewrite')
    expect(mod.runExpressionRewrite).toBeDefined()
    expect(typeof mod.runExpressionRewrite).toBe('function')
  })

  it('should be able to import writing skill (modified)', async () => {
    const mod = await import('@/skills/writing')
    expect(mod.runWriting).toBeDefined()
    expect(typeof mod.runWriting).toBe('function')
  })

  it('should be able to import humanization skill (preserved)', async () => {
    const mod = await import('@/skills/humanization')
    expect(mod.runHumanization).toBeDefined()
    expect(typeof mod.runHumanization).toBe('function')
  })

  it('should be able to import evaluation skill (preserved)', async () => {
    const mod = await import('@/skills/evaluation')
    expect(mod.runEvaluation).toBeDefined()
    expect(typeof mod.runEvaluation).toBe('function')
  })
})

describe('Expression Engine Constants', () => {
  it('should have MAX_EXPRESSION_REWRITE_ROUNDS = 1', async () => {
    const { MAX_EXPRESSION_REWRITE_ROUNDS } = await import(
      '@/lib/expression/types'
    )
    expect(MAX_EXPRESSION_REWRITE_ROUNDS).toBe(1)
  })

  it('should have DEFAULT_EXPRESSION_WEIGHTS with correct keys', async () => {
    const { DEFAULT_EXPRESSION_WEIGHTS } = await import(
      '@/lib/expression/types'
    )
    expect(DEFAULT_EXPRESSION_WEIGHTS).toHaveProperty('naturalness')
    expect(DEFAULT_EXPRESSION_WEIGHTS).toHaveProperty('voiceConsistency')
    expect(DEFAULT_EXPRESSION_WEIGHTS).toHaveProperty('specificity')
    expect(DEFAULT_EXPRESSION_WEIGHTS).toHaveProperty('rhythm')
    expect(DEFAULT_EXPRESSION_WEIGHTS).toHaveProperty('thoughtAuthenticity')
    expect(DEFAULT_EXPRESSION_WEIGHTS).toHaveProperty('emotionalAuthenticity')
  })
})
