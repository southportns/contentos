/**
 * Schema Tests for Expression Engine
 *
 * Tests valid/invalid ExpressionPlan, ExpressionAudit, and ExpressionRewriteResult.
 * @see docs/P0.1_HUMAN_EXPRESSION_ENGINE_PROMPT.md §28.1
 */
import { describe, it, expect } from 'vitest'
import {
  expressionPlanSchema,
  expressionAuditSchema,
  expressionRewriteResultSchema,
  conclusionModeSchema,
  auditIssueTypeSchema,
  validateExpressionPlan,
  validateExpressionAudit,
  validateExpressionRewriteResult,
} from '@/lib/expression/schema'
import {
  VALID_EXPRESSION_PLAN,
  VALID_EXPRESSION_AUDIT,
  FAILING_EXPRESSION_AUDIT,
} from './fixtures'

describe('ConclusionMode Schema (P0.1.5)', () => {
  it('should accept all 8 conclusion modes', () => {
    const modes = [
      'reflection',
      'open_ended',
      'echo',
      'question',
      'direct_takeaway',
      'scene_return',
      'self_aware',
      'quiet_statement',
    ]
    for (const mode of modes) {
      const result = conclusionModeSchema.safeParse(mode)
      expect(result.success).toBe(true)
    }
  })

  it('should reject invalid conclusion mode', () => {
    const result = conclusionModeSchema.safeParse('summary')
    expect(result.success).toBe(false)
  })
})

describe('AuditIssueType Schema (P0.1.5)', () => {
  it('should accept conclusion_cliche type', () => {
    const result = auditIssueTypeSchema.safeParse('conclusion_cliche')
    expect(result.success).toBe(true)
  })

  it('should accept emotion_shift_excessive type', () => {
    const result = auditIssueTypeSchema.safeParse('emotion_shift_excessive')
    expect(result.success).toBe(true)
  })
})

describe('ExpressionPlan Schema', () => {
  it('should validate a valid ExpressionPlan', () => {
    const result = expressionPlanSchema.safeParse(VALID_EXPRESSION_PLAN)
    expect(result.success).toBe(true)
  })

  it('should reject an ExpressionPlan with missing required fields', () => {
    const invalid = { version: '1.0' }
    const result = expressionPlanSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('should reject an ExpressionPlan with invalid enum value', () => {
    const invalid = {
      ...VALID_EXPRESSION_PLAN,
      thoughtPath: [
        { step: 1, mode: 'invalid_mode', purpose: 'test' },
      ],
    }
    const result = expressionPlanSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('should reject an ExpressionPlan with out-of-range emotion intensity', () => {
    const invalid = {
      ...VALID_EXPRESSION_PLAN,
      emotionCurve: [
        { stage: '开头', emotion: 'calm', intensity: 150 },
      ],
    }
    const result = expressionPlanSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('should reject an ExpressionPlan with wrong version', () => {
    const invalid = { ...VALID_EXPRESSION_PLAN, version: '2.0' }
    const result = expressionPlanSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('should reject an ExpressionPlan with empty thoughtPath', () => {
    const invalid = { ...VALID_EXPRESSION_PLAN, thoughtPath: [] }
    const result = expressionPlanSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('should accept an ExpressionPlan with minimal speaker (all optional fields missing)', () => {
    const minimal = {
      ...VALID_EXPRESSION_PLAN,
      speaker: {},
    }
    const result = expressionPlanSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('validateExpressionPlan helper should return true for valid plan', () => {
    expect(validateExpressionPlan(VALID_EXPRESSION_PLAN)).toBe(true)
  })

  it('validateExpressionPlan helper should return false for invalid plan', () => {
    expect(validateExpressionPlan({ version: '1.0' })).toBe(false)
  })
})

describe('ExpressionAudit Schema', () => {
  it('should validate a passing ExpressionAudit', () => {
    const result = expressionAuditSchema.safeParse(VALID_EXPRESSION_AUDIT)
    expect(result.success).toBe(true)
  })

  it('should validate a failing ExpressionAudit', () => {
    const result = expressionAuditSchema.safeParse(FAILING_EXPRESSION_AUDIT)
    expect(result.success).toBe(true)
  })

  it('should reject an ExpressionAudit with invalid issue type', () => {
    const invalid = {
      ...VALID_EXPRESSION_AUDIT,
      issues: [
        {
          id: 'issue-1',
          type: 'invalid_type',
          severity: 'low',
          diagnosis: 'test',
          rewriteInstruction: 'test',
        },
      ],
    }
    const result = expressionAuditSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('should reject an ExpressionAudit with out-of-range scores', () => {
    const invalid = {
      ...VALID_EXPRESSION_AUDIT,
      overallScore: 150,
    }
    const result = expressionAuditSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('should reject an ExpressionAudit with invalid severity', () => {
    const invalid = {
      ...VALID_EXPRESSION_AUDIT,
      issues: [
        {
          id: 'issue-1',
          type: 'formulaic',
          severity: 'critical',
          diagnosis: 'test',
          rewriteInstruction: 'test',
        },
      ],
    }
    const result = expressionAuditSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('validateExpressionAudit helper should return true for valid audit', () => {
    expect(validateExpressionAudit(VALID_EXPRESSION_AUDIT)).toBe(true)
  })

  it('validateExpressionAudit helper should return false for invalid audit', () => {
    expect(validateExpressionAudit({ version: '1.0' })).toBe(false)
  })
})

describe('ExpressionRewriteResult Schema', () => {
  it('should validate a valid rewrite result', () => {
    const valid = {
      version: '1.0',
      revisedContent: '修改后的内容',
      changedSections: [
        {
          location: '第1段',
          issueId: 'issue-1',
          original: '原文',
          revised: '修改后',
          reason: '原因',
        },
      ],
      summary: '修正总结',
    }
    const result = expressionRewriteResultSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('should reject a rewrite result with empty revisedContent', () => {
    const invalid = {
      version: '1.0',
      revisedContent: '',
      changedSections: [],
      summary: 'test',
    }
    const result = expressionRewriteResultSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('validateExpressionRewriteResult helper should work', () => {
    const valid = {
      version: '1.0',
      revisedContent: '内容',
      changedSections: [
        {
          location: '第1段',
          issueId: 'issue-1',
          original: '原文',
          revised: '修改后',
          reason: '原因',
        },
      ],
      summary: '总结',
    }
    expect(validateExpressionRewriteResult(valid)).toBe(true)
    expect(validateExpressionRewriteResult({ version: '1.0' })).toBe(false)
  })
})
