/**
 * P0.6.5.3 — Outcome Alert Domain Model
 *
 * An Alert represents a mutable action signal triggered by an Outcome.
 */

export type OutcomeAlertStatus = 'open' | 'acknowledged' | 'resolved' | 'suppressed';

export const OUTCOME_ALERT_STATUSES: readonly OutcomeAlertStatus[] = [
  'open', 'acknowledged', 'resolved', 'suppressed',
] as const;

export type { OutcomeAlertMatchedCondition } from './outcome-alert-evaluator';

export interface OutcomeAlert {
  id: string;
  ruleId: string;
  outcomeId: string;
  ownerId: string;
  projectId?: string | null;
  topicId?: string | null;
  severity: import('./outcome-alert-rule').OutcomeAlertSeverity;
  status: OutcomeAlertStatus;
  title: string;
  message: string;
  matchedConditions?: import('./outcome-alert-evaluator').OutcomeAlertMatchedCondition[];
  triggeredAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  suppressedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  fingerprint: string;
}

export function validateOutcomeAlert(alert: OutcomeAlert): void {
  if (!alert.id || typeof alert.id !== 'string') {
    throw new Error('OutcomeAlert.id must be a non-empty string');
  }
  if (!alert.ruleId || typeof alert.ruleId !== 'string') {
    throw new Error('OutcomeAlert.ruleId must be a non-empty string');
  }
  if (!alert.outcomeId || typeof alert.outcomeId !== 'string') {
    throw new Error('OutcomeAlert.outcomeId must be a non-empty string');
  }
  if (!alert.ownerId || typeof alert.ownerId !== 'string') {
    throw new Error('OutcomeAlert.ownerId must be a non-empty string');
  }
  if (!OUTCOME_ALERT_STATUSES.includes(alert.status)) {
    throw new Error(`OutcomeAlert.status must be one of: ${OUTCOME_ALERT_STATUSES.join(', ')}. Got: ${alert.status}`);
  }
  if (!alert.title || typeof alert.title !== 'string') {
    throw new Error('OutcomeAlert.title must be a non-empty string');
  }
  if (typeof alert.version !== 'number' || alert.version < 1 || !Number.isInteger(alert.version)) {
    throw new Error(`OutcomeAlert.version must be a positive integer. Got: ${alert.version}`);
  }
  if (!isValidISODate(alert.triggeredAt)) {
    throw new Error(`OutcomeAlert.triggeredAt must be a valid ISO 8601 string. Got: ${alert.triggeredAt}`);
  }
  if (!isValidISODate(alert.createdAt)) {
    throw new Error(`OutcomeAlert.createdAt must be a valid ISO 8601 string. Got: ${alert.createdAt}`);
  }
  if (!isValidISODate(alert.updatedAt)) {
    throw new Error(`OutcomeAlert.updatedAt must be a valid ISO 8601 string. Got: ${alert.updatedAt}`);
  }
  if (alert.acknowledgedAt !== undefined && alert.acknowledgedAt !== null && !isValidISODate(alert.acknowledgedAt)) {
    throw new Error(`OutcomeAlert.acknowledgedAt must be a valid ISO 8601 string or null. Got: ${alert.acknowledgedAt}`);
  }
  if (alert.resolvedAt !== undefined && alert.resolvedAt !== null && !isValidISODate(alert.resolvedAt)) {
    throw new Error(`OutcomeAlert.resolvedAt must be a valid ISO 8601 string or null. Got: ${alert.resolvedAt}`);
  }
  if (alert.suppressedAt !== undefined && alert.suppressedAt !== null && !isValidISODate(alert.suppressedAt)) {
    throw new Error(`OutcomeAlert.suppressedAt must be a valid ISO 8601 string or null. Got: ${alert.suppressedAt}`);
  }
}

function isValidISODate(value: string): boolean {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString() === value;
}
