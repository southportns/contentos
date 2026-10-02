/**
 * P0.6.5.3 — Outcome Alert Evaluator Unit Tests
 *
 * Pure function tests — no database, no network, no LLM.
 */

import { describe, it, expect } from 'vitest';
import { evaluateOutcomeAgainstRule, evaluateOutcomeAgainstRules, evaluateCondition, renderAlertMessage } from '../outcome-alert-evaluator';
import { validateAlertRule } from '../outcome-alert-rule';
import { generateFingerprint } from '../outcome-alert-service';
import type { OutcomeAlertRule, OutcomeAlertOperator } from '../outcome-alert-rule';
import { createOutcomeMemory } from '../outcome-memory-factory';
import type { OutcomeMemory } from '../outcome-memory';

const OWNER = 'user-eval-owner';

function createTestOutcome(overrides?: Partial<Parameters<typeof createOutcomeMemory>[0]>): OutcomeMemory {
  return createOutcomeMemory({
    outcomeType: 'engagement', targetType: 'content', targetId: 'content-eval-001',
    observedAt: '2026-10-02T08:00:00Z', ownerId: OWNER,
    metrics: [{ key: 'engagement_rate', value: 0.018, unit: 'ratio' }, { key: 'views', value: 500, unit: 'count' }, { key: 'ctr', value: 0.05, unit: 'ratio' }],
    ...overrides,
  });
}

function createTestRule(overrides?: Partial<OutcomeAlertRule>): OutcomeAlertRule {
  return {
    id: 'rule-engagement-low', name: 'Low Engagement Rule', enabled: true, severity: 'warning',
    outcomeTypes: ['engagement'], targetTypes: ['content'], targetIds: [],
    metricConditions: [{ metricKey: 'engagement_rate', operator: 'lt', threshold: 0.03 }],
    ...overrides,
  };
}

describe('A: Rule Matching', () => {
  it('A1: rule matched — single metric condition', () => {
    const outcome = createTestOutcome();
    const rule = createTestRule();
    const result = evaluateOutcomeAgainstRule(outcome, rule);
    expect(result.matched).toBe(true);
    expect(result.ruleId).toBe('rule-engagement-low');
    expect(result.outcomeId).toBe(outcome.id);
    expect(result.matchedConditions).toHaveLength(1);
    expect(result.matchedConditions[0].matched).toBe(true);
    expect(result.matchedConditions[0].actualValue).toBe(0.018);
    expect(result.matchedConditions[0].threshold).toBe(0.03);
  });

  it('A2: disabled rule not matched', () => {
    const outcome = createTestOutcome();
    const rule = createTestRule({ enabled: false });
    const result = evaluateOutcomeAgainstRule(outcome, rule);
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('A3: outcomeType mismatch', () => {
    const outcome = createTestOutcome({ outcomeType: 'performance' });
    const rule = createTestRule();
    const result = evaluateOutcomeAgainstRule(outcome, rule);
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('outcomeType');
  });

  it('A4: targetType mismatch', () => {
    const outcome = createTestOutcome({ targetType: 'draft' });
    const rule = createTestRule();
    const result = evaluateOutcomeAgainstRule(outcome, rule);
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('targetType');
  });

  it('A5: targetId mismatch', () => {
    const outcome = createTestOutcome({ targetId: 'content-other' });
    const rule = createTestRule({ targetIds: ['content-eval-001'] });
    const result = evaluateOutcomeAgainstRule(outcome, rule);
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('targetId');
  });

  it('A6: gt/gte/lt/lte/eq/neq operators', () => {
    const baseRule = (operator: string): OutcomeAlertRule => createTestRule({ metricConditions: [{ metricKey: 'views', operator: operator as 'lt', threshold: 500 }] });
    expect(evaluateOutcomeAgainstRule(createTestOutcome(), baseRule('gt')).matched).toBe(false);
    expect(evaluateOutcomeAgainstRule(createTestOutcome(), baseRule('gte')).matched).toBe(true);
    expect(evaluateOutcomeAgainstRule(createTestOutcome(), baseRule('lt')).matched).toBe(false);
    expect(evaluateOutcomeAgainstRule(createTestOutcome(), baseRule('lte')).matched).toBe(true);
    expect(evaluateOutcomeAgainstRule(createTestOutcome(), baseRule('eq')).matched).toBe(true);
    expect(evaluateOutcomeAgainstRule(createTestOutcome(), baseRule('neq')).matched).toBe(false);
  });

  it('A7: missing metric — not matched', () => {
    const outcome = createTestOutcome({ metrics: [{ key: 'views', value: 500 }] });
    const rule = createTestRule();
    const result = evaluateOutcomeAgainstRule(outcome, rule);
    expect(result.matched).toBe(false);
    expect(result.matchedConditions[0].actualValue).toBeUndefined();
    expect(result.matchedConditions[0].matched).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('A8: multiple conditions AND', () => {
    const outcome = createTestOutcome({ metrics: [{ key: 'engagement_rate', value: 0.018 }, { key: 'views', value: 500 }] });
    const ruleAllMatch = createTestRule({ metricConditions: [{ metricKey: 'engagement_rate', operator: 'lt', threshold: 0.03 }, { metricKey: 'views', operator: 'gt', threshold: 100 }] });
    expect(evaluateOutcomeAgainstRule(outcome, ruleAllMatch).matched).toBe(true);
    const ruleOneFail = createTestRule({ metricConditions: [{ metricKey: 'engagement_rate', operator: 'lt', threshold: 0.03 }, { metricKey: 'views', operator: 'lt', threshold: 100 }] });
    expect(evaluateOutcomeAgainstRule(outcome, ruleOneFail).matched).toBe(false);
  });

  it('A9: multiple rules — some match, some don\'t', () => {
    const outcome = createTestOutcome();
    const rules: OutcomeAlertRule[] = [
      createTestRule({ id: 'match-rule' }),
      createTestRule({ id: 'disabled-rule', enabled: false }),
      createTestRule({ id: 'wrong-type', outcomeTypes: ['performance'] }),
    ];
    const results = evaluateOutcomeAgainstRules(outcome, rules);
    expect(results).toHaveLength(3);
    expect(results[0].matched).toBe(true);
    expect(results[1].matched).toBe(false);
    expect(results[2].matched).toBe(false);
  });

  it('A10: filter-only rule (no metric conditions)', () => {
    const outcome = createTestOutcome();
    const rule = createTestRule({ metricConditions: [] });
    const result = evaluateOutcomeAgainstRule(outcome, rule);
    expect(result.matched).toBe(true);
    expect(result.reason).toContain('filter-only');
  });
});

describe('B: Metric Operators', () => {
  it('B1: gt', () => { expect(evaluateCondition(0.05, 'gt', 0.03)).toBe(true); expect(evaluateCondition(0.03, 'gt', 0.03)).toBe(false); });
  it('B2: gte', () => { expect(evaluateCondition(0.03, 'gte', 0.03)).toBe(true); expect(evaluateCondition(0.01, 'gte', 0.03)).toBe(false); });
  it('B3: lt', () => { expect(evaluateCondition(0.01, 'lt', 0.03)).toBe(true); expect(evaluateCondition(0.05, 'lt', 0.03)).toBe(false); });
  it('B4: lte', () => { expect(evaluateCondition(0.03, 'lte', 0.03)).toBe(true); expect(evaluateCondition(0.05, 'lte', 0.03)).toBe(false); });
  it('B5: eq', () => { expect(evaluateCondition(0.03, 'eq', 0.03)).toBe(true); expect(evaluateCondition(0.04, 'eq', 0.03)).toBe(false); });
  it('B6: neq', () => { expect(evaluateCondition(100, 'neq', 200)).toBe(true); expect(evaluateCondition(200, 'neq', 200)).toBe(false); });
});

describe('C: Operator Boundary Cases', () => {
  it('C1: gt — actual === threshold → NOT matched', () => { expect(evaluateCondition(5, 'gt', 5)).toBe(false); });
  it('C2: gte — actual === threshold → matched', () => { expect(evaluateCondition(5, 'gte', 5)).toBe(true); });
  it('C3: lt — actual === threshold → NOT matched', () => { expect(evaluateCondition(5, 'lt', 5)).toBe(false); });
  it('C4: lte — actual === threshold → matched', () => { expect(evaluateCondition(5, 'lte', 5)).toBe(true); });
  it('C5: eq — actual !== threshold → NOT matched', () => { expect(evaluateCondition(5.001, 'eq', 5)).toBe(false); });
  it('C6: neq — actual === threshold → NOT matched', () => { expect(evaluateCondition(5, 'neq', 5)).toBe(false); });
});

describe('D: Rule Validation', () => {
  it('D1: empty id rejected', () => { expect(() => validateAlertRule(createTestRule({ id: '' }))).toThrow('id'); });
  it('D2: empty name rejected', () => { expect(() => validateAlertRule(createTestRule({ name: '' }))).toThrow('name'); });
  it('D3: invalid operator rejected', () => { expect(() => validateAlertRule(createTestRule({ metricConditions: [{ metricKey: 'views', operator: 'invalid' as OutcomeAlertOperator, threshold: 100 }] }))).toThrow('operator'); });
  it('D4: NaN threshold rejected', () => { expect(() => validateAlertRule(createTestRule({ metricConditions: [{ metricKey: 'views', operator: 'gt', threshold: NaN }] }))).toThrow('finite'); });
  it('D5: Infinity threshold rejected', () => {
    expect(() => validateAlertRule(createTestRule({ metricConditions: [{ metricKey: 'views', operator: 'gt', threshold: Infinity }] }))).toThrow('finite');
    expect(() => validateAlertRule(createTestRule({ metricConditions: [{ metricKey: 'views', operator: 'lt', threshold: -Infinity }] }))).toThrow('finite');
  });
});

describe('E: Utility Functions', () => {
  it('E1: fingerprint deterministic', () => {
    const fp1 = generateFingerprint('rule-1', 'outcome-1');
    const fp2 = generateFingerprint('rule-1', 'outcome-1');
    const fp3 = generateFingerprint('rule-1', 'outcome-2');
    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });

  it('E2: renderAlertMessage default format', () => {
    const msg = renderAlertMessage('rule-test', { metricKey: 'engagement_rate', actualValue: 0.018, operator: 'lt', threshold: 0.03, matched: true });
    expect(msg).toContain('engagement_rate');
    expect(msg).toContain('0.018');
    expect(msg).toContain('0.03');
  });

  it('E3: evaluateOutcomeAgainstRules empty rules', () => {
    const outcome = createTestOutcome();
    expect(evaluateOutcomeAgainstRules(outcome, [])).toEqual([]);
  });
});
