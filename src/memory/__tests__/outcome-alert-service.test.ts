/*
 * P0.6.5.3 — Outcome Alert Service Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OutcomeAlertServiceImpl, OutcomeAlertTransitionError, OutcomeAlertOwnerError } from '../outcome-alert-service';
import type { OutcomeAlertStore } from '../persistence/outcome-alert-store';
import type { OutcomeAlert } from '../outcome-alert';
import type { OutcomeAlertRule } from '../outcome-alert-rule';
import { createOutcomeMemory } from '../outcome-memory-factory';
import type { OutcomeMemory } from '../outcome-memory';
import { MemoryConcurrencyError, MemoryNotFoundError, MemoryAuthorizationError } from '../persistence/memory-persistence-types';

class MockOutcomeAlertStore implements OutcomeAlertStore {
  private _alerts: Map<string, OutcomeAlert> = new Map();
  private _fingerprintIndex: Map<string, string> = new Map();

  async create(alert: OutcomeAlert): Promise<OutcomeAlert> {
    if (this._fingerprintIndex.has(alert.fingerprint)) {
      const existingId = this._fingerprintIndex.get(alert.fingerprint)!;
      if (this._alerts.has(existingId)) throw new MemoryConcurrencyError(alert.id, alert.version);
    }
    this._alerts.set(alert.id, { ...alert });
    this._fingerprintIndex.set(alert.fingerprint, alert.id);
    return { ...alert };
  }

  async getById(id: string, authenticatedOwnerId: string): Promise<OutcomeAlert | null> {
    const alert = this._alerts.get(id);
    if (!alert || alert.ownerId !== authenticatedOwnerId) return null;
    return { ...alert };
  }

  async getByFingerprint(fingerprint: string, authenticatedOwnerId: string): Promise<OutcomeAlert | null> {
    const alertId = this._fingerprintIndex.get(fingerprint);
    if (!alertId) return null;
    const alert = this._alerts.get(alertId);
    if (!alert || alert.ownerId !== authenticatedOwnerId) return null;
    return { ...alert };
  }

  async list(authenticatedOwnerId: string, filters?: import('../persistence/outcome-alert-store').OutcomeAlertListFilters): Promise<OutcomeAlert[]> {
    let alerts = Array.from(this._alerts.values()).filter(a => a.ownerId === authenticatedOwnerId);
    if (filters?.status?.length) alerts = alerts.filter(a => filters.status!.includes(a.status));
    if (filters?.severity?.length) alerts = alerts.filter(a => filters.severity!.includes(a.severity));
    if (filters?.ruleId) alerts = alerts.filter(a => a.ruleId === filters.ruleId);
    if (filters?.outcomeId) alerts = alerts.filter(a => a.outcomeId === filters.outcomeId);
    if (filters?.limit) alerts = alerts.slice(0, filters.limit);
    return alerts.map(a => ({ ...a }));
  }

  async listActionable(authenticatedOwnerId: string, filters?: Omit<import('../persistence/outcome-alert-store').OutcomeAlertListFilters, 'status'>): Promise<OutcomeAlert[]> {
    return this.list(authenticatedOwnerId, { ...filters, status: ['open', 'acknowledged'] });
  }

  async update(alert: OutcomeAlert, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlert> {
    if (alert.ownerId !== authenticatedOwnerId) throw new MemoryAuthorizationError(alert.id);
    const existing = this._alerts.get(alert.id);
    if (!existing || existing.ownerId !== authenticatedOwnerId) throw new MemoryNotFoundError(alert.id);
    if (existing.version !== expectedVersion) throw new MemoryConcurrencyError(alert.id, expectedVersion, existing.version);
    const updated: OutcomeAlert = { ...alert, version: expectedVersion + 1, updatedAt: new Date().toISOString() };
    this._alerts.set(alert.id, updated);
    return { ...updated };
  }
}

const OWNER_ALICE = 'user-alice';
const OWNER_BOB = 'user-bob';

function createTestOutcome(overrides?: Partial<Parameters<typeof createOutcomeMemory>[0]>): OutcomeMemory {
  return createOutcomeMemory({
    outcomeType: 'engagement', targetType: 'content', targetId: 'content-svc-001',
    observedAt: '2026-10-02T08:00:00Z', ownerId: OWNER_ALICE,
    metrics: [{ key: 'engagement_rate', value: 0.018, unit: 'ratio' }, { key: 'views', value: 500, unit: 'count' }],
    projectId: 'project-x', topicId: 'topic-y', ...overrides,
  });
}

function createLowEngagementRule(overrides?: Partial<OutcomeAlertRule>): OutcomeAlertRule {
  return {
    id: 'rule-low-engagement', name: 'Low Engagement Alert', enabled: true, severity: 'warning',
    outcomeTypes: ['engagement'], targetTypes: ['content'],
    metricConditions: [{ metricKey: 'engagement_rate', operator: 'lt', threshold: 0.03 }],
    ...overrides,
  };
}

describe('S: Service Evaluate', () => {
  let store: MockOutcomeAlertStore;
  let service: OutcomeAlertServiceImpl;
  beforeEach(() => { store = new MockOutcomeAlertStore(); service = new OutcomeAlertServiceImpl(store); });

  it('S1: evaluate creates alert for matched rule', async () => {
    const result = await service.evaluateOutcome(createTestOutcome(), [createLowEngagementRule()], OWNER_ALICE);
    expect(result.results[0].action).toBe('newlyCreated');
    expect(result.results[0].alert!.status).toBe('open');
  });

  it('S2: duplicate evaluation — only one alert created', async () => {
    const outcome = createTestOutcome();
    const rules = [createLowEngagementRule()];
    const r1 = await service.evaluateOutcome(outcome, rules, OWNER_ALICE);
    expect(r1.results[0].action).toBe('newlyCreated');
    const r2 = await service.evaluateOutcome(outcome, rules, OWNER_ALICE);
    expect(r2.results[0].action).toBe('alreadyExists');
  });

  it('S3: disabled rule — no alert created', async () => {
    const result = await service.evaluateOutcome(createTestOutcome(), [createLowEngagementRule({ enabled: false })], OWNER_ALICE);
    expect(result.results[0].action).toBe('notMatched');
  });

  it('S4: owner mismatch — throws OutcomeAlertOwnerError', async () => {
    await expect(service.evaluateOutcome(createTestOutcome(), [createLowEngagementRule()], OWNER_BOB)).rejects.toThrow(OutcomeAlertOwnerError);
  });

  it('S5: not matched — returns notMatched', async () => {
    const result = await service.evaluateOutcome(createTestOutcome({ metrics: [{ key: 'engagement_rate', value: 0.05 }] }), [createLowEngagementRule()], OWNER_ALICE);
    expect(result.results[0].action).toBe('notMatched');
  });

  it('S6: evaluate before and after — Outcome unchanged', async () => {
    const outcome = createTestOutcome();
    const beforeSnapshot = JSON.parse(JSON.stringify(outcome));
    await service.evaluateOutcome(outcome, [createLowEngagementRule()], OWNER_ALICE);
    expect(outcome).toEqual(beforeSnapshot);
  });

  it('S7: multiple rules — mixed results', async () => {
    const result = await service.evaluateOutcome(createTestOutcome(), [
      createLowEngagementRule({ id: 'match-rule' }),
      createLowEngagementRule({ id: 'disabled-rule', enabled: false }),
      createLowEngagementRule({ id: 'wrong-type', outcomeTypes: ['performance'] }),
    ], OWNER_ALICE);
    expect(result.results[0].action).toBe('newlyCreated');
    expect(result.results[1].action).toBe('notMatched');
    expect(result.results[2].action).toBe('notMatched');
  });

  it('S8: batch evaluation — aggregate counts', async () => {
    const result = await service.evaluateOutcomes([createTestOutcome({ id: 'b1' }), createTestOutcome({ id: 'b2' })], [createLowEngagementRule()], OWNER_ALICE);
    expect(result.totalOutcomes).toBe(2);
    expect(result.created).toBe(2);
  });

  it('S9: batch with owner mismatch', async () => {
    const outcomes = [createTestOutcome({ id: 'ok' }), createOutcomeMemory({ outcomeType: 'engagement', targetType: 'content', targetId: 'bob-target', observedAt: '2026-10-02T08:00:00Z', ownerId: OWNER_BOB, metrics: [{ key: 'engagement_rate', value: 0.01 }] })];
    const result = await service.evaluateOutcomes(outcomes, [createLowEngagementRule()], OWNER_ALICE);
    expect(result.failed).toBe(1);
    expect(result.created).toBe(1);
  });

  it('S10: batch single outcome multiple rules', async () => {
    const result = await service.evaluateOutcomes([createTestOutcome()], [createLowEngagementRule({ id: 'r1' }), createLowEngagementRule({ id: 'r2', outcomeTypes: ['failure'] })], OWNER_ALICE);
    expect(result.matched).toBe(1);
  });

  it('S11: empty rules', async () => {
    const result = await service.evaluateOutcome(createTestOutcome(), [], OWNER_ALICE);
    expect(result.results).toEqual([]);
  });

  it('S12: empty outcomes', async () => {
    const result = await service.evaluateOutcomes([], [createLowEngagementRule()], OWNER_ALICE);
    expect(result.totalOutcomes).toBe(0);
  });
});

describe('L: Lifecycle', () => {
  let store: MockOutcomeAlertStore;
  let service: OutcomeAlertServiceImpl;
  beforeEach(() => { store = new MockOutcomeAlertStore(); service = new OutcomeAlertServiceImpl(store); });

  async function createAlertViaEvaluate(): Promise<OutcomeAlert> {
    const outcome = createTestOutcome();
    const rules = [createLowEngagementRule()];
    const result = await service.evaluateOutcome(outcome, rules, OWNER_ALICE);
    return result.results[0].alert!;
  }

  it('L1: acknowledge — open → acknowledged', async () => {
    const alert = await createAlertViaEvaluate();
    const result = await service.acknowledgeAlert(alert.id, OWNER_ALICE, 1);
    expect(result.previousStatus).toBe('open');
    expect(result.alert.status).toBe('acknowledged');
    expect(result.alert.version).toBe(2);
  });

  it('L2: resolve — open → resolved', async () => {
    const alert = await createAlertViaEvaluate();
    const result = await service.resolveAlert(alert.id, OWNER_ALICE, 1);
    expect(result.alert.status).toBe('resolved');
  });

  it('L3: suppress — open → suppressed', async () => {
    const alert = await createAlertViaEvaluate();
    const result = await service.suppressAlert(alert.id, OWNER_ALICE, 1);
    expect(result.alert.status).toBe('suppressed');
  });

  it('L4: acknowledged → resolved is valid', async () => {
    const alert = await createAlertViaEvaluate();
    await service.acknowledgeAlert(alert.id, OWNER_ALICE, 1);
    const result = await service.resolveAlert(alert.id, OWNER_ALICE, 2);
    expect(result.previousStatus).toBe('acknowledged');
    expect(result.alert.status).toBe('resolved');
  });

  it('L5: acknowledged → suppressed is valid', async () => {
    const alert = await createAlertViaEvaluate();
    await service.acknowledgeAlert(alert.id, OWNER_ALICE, 1);
    const result = await service.suppressAlert(alert.id, OWNER_ALICE, 2);
    expect(result.alert.status).toBe('suppressed');
  });

  it('L6: resolved → acknowledged is INVALID', async () => {
    const alert = await createAlertViaEvaluate();
    await service.resolveAlert(alert.id, OWNER_ALICE, 1);
    await expect(service.acknowledgeAlert(alert.id, OWNER_ALICE, 2)).rejects.toThrow(OutcomeAlertTransitionError);
  });

  it('L7: suppressed → acknowledged is INVALID', async () => {
    const alert = await createAlertViaEvaluate();
    await service.suppressAlert(alert.id, OWNER_ALICE, 1);
    await expect(service.acknowledgeAlert(alert.id, OWNER_ALICE, 2)).rejects.toThrow(OutcomeAlertTransitionError);
  });

  it('L8: OCC version mismatch rejected', async () => {
    const alert = await createAlertViaEvaluate();
    await expect(service.acknowledgeAlert(alert.id, OWNER_ALICE, 99)).rejects.toThrow(MemoryConcurrencyError);
  });

  it('L9: wrong owner cannot acknowledge', async () => {
    const alert = await createAlertViaEvaluate();
    await expect(service.acknowledgeAlert(alert.id, OWNER_BOB, 1)).rejects.toThrow(MemoryNotFoundError);
  });

  it('L10: timestamps set correctly on transition', async () => {
    const alert = await createAlertViaEvaluate();
    const beforeTime = Date.now();
    const result = await service.acknowledgeAlert(alert.id, OWNER_ALICE, 1);
    expect(new Date(result.alert.acknowledgedAt!).getTime()).toBeGreaterThanOrEqual(beforeTime);
  });

  it('L11: transition error contains alertId', async () => {
    const alert = await createAlertViaEvaluate();
    await service.resolveAlert(alert.id, OWNER_ALICE, 1);
    try {
      await service.acknowledgeAlert(alert.id, OWNER_ALICE, 2);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(OutcomeAlertTransitionError);
      expect((err as OutcomeAlertTransitionError).alertId).toBe(alert.id);
      expect((err as OutcomeAlertTransitionError).fromStatus).toBe('resolved');
      expect((err as OutcomeAlertTransitionError).toStatus).toBe('acknowledged');
    }
  });
});

describe('V: Severity Propagation', () => {
  let store: MockOutcomeAlertStore;
  let service: OutcomeAlertServiceImpl;
  beforeEach(() => { store = new MockOutcomeAlertStore(); service = new OutcomeAlertServiceImpl(store); });

  it('V1: alert inherits severity from rule (critical)', async () => {
    const result = await service.evaluateOutcome(createTestOutcome(), [createLowEngagementRule({ severity: 'critical' })], OWNER_ALICE);
    expect(result.results[0].action).toBe('newlyCreated');
    expect(result.results[0].alert!.severity).toBe('critical');
  });

  it('V2: alert inherits severity from rule (info)', async () => {
    const result = await service.evaluateOutcome(createTestOutcome(), [createLowEngagementRule({ severity: 'info' })], OWNER_ALICE);
    expect(result.results[0].alert!.severity).toBe('info');
  });

  it('V3: multiple rules — each alert gets its own severity', async () => {
    const result = await service.evaluateOutcome(createTestOutcome(), [
      createLowEngagementRule({ id: 'r-crit', severity: 'critical' }),
      createLowEngagementRule({ id: 'r-info', severity: 'info', targetIds: [], outcomeTypes: ['engagement'] }),
    ], OWNER_ALICE);
    const critAlert = result.results.find(r => r.ruleId === 'r-crit')?.alert;
    const infoAlert = result.results.find(r => r.ruleId === 'r-info')?.alert;
    expect(critAlert!.severity).toBe('critical');
    expect(infoAlert!.severity).toBe('info');
  });
});

describe('T: Message Template', () => {
  let store: MockOutcomeAlertStore;
  let service: OutcomeAlertServiceImpl;
  beforeEach(() => { store = new MockOutcomeAlertStore(); service = new OutcomeAlertServiceImpl(store); });

  it('T1: custom messageTemplate renders variables', async () => {
    const tmpl = '警告：{metricKey} 当前值 {actualValue} 低于阈值 {threshold}';
    const result = await service.evaluateOutcome(
      createTestOutcome(),
      [createLowEngagementRule({ messageTemplate: tmpl })],
      OWNER_ALICE,
    );
    const alert = result.results[0].alert!;
    expect(alert.message).toContain('engagement_rate');
    expect(alert.message).toContain('0.018');
    expect(alert.message).toContain('0.03');
  });

  it('T2: no template — uses default format', async () => {
    const result = await service.evaluateOutcome(createTestOutcome(), [createLowEngagementRule()], OWNER_ALICE);
    const alert = result.results[0].alert!;
    expect(alert.message).toContain('engagement_rate');
    expect(alert.message).toContain('0.018');
  });

  it('T3: template with filter-only rule (no matched conditions)', async () => {
    const rule = createLowEngagementRule({ metricConditions: [], messageTemplate: 'no condition' });
    const result = await service.evaluateOutcome(createTestOutcome(), [rule], OWNER_ALICE);
    const alert = result.results[0].alert!;
    expect(alert.message).toContain('rule "rule-low-engagement" matched');
  });
});

describe('R: Rule Validation', () => {
  let store: MockOutcomeAlertStore;
  let service: OutcomeAlertServiceImpl;
  beforeEach(() => { store = new MockOutcomeAlertStore(); service = new OutcomeAlertServiceImpl(store); });

  it('R1: invalid rule — empty id throws', async () => {
    await expect(service.evaluateOutcome(
      createTestOutcome(),
      [{ id: '', name: 'x', enabled: true, severity: 'warning' }],
      OWNER_ALICE,
    )).rejects.toThrow('id');
  });

  it('R2: invalid rule — empty name throws', async () => {
    await expect(service.evaluateOutcome(
      createTestOutcome(),
      [{ id: 'r1', name: '', enabled: true, severity: 'warning' }],
      OWNER_ALICE,
    )).rejects.toThrow('name');
  });

  it('R3: invalid rule — invalid severity throws', async () => {
    await expect(service.evaluateOutcome(
      createTestOutcome(),
      [{ id: 'r1', name: 'x', enabled: true, severity: 'invalid' as import('../outcome-alert-rule').OutcomeAlertSeverity }],
      OWNER_ALICE,
    )).rejects.toThrow('severity');
  });

  it('R4: invalid rule — invalid operator in metricConditions throws', async () => {
    await expect(service.evaluateOutcome(
      createTestOutcome(),
      [{ id: 'r1', name: 'x', enabled: true, severity: 'warning', metricConditions: [{ metricKey: 'views', operator: 'bad', threshold: 1 }] } as unknown as OutcomeAlertRule],
      OWNER_ALICE,
    )).rejects.toThrow('operator');
  });
});

describe('E: Error Message Interpolation', () => {
  let store: MockOutcomeAlertStore;
  let service: OutcomeAlertServiceImpl;
  beforeEach(() => { store = new MockOutcomeAlertStore(); service = new OutcomeAlertServiceImpl(store); });

  async function createAlertViaEvaluate(): Promise<OutcomeAlert> {
    const outcome = createTestOutcome();
    const rules = [createLowEngagementRule()];
    const result = await service.evaluateOutcome(outcome, rules, OWNER_ALICE);
    return result.results[0].alert!;
  }

  it('E1: OutcomeAlertTransitionError message contains real alertId, fromStatus, toStatus', async () => {
    const alert = await createAlertViaEvaluate();
    await service.resolveAlert(alert.id, OWNER_ALICE, 1);
    try {
      await service.acknowledgeAlert(alert.id, OWNER_ALICE, 2);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(OutcomeAlertTransitionError);
      const message = (err as OutcomeAlertTransitionError).message;
      expect(message).toContain(`cannot transition alert from "resolved" to "acknowledged" — id=${alert.id}`);
      expect(message).not.toContain('${fromStatus}');
      expect(message).not.toContain('${toStatus}');
      expect(message).not.toContain('${alertId}');
    }
  });

  it('E2: OutcomeAlertOwnerError message contains real outcomeId', async () => {
    const testOutcome = createTestOutcome({ id: 'test-outcome-123' });
    try {
      await service.evaluateOutcome(testOutcome, [createLowEngagementRule()], OWNER_BOB);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(OutcomeAlertOwnerError);
      const message = (err as OutcomeAlertOwnerError).message;
      expect(message).toContain(`outcome ownerId mismatch — outcome "${testOutcome.id}" does not belong to the authenticated user`);
      expect(message).not.toContain('${outcomeId}');
    }
  });
});