/**
 * P0.6.5.3 — Outcome Alert Rule Model
 *
 * Defines alert rules that specify when an Outcome should trigger an Alert.
 */

import type { OutcomeType } from './outcome-memory';
import type { OutcomeTargetType } from './outcome-memory';

export type OutcomeAlertOperator =
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export const OUTCOME_ALERT_OPERATORS: readonly OutcomeAlertOperator[] = [
  'gt', 'gte', 'lt', 'lte', 'eq', 'neq',
] as const;

export type OutcomeAlertSeverity = 'info' | 'warning' | 'critical';

export const OUTCOME_ALERT_SEVERITIES: readonly OutcomeAlertSeverity[] = [
  'info', 'warning', 'critical',
] as const;

export interface OutcomeAlertMetricCondition {
  metricKey: string;
  operator: OutcomeAlertOperator;
  threshold: number;
}

export interface OutcomeAlertRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  severity: OutcomeAlertSeverity;
  outcomeTypes?: OutcomeType[];
  targetTypes?: OutcomeTargetType[];
  targetIds?: string[];
  metricConditions?: OutcomeAlertMetricCondition[];
  messageTemplate?: string;
}

export function validateAlertRule(rule: OutcomeAlertRule): void {
  if (!rule.id || typeof rule.id !== 'string' || rule.id.trim().length === 0) {
    throw new Error('OutcomeAlertRule.id must be a non-empty string');
  }
  if (!rule.name || typeof rule.name !== 'string' || rule.name.trim().length === 0) {
    throw new Error('OutcomeAlertRule.name must be a non-empty string');
  }
  if (!OUTCOME_ALERT_SEVERITIES.includes(rule.severity)) {
    throw new Error(
      `OutcomeAlertRule.severity must be one of: ${OUTCOME_ALERT_SEVERITIES.join(', ')}. Got: ${rule.severity}`
    );
  }
  if (rule.metricConditions !== undefined) {
    if (!Array.isArray(rule.metricConditions)) {
      throw new Error('OutcomeAlertRule.metricConditions must be an array');
    }
    for (let i = 0; i < rule.metricConditions.length; i++) {
      const cond = rule.metricConditions[i];
      if (!cond.metricKey || typeof cond.metricKey !== 'string' || cond.metricKey.trim().length === 0) {
        throw new Error(
          `OutcomeAlertRule.metricConditions[${i}].metricKey must be a non-empty string`
        );
      }
      if (!OUTCOME_ALERT_OPERATORS.includes(cond.operator)) {
        throw new Error(
          `OutcomeAlertRule.metricConditions[${i}].operator must be one of: ${OUTCOME_ALERT_OPERATORS.join(', ')}. Got: ${cond.operator}`
        );
      }
      if (typeof cond.threshold !== 'number' || !Number.isFinite(cond.threshold)) {
        throw new Error(
          `OutcomeAlertRule.metricConditions[${i}].threshold must be a finite number. Got: ${cond.threshold}`
        );
      }
    }
  }
  if (rule.outcomeTypes !== undefined) {
    if (!Array.isArray(rule.outcomeTypes)) {
      throw new Error('OutcomeAlertRule.outcomeTypes must be an array');
    }
  }
  if (rule.targetTypes !== undefined) {
    if (!Array.isArray(rule.targetTypes)) {
      throw new Error('OutcomeAlertRule.targetTypes must be an array');
    }
  }
  if (rule.targetIds !== undefined) {
    if (!Array.isArray(rule.targetIds)) {
      throw new Error('OutcomeAlertRule.targetIds must be an array');
    }
    for (let i = 0; i < rule.targetIds.length; i++) {
      if (typeof rule.targetIds[i] !== 'string' || rule.targetIds[i].trim().length === 0) {
        throw new Error(`OutcomeAlertRule.targetIds[${i}] must be a non-empty string`);
      }
    }
  }
}
