/**
 * P0.6.5.5 — Decision Feedback Core Tests
 *
 * Unit tests for:
 *   - isOutcomeAttributedToDecision()
 *   - retrieveDecisionOutcomes()
 *   - determineDecisionFeedbackCompleteness()
 *   - determineDecisionFeedbackStatus()
 *   - feedbackConfidence()
 *
 * Test Categories (from spec):
 *   A. Attribution
 *   B. Feedback Status
 *   C. Owner / Scope
 *   D. Expected Outcome
 *   E. Metrics
 *   F. Trend
 *   G. Decision Status
 *   H. Integration
 */

import { describe, it, expect } from 'vitest';
import { createOutcomeMemory } from '../outcome-memory-factory';
import type { OutcomeMemory } from '../outcome-memory';
import type { OutcomeMetric } from '../outcome-memory';
import { InMemoryRetriever } from '../memory-retriever';
import {
  isOutcomeAttributedToDecision,
  retrieveDecisionOutcomes,
  determineDecisionFeedbackCompleteness,
  determineDecisionFeedbackStatus,
  feedbackConfidence,
} from '../decision-feedback';
import type { OutcomeRetrievalMetadata } from '../outcome-memory-retrieval';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function createTestOutcome(opts: {
  id: string;
  ownerId: string;
  observedAt: string;
  decisionId?: string;
  metrics?: OutcomeMetric[];
  projectId?: string | null;
  topicId?: string | null;
  targetType?: 'content' | 'draft' | 'topic' | 'decision' | 'project';
  targetId?: string;
  outcomeType?: 'performance' | 'engagement' | 'conversion' | 'feedback' | 'publication' | 'failure' | 'milestone';
}): OutcomeMemory {
  return createOutcomeMemory({
    id: opts.id,
    ownerId: opts.ownerId,
    observedAt: opts.observedAt,
    metrics: opts.metrics ?? [],
    projectId: opts.projectId ?? null,
    topicId: opts.topicId ?? null,
    targetType: opts.targetType ?? 'content',
    targetId: opts.targetId ?? `target-${opts.id}`,
    outcomeType: opts.outcomeType ?? 'engagement',
    attribution: opts.decisionId ? { decisionId: opts.decisionId } : undefined,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Attribution
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Attribution', () => {
  it('A1: should match when attribution.decisionId equals decisionId', () => {
    const outcome = createTestOutcome({
      id: 'o1',
      ownerId: 'user-1',
      observedAt: '2026-10-01T00:00:00Z',
      decisionId: 'dec-1',
    });

    expect(isOutcomeAttributedToDecision(outcome, 'dec-1')).toBe(true);
  });

  it('A2: should NOT match when attribution is absent', () => {
    const outcome = createTestOutcome({
      id: 'o2',
      ownerId: 'user-1',
      observedAt: '2026-10-01T00:00:00Z',
      // No decisionId
    });

    expect(isOutcomeAttributedToDecision(outcome, 'dec-1')).toBe(false);
  });

  it('A3: should NOT match when attribution.decisionId is different', () => {
    const outcome = createTestOutcome({
      id: 'o3',
      ownerId: 'user-1',
      observedAt: '2026-10-01T00:00:00Z',
      decisionId: 'dec-2',
    });

    expect(isOutcomeAttributedToDecision(outcome, 'dec-1')).toBe(false);
  });

  it('A4: should ONLY check attribution, not owner', () => {
    // Outcome has decisionId match but different owner
    // Attribution match is independent of owner (isolation is checked elsewhere)
    const outcome = createTestOutcome({
      id: 'o4',
      ownerId: 'other-user',
      observedAt: '2026-10-01T00:00:00Z',
      decisionId: 'dec-1',
    });

    // Attribution alone should match
    expect(isOutcomeAttributedToDecision(outcome, 'dec-1')).toBe(true);
  });

  it('A5: should handle multiple outcomes correctly', () => {
    const outcomes = [
      createTestOutcome({ id: 'o5a', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o5b', ownerId: 'user-1', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o5c', ownerId: 'user-1', observedAt: '2026-10-03T00:00:00Z', decisionId: 'dec-2' }),
    ];

    const matched = outcomes.filter(o => isOutcomeAttributedToDecision(o, 'dec-1'));
    expect(matched).toHaveLength(2);
    expect(matched.map(o => o.id)).toEqual(['o5a', 'o5b']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Feedback Status
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Feedback Status', () => {
  it('B1: no_evidence + complete', () => {
    const status = determineDecisionFeedbackStatus(0, 'complete');
    expect(status).toBe('no_evidence');
  });

  it('B2: no_evidence + bounded', () => {
    const status = determineDecisionFeedbackStatus(0, 'bounded');
    expect(status).toBe('no_evidence');
  });

  it('B3: evidence_available (count > 0 + complete)', () => {
    const status = determineDecisionFeedbackStatus(5, 'complete');
    expect(status).toBe('evidence_available');
  });

  it('B4: bounded (count > 0 + bounded)', () => {
    const status = determineDecisionFeedbackStatus(3, 'bounded');
    expect(status).toBe('bounded');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Owner / Scope (via retrieveDecisionOutcomes filtering)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Owner / Scope', () => {
  it('C1: outcomes from different owner are excluded by retriever', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-2', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o1');
  });

  it('C2: outcomes from different project are excluded by retriever scope', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-2' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      projectId: 'proj-1',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o1');
  });

  it('C3: outcomes from different topic are excluded by retriever scope', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1', topicId: 'topic-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1', topicId: 'topic-2' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      projectId: 'proj-1',
      topicId: 'topic-1',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o1');
  });

  it('C4: matching project/topic outcomes are included', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1', topicId: 'topic-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      projectId: 'proj-1',
      topicId: 'topic-1',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o1');
  });

  it('C5: combined isolation (owner + project + topic)', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      // Match: same owner, project, topic, and decisionId
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1', topicId: 'topic-1' }),
      // Wrong owner
      createTestOutcome({ id: 'o2', ownerId: 'user-2', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1', topicId: 'topic-1' }),
      // Wrong project
      createTestOutcome({ id: 'o3', ownerId: 'user-1', observedAt: '2026-10-03T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-2', topicId: 'topic-1' }),
      // Wrong topic
      createTestOutcome({ id: 'o4', ownerId: 'user-1', observedAt: '2026-10-04T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1', topicId: 'topic-2' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      projectId: 'proj-1',
      topicId: 'topic-1',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Expected Outcome — preserved, not interpreted
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Expected Outcome (preserved not interpreted)', () => {
  it('D1: completeness = bounded when metadata.truncated = true', () => {
    const metadata: OutcomeRetrievalMetadata = {
      scannedRecords: 500,
      batchesFetched: 10,
      truncated: true,
      exhausted: false,
    };
    expect(determineDecisionFeedbackCompleteness(metadata)).toBe('bounded');
  });

  it('D2: completeness = complete when metadata.exhausted = true', () => {
    const metadata: OutcomeRetrievalMetadata = {
      scannedRecords: 30,
      batchesFetched: 1,
      truncated: false,
      exhausted: true,
    };
    expect(determineDecisionFeedbackCompleteness(metadata)).toBe('complete');
  });

  it('D3: completeness defaults to bounded when neither flag is set', () => {
    const metadata: OutcomeRetrievalMetadata = {
      scannedRecords: 0,
      batchesFetched: 0,
      truncated: false,
      exhausted: false,
    };
    // Safety fallback
    expect(determineDecisionFeedbackCompleteness(metadata)).toBe('bounded');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Feedback Confidence
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Feedback Confidence', () => {
  it('E1: evidence_available + complete → 0.9', () => {
    expect(feedbackConfidence('evidence_available', 'complete')).toBe(0.9);
  });

  it('E2: no_evidence + complete → 0.7', () => {
    expect(feedbackConfidence('no_evidence', 'complete')).toBe(0.7);
  });

  it('E3: bounded → 0.6 (regardless of count)', () => {
    expect(feedbackConfidence('bounded', 'complete')).toBe(0.6);
    expect(feedbackConfidence('bounded', 'bounded')).toBe(0.6);
  });

  it('E4: no_evidence + bounded → 0.4', () => {
    expect(feedbackConfidence('no_evidence', 'bounded')).toBe(0.4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. retrieveDecisionOutcomes Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. retrieveDecisionOutcomes Integration', () => {
  it('F1: CRITICAL — only attributed outcomes are counted', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o3', ownerId: 'user-1', observedAt: '2026-10-03T00:00:00Z', decisionId: 'dec-2' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
    });

    // MUST be 2, not 3 (order depends on retriever sort — use arrayContaining)
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.map(o => o.id)).toEqual(expect.arrayContaining(['o1', 'o2']));
  });

  it('F2: returns metadata from the retrieval pipeline', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
    });

    expect(result.metadata).toBeDefined();
    expect(result.metadata.scannedRecords).toBeGreaterThanOrEqual(1);
  });

  it('F3: empty array when no outcomes match', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-2' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
    });

    expect(result.outcomes).toHaveLength(0);
  });
});
