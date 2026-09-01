/**
 * Expression Audit — Scoring Logic Tests
 *
 * Tests the internal scoring logic (overallScore calculation,
 * pass/fail determination) without calling LLMs.
 * @see docs/P0.1_HUMAN_EXPRESSION_ENGINE_PROMPT.md §28.4
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_EXPRESSION_WEIGHTS,
  EXPRESSION_AUDIT_PASS_THRESHOLD,
  MAX_EXPRESSION_REWRITE_ROUNDS,
} from '@/lib/expression/types'

describe('Expression Weights Configuration', () => {
  it('should have weights that sum to 1.0', () => {
    const sum =
      DEFAULT_EXPRESSION_WEIGHTS.naturalness +
      DEFAULT_EXPRESSION_WEIGHTS.voiceConsistency +
      DEFAULT_EXPRESSION_WEIGHTS.specificity +
      DEFAULT_EXPRESSION_WEIGHTS.rhythm +
      DEFAULT_EXPRESSION_WEIGHTS.thoughtAuthenticity +
      DEFAULT_EXPRESSION_WEIGHTS.emotionalAuthenticity

    expect(sum).toBeCloseTo(1.0, 2)
  })

  it('should weight naturalness highest', () => {
    expect(DEFAULT_EXPRESSION_WEIGHTS.naturalness).toBeGreaterThan(
      DEFAULT_EXPRESSION_WEIGHTS.voiceConsistency,
    )
  })
})

describe('Audit Pass Threshold', () => {
  it('should be set to 70', () => {
    expect(EXPRESSION_AUDIT_PASS_THRESHOLD).toBe(70)
  })
})

describe('Max Rewrite Rounds', () => {
  it('should be 1 for P0.1', () => {
    expect(MAX_EXPRESSION_REWRITE_ROUNDS).toBe(1)
  })
})

describe('Audit Pass Logic', () => {
  // Replicating the pass logic from expression-audit/index.ts
  function hasHighSeverityIssues(issues: Array<{ severity: string }>): boolean {
    return issues.some((i) => i.severity === 'high')
  }

  function determinePass(
    overallScore: number,
    issues: Array<{ severity: string }>,
  ): boolean {
    if (hasHighSeverityIssues(issues)) return false
    return overallScore >= EXPRESSION_AUDIT_PASS_THRESHOLD
  }

  it('should pass when score >= 70 and no high severity issues', () => {
    const pass = determinePass(75, [
      { severity: 'low' },
      { severity: 'medium' },
    ])
    expect(pass).toBe(true)
  })

  it('should fail when score < 70', () => {
    const pass = determinePass(65, [{ severity: 'low' }])
    expect(pass).toBe(false)
  })

  it('should fail when high severity issues exist, even if score is high', () => {
    const pass = determinePass(90, [{ severity: 'high' }])
    expect(pass).toBe(false)
  })

  it('should pass when score >= 70 and no issues', () => {
    const pass = determinePass(85, [])
    expect(pass).toBe(true)
  })

  it('should pass at exact threshold of 70', () => {
    const pass = determinePass(70, [])
    expect(pass).toBe(true)
  })

  it('should fail just below threshold at 69', () => {
    const pass = determinePass(69, [])
    expect(pass).toBe(false)
  })
})
