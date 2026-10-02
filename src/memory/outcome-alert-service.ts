/**
 * P0.6.5.3 — Outcome Alert Service
 *
 * Orchestrates Outcome Alert lifecycle: evaluation, dedup, persistence, lifecycle.
 */

import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeAlertRule } from './outcome-alert-rule';
import type { OutcomeAlert } from './outcome-alert';
import type { OutcomeAlertMatchedCondition, OutcomeAlertEvaluation } from './outcome-alert-evaluator';
import { renderAlertMessage, evaluateOutcomeAgainstRules } from './outcome-alert-evaluator';
import type { OutcomeAlertStore } from './persistence/outcome-alert-store';
import { MemoryConcurrencyError } from './persistence/memory-persistence-types';

export class OutcomeAlertTransitionError extends Error {
  constructor(
    public readonly alertId: string,
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(`cannot transition alert from "${fromStatus}" to "${toStatus}" — id=${alertId}`);
    this.name = 'OutcomeAlertTransitionError';
  }
}

export class OutcomeAlertOwnerError extends Error {
  constructor(outcomeId: string) {
    super(`outcome ownerId mismatch — outcome "${outcomeId}" does not belong to the authenticated user`);
    this.name = 'OutcomeAlertOwnerError';
  }
}

export interface OutcomeAlertEvaluateItem {
  ruleId: string;
  outcomeId: string;
  action: 'newlyCreated' | 'alreadyExists' | 'notMatched' | 'failed';
  alert?: OutcomeAlert;
  error?: string;
}

export interface OutcomeAlertEvaluateResult {
  outcomeId: string;
  results: OutcomeAlertEvaluateItem[];
}

export interface OutcomeAlertBatchResult {
  totalOutcomes: number;
  totalRules: number;
  matched: number;
  created: number;
  existing: number;
  failed: number;
  results: OutcomeAlertEvaluateResult[];
}

export interface OutcomeAlertLifecycleResult {
  alert: OutcomeAlert;
  previousStatus: OutcomeAlertStatus;
}

const VALID_TRANSITIONS: Record<OutcomeAlertStatus, OutcomeAlertStatus[]> = {
  open: ['acknowledged', 'resolved', 'suppressed'],
  acknowledged: ['resolved', 'suppressed'],
  resolved: [],
  suppressed: [],
};

export interface OutcomeAlertService {
  evaluateOutcome(outcome: OutcomeMemory, rules: OutcomeAlertRule[], authenticatedOwnerId: string): Promise<OutcomeAlertEvaluateResult>;
  evaluateOutcomes(outcomes: OutcomeMemory[], rules: OutcomeAlertRule[], authenticatedOwnerId: string): Promise<OutcomeAlertBatchResult>;
  acknowledgeAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult>;
  resolveAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult>;
  suppressAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult>;
}

export class OutcomeAlertServiceImpl implements OutcomeAlertService {
  private _store: OutcomeAlertStore;

  constructor(store: OutcomeAlertStore) {
    this._store = store;
  }

  async evaluateOutcome(outcome: OutcomeMemory, rules: OutcomeAlertRule[], authenticatedOwnerId: string): Promise<OutcomeAlertEvaluateResult> {
    if (outcome.ownerId !== authenticatedOwnerId) {
      throw new OutcomeAlertOwnerError(outcome.id);
    }
    const evaluations = evaluateOutcomeAgainstRules(outcome, rules);
    const results: OutcomeAlertEvaluateItem[] = [];

    for (const evaluation of evaluations) {
      if (!evaluation.matched) {
        results.push({ ruleId: evaluation.ruleId, outcomeId: outcome.id, action: 'notMatched' });
        continue;
      }
      try {
        const alert = await this._createAlertIfNew(outcome, evaluation, authenticatedOwnerId);
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
    this._validateTransition(alert.status, 'acknowledged');
    return this._performTransition(alert, 'acknowledged', authenticatedOwnerId, expectedVersion);
  }

  async resolveAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult> {
    const alert = await this._store.getById(alertId, authenticatedOwnerId);
    if (!alert) {
      const { MemoryNotFoundError } = await import('./persistence/memory-persistence-types');
      throw new MemoryNotFoundError(alertId);
    }
    this._validateTransition(alert.status, 'resolved');
    return this._performTransition(alert, 'resolved', authenticatedOwnerId, expectedVersion);
  }

  async suppressAlert(alertId: string, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlertLifecycleResult> {
    const alert = await this._store.getById(alertId, authenticatedOwnerId);
    if (!alert) {
      const { MemoryNotFoundError } = await import('./persistence/memory-persistence-types');
      throw new MemoryNotFoundError(alertId);
    }
    this._validateTransition(alert.status, 'suppressed');
    return this._performTransition(alert, 'suppressed', authenticatedOwnerId, expectedVersion);
  }

  private async _createAlertIfNew(outcome: OutcomeMemory, evaluation: OutcomeAlertEvaluation, authenticatedOwnerId: string): Promise<OutcomeAlert | undefined> {
    const fingerprint = generateFingerprint(evaluation.ruleId, outcome.id);
    const existing = await this._store.getByFingerprint(fingerprint, authenticatedOwnerId);
    if (existing) return undefined;

    const alertId = generateAlertId();
    const now = new Date().toISOString();
    const firstCondition = evaluation.matchedConditions.find(m => m.matched);
    const message = renderAlertMessage(evaluation.ruleId, firstCondition, undefined);
    const title = generateAlertTitle(outcome, firstCondition);

    const alert: OutcomeAlert = {
      id: alertId, ruleId: evaluation.ruleId, outcomeId: outcome.id,
      ownerId: outcome.ownerId ?? authenticatedOwnerId,
      projectId: outcome.projectId ?? null, topicId: outcome.topicId ?? null,
      severity: 'warning', status: 'open', title, message,
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

  private _validateTransition(fromStatus: OutcomeAlertStatus, toStatus: OutcomeAlertStatus): void {
    if (fromStatus === toStatus) throw new OutcomeAlertTransitionError('unknown', fromStatus, toStatus);
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed.includes(toStatus)) throw new OutcomeAlertTransitionError('unknown', fromStatus, toStatus);
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
  if (firstCondition?.metricKey) return `告警：${firstCondition.metricKey} 异常`;
  return 'Result告警';
}
