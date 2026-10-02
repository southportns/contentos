/**
 * @file outcome-alert.ts
 * @brief P0.6.5.3 Outcome Alert Domain Model
 * @copyright Copyright 2026 ContentOS
 * @par License MIT License
 * 
 * @details Defines the core OutcomeAlert domain entity, status lifecycle constants,
 * and validation logic. Alerts are immutable action signals triggered by Outcome
 * evaluation against OutcomeAlertRule, supporting OCC concurrency control and
 * owner-based data isolation.
 * 
 * @see OutcomeAlertRule for rule definition
 * @see OutcomeAlertServiceImpl for alert lifecycle orchestration
 * @see PrismaOutcomeAlertStore for persistence implementation
 */

/**
 * @brief Alert lifecycle status values
 * @details Valid transitions:
 * - open → acknowledged, resolved, suppressed
 * - acknowledged → resolved, suppressed
 * - resolved/suppressed → terminal states
 */
export type OutcomeAlertStatus = 'open' | 'acknowledged' | 'resolved' | 'suppressed';

/**
 * @brief Immutable list of all valid OutcomeAlertStatus values
 * @details Used for runtime validation of status fields
 */
export const OUTCOME_ALERT_STATUSES: readonly OutcomeAlertStatus[] = [
  'open', 'acknowledged', 'resolved', 'suppressed',
] as const;

export type { OutcomeAlertMatchedCondition } from './outcome-alert-evaluator';

/**
 * @brief Core OutcomeAlert domain entity
 * @details Represents a single alert instance triggered by an Outcome.
 * - Supports OCC via version field
 * - Owner-based isolation for multi-tenant security
 * - Fingerprint-based deduplication (ruleId:outcomeId hash)
 * - Tracks metric conditions that triggered the alert
 */
export interface OutcomeAlert {
  /** @brief Unique alert identifier (UUIDv4) */
  id: string;
  /** @brief Reference to the OutcomeAlertRule that triggered this alert */
  ruleId: string;
  /** @brief Reference to the Outcome that matched the rule */
  outcomeId: string;
  /** @brief Owner identifier for data isolation (multi-tenant) */
  ownerId: string;
  /** @brief Optional project ID for scope filtering */
  projectId?: string | null;
  /** @brief Optional topic ID for scope filtering */
  topicId?: string | null;
  /** @brief Alert severity (inherited from rule or overridden) */
  severity: import('./outcome-alert-rule').OutcomeAlertSeverity;
  /** @brief Current status in alert lifecycle */
  status: OutcomeAlertStatus;
  /** @brief Short alert title for display */
  title: string;
  /** @brief Human-readable alert message (supports template rendering) */
  message: string;
  /** @brief List of metric conditions and their match results */
  matchedConditions?: import('./outcome-alert-evaluator').OutcomeAlertMatchedCondition[];
  /** @brief ISO 8601 timestamp when the alert was triggered */
  triggeredAt: string;
  /** @brief ISO 8601 timestamp when the alert was acknowledged, null if not acknowledged */
  acknowledgedAt?: string | null;
  /** @brief ISO 8601 timestamp when the alert was resolved, null if not resolved */
  resolvedAt?: string | null;
  /** @brief ISO 8601 timestamp when the alert was suppressed, null if not suppressed */
  suppressedAt?: string | null;
  /** @brief ISO 8601 timestamp of record creation */
  createdAt: string;
  /** @brief ISO 8601 timestamp of last update (for OCC) */
  updatedAt: string;
  /** @brief Version number for optimistic concurrency control */
  version: number;
  /** @brief Unique fingerprint for dedup (base64 of ruleId:outcomeId) */
  fingerprint: string;
}

/**
 * @brief Validates an OutcomeAlert object for persistence or update
 * @param alert - OutcomeAlert instance to validate
 * @throws {Error} If any required field is missing/invalid:
 * - id, ruleId, outcomeId, ownerId, title must be non-empty strings
 * - status must be a valid OutcomeAlertStatus value
 * - version must be a positive integer
 * - All timestamp fields must be valid ISO 8601 strings
 */
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