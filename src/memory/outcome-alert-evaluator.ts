/**
 * P0.6.5.3 — Outcome Alert Evaluator
 *
 * Pure function that evaluates OutcomeMemory against OutcomeAlertRule.
 */

import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeAlertRule } from './outcome-alert-rule';

export interface OutcomeAlertMatchedCondition {
  metricKey: string;
  actualValue?: number;
  operator: import('./outcome-alert-rule').OutcomeAlertOperator;
  threshold: number;
  matched: boolean;
}

export interface OutcomeAlertEvaluation {
  matched: boolean;
  ruleId: string;
  outcomeId: string;
  matchedConditions: OutcomeAlertMatchedCondition[];
  reason?: string;
}

export function evaluateOutcomeAgainstRule(
  outcome: OutcomeMemory,
  rule: OutcomeAlertRule,
): OutcomeAlertEvaluation {
  if (!rule.enabled) {
    return {
      matched: false,
      ruleId: rule.id,
      outcomeId: outcome.id,
      matchedConditions: [],
      reason: `rule "${rule.id}" is disabled`,
    };
  }

  if (rule.outcomeTypes && rule.outcomeTypes.length > 0) {
    if (!outcome.payload || !rule.outcomeTypes.includes(outcome.payload.outcomeType)) {
      return {
        matched: false,
        ruleId: rule.id,
        outcomeId: outcome.id,
        matchedConditions: [],
        reason: `outcomeType "${outcome.payload?.outcomeType}" not in rule outcomeTypes [${rule.outcomeTypes.join(', ')}]`,
      };
    }
  }

  if (rule.targetTypes && rule.targetTypes.length > 0) {
    if (!outcome.payload || !rule.targetTypes.includes(outcome.payload.targetType)) {
      return {
        matched: false,
        ruleId: rule.id,
        outcomeId: outcome.id,
        matchedConditions: [],
        reason: `targetType "${outcome.payload?.targetType}" not in rule targetTypes [${rule.targetTypes.join(', ')}]`,
      };
    }
  }

  if (rule.targetIds && rule.targetIds.length > 0) {
    if (!outcome.payload || !rule.targetIds.includes(outcome.payload.targetId)) {
      return {
        matched: false,
        ruleId: rule.id,
        outcomeId: outcome.id,
        matchedConditions: [],
        reason: `targetId "${outcome.payload?.targetId}" not in rule targetIds [${rule.targetIds.join(', ')}]`,
      };
    }
  }

  const matchedConditions: OutcomeAlertMatchedCondition[] = [];

  if (rule.metricConditions && rule.metricConditions.length > 0) {
    const metrics = outcome.payload?.metrics ?? [];

    for (const condition of rule.metricConditions) {
      const metric = metrics.find(m => m.key === condition.metricKey);

      if (!metric) {
        matchedConditions.push({
          metricKey: condition.metricKey,
          actualValue: undefined,
          operator: condition.operator,
          threshold: condition.threshold,
          matched: false,
        });
        return {
          matched: false,
          ruleId: rule.id,
          outcomeId: outcome.id,
          matchedConditions,
          reason: `metric "${condition.metricKey}" not found in outcome`,
        };
      }

      const actualValue = metric.value;
      const matched = evaluateCondition(actualValue, condition.operator, condition.threshold);

      matchedConditions.push({
        metricKey: condition.metricKey,
        actualValue,
        operator: condition.operator,
        threshold: condition.threshold,
        matched,
      });

      if (!matched) {
        return {
          matched: false,
          ruleId: rule.id,
          outcomeId: outcome.id,
          matchedConditions,
          reason: metricKeyMessage(condition.metricKey, actualValue, condition.operator, condition.threshold),
        };
      }
    }
  }

  return {
    matched: true,
    ruleId: rule.id,
    outcomeId: outcome.id,
    matchedConditions,
    reason: rule.metricConditions && rule.metricConditions.length > 0
      ? `all ${rule.metricConditions.length} metric condition(s) matched`
      : 'filter-only match (no metric conditions)',
  };
}

export function evaluateOutcomeAgainstRules(
  outcome: OutcomeMemory,
  rules: OutcomeAlertRule[],
): OutcomeAlertEvaluation[] {
  return rules.map(rule => evaluateOutcomeAgainstRule(outcome, rule));
}

export function evaluateCondition(
  actualValue: number,
  operator: import('./outcome-alert-rule').OutcomeAlertOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case 'gt': return actualValue > threshold;
    case 'gte': return actualValue >= threshold;
    case 'lt': return actualValue < threshold;
    case 'lte': return actualValue <= threshold;
    case 'eq': return actualValue === threshold;
    case 'neq': return actualValue !== threshold;
    default: return false;
  }
}

function metricKeyMessage(
  metricKey: string,
  actualValue: number,
  operator: import('./outcome-alert-rule').OutcomeAlertOperator,
  threshold: number,
): string {
  const opLabel = operatorLabel(operator);
  return `${metricKey} ${opLabel} ${threshold} — actual: ${actualValue}`;
}

function operatorLabel(operator: import('./outcome-alert-rule').OutcomeAlertOperator): string {
  switch (operator) {
    case 'gt': return '>';
    case 'gte': return '≥';
    case 'lt': return '<';
    case 'lte': return '≤';
    case 'eq': return '===';
    case 'neq': return '!==';
    default: return operator;
  }
}

export function renderAlertMessage(
  ruleId: string,
  firstCondition: OutcomeAlertMatchedCondition | undefined,
  template?: string,
): string {
  if (template && firstCondition) {
    return template
      .replace('{metricKey}', firstCondition.metricKey)
      .replace('{actualValue}', String(firstCondition.actualValue ?? 'N/A'))
      .replace('{threshold}', String(firstCondition.threshold))
      .replace('{operator}', operatorLabel(firstCondition.operator));
  }

  if (firstCondition) {
    const opLabel = operatorLabel(firstCondition.operator);
    const actual = firstCondition.actualValue !== undefined
      ? String(firstCondition.actualValue)
      : 'N/A';
    return `${firstCondition.metricKey}=${actual} ${opLabel} ${firstCondition.threshold}`;
  }

  return `rule "${ruleId}" matched`;
}
