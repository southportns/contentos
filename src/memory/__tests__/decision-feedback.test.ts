/**
 * P0.6.5.5 — Decision Feedback Core Tests
 *
 * Unit tests for:
 *   - isOutcomeAttributedToDecision()
 *   - resolveDecisionFeedbackWindow()
 *   - retrieveDecisionOutcomes()
 *   - determineDecisionFeedbackCompleteness()
 *   - determineDecisionFeedbackStatus()
 *   - feedbackConfidence()
 *
 * Test Categories:
 *   A. Attribution
 *   B. Feedback Status
 *   C. Owner / Scope
 *   D. Completeness
 *   E. Feedback Confidence
 *   F. resolveDecisionFeedbackWindow (P0.6.5.5-R1)
 *   G. Time Window Filtering (P0.6.5.5-R1)
 *   H. retrieveDecisionOutcomes Integration
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
  resolveDecisionFeedbackWindow,
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
    const outcome = createTestOutcome({
      id: 'o4',
      ownerId: 'other-user',
      observedAt: '2026-10-01T00:00:00Z',
      decisionId: 'dec-1',
    });

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
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-10-01T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1', topicId: 'topic-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-2', observedAt: '2026-10-02T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-1', topicId: 'topic-1' }),
      createTestOutcome({ id: 'o3', ownerId: 'user-1', observedAt: '2026-10-03T00:00:00Z', decisionId: 'dec-1', projectId: 'proj-2', topicId: 'topic-1' }),
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
// D. Completeness
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Completeness', () => {
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
// F. resolveDecisionFeedbackWindow (P0.6.5.5-R1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. resolveDecisionFeedbackWindow', () => {
  const DECISION_CREATED_AT = '2026-09-01T00:00:00.000Z';
  const NOW = '2026-10-03T12:00:00.000Z';

  // W1: explicit windowStart only → [provided, now]
  it('W1: windowStart only → [provided, now]', () => {
    const ws = '2026-09-15T00:00:00.000Z';
    const result = resolveDecisionFeedbackWindow(DECISION_CREATED_AT, {
      windowStart: ws,
      now: NOW,
    });
    expect(result.windowStart).toBe(ws);
    expect(result.windowEnd).toBe(NOW);
  });

  // W2: explicit windowEnd only → [decisionCreatedAt, provided]
  it('W2: windowEnd only → [decisionCreatedAt, provided]', () => {
    const we = '2026-09-20T00:00:00.000Z';
    const result = resolveDecisionFeedbackWindow(DECISION_CREATED_AT, {
      windowEnd: we,
      now: NOW,
    });
    expect(result.windowStart).toBe(DECISION_CREATED_AT);
    expect(result.windowEnd).toBe(we);
  });

  // W3: both explicit → use both
  it('W3: both explicit → [providedStart, providedEnd]', () => {
    const ws = '2026-09-10T00:00:00.000Z';
    const we = '2026-09-25T00:00:00.000Z';
    const result = resolveDecisionFeedbackWindow(DECISION_CREATED_AT, {
      windowStart: ws,
      windowEnd: we,
      now: NOW,
    });
    expect(result.windowStart).toBe(ws);
    expect(result.windowEnd).toBe(we);
  });

  // W4: no explicit → [decisionCreatedAt, now]
  it('W4: no explicit → [decisionCreatedAt, now]', () => {
    const result = resolveDecisionFeedbackWindow(DECISION_CREATED_AT, {
      now: NOW,
    });
    expect(result.windowStart).toBe(DECISION_CREATED_AT);
    expect(result.windowEnd).toBe(NOW);
  });

  // W5: windowStart >= windowEnd → throws error
  it('W5: windowStart >= windowEnd → throws', () => {
    expect(() => {
      resolveDecisionFeedbackWindow(DECISION_CREATED_AT, {
        windowStart: '2026-10-01T00:00:00.000Z',
        windowEnd: '2026-09-01T00:00:00.000Z',
        now: NOW,
      });
    }).toThrow(/windowStart.*must be strictly less than.*windowEnd/);
  });

  // Invalid ISO date
  it('F1: invalid windowStart throws', () => {
    expect(() => {
      resolveDecisionFeedbackWindow(DECISION_CREATED_AT, {
        windowStart: 'not-a-date',
        now: NOW,
      });
    }).toThrow(/Invalid windowStart/);
  });

  it('F2: invalid windowEnd throws', () => {
    expect(() => {
      resolveDecisionFeedbackWindow(DECISION_CREATED_AT, {
        windowEnd: 'not-a-date',
        now: NOW,
      });
    }).toThrow(/Invalid windowEnd/);
  });

  // Equal timestamps also throw
  it('F3: windowStart === windowEnd throws', () => {
    const ts = '2026-09-15T00:00:00.000Z';
    expect(() => {
      resolveDecisionFeedbackWindow(DECISION_CREATED_AT, {
        windowStart: ts,
        windowEnd: ts,
        now: NOW,
      });
    }).toThrow(/windowStart.*must be strictly less than.*windowEnd/);
  });

  // Backwards compatibility: no options provided → uses default now
  it('F4: no options provided → [decisionCreatedAt, current time]', () => {
    const before = new Date().toISOString();
    const result = resolveDecisionFeedbackWindow(DECISION_CREATED_AT);
    const after = new Date().toISOString();
    expect(result.windowStart).toBe(DECISION_CREATED_AT);
    expect(result.windowEnd >= before).toBe(true);
    expect(result.windowEnd <= after).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Time Window Filtering (P0.6.5.5-R1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Time Window Filtering on retrieveDecisionOutcomes', () => {
  // W6: outcome before windowStart is excluded
  it('W6: outcome before windowStart excluded', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-09-14T23:59:59.999Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-09-15T00:00:00.000Z', decisionId: 'dec-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      windowStart: '2026-09-15T00:00:00.000Z',
      windowEnd: '2026-09-20T00:00:00.000Z',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o2');
  });

  // W7: outcome exactly at windowStart is included (>=)
  it('W7: outcome exactly at windowStart included', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-09-15T00:00:00.000Z', decisionId: 'dec-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      windowStart: '2026-09-15T00:00:00.000Z',
      windowEnd: '2026-09-20T00:00:00.000Z',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o1');
  });

  // W8: outcome exactly at windowEnd is excluded (<)
  it('W8: outcome exactly at windowEnd excluded', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-09-19T23:59:59.999Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-09-20T00:00:00.000Z', decisionId: 'dec-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      windowStart: '2026-09-15T00:00:00.000Z',
      windowEnd: '2026-09-20T00:00:00.000Z',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o1');
  });

  // W9: only windowStart provided (no windowEnd) → no end filter
  it('G1: only windowStart filters on start', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-09-14T00:00:00Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-09-16T00:00:00Z', decisionId: 'dec-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      windowStart: '2026-09-15T00:00:00Z',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o2');
  });

  // W10: only windowEnd provided (no windowStart) → no start filter
  it('G2: only windowEnd filters on end', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-09-14T00:00:00Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-09-16T00:00:00Z', decisionId: 'dec-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      windowEnd: '2026-09-15T00:00:00Z',
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].id).toBe('o1');
  });

  // G3: no window → no time filtering
  it('G3: no window params → all attributed outcomes returned', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestOutcome({ id: 'o1', ownerId: 'user-1', observedAt: '2026-09-14T00:00:00Z', decisionId: 'dec-1' }),
      createTestOutcome({ id: 'o2', ownerId: 'user-1', observedAt: '2026-09-16T00:00:00Z', decisionId: 'dec-1' }),
    ]);

    const result = await retrieveDecisionOutcomes(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
    });

    expect(result.outcomes).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. retrieveDecisionOutcomes Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. retrieveDecisionOutcomes Integration', () => {
  it('H1: CRITICAL — only attributed outcomes are counted', async () => {
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

    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.map(o => o.id)).toEqual(expect.arrayContaining(['o1', 'o2']));
  });

  it('H2: returns metadata from the retrieval pipeline', async () => {
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

  it('H3: empty array when no outcomes match', async () => {
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
