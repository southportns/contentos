/**
 * P0.6.5.5 — Decision Feedback Core Types & Functions
 *
 * Establishes the first version of the Decision Feedback Layer.
 *
 * Mission:
 *   Connect Decisions to their attributed Outcome evidence,
 *   providing objective, replayable feedback WITHOUT causal claims.
 *
 * Architecture Position:
 *
 *   DecisionMemory (source fact)
 *       ↓
 *   Decision Feedback Entry (buildDecisionFeedback)
 *       ↓
 *   Outcome Retrieval (retrieveDecisionOutcomes)
 *       ↓
 *   attribution.decisionId filter
 *       ↓
 *   Outcome Aggregation (reused)
 *       ↓
 *   DecisionFeedback (derived, NOT persisted)
 *
 * Design Principles:
 *   1. DecisionFeedback IS derived — recomputable, no persistence
 *   2. Attribution.decisionId is the SOLE linkage source (no guessing)
 *   3. No LLM, no AI judgment, no auto-learning
 *   4. No modification of Decision or Outcome
 *   5. Completeness is HONEST — uses OutcomeRetrievalMetadata
 *   6. Owner / Project / Topic isolation at every layer
 *
 * Non-goals:
 *   - No causal inference
 *   - No decision success/failure classification
 *   - No automatic decision modification
 *   - No persistence of feedback
 *   - No second Outcome data system
 *
 * IMPORTANT — No Causal Claim:
 *   Decision → Outcome attribution establishes explicit record linkage.
 *   It does NOT establish causal inference.
 */

import type { MemoryRetriever } from './memory-retriever';
import type { DecisionMemory } from './decision-memory';
import type { DecisionStatus } from './memory-types';
import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeType } from './outcome-memory';
import type {
  OutcomeMetricAggregation,
  OutcomeMetricTrend,
} from './outcome-aggregation';
import type {
  OutcomeRetrievalMetadata,
  OutcomeRetrievalResult,
} from './outcome-memory-retrieval';
import { retrieveOutcomeMemoriesWithMetadata } from './outcome-memory-retrieval';
import type { OutcomeRetrievalParams } from './outcome-memory-retrieval';

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Feedback Status
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Status of decision feedback evidence.
 *
 * - no_evidence:        No Outcomes found linked to this Decision
 * - evidence_available: At least one Outcome found AND retrieval is complete
 * - bounded:            Partial Outcomes found, retrieval hit safety bound
 *
 * IMPORTANT:
 *   evidence_available does NOT mean decision_success.
 *   bounded does NOT mean decision_failure.
 *   These statuses indicate evidence availability only.
 */
export type DecisionFeedbackStatus =
  | 'no_evidence'
  | 'evidence_available'
  | 'bounded';

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Feedback Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DecisionFeedback — derived view of Outcome evidence for a Decision.
 *
 * This is a RECOMPUTABLE result, NOT a persisted entity.
 * Every field can be recomputed from Decision + Outcome source facts.
 *
 * Design: This interface carries objective observations only.
 * It does NOT judge whether the Decision was correct or successful.
 */
export interface DecisionFeedback {
  /** Unique ID for this feedback instance (generated) */
  id: string;

  /** Owner (user) ID */
  ownerId: string;

  /** The Decision ID this feedback is for */
  decisionId: string;

  /** Current lifecycle status of the Decision */
  decisionStatus: DecisionStatus;

  /** When the Decision was created (ISO 8601) */
  decisionCreatedAt: string;

  /** What outcome was expected (carried from Decision, NOT interpreted) */
  expectedOutcome?: string;

  /** Number of Outcome observations attributed to this Decision */
  outcomeCount: number;

  /** IDs of attributed Outcomes */
  outcomeIds: string[];

  /** Types of attributed Outcomes */
  outcomeTypes: OutcomeType[];

  /** Earliest observedAt among attributed Outcomes */
  firstObservedAt?: string;

  /** Latest observedAt among attributed Outcomes */
  lastObservedAt?: string;

  /** Per-metric aggregated statistics */
  metricAggregations: OutcomeMetricAggregation[];

  /** Per-metric trend analysis (current vs previous window) */
  trends: OutcomeMetricTrend[];

  /** Evidence status */
  status: DecisionFeedbackStatus;

  /** Completeness of evidence retrieval */
  completeness: 'complete' | 'bounded';

  /** When this feedback was generated (ISO 8601) — NOT used in computation */
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feedback Params
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters for generating Decision Feedback.
 *
 * Rules:
 * - If windowStart/windowEnd NOT provided: uses [decision.createdAt, now]
 * - If both provided: uses explicit window
 * - windowStart must be < windowEnd
 */
export interface DecisionFeedbackParams {
  /** Owner (user) ID — mandatory for isolation */
  ownerId: string;

  /** The Decision ID to build feedback for */
  decisionId: string;

  /**
   * Time window start (inclusive) — ISO 8601.
   * Defaults to decision.createdAt if not provided.
   */
  windowStart?: string;

  /**
   * Time window end (exclusive) — ISO 8601.
   * Defaults to current time if not provided.
   */
  windowEnd?: string;

  /**
   * Maximum number of outcome records to retrieve.
   * Clamped to safety bound (500).
   */
  retrievalLimit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Outcome Retrieval Params
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters for retrieving Outcomes attributed to a Decision.
 *
 * Extends OutcomeRetrievalParams with decisionId.
 * The decisionId filtering happens at application level (payload JSON),
 * NOT at database level.
 */
export interface DecisionOutcomeRetrievalParams {
  /** Owner (user) ID — mandatory for isolation */
  ownerId: string;

  /** The Decision ID to retrieve outcomes for */
  decisionId: string;

  /** Project ID filter (optional) */
  projectId?: string;

  /** Topic ID filter (optional) */
  topicId?: string;

  /** Filter by outcome type (optional) */
  outcomeType?: OutcomeType;

  /** Maximum number of results (default: 50, max: 500) */
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Attribution Matching — Pure Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if an Outcome is attributed to a specific Decision.
 *
 * Matching condition:
 *   outcome.payload.attribution?.decisionId === decisionId
 *
 * This is the SOLE attribution mechanism. We do NOT use:
 * - targetId matching
 * - summary text similarity
 * - source matching
 * - any heuristic guessing
 *
 * Only explicit attribution.decisionId establishes the link.
 *
 * @param outcome - The Outcome Memory to check
 * @param decisionId - The Decision ID to match against
 * @return True if the Outcome is explicitly attributed to the Decision
 */
export function isOutcomeAttributedToDecision(
  outcome: OutcomeMemory,
  decisionId: string,
): boolean {
  return outcome.payload.attribution?.decisionId === decisionId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Retrieval for Decision
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieve Outcomes attributed to a specific Decision.
 *
 * Architecture:
 *   retrieveOutcomeMemoriesWithMetadata()
 *       ↓
 *   owner/project/topic/type filtering (DB + app level)
 *       ↓
 *   application-level attribution.decisionId filtering
 *       ↓
 *   OutcomeRetrievalMetadata
 *
 * IMPORTANT:
 *   attribution.decisionId lives in payload JSON, so it cannot be
 *   filtered at the DB level. We retrieve via the standard outcome
 *   retrieval pipeline and filter at the application level.
 *
 * @param retriever - MemoryRetriever implementation
 * @param params - Retrieval parameters including decisionId
 * @return OutcomeRetrievalResult with attributed outcomes and metadata
 */
export async function retrieveDecisionOutcomes(
  retriever: MemoryRetriever,
  params: DecisionOutcomeRetrievalParams,
): Promise<OutcomeRetrievalResult> {
  const retrievalParams: OutcomeRetrievalParams = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    outcomeType: params.outcomeType,
    limit: params.limit ?? 50,
  };

  // Step 1: Retrieve outcomes using the standard pipeline
  const result = await retrieveOutcomeMemoriesWithMetadata(retriever, retrievalParams);

  // Step 2: Filter at application level by attribution.decisionId
  const attributedOutcomes = result.outcomes.filter((outcome) =>
    isOutcomeAttributedToDecision(outcome, params.decisionId)
  );

  return {
    outcomes: attributedOutcomes,
    metadata: result.metadata,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Completeness Determination
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the completeness of Decision Feedback based on retrieval metadata.
 *
 * Rules (strictly follows OutcomeRetrievalMetadata):
 * - metadata.truncated === true  → completeness = 'bounded'
 * - metadata.exhausted === true  → completeness = 'complete'
 *
 * When both are false (shouldn't happen with correct retriever impl),
 * defaults to 'bounded' (safe — can't prove completeness).
 *
 * @param metadata - The OutcomeRetrievalMetadata from the retrieval operation
 * @return 'complete' or 'bounded'
 */
export function determineDecisionFeedbackCompleteness(
  metadata: OutcomeRetrievalMetadata,
): 'complete' | 'bounded' {
  if (metadata.truncated) {
    return 'bounded';
  }
  if (metadata.exhausted) {
    return 'complete';
  }
  // Safety fallback: if neither flag is set, assume bounded
  return 'bounded';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feedback Status Determination
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the Decision Feedback status based on outcome count and completeness.
 *
 * Rules:
 * - outcomeCount === 0:
 *     - completeness === 'complete' → status = 'no_evidence' (confirmed no data)
 *     - completeness === 'bounded'  → status = 'no_evidence' (may exist but not found)
 * - outcomeCount > 0 AND completeness === 'complete' → status = 'evidence_available'
 * - outcomeCount > 0 AND completeness === 'bounded'  → status = 'bounded'
 *
 * IMPORTANT:
 *   When outcomeCount === 0, completeness still reflects retrieval state:
 *   - Case A: DB has no relevant outcomes → status=no_evidence, completeness=complete
 *   - Case B: Only scanned partial data → status=no_evidence, completeness=bounded
 *
 * @param outcomeCount - Number of attributed outcomes
 * @param completeness - Retrieval completeness
 * @return The feedback status
 */
export function determineDecisionFeedbackStatus(
  outcomeCount: number,
  completeness: 'complete' | 'bounded',
): DecisionFeedbackStatus {
  if (outcomeCount === 0) {
    // Regardless of completeness, no evidence was found
    return 'no_evidence';
  }

  // outcomeCount > 0
  if (completeness === 'bounded') {
    return 'bounded';
  }

  return 'evidence_available';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Confidence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map feedback status + completeness to a confidence score for Context Assembly.
 *
 * Confidence represents EVIDENCE COMPLETENESS, NOT decision correctness.
 *
 * Mapping:
 *   evidence_available + complete  → 0.9
 *   no_evidence + complete         → 0.7
 *   bounded                        → 0.6 (regardless of outcomeCount)
 *   no_evidence + bounded          → 0.4
 *
 * @param status - The feedback status
 * @param completeness - The retrieval completeness
 * @return Confidence score (0.0 - 1.0)
 */
export function feedbackConfidence(
  status: DecisionFeedbackStatus,
  completeness: 'complete' | 'bounded',
): number {
  if (status === 'evidence_available' && completeness === 'complete') {
    return 0.9;
  }
  if (status === 'no_evidence' && completeness === 'complete') {
    return 0.7;
  }
  if (status === 'bounded') {
    return 0.6;
  }
  // no_evidence + bounded
  return 0.4;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  OutcomeMetricAggregation,
  OutcomeMetricTrend,
  OutcomeRetrievalMetadata,
  OutcomeRetrievalResult,
} from './outcome-memory-retrieval';
