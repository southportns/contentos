/**
 * P0.6.5.3 — Outcome Alert Persistence Integration Tests
 * Real SQLite database integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

let tempDir: string;
function setupTestDatabase(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'p0653-outcome-alert-'));
  const tempDbPath = join(tempDir, 'test.db');
  const dbUrl = `file:${tempDbPath}`;
  execSync(`npx prisma db push --accept-data-loss --force-reset --url "${dbUrl}"`, { cwd: process.cwd(), stdio: 'pipe' });
  process.env.DATABASE_URL = dbUrl;
}

import { PrismaOutcomeAlertStore } from '../persistence/outcome-alert-store';
import { OutcomeAlertServiceImpl } from '../outcome-alert-service';
import type { OutcomeAlertRule } from '../outcome-alert-rule';
import type { OutcomeAlert } from '../outcome-alert';
import type { OutcomeMemory } from '../outcome-memory';
import { createOutcomeMemory } from '../outcome-memory-factory';
import { generateFingerprint } from '../outcome-alert-service';
import { MemoryConcurrencyError, MemoryAuthorizationError } from '../persistence/memory-persistence-types';

let store: PrismaOutcomeAlertStore;
let service: OutcomeAlertServiceImpl;
const OWNER_A = 'user-db-alert-a';
const OWNER_B = 'user-db-alert-b';

function createRule(overrides?: Partial<OutcomeAlertRule>): OutcomeAlertRule {
  return { id: 'rule-test-001', name: '测试规则', enabled: true, severity: 'warning', outcomeTypes: ['engagement'], metricConditions: [{ metricKey: 'engagement_rate', operator: 'lt', threshold: 3.0 }], ...overrides };
}

function createOutcomeForAlert(ownerId: string, overrides?: Partial<Parameters<typeof createOutcomeMemory>[0]>): OutcomeMemory {
  return createOutcomeMemory({ outcomeType: 'engagement', targetType: 'content', targetId: `alert-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, observedAt: '2026-10-02T10:00:00Z', ownerId, projectId: 'project-db-p', topicId: 'topic-db-t', metrics: [{ key: 'engagement_rate', value: 1.5, unit: 'percent' }, { key: 'views', value: 500 }], ...overrides });
}

function buildAlert(overrides?: Partial<OutcomeAlert>): OutcomeAlert {
  const now = '2026-10-02T12:00:00.000Z';
  const id = overrides?.id ?? `oal_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ruleId = overrides?.ruleId ?? 'rule-test-001';
  const outcomeId = overrides?.outcomeId ?? 'out_test_123';
  const fingerprint = overrides?.fingerprint ?? generateFingerprint(ruleId, outcomeId);
  const base: OutcomeAlert = { id, ruleId, outcomeId, ownerId: OWNER_A, projectId: null, topicId: null, severity: 'warning', status: 'open', title: 'Test Alert', message: 'Test message', matchedConditions: [], triggeredAt: now, acknowledgedAt: null, resolvedAt: null, suppressedAt: null, createdAt: now, updatedAt: now, version: 1, fingerprint };
  const { id: _omitId, fingerprint: _omitFp, ...safeOverrides } = overrides ?? {};
  return { ...base, ...safeOverrides };
}

beforeAll(async () => {
  setupTestDatabase();
  const { prisma } = await import('@/lib/prisma');
  await prisma.outcomeAlert.count();
  store = new PrismaOutcomeAlertStore();
  service = new OutcomeAlertServiceImpl(store);
});

afterAll(async () => { delete process.env.DATABASE_URL; });

describe('P0.6.5.3 — Outcome Alert Persistence', () => {
  describe('CRUD Operations (D1-D4)', () => {
    it('D1: create alert → read back → all fields preserved', async () => {
      const alert = buildAlert({ ruleId: 'rule-d1', outcomeId: 'out-d1', title: 'D1 Test', message: 'D1 msg', severity: 'critical', matchedConditions: [{ metricKey: 'engagement_rate', operator: 'lt', threshold: 3.0, actualValue: 1.5, matched: true }] });
      const created = await store.create(alert);
      expect(created.id).toBe(alert.id);
      expect(created.severity).toBe('critical');
      const retrieved = await store.getById(alert.id, OWNER_A);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.message).toBe('D1 msg');
    });

    it('D2: duplicate fingerprint rejected', async () => {
      const alert = buildAlert({ ruleId: 'rule-d2', outcomeId: 'out-d2', fingerprint: 'fp-d2-unique' });
      await store.create(alert);
      const dupAlert = buildAlert({ id: `oal_dup_${Date.now()}`, ruleId: 'rule-d2', outcomeId: 'out-d2', fingerprint: 'fp-d2-unique' });
      await expect(store.create(dupAlert)).rejects.toThrow(MemoryConcurrencyError);
    });

    it('D3: getById returns null for wrong owner', async () => {
      const alert = buildAlert({ ruleId: 'rule-d3', outcomeId: 'out-d3', ownerId: OWNER_A });
      await store.create(alert);
      expect(await store.getById(alert.id, OWNER_B)).toBeNull();
    });

    it('D4: getByFingerprint returns null for wrong owner', async () => {
      const alert = buildAlert({ ruleId: 'rule-d4', outcomeId: 'out-d4', fingerprint: 'fp-d4-unique', ownerId: OWNER_A });
      await store.create(alert);
      expect(await store.getByFingerprint('fp-d4-unique', OWNER_B)).toBeNull();
      expect(await store.getByFingerprint('fp-d4-unique', OWNER_A)).not.toBeNull();
    });
  });

  describe('List & Filtering (D5-D9, D19-D21)', () => {
    it('D5: list filters by status', async () => {
      const openAlert = buildAlert({ ruleId: 'rule-d5-open', outcomeId: 'out-d5-open', fingerprint: 'fp-d5-open', status: 'open' });
      const resolvedAlert = buildAlert({ ruleId: 'rule-d5-resolved', outcomeId: 'out-d5-resolved', fingerprint: 'fp-d5-resolved', status: 'resolved' });
      await store.create(openAlert); await store.create(resolvedAlert);
      const openAlerts = await store.list(OWNER_A, { status: ['open'] });
      expect(openAlerts.map(a => a.id)).toContain(openAlert.id);
      expect(openAlerts.map(a => a.id)).not.toContain(resolvedAlert.id);
    });

    it('D6: list filters by severity', async () => {
      const infoAlert = buildAlert({ ruleId: 'rule-d6-info', outcomeId: 'out-d6-info', fingerprint: 'fp-d6-info', severity: 'info' });
      const criticalAlert = buildAlert({ ruleId: 'rule-d6-critical', outcomeId: 'out-d6-critical', fingerprint: 'fp-d6-critical', severity: 'critical' });
      await store.create(infoAlert); await store.create(criticalAlert);
      const criticalAlerts = await store.list(OWNER_A, { severity: ['critical'] });
      expect(criticalAlerts.map(a => a.id)).toContain(criticalAlert.id);
    });

    it('D7: list filters by ruleId', async () => {
      const a1 = buildAlert({ ruleId: 'rule-d7-a', outcomeId: 'out-d7-a', fingerprint: 'fp-d7-a' });
      const a2 = buildAlert({ ruleId: 'rule-d7-b', outcomeId: 'out-d7-b', fingerprint: 'fp-d7-b' });
      await store.create(a1); await store.create(a2);
      const filtered = await store.list(OWNER_A, { ruleId: 'rule-d7-a' });
      expect(filtered).toHaveLength(1);
    });

    it('D8: list filters by projectId', async () => {
      const withProject = buildAlert({ ruleId: 'rule-d8-project', outcomeId: 'out-d8-project', fingerprint: 'fp-d8-project', projectId: 'proj-specific' });
      const noProject = buildAlert({ ruleId: 'rule-d8-noproj', outcomeId: 'out-d8-noproj', fingerprint: 'fp-d8-noproj', projectId: null });
      await store.create(withProject); await store.create(noProject);
      const filtered = await store.list(OWNER_A, { projectId: 'proj-specific' });
      expect(filtered).toHaveLength(1);
    });

    it('D9: list ordered by triggeredAt DESC', async () => {
      const now = new Date('2026-10-02T10:00:00Z');
      const a1 = buildAlert({ ruleId: 'rule-d9-1', outcomeId: 'out-d9-1', fingerprint: 'fp-d9-1', triggeredAt: new Date(now.getTime() + 1000).toISOString() });
      const a2 = buildAlert({ ruleId: 'rule-d9-2', outcomeId: 'out-d9-2', fingerprint: 'fp-d9-2', triggeredAt: new Date(now.getTime() + 3000).toISOString() });
      const a3 = buildAlert({ ruleId: 'rule-d9-3', outcomeId: 'out-d9-3', fingerprint: 'fp-d9-3', triggeredAt: new Date(now.getTime() + 2000).toISOString() });
      await store.create(a1); await store.create(a2); await store.create(a3);
      const d9Alerts = (await store.list(OWNER_A)).filter(a => a.fingerprint.startsWith('fp-d9-'));
      expect(d9Alerts.length).toBeGreaterThanOrEqual(3);
    });

    it('D19: list limit respected', async () => {
      for (let i = 0; i < 5; i++) await store.create(buildAlert({ ruleId: `rule-d19-${i}`, outcomeId: `out-d19-${i}`, fingerprint: `fp-d19-${i}` }));
      const limited = await store.list(OWNER_A, { limit: 3 });
      expect(limited.length).toBeLessThanOrEqual(3);
    });

    it('D20: filter combinations', async () => {
      await store.create(buildAlert({ ruleId: 'rule-d20-a', outcomeId: 'out-d20-a', fingerprint: 'fp-d20-a', status: 'open', severity: 'critical' }));
      await store.create(buildAlert({ ruleId: 'rule-d20-b', outcomeId: 'out-d20-b', fingerprint: 'fp-d20-b', status: 'open', severity: 'info' }));
      await store.create(buildAlert({ ruleId: 'rule-d20-c', outcomeId: 'out-d20-c', fingerprint: 'fp-d20-c', status: 'resolved', severity: 'critical' }));
      // Filter by status + severity + ruleId to isolate from other tests' data
      const filtered = await store.list(OWNER_A, { status: ['open'], severity: ['critical'], ruleId: 'rule-d20-a' });
      expect(filtered).toHaveLength(1);
    });

    it('D21: list returns empty for owner with no alerts', async () => {
      expect(await store.list('nonexistent-owner')).toEqual([]);
    });
  });

  describe('OCC Update (D10-D12)', () => {
    it('D10: update with correct version succeeds', async () => {
      const alert = buildAlert({ ruleId: 'rule-d10', outcomeId: 'out-d10', fingerprint: 'fp-d10', status: 'open', version: 1 });
      await store.create(alert);
      const ackTime = new Date('2026-10-02T13:00:00Z').toISOString();
      const updated = await store.update({ ...alert, status: 'acknowledged', acknowledgedAt: ackTime }, OWNER_A, 1);
      expect(updated.status).toBe('acknowledged');
      expect(updated.version).toBe(2);
    });

    it('D11: stale version throws MemoryConcurrencyError', async () => {
      const alert = buildAlert({ ruleId: 'rule-d11', outcomeId: 'out-d11', fingerprint: 'fp-d11', version: 1 });
      await store.create(alert);
      await store.update({ ...alert, status: 'acknowledged' }, OWNER_A, 1);
      await expect(store.update({ ...alert, status: 'resolved' }, OWNER_A, 1)).rejects.toThrow(MemoryConcurrencyError);
    });

    it('D12: update by wrong owner throws MemoryAuthorizationError', async () => {
      const alert = buildAlert({ ruleId: 'rule-d12', outcomeId: 'out-d12', fingerprint: 'fp-d12', ownerId: OWNER_A, version: 1 });
      await store.create(alert);
      await expect(store.update({ ...alert, status: 'resolved' }, OWNER_B, 1)).rejects.toThrow(MemoryAuthorizationError);
    });
  });

  describe('Service Integration (D13-D18, D22-D23)', () => {
    it('D13: service evaluateOutcome creates alert in DB', async () => {
      const outcome = createOutcomeForAlert(OWNER_A, { targetId: 'd13-target', metrics: [{ key: 'engagement_rate', value: 1.0, unit: 'percent' }] });
      const rule = createRule({ id: 'rule-d13', name: 'D13 Engagement Low', metricConditions: [{ metricKey: 'engagement_rate', operator: 'lt', threshold: 3.0 }] });
      const result = await service.evaluateOutcome(outcome, [rule], OWNER_A);
      expect(result.results[0].action).toBe('newlyCreated');
      const stored = await store.getById(result.results[0].alert!.id, OWNER_A);
      expect(stored).not.toBeNull();
    });

    it('D14: service deduplication via fingerprint', async () => {
      const outcome = createOutcomeForAlert(OWNER_A, { targetId: 'd14-target', metrics: [{ key: 'engagement_rate', value: 0.5, unit: 'percent' }] });
      const rule = createRule({ id: 'rule-d14', name: 'D14 Dedup' });
      const r1 = await service.evaluateOutcome(outcome, [rule], OWNER_A);
      expect(r1.results[0].action).toBe('newlyCreated');
      const r2 = await service.evaluateOutcome(outcome, [rule], OWNER_A);
      expect(r2.results[0].action).toBe('alreadyExists');
      const all = await store.list(OWNER_A, { ruleId: 'rule-d14' });
      expect(all.filter(a => a.outcomeId === outcome.id)).toHaveLength(1);
    });

    it('D15: acknowledge lifecycle persists', async () => {
      const outcome = createOutcomeForAlert(OWNER_A, { targetId: 'd15-target', metrics: [{ key: 'engagement_rate', value: 1.0, unit: 'percent' }] });
      const rule = createRule({ id: 'rule-d15', name: 'D15 Acknowledge' });
      const evalResult = await service.evaluateOutcome(outcome, [rule], OWNER_A);
      const ackResult = await service.acknowledgeAlert(evalResult.results[0].alert!.id, OWNER_A, 1);
      expect(ackResult.alert.status).toBe('acknowledged');
      const stored = await store.getById(evalResult.results[0].alert!.id, OWNER_A);
      expect(stored!.version).toBe(2);
    });

    it('D16: resolve lifecycle persists', async () => {
      const outcome = createOutcomeForAlert(OWNER_A, { targetId: 'd16-target', metrics: [{ key: 'engagement_rate', value: 1.0, unit: 'percent' }] });
      const rule = createRule({ id: 'rule-d16', name: 'D16 Resolve' });
      const evalResult = await service.evaluateOutcome(outcome, [rule], OWNER_A);
      const resolveResult = await service.resolveAlert(evalResult.results[0].alert!.id, OWNER_A, 1);
      expect(resolveResult.alert.status).toBe('resolved');
      const stored = await store.getById(evalResult.results[0].alert!.id, OWNER_A);
      expect(stored!.status).toBe('resolved');
    });

    it('D17: suppress lifecycle persists', async () => {
      const outcome = createOutcomeForAlert(OWNER_A, { targetId: 'd17-target', metrics: [{ key: 'engagement_rate', value: 1.0, unit: 'percent' }] });
      const rule = createRule({ id: 'rule-d17', name: 'D17 Suppress' });
      const evalResult = await service.evaluateOutcome(outcome, [rule], OWNER_A);
      const suppressResult = await service.suppressAlert(evalResult.results[0].alert!.id, OWNER_A, 1);
      expect(suppressResult.alert.status).toBe('suppressed');
    });

    it('D18: list after lifecycle has correct status', async () => {
      const o1 = createOutcomeForAlert(OWNER_A, { targetId: 'd18-open', metrics: [{ key: 'engagement_rate', value: 1.0, unit: 'percent' }] });
      const o2 = createOutcomeForAlert(OWNER_A, { targetId: 'd18-resolved', metrics: [{ key: 'engagement_rate', value: 0.5, unit: 'percent' }] });
      const r1 = await service.evaluateOutcome(o1, [createRule({ id: 'rule-d18-open', name: 'D18 Open' })], OWNER_A);
      const r2 = await service.evaluateOutcome(o2, [createRule({ id: 'rule-d18-resolved', name: 'D18 Resolved' })], OWNER_A);
      await service.resolveAlert(r2.results[0].alert!.id, OWNER_A, 1);
      const openAlerts = await store.list(OWNER_A, { status: ['open'] });
      expect(openAlerts.map(a => a.id)).toContain(r1.results[0].alert!.id);
      expect(openAlerts.map(a => a.id)).not.toContain(r2.results[0].alert!.id);
    });

    it('D23: listActionable returns open+acknowledged only', async () => {
      const openAlert = buildAlert({ ruleId: 'rule-d23-open', outcomeId: 'out-d23-open', fingerprint: 'fp-d23-open', status: 'open' });
      const ackAlert = buildAlert({ ruleId: 'rule-d23-ack', outcomeId: 'out-d23-ack', fingerprint: 'fp-d23-ack', status: 'acknowledged' });
      const resolvedAlert = buildAlert({ ruleId: 'rule-d23-resolved', outcomeId: 'out-d23-resolved', fingerprint: 'fp-d23-resolved', status: 'resolved' });
      const suppressedAlert = buildAlert({ ruleId: 'rule-d23-suppressed', outcomeId: 'out-d23-suppressed', fingerprint: 'fp-d23-suppressed', status: 'suppressed' });
      await store.create(openAlert);
      await store.create(ackAlert);
      await store.create(resolvedAlert);
      await store.create(suppressedAlert);
      const actionable = await store.listActionable(OWNER_A);
      const actionableIds = actionable.map(a => a.id);
      expect(actionableIds).toContain(openAlert.id);
      expect(actionableIds).toContain(ackAlert.id);
      expect(actionableIds).not.toContain(resolvedAlert.id);
      expect(actionableIds).not.toContain(suppressedAlert.id);
    });

    it('D22: version increments through acknowledge then resolve', async () => {
      const outcome = createOutcomeForAlert(OWNER_A, { targetId: 'd22-target', metrics: [{ key: 'engagement_rate', value: 1.0, unit: 'percent' }] });
      const rule = createRule({ id: 'rule-d22', name: 'D22 Version Chain' });
      const evalResult = await service.evaluateOutcome(outcome, [rule], OWNER_A);
      expect(evalResult.results[0].alert!.version).toBe(1);
      const ackResult = await service.acknowledgeAlert(evalResult.results[0].alert!.id, OWNER_A, 1);
      expect(ackResult.alert.version).toBe(2);
      const resolveResult = await service.resolveAlert(evalResult.results[0].alert!.id, OWNER_A, 2);
      expect(resolveResult.alert.version).toBe(3);
    });
  });
});
