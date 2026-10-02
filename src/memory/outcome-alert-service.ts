/*
 * @file outcome-alert-service.ts
 * @brief P0.6.5.3 Outcome Alert Service
 * @copyright Copyright 2026 ContentOS
 * @par License MIT License
 * 
 * @details Orchestrates the complete Outcome Alert lifecycle:
 * - Outcome evaluation against rules (with upfront rule validation)
 * - Alert deduplication via fingerprint
 * - Alert persistence (create/update)
 * - Alert lifecycle state transitions (acknowledge/resolve/suppress)
 * - Owner-based authorization for all operations
 * 
 * @see OutcomeAlert for alert instance structure
 * @see OutcomeAlertRule for rule definition
 * @see OutcomeAlertStore for persistence contract
 * @see OutcomeAlertEvaluateResult for evaluation response structure
 */

import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeAlertRule } from './outcome-alert-rule';
import type { OutcomeAlert, OutcomeAlertStatus } from './outcome-alert';
import type { OutcomeAlertMatchedCondition, OutcomeAlertEvaluation } from './outcome-alert-evaluator';
import { renderAlertMessage, evaluateOutcomeAgainstRules } from './outcome-alert-evaluator';
import type { OutcomeAlertStore } from './persistence/outcome-alert-store';
import { MemoryConcurrencyError } from './persistence/memory-persistence-types';
import { validateAlertRule } from './outcome-alert-rule';

/**
 * @brief Error thrown when an invalid alert status transition is attempted
 * @details Example: trying to transition an alert from resolved → suppressed
 */
export class OutcomeAlertTransitionError extends Error {
  constructor(
    /** @brief ID of the alert with invalid transition */
    public readonly alertId: string,
    /** @brief Current status of the alert */
    public readonly fromStatus: string,
    /** @brief Attempted target status */
    public readonly toStatus: string,
  ) {
    super(`cannot transition alert from \"\${fromStatus}\" to \"\${toStatus}\" — id=\${alertId}`);
    this.name = 'OutcomeAlertTransitionError';
  }
}

/**
 * @brief Error thrown when an authenticated user does not own the target Outcome
 * @details Security measure for owner-isolated data access
 */
export class OutcomeAlertOwnerError extends Error {
  constructor(
    /** @brief ID of the Outcome with ownership mismatch */
    outcomeId: string
  ) {
    super(`outcome ownerId mismatch — outcome \"\${outcomeId}\" does not belong to the authenticated user`);
    this.name = 'OutcomeAlertOwnerError';
  }
}

/**
 * @brief Result of evaluating a single rule against a single Outcome
 * @details Contains rule ID, outcome ID, action taken, and optional alert/error details
 */
export interface OutcomeAlertEvaluateItem {
  /** @brief ID of the rule that was evaluated */
  ruleId: string;
  /** @brief ID of the Outcome that was evaluated */
  outcomeId: string;
  /** @brief Action taken for this rule */
  action: 'newlyCreated' | 'alreadyExists' | 'notMatched' | 'failed';
  /** @brief Alert object (present if action is newlyCreated or alreadyExists) */
  alert?: OutcomeAlert;
  /** @brief Error message (present if action is failed) */
  error?: string;
}

/**
 * @brief Result of evaluating a single Outcome against multiple rules
 * @details Contains outcome ID and array of per-rule evaluation results
 */
export interface OutcomeAlertEvaluateResult {
  /** @brief ID of the evaluated Outcome */
  outcomeId: string;
  /** @brief Array of per-rule evaluation results */
  results: OutcomeAlertEvaluateItem[];
}

/**
 * @brief Result of evaluating multiple Outcomes against multiple rules (batch operation)
 * @details Contains aggregate statistics and per-outcome evaluation results
 */
export interface OutcomeAlertBatchResult {
  /** @brief Total number of Outcomes evaluated */
  totalOutcomes: number;
  /** @brief Total number of rules evaluated per Outcome */
  totalRules: number;
  /** @brief Total number of rules that matched any Outcome */
  matched: number;
  /** @brief Total number of new alerts created */
  created: number;
  /** @brief Total number of duplicate alerts skipped */
  existing: number;
  /** @brief Total number of evaluation failures */
  failed: number;
  /** @brief Per-outcome evaluation results */
  results: OutcomeAlertEvaluateResult[];
}

/**
 * @brief Result of a successful alert lifecycle state transition
 * @details Contains updated alert and previous status for audit purposes
 */
export interface OutcomeAlertLifecycleResult {
  /** @brief Updated alert after transition */
  alert: OutcomeAlert;
  /** @brief Status before transition (for logging/audit) */
  previousStatus: OutcomeAlertStatus;
}

const VALID_TRANSITIONS: Record<OutcomeAlertStatus, OutcomeAlertStatus[]> = {
  open: ['acknowledged', 'resolved', 'suppressed'],
  acknowledged: ['resolved', 'suppressed'],
  resolved: [],
  suppressed: [],
};

/**
 * @brief OutcomeAlertService interface (contract for DI/ mocking)
 * @details Defines all operations for alert lifecycle management
 */
export interface OutcomeAlertService {
  evaluateOutcome(outcome: OutcomeMemory, rules: OutcomeAlertRule[], authenticatedOwnerId: string): Promise<OutcomeAlertEvaluateResult>;
  evaluateOutcomes(outcomes: OutcomeMemory[], rules: OutcomeAlertRule[], authenticatedOwnerId: string): Promise<OutcomeAlertBatchResult>;
  acknowledgeAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult>;
  resolveAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult>;
  suppressAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult>;
}

/**
 * @brief Default implementation of OutcomeAlertService
 * @details Stateless, thread-safe (assuming store implementation is thread-safe).
 * Constructor accepts any OutcomeAlertStore implementation (supports DI).
 */
export class OutcomeAlertServiceImpl implements OutcomeAlertService {
  private _store: OutcomeAlertStore;

  constructor(store: OutcomeAlertStore) {
    this._store = store;
  }

  async evaluateOutcome(outcome: OutcomeMemory, rules: OutcomeAlertRule[], authenticatedOwnerId: string): Promise<OutcomeAlertEvaluateResult> {
    if (outcome.ownerId !== authenticatedOwnerId) {
      throw new OutcomeAlertOwnerError(outcome.id);
    }
    for (const rule of rules) {
      validateAlertRule(rule);
    }
    const evaluations = evaluateOutcomeAgainstRules(outcome, rules);
    const results: OutcomeAlertEvaluateItem[] = [];

    for (let i = 0; i < evaluations.length; i++) {
      const evaluation = evaluations[i];
      if (!evaluation.matched) {
        results.push({ ruleId: evaluation.ruleId, outcomeId: outcome.id, action: 'notMatched' });
        continue;
      }
      try {
        const rule = rules[i];
        const alert = await this._createAlertIfNew(outcome, evaluation, rule, authenticatedOwnerId);
        results.push({ ruleId: evaluation.ruleId, outcomeId: outcome.id, action: alert ? 'newlyCreated' : 'alreadyExists', alert });
      } catch (err) {
        results.push({ ruleId: evaluation.ruleId, outcomeId: outcome.id, action: 'failed', error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { outcomeId: outcome.id, results };
  }

  async evaluateOutcomes(outcomes: OutcomeMemory[], rules: OutcomeAlertRule[], authenticatedOwnerId: string): Promise<OutcomeAlertBatchResult> {
    const results: OutcomeAlertEvaluateResult[] = [];
    let matched = 0, created = 0, existing = 0, failed = 0;

    for (const outcome of outcomes) {
      try {
        const result = await this.evaluateOutcome(outcome, rules, authenticatedOwnerId);
        results.push(result);
        for (const item of result.results) {
          if (item.action === 'newlyCreated') { matched++; created++; }
          else if (item.action === 'alreadyExists') { matched++; existing++; }
          else if (item.action === 'failed') { failed++; }
        }
      } catch (err) {
        const errorItem: OutcomeAlertEvaluateItem = { ruleId: 'N/A', outcomeId: outcome.id, action: 'failed', error: err instanceof Error ? err.message : String(err) };
        results.push({ outcomeId: outcome.id, results: [errorItem] });
        failed++;
      }
    }
    return { totalOutcomes: outcomes.length, totalRules: rules.length, matched, created, existing, failed, results };
  }

  async acknowledgeAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult> {
    const alert = await this._store.getById(alertId, authenticatedOwnerId);
    if (!alert) {
      const { MemoryNotFoundError } = await import('./persistence/memory-persistence-types');
      throw new MemoryNotFoundError(alertId);
    }
    this._validateTransition(alert, 'acknowledged');
    return this._performTransition(alert, 'acknowledged', authenticatedOwnerId, expectedVersion);
  }

  async resolveAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult> {
    const alert = await this._store.getById(alertId, authenticatedOwnerId);
    if (!alert) {
      const { MemoryNotFoundError } = await import('./persistence/memory-persistence-types');
      throw new MemoryNotFoundError(alertId);
    }
    this._validateTransition(alert, 'resolved');
    return this._performTransition(alert, 'resolved', authenticatedOwnerId, expectedVersion);
  }

  async suppressAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult> {
    const alert = await this._store.getById(alertId, authenticatedOwnerId);
    if (!alert) {
      const { MemoryNotFoundError } = await import('./persistence/memory-persistence-types');
      throw new MemoryNotFoundError(alertId);
    }
    this._validateTransition(alert, 'suppressed');
    return this._performTransition(alert, 'suppressed', authenticatedOwnerId, expectedVersion);
  }

  private async _createAlertIfNew(outcome: OutcomeMemory, evaluation: OutcomeAlertEvaluation, rule: OutcomeAlertRule, authenticatedOwnerId: string): Promise<OutcomeAlert | undefined> {
    const fingerprint = generateFingerprint(evaluation.ruleId, outcome.id);
    const existing = await this._store.getByFingerprint(fingerprint, authenticatedOwnerId);
    if (existing) return undefined;

    const alertId = generateAlertId();
    const now = new Date().toISOString();
    const firstCondition = evaluation.matchedConditions.find(m => m.matched);
    const message = renderAlertMessage(evaluation.ruleId, firstCondition, rule.messageTemplate);
    const title = generateAlertTitle(outcome, firstCondition);

    const alert: OutcomeAlert = {
      id: alertId, ruleId: evaluation.ruleId, outcomeId: outcome.id,
      ownerId: outcome.ownerId ?? authenticatedOwnerId,
      projectId: outcome.projectId ?? null, topicId: outcome.topicId ?? null,
      severity: rule.severity, status: 'open', title, message,
      matchedConditions: evaluation.matchedConditions,
      triggeredAt: now, acknowledgedAt: null, resolvedAt: null, suppressedAt: null,
      createdAt: now, updatedAt: now, version: 1, fingerprint,
    };

    try {
      return await this._store.create(alert);
    } catch (err) {
      if (err instanceof MemoryConcurrencyError) {
        const retry = await this._store.getByFingerprint(fingerprint, authenticatedOwnerId);
        if (retry) return undefined;
      }
      throw err;
    }
  }

  private _validateTransition(alert: { id: string; status: OutcomeAlertStatus }, toStatus: OutcomeAlertStatus): void {
    const fromStatus = alert.status;
    if (fromStatus === toStatus) throw new OutcomeAlertTransitionError(alert.id, fromStatus, toStatus);
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed.includes(toStatus)) throw new OutcomeAlertTransitionError(alert.id, fromStatus, toStatus);
  }

  private async _performTransition(alert: OutcomeAlert, newStatus: OutcomeAlertStatus, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult> {
    const previousStatus = alert.status;
    const now = new Date().toISOString();
    const updatedAlert: OutcomeAlert = {
      ...alert, status: newStatus, updatedAt: now,
      acknowledgedAt: newStatus === 'acknowledged' ? (alert.acknowledgedAt ?? now) : alert.acknowledgedAt,
      resolvedAt: newStatus === 'resolved' ? (alert.resolvedAt ?? now) : alert.resolvedAt,
      suppressedAt: newStatus === 'suppressed' ? (alert.suppressedAt ?? now) : alert.suppressedAt,
    };
    const result = await this._store.update(updatedAlert, authenticatedOwnerId, expectedVersion);
    return { alert: result, previousStatus };
  }
}

/**
 * @brief Generates a unique fingerprint for alert deduplication
 * @param ruleId - ID of the rule
 * @param outcomeId - ID of the Outcome
 * @returns Base64-encoded fingerprint (ruleId:outcomeId)
 * @details Used to prevent duplicate alerts for the same rule+outcome pair
 */
export function generateFingerprint(ruleId: string, outcomeId: string): string {
  const raw = `${ruleId}:${outcomeId}`;
  if (typeof Buffer !== 'undefined') return Buffer.from(raw).toString('base64');
  return raw;
}

function generateAlertId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `oal_${crypto.randomUUID()}`;
  return `oal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateAlertTitle(outcome: OutcomeMemory, firstCondition?: OutcomeAlertMatchedCondition): string {
  if (firstCondition?.metricKey) return `告警：${firstCondition.metricId} 异常`;
  return 'Result告警';
}