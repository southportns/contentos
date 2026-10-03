/**
 * P0.6.5.5-R1 — Decision Feedback Context Bridge Tests
 *
 * Tests for:
 *   - decisionFeedbackToContext()
 *
 * Test Categories:
 *   C. Context Bridge (C1-C11)
 *   S. Stability (S1-S4)
 */

import { describe, it, expect } from 'vitest';
import { createDecisionMemory } from '../decision-memory-factory';
import { createOutcomeMemory } from '../outcome-memory-factory';
import type { DecisionMemory } from '../decision-memory';
import type { OutcomeMemory } from '../outcome-memory';
import type { OutcomeMetric } from '../outcome-memory';
import type { OutcomeRetrievalMetadata } from '../outcome-memory-retrieval';
import { DecisionFeedbackServiceImpl } from '../decision-feedback-service';
import type { DecisionFeedbackBuildOptions } from '../decision-feedback';
import { decisionFeedbackToContext } from '../decision-feedback-bridge';
import { isContextObject } from '@/context/context-utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function createTestDecision(opts: {
  id: string;
  ownerId: string;
  decisionStatus?: 'proposed' | 'active' | 'superseded' | 'reversed';
  projectId?: string | null;
  topicId?: string | null;
  expectedOutcome?: string;
  createdAt?: string;
}): DecisionMemory {
  return createDecisionMemory({
    id: opts.id,
    ownerId: opts.ownerId,
    decision: `Test decision ${opts.id}`,
    decisionStatus: opts.decisionStatus ?? 'active',
    projectId: opts.projectId ?? null,
    topicId: opts.topicId ?? null,
    expectedOutcome: opts.expectedOutcome,
    createdAt: opts.createdAt ?? '2026-09-01T00:00:00Z',
  });
}

function createTestOutcome(opts: {
  id: string;
  ownerId: string;
  observedAt: string;
  decisionId?: string;
  metrics?: OutcomeMetric[];
  projectId?: string | null;
  topicId?: string | null;
  outcomeType?: 'performance' | 'engagement' | 'conversion' | 'feedback' | 'publication' | 'failure' | 'milestone';
}): OutcomeMemory {
  return createOutcomeMemory({
    id: opts.id,
    ownerId: opts.ownerId,
    observedAt: opts.observedAt,
    metrics: opts.metrics ?? [],
    projectId: opts.projectId ?? null,
    topicId: opts.topicId ?? null,
    targetType: 'content',
    targetId: `target-${opts.id}`,
    outcomeType: opts.outcomeType ?? 'engagement',
    attribution: opts.decisionId ? { decisionId: opts.decisionId } : undefined,
  });
}

function createMetadata(opts: {
  truncated?: boolean;
  exhausted?: boolean;
}): OutcomeRetrievalMetadata {
  return {
    scannedRecords: opts.truncated ? 500 : 10,
    batchesFetched: opts.truncated ? 10 : 1,
    truncated: opts.truncated ?? false,
    exhausted: opts.exhausted ?? true,
  };
}

function createBuildOptions(opts?: {
  windowStart?: string;
  windowEnd?: string;
  requestNow?: string;
}): DecisionFeedbackBuildOptions {
  const requestNow = opts?.requestNow ?? '2026-10-03T12:00:00.000Z';
  return {
    windowStart: opts?.windowStart ?? '2026-09-01T00:00:00.000Z',
    windowEnd: opts?.windowEnd ?? '2026-10-03T12:00:00.000Z',
    requestNow,
  };
}

function buildSampleFeedback(
  decisionId = 'dec-1',
  options?: { requestNow?: string; withOutcomes?: boolean },
) {
  const service = new DecisionFeedbackServiceImpl();
  const decision = createTestDecision({
    id: decisionId,
    ownerId: 'user-1',
    expectedOutcome: 'Increase engagement by 20%',
  });

  const outcomes = options?.withOutcomes
    ? [
        createTestOutcome({
          id: 'o1',
          ownerId: 'user-1',
          observedAt: '2026-10-01T00:00:00Z',
          decisionId,
          metrics: [{ key: 'views', value: 100 }, { key: 'likes', value: 50 }],
        }),
        createTestOutcome({
          id: 'o2',
          ownerId: 'user-1',
          observedAt: '2026-10-02T00:00:00Z',
          decisionId,
          metrics: [{ key: 'views', value: 200 }, { key: 'likes', value: 70 }],
        }),
      ]
    : [];

  return service.buildFeedback(
    decision,
    outcomes,
    createMetadata({ exhausted: true }),
    createBuildOptions({ requestNow: options?.requestNow }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// C. Context Bridge
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Context Bridge (decisionFeedbackToContext)', () => {
  // C1: feedback → ContextObject
  it('C1: should convert feedback to a valid ContextObject', () => {
    const feedback = buildSampleFeedback('dec-1', { withOutcomes: true });
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx).toBeDefined();
    expect(isContextObject(ctx)).toBe(true);
  });

  // C2: kind = decision
  it('C2: kind should be decision', () => {
    const feedback = buildSampleFeedback('dec-2');
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx.kind).toBe('decision');
  });

  // C3: type = decision_feedback
  it('C3: type should be decision_feedback (NOT raw decision)', () => {
    const feedback = buildSampleFeedback('dec-3');
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx.type).toBe('decision_feedback');
    expect(ctx.type).not.toBe('decision');
  });

  // C4: decisionId preserved
  it('C4: decisionId should be preserved in payload', () => {
    const feedback = buildSampleFeedback('dec-4', { withOutcomes: true });
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx.payload.decisionId).toBe('dec-4');
  });

  // C5: expectedOutcome preserved
  it('C5: expectedOutcome should be preserved (not interpreted)', () => {
    const feedback = buildSampleFeedback('dec-5');
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx.payload.expectedOutcome).toBe('Increase engagement by 20%');
  });

  // C6: outcomeIds preserved
  it('C6: outcomeIds should match the feedback outcomeIds', () => {
    const feedback = buildSampleFeedback('dec-6', { withOutcomes: true });
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx.payload.outcomeIds).toEqual(feedback.outcomeIds);
    expect(ctx.payload.outcomeCount).toBe(feedback.outcomeCount);
  });

  // C7: metrics preserved
  it('C7: metric aggregations should be preserved with correct values', () => {
    const feedback = buildSampleFeedback('dec-7', { withOutcomes: true });
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx.payload.metricAggregations).toEqual(feedback.metricAggregations);

    // Check specific metric correctness
    const viewsAgg = ctx.payload.metricAggregations.find((m) => m.metricKey === 'views');
    expect(viewsAgg).toBeDefined();
    expect(viewsAgg!.count).toBe(2);
    expect(viewsAgg!.sum).toBe(300);
    expect(viewsAgg!.avg).toBe(150);
  });

  // C8: trends preserved
  it('C8: trends should be preserved (when present)', () => {
    const feedback = buildSampleFeedback('dec-8', { withOutcomes: true });
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx.payload.trends).toEqual(feedback.trends);
  });

  // C9: completeness preserved
  it('C9: completeness status should be preserved', () => {
    const feedbackComplete = buildSampleFeedback('dec-9a');
    const ctxComplete = decisionFeedbackToContext(feedbackComplete);
    expect(ctxComplete.payload.completeness).toBe('complete');

    const service = new DecisionFeedbackServiceImpl();
    const decision = createTestDecision({ id: 'dec-9b', ownerId: 'user-1' });
    const feedbackBounded = service.buildFeedback(
      decision,
      [],
      createMetadata({ truncated: true }),
      createBuildOptions(),
    );
    const ctxBounded = decisionFeedbackToContext(feedbackBounded);
    expect(ctxBounded.payload.completeness).toBe('bounded');
  });

  // C10: confidence preserved
  it('C10: context confidence should reflect evidence completeness (not correctness)', () => {
    // evidence_available + complete → 0.9
    const feedbackEvidence = buildSampleFeedback('dec-10a', { withOutcomes: true });
    const ctxEvidence = decisionFeedbackToContext(feedbackEvidence);
    expect(ctxEvidence.confidence).toBe(0.9);

    // no_evidence + complete → 0.7
    const feedbackNone = buildSampleFeedback('dec-10b');
    const ctxNone = decisionFeedbackToContext(feedbackNone);
    expect(ctxNone.confidence).toBe(0.7);

    // bounded → 0.6
    const service = new DecisionFeedbackServiceImpl();
    const decision = createTestDecision({ id: 'dec-10c', ownerId: 'user-1' });
    const feedbackBounded = service.buildFeedback(
      decision,
      [createTestOutcome({ id: 'ob', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-10c' })],
      createMetadata({ truncated: true }),
      createBuildOptions(),
    );
    const ctxBounded = decisionFeedbackToContext(feedbackBounded);
    expect(ctxBounded.confidence).toBe(0.6);
  });

  // C11: provenance preserved
  it('C11: provenance should indicate decision_feedback source', () => {
    const feedback = buildSampleFeedback('dec-11');
    const ctx = decisionFeedbackToContext(feedback);

    expect(ctx.provenance).toBeDefined();
    expect(ctx.provenance.source).toContain('decision_feedback');
    expect(ctx.provenance.source).toContain('dec-11');
    expect(ctx.provenance.sourceType).toBe('decision_feedback');
    expect(ctx.provenance.ownerId).toBe('user-1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S. Stability
// ═══════════════════════════════════════════════════════════════════════════════

describe('S. Stability', () => {
  const service = new DecisionFeedbackServiceImpl();

  // S1: same decision + same outcomes → same feedback.id
  it('S1: same decision + same outcomes always produces same feedback.id', () => {
    const decision = createTestDecision({ id: 'dec-stable', ownerId: 'user-1' });
    const outcomes = [
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-stable' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-stable' }),
    ];
    const metadata = createMetadata({ exhausted: true });

    const fb1 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-10-01T00:00:00Z' }));
    const fb2 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-10-05T00:00:00Z' }));
    const fb3 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-11-01T00:00:00Z' }));

    expect(fb1.id).toBe('dfb_dec-stable');
    expect(fb2.id).toBe('dfb_dec-stable');
    expect(fb3.id).toBe('dfb_dec-stable');
    expect(fb1.id).toBe(fb2.id);
    expect(fb2.id).toBe(fb3.id);
  });

  // S2: generatedAt may differ but must not affect metrics
  it('S2: different generatedAt does NOT affect metric aggregations', () => {
    const decision = createTestDecision({ id: 'dec-stable-2', ownerId: 'user-1', createdAt: '2026-09-01T00:00:00Z' });
    const outcomes = [
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-stable-2', metrics: [{ key: 'views', value: 100 }] }),
    ];
    const metadata = createMetadata({ exhausted: true });

    const fb1 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-10-01T00:00:00Z' }));
    const fb2 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-10-05T00:00:00Z' }));

    // Timestamps differ
    expect(fb1.generatedAt).not.toBe(fb2.generatedAt);

    // But metrics are identical
    expect(fb1.metricAggregations).toEqual(fb2.metricAggregations);
    expect(fb1.metricAggregations[0]?.sum).toBe(fb2.metricAggregations[0]?.sum);
    expect(fb1.metricAggregations[0]?.avg).toBe(fb2.metricAggregations[0]?.avg);
  });

  // S3: generatedAt must not affect trend
  it('S3: different generatedAt does NOT affect trend calculation', () => {
    const decision = createTestDecision({ id: 'dec-stable-3', ownerId: 'user-1', createdAt: '2026-08-01T00:00:00Z' });
    const outcomes = [
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-09-15T00:00:00Z', decisionId: 'dec-stable-3', metrics: [{ key: 'views', value: 100 }] }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-stable-3', metrics: [{ key: 'views', value: 200 }] }),
    ];
    const metadata = createMetadata({ exhausted: true });

    const fb1 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-10-02T00:00:00Z' }));
    const fb2 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-10-10T00:00:00Z' }));

    // Trends should be identical (window is same, not based on generatedAt)
    expect(fb1.trends).toEqual(fb2.trends);
  });

  // S4: generatedAt must not affect outcomeCount
  it('S4: different generatedAt does NOT affect outcomeCount', () => {
    const decision = createTestDecision({ id: 'dec-stable-4', ownerId: 'user-1' });
    const outcomes = [
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-stable-4' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-stable-4' }),
      createTestOutcome({ id: 'o3', ownerId: 'user-1', observedAt: '2026-10-03T00:00:00Z', decisionId: 'dec-stable-4' }),
    ];
    const metadata = createMetadata({ exhausted: true });

    const fb1 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-10-01T00:00:00Z' }));
    const fb2 = service.buildFeedback(decision, outcomes, metadata, createBuildOptions({ requestNow: '2026-12-31T00:00:00Z' }));

    expect(fb1.outcomeCount).toBe(3);
    expect(fb2.outcomeCount).toBe(3);
    expect(fb1.outcomeCount).toBe(fb2.outcomeCount);
    expect(fb1.outcomeIds).toEqual(fb2.outcomeIds);
  });
});
