/**
 * P0.6.7 — Context Loop Learning Module Tests
 *
 * Tests for Learning Candidate generation from Decision + Feedback evidence.
 */

import { describe, it, expect } from 'vitest';
import { buildLearningCandidates } from '../context-loop-learning';
import type { DecisionMemory } from '@/memory/decision-memory';
import type { DecisionFeedback } from '@/memory/decision-feedback';
import { createDecisionMemoryFixture, TEST_OWNER_A, TEST_PROJECT_A, TEST_TOPIC_A } from './test-helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function createFeedback(overrides: Partial<DecisionFeedback> = {}): DecisionFeedback {
  return {
    id: 'dfb_test_001',
    ownerId: TEST_OWNER_A,
    decisionId: 'dec_test_001',
    decisionStatus: 'active',
    decisionCreatedAt: '2026-10-01T08:00:00.000Z',
    expectedOutcome: 'views > 10000',
    outcomeCount: 1,
    outcomeIds: ['out_001'],
    outcomeTypes: ['engagement'],
    firstObservedAt: '2026-10-02T10:00:00.000Z',
    lastObservedAt: '2026-10-02T10:00:00.000Z',
    windowStart: '2026-10-01T08:00:00.000Z',
    windowEnd: '2026-10-03T08:00:00.000Z',
    metricAggregations: [
      {
        metricKey: 'views',
        unit: 'count',
        count: 1,
        sum: 15000,
        avg: 15000,
        min: 15000,
        max: 15000,
        median: 15000,
        firstValue: 15000,
        lastValue: 15000,
        firstObservedAt: '2026-10-02T10:00:00.000Z',
        lastObservedAt: '2026-10-02T10:00:00.000Z',
      },
    ],
    trends: [
      {
        metricKey: 'views',
        unit: 'count',
        currentValue: 15000,
        previousValue: 8000,
        delta: 7000,
        deltaPercent: 87.5,
        direction: 'up',
      },
    ],
    status: 'evidence_available',
    completeness: 'complete',
    generatedAt: '2026-10-03T08:00:00.000Z',
    ...overrides,
  };
}

function createDecision(overrides: Partial<DecisionMemory> = {}): DecisionMemory {
  return createDecisionMemoryFixture({
    id: 'dec_test_001',
    decision: 'Use storytelling hook for opening',
    ownerId: TEST_OWNER_A,
    projectId: TEST_PROJECT_A,
    topicId: TEST_TOPIC_A,
    confidence: 0.8,
    ...overrides,
  });
}

const NOW = '2026-10-03T12:00:00.000Z';

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0.6.7 — Context Loop Learning', () => {
  // ─── No Outcomes = No Candidates ───────────────────────────────────────────

  describe('no false learning', () => {
    it('should return empty array when outcomeCount is 0', () => {
      const decision = createDecision();
      const feedback = createFeedback({ outcomeCount: 0, outcomeIds: [], outcomeTypes: [], status: 'no_evidence' });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates).toHaveLength(0);
    });

    it('should return empty array when status is no_evidence', () => {
      const decision = createDecision();
      const feedback = createFeedback({
        outcomeCount: 0,
        outcomeIds: [],
        outcomeTypes: [],
        status: 'no_evidence',
        completeness: 'complete',
      });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates).toHaveLength(0);
    });
  });

  // ─── Decision Pattern Candidate ────────────────────────────────────────────

  describe('decision_pattern candidate', () => {
    it('should always generate decision_pattern when outcomes exist', () => {
      const decision = createDecision();
      const feedback = createFeedback();

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      const decisionPatterns = candidates.filter((c) => c.type === 'decision_pattern');
      expect(decisionPatterns).toHaveLength(1);
    });

    it('should have deterministic ID', () => {
      const decision = createDecision();
      const feedback = createFeedback();

      const candidates1 = buildLearningCandidates(decision, feedback, NOW);
      const candidates2 = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates1[0].id).toBe(candidates2[0].id);
      expect(candidates1[0].id).toBe('lc_dec_test_001_decision_pattern');
    });

    it('should include evidence from decision and feedback', () => {
      const decision = createDecision();
      const feedback = createFeedback();

      const candidates = buildLearningCandidates(decision, feedback, NOW);
      const dp = candidates.find((c) => c.type === 'decision_pattern')!;

      expect(dp.evidence.length).toBeGreaterThan(0);
      expect(dp.evidence.some((e) => e.type === 'decision')).toBe(true);
      expect(dp.evidence.some((e) => e.type === 'feedback')).toBe(true);
    });

    it('should have correct source references', () => {
      const decision = createDecision();
      const feedback = createFeedback();

      const candidates = buildLearningCandidates(decision, feedback, NOW);
      const dp = candidates.find((c) => c.type === 'decision_pattern')!;

      expect(dp.sourceDecisionId).toBe('dec_test_001');
      expect(dp.sourceOutcomeIds).toContain('out_001');
      expect(dp.sourceFeedbackId).toBe('dfb_test_001');
    });

    it('should set status to candidate', () => {
      const decision = createDecision();
      const feedback = createFeedback();

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      for (const c of candidates) {
        expect(c.status).toBe('candidate');
      }
    });
  });

  // ─── Successful Pattern ────────────────────────────────────────────────────

  describe('successful_pattern candidate', () => {
    it('should generate when majority of trends are up', () => {
      const decision = createDecision();
      const feedback = createFeedback({
        trends: [
          { metricKey: 'views', direction: 'up', currentValue: 15000, previousValue: 8000, delta: 7000, deltaPercent: 87.5 },
          { metricKey: 'likes', direction: 'up', currentValue: 2000, previousValue: 1000, delta: 1000, deltaPercent: 100 },
          { metricKey: 'shares', direction: 'up', currentValue: 500, previousValue: 300, delta: 200, deltaPercent: 66.7 },
        ],
      });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates.some((c) => c.type === 'successful_pattern')).toBe(true);
    });

    it('should NOT generate when trends are mixed', () => {
      const decision = createDecision();
      const feedback = createFeedback({
        trends: [
          { metricKey: 'views', direction: 'up', currentValue: 15000, previousValue: 8000, delta: 7000, deltaPercent: 87.5 },
          { metricKey: 'likes', direction: 'down', currentValue: 500, previousValue: 1000, delta: -500, deltaPercent: -50 },
          { metricKey: 'shares', direction: 'flat', currentValue: 300, previousValue: 300, delta: 0, deltaPercent: 0 },
        ],
      });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates.some((c) => c.type === 'successful_pattern')).toBe(false);
    });
  });

  // ─── Failure Pattern ───────────────────────────────────────────────────────

  describe('failure_pattern candidate', () => {
    it('should generate when majority of trends are down', () => {
      const decision = createDecision();
      const feedback = createFeedback({
        trends: [
          { metricKey: 'views', direction: 'down', currentValue: 3000, previousValue: 8000, delta: -5000, deltaPercent: -62.5 },
          { metricKey: 'likes', direction: 'down', currentValue: 200, previousValue: 1000, delta: -800, deltaPercent: -80 },
          { metricKey: 'shares', direction: 'down', currentValue: 50, previousValue: 300, delta: -250, deltaPercent: -83.3 },
        ],
      });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates.some((c) => c.type === 'failure_pattern')).toBe(true);
    });

    it('should NOT generate when trends are mixed', () => {
      const decision = createDecision();
      const feedback = createFeedback({
        trends: [
          { metricKey: 'views', direction: 'up', currentValue: 15000, previousValue: 8000, delta: 7000, deltaPercent: 87.5 },
          { metricKey: 'likes', direction: 'down', currentValue: 500, previousValue: 1000, delta: -500, deltaPercent: -50 },
        ],
      });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates.some((c) => c.type === 'failure_pattern')).toBe(false);
    });
  });

  // ─── Strategy Signal ───────────────────────────────────────────────────────

  describe('strategy_signal candidate', () => {
    it('should generate when metric values exceed threshold', () => {
      const decision = createDecision();
      const feedback = createFeedback({
        metricAggregations: [
          {
            metricKey: 'views',
            unit: 'count',
            count: 1,
            sum: 15000,
            avg: 15000,
            min: 15000,
            max: 15000,
            median: 15000,
            firstValue: 15000,
            lastValue: 15000,
          },
        ],
      });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates.some((c) => c.type === 'strategy_signal')).toBe(true);
    });

    it('should NOT generate when all metric values are below threshold', () => {
      const decision = createDecision();
      const feedback = createFeedback({
        metricAggregations: [
          {
            metricKey: 'micro_metric',
            count: 1,
            sum: 50,
            avg: 50,
            min: 50,
            max: 50,
            median: 50,
            firstValue: 50,
            lastValue: 50,
          },
        ],
      });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      expect(candidates.some((c) => c.type === 'strategy_signal')).toBe(false);
    });
  });

  // ─── Confidence Bounding ───────────────────────────────────────────────────

  describe('confidence bounding', () => {
    it('should have confidence <= decision confidence', () => {
      const decision = createDecision({ confidence: 0.5 });
      const feedback = createFeedback({ completeness: 'complete', status: 'evidence_available' });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      for (const c of candidates) {
        expect(c.confidence).toBeLessThanOrEqual(0.5);
      }
    });

    it('should reduce confidence for bounded feedback', () => {
      const decision = createDecision({ confidence: 0.9 });
      const completeFeedback = createFeedback({ completeness: 'complete', status: 'evidence_available' });
      const boundedFeedback = createFeedback({ completeness: 'bounded', status: 'bounded' });

      const candidatesComplete = buildLearningCandidates(decision, completeFeedback, NOW);
      const candidatesBounded = buildLearningCandidates(decision, boundedFeedback, NOW);

      if (candidatesComplete.length > 0 && candidatesBounded.length > 0) {
        const completeConf = candidatesComplete[0].confidence;
        const boundedConf = candidatesBounded[0].confidence;
        expect(boundedConf).toBeLessThanOrEqual(completeConf);
      }
    });

    it('should have minimum confidence floor', () => {
      const decision = createDecision({ confidence: 0.05 });
      const feedback = createFeedback();

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      for (const c of candidates) {
        expect(c.confidence).toBeGreaterThanOrEqual(0.1);
      }
    });
  });

  // ─── Determinism ───────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('should produce same candidates for same input on repeated runs', () => {
      const decision = createDecision();
      const feedback = createFeedback();

      const result1 = buildLearningCandidates(decision, feedback, NOW);
      const result2 = buildLearningCandidates(decision, feedback, NOW);

      expect(result1.length).toBe(result2.length);

      for (let i = 0; i < result1.length; i++) {
        expect(result1[i].id).toBe(result2[i].id);
        expect(result1[i].type).toBe(result2[i].type);
        expect(result1[i].sourceDecisionId).toBe(result2[i].sourceDecisionId);
        expect(result1[i].confidence).toBe(result2[i].confidence);
      }
    });
  });

  // ─── Owner Isolation ───────────────────────────────────────────────────────

  describe('owner isolation', () => {
    it('should set ownerId from decision ownerId', () => {
      const decision = createDecision({ ownerId: 'specific_user_123' });
      const feedback = createFeedback({ ownerId: 'specific_user_123' });

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      for (const c of candidates) {
        expect(c.ownerId).toBe('specific_user_123');
      }
    });

    it('should propagate projectId and topicId', () => {
      const decision = createDecision();
      const feedback = createFeedback();

      const candidates = buildLearningCandidates(decision, feedback, NOW);

      for (const c of candidates) {
        expect(c.projectId).toBe(TEST_PROJECT_A);
        expect(c.topicId).toBe(TEST_TOPIC_A);
      }
    });
  });

  // ─── Multiple Outcomes ────────────────────────────────────────────────────

  describe('multiple outcomes', () => {
    it('should generate decision_pattern with multiple outcome IDs', () => {
      const decision = createDecision();
      const feedback = createFeedback({
        outcomeCount: 3,
        outcomeIds: ['out_001', 'out_002', 'out_003'],
        outcomeTypes: ['engagement', 'performance', 'engagement'],
      });

      const candidates = buildLearningCandidates(decision, feedback, NOW);
      const dp = candidates.find((c) => c.type === 'decision_pattern')!;

      expect(dp.sourceOutcomeIds).toHaveLength(3);
      expect(dp.sourceOutcomeIds).toContain('out_001');
      expect(dp.sourceOutcomeIds).toContain('out_002');
      expect(dp.sourceOutcomeIds).toContain('out_003');
    });
  });
});
