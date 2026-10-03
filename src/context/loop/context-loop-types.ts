/**
 * P0.6.7 — Context Loop Types
 *
 * Defines the End-to-End Context Loop types that orchestrate the full
 * Decision → Outcome → Feedback → Graph → Assembly → Learning pipeline.
 *
 * Architecture Position:
 *
 *   ContextLoopRequest
 *       ↓
 *   runContextLoop()
 *       ↓
 *   Decision → Outcome → Feedback → Graph → Assembly → Learning
 *       ↓
 *   ContextLoopResult
 *
 * Design Principles:
 *   1. Loop is orchestration — does NOT re-implement subsystems
 *   2. All IDs are deterministic (no UUID, no randomness)
 *   3. Stage tracking — every pipeline step is observable
 *   4. Non-fatal degradation — partial loop > crashed loop
 *   5. Owner / Project / Topic isolation at every stage
 *   6. Learning Candidates are evidence-derived, not LLM-inferred
 *   7. Learning Candidates do NOT auto-modify Knowledge
 *
 * Non-goals:
 *   - Not a new database layer
 *   - Not an LLM agent
 *   - Not a Knowledge mutation system
 *   - Not a Causal inference engine
 */

import type { ContextObject } from '../context-object';
import type { ContextAssemblyResult } from '../assembly/types';
import type { ContextGraph, ContextGraphEdgeType } from '../graph/context-graph-types';
import type { DecisionFeedback } from '@/memory/decision-feedback';
import type { MemoryRecord } from '@/memory/memory-record';
import type { MemoryRetriever } from '@/memory/memory-retriever';
import type { DecisionFeedbackService } from '@/memory/decision-feedback-service';

// ═══════════════════════════════════════════════════════════════════════════════
// Context Loop Request
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request to execute a complete Context Loop for a specific Decision.
 *
 * The Loop will:
 * 1. Retrieve the Decision by ID
 * 2. Build Decision Feedback (outcomes, aggregations, trends)
 * 3. (Optional) Traverse the Context Graph for related contexts
 * 4. Assemble Context from all sources through the standard pipeline
 * 5. Generate Learning Candidates from evidence
 */
export interface ContextLoopRequest {
  /** Owner (user) ID — mandatory for isolation */
  ownerId: string;

  /** The Decision ID to build the loop around */
  decisionId: string;

  /** Project ID filter (optional, for memory retrieval scope) */
  projectId?: string;

  /** Topic ID filter (optional, for memory retrieval scope) */
  topicId?: string;

  /**
   * Time window start (inclusive) — ISO 8601.
   * Passed to Decision Feedback for outcome retrieval.
   * Defaults to decision.createdAt if not provided.
   */
  windowStart?: string;

  /**
   * Time window end (exclusive) — ISO 8601.
   * Passed to Decision Feedback for outcome retrieval.
   * Defaults to current time if not provided.
   */
  windowEnd?: string;

  /**
   * Optional pre-built Context Graph for relationship traversal.
   * If not provided, graphContext will be empty but Loop still completes.
   */
  graph?: ContextGraph;

  /** Maximum number of memory records to retrieve (default: 50) */
  retrievalLimit?: number;

  /** Maximum graph traversal depth (default: 2, max: 10) */
  graphDepth?: number;

  /**
   * Graph traversal direction from the decision node.
   * - 'incoming': what led to this decision
   * - 'outgoing': what this decision led to
   * - 'both': both directions
   * Default: 'both'
   */
  graphDirection?: 'incoming' | 'outgoing' | 'both';

  /**
   * Filter graph traversal to specific edge types.
   * If not provided, all edge types are traversed.
   */
  graphEdgeTypes?: ContextGraphEdgeType[];

  /**
   * Purpose for Context Assembly.
   * Default: 'generic'
   */
  assemblyPurpose?: 'generic' | 'strategy' | 'writing' | 'evaluation';

  /**
   * Optional token budget for Context Assembly.
   * If not provided, uses default budget.
   */
  maxTokens?: number;

  /**
   * Optional context count limit for Context Assembly.
   * If not provided, uses default limit.
   */
  maxContexts?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Loop Result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of executing a complete Context Loop.
 *
 * Contains:
 * - Whether the Decision was found
 * - The Decision Feedback (if any)
 * - Graph-retrieved ContextObjects
 * - Assembled Context Result
 * - Learning Candidates
 * - Completeness status
 * - Stage-by-stage status
 * - Metrics and warnings
 */
export interface ContextLoopResult {
  /** Deterministic loop ID: loop_${decisionId} */
  loopId: string;

  /** The Decision ID this loop was run for */
  decisionId: string;

  /** Whether the Decision was found for the owner */
  decisionFound: boolean;

  /**
   * The Decision Feedback (derived evidence).
   * null if Decision not found or no outcomes attributed.
   */
  feedback: DecisionFeedback | null;

  /**
   * ContextObjects retrieved from graph traversal.
   * Empty array if no graph provided or no related contexts found.
   */
  graphContext: ContextObject[];

  /**
   * The assembled context result (from Context Assembly pipeline).
   * undefined if assembly was not performed (e.g., no contexts available).
   */
  assembledContext?: ContextAssemblyResult;

  /**
   * Learning Candidates derived from Decision + Outcome + Feedback evidence.
   * Empty array if no outcomes available (no false learning).
   */
  learningCandidates: LearningCandidate[];

  /** Overall completeness status of the loop */
  completeness: ContextLoopCompleteness;

  /** Per-stage completion status */
  stageStatus: ContextLoopStageStatus;

  /** Warnings encountered during execution (non-fatal) */
  warnings: string[];

  /** Performance metrics (for observability) */
  metrics: ContextLoopMetrics;

  /** When this loop result was generated (ISO 8601) — execution metadata only */
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loop Completeness
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Overall completeness status of the Context Loop.
 *
 * Represents the furthest stage the loop successfully reached.
 */
export type ContextLoopCompleteness =
  | 'no_decision'
  | 'no_outcome'
  | 'outcome_available'
  | 'feedback_available'
  | 'graph_available'
  | 'assembled'
  | 'learned';

// ═══════════════════════════════════════════════════════════════════════════════
// Stage Status
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Per-stage completion status.
 *
 * Each boolean indicates whether that pipeline stage produced meaningful output.
 */
export interface ContextLoopStageStatus {
  /** Decision was found for the owner */
  decision: boolean;

  /** At least one outcome was attributed to the Decision */
  outcome: boolean;

  /** Decision Feedback was built */
  feedback: boolean;

  /** Graph traversal produced related contexts */
  graph: boolean;

  /** Context Assembly completed (may have empty selection) */
  assembly: boolean;

  /** At least one Learning Candidate was generated */
  learning: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Learning Candidate
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of Learning Candidates that can be derived from evidence.
 *
 * - decision_pattern: Pattern observed in how decisions are made
 * - successful_pattern: Observed pattern based on positive outcomes
 * - failure_pattern: Observed pattern based on negative outcomes
 * - preference_signal: User preference inferred from repeated decisions
 * - strategy_signal: Strategy effectiveness signal from outcomes
 */
export type LearningCandidateType =
  | 'decision_pattern'
  | 'successful_pattern'
  | 'failure_pattern'
  | 'preference_signal'
  | 'strategy_signal';

/**
 * A structured learning candidate derived from Decision + Outcome + Feedback.
 *
 * IMPORTANT: Candidate ≠ Learned Truth.
 * Candidates are evidence-based hypotheses that require further validation
 * before becoming part of the Knowledge Layer.
 */
export interface LearningCandidate {
  /** Deterministic ID: lc_${decisionId}_${type} */
  id: string;

  /** Type of learning candidate */
  type: LearningCandidateType;

  /** Owner (user) ID */
  ownerId: string;

  /** Project ID (optional, from decision context) */
  projectId?: string;

  /** Topic ID (optional, from decision context) */
  topicId?: string;

  /** The Decision ID this candidate was derived from */
  sourceDecisionId: string;

  /** IDs of Outcomes that contributed to this candidate */
  sourceOutcomeIds: string[];

  /** The Decision Feedback ID used */
  sourceFeedbackId: string;

  /** Human-readable summary of what was observed */
  summary: string;

  /** Structured evidence supporting this candidate */
  evidence: LearningCandidateEvidence[];

  /** Confidence in this candidate (0-1), bounded by source confidence */
  confidence: number;

  /** Importance score (0-1) */
  importance: number;

  /** Always 'candidate' — never 'confirmed' or 'learned' */
  status: 'candidate';

  /** When this candidate was generated (ISO 8601) */
  createdAt: string;
}

/**
 * A piece of evidence supporting a LearningCandidate.
 */
export interface LearningCandidateEvidence {
  /** Type of evidence */
  type:
    | 'decision'
    | 'outcome'
    | 'aggregation'
    | 'trend'
    | 'feedback';

  /** Optional reference ID (e.g., outcome ID, aggregation metric key) */
  referenceId?: string;

  /** Human-readable description of this evidence */
  summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loop Metrics (Observability)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Performance and observability metrics for a Context Loop execution.
 *
 * These are for monitoring/debugging — NOT for business logic decisions.
 */
export interface ContextLoopMetrics {
  /** Time spent on decision lookup (ms) */
  decisionLookupMs?: number;

  /** Time spent building feedback (ms) */
  feedbackMs?: number;

  /** Time spent on graph traversal (ms) */
  graphTraversalMs?: number;

  /** Time spent on context assembly (ms) */
  assemblyMs?: number;

  /** Time spent generating learning candidates (ms) */
  learningMs?: number;

  /** Total end-to-end time (ms) */
  totalMs?: number;

  /** Total number of contexts considered for assembly */
  contextCount: number;

  /** Number of contexts retrieved from graph */
  graphContextCount: number;

  /** Number of outcomes attributed to this decision */
  outcomeCount: number;

  /** Number of learning candidates generated */
  learningCandidateCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Loop Dependencies (Dependency Injection)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dependencies for runContextLoop — enables testability via injection.
 */
export interface ContextLoopDependencies {
  /** MemoryRetriever for all memory operations (Decision + Outcome retrieval) */
  memoryRetriever: MemoryRetriever;

  /**
   * Decision Feedback Builder — if not provided, uses default buildDecisionFeedback.
   * Injected for testing/customization.
   */
  decisionFeedbackBuilder?: (
    retriever: MemoryRetriever,
    params: {
      ownerId: string;
      decisionId: string;
      windowStart?: string;
      windowEnd?: string;
      retrievalLimit?: number;
    },
    service?: DecisionFeedbackService,
  ) => Promise<DecisionFeedback>;

  /**
   * Clock function for deterministic timestamps.
   * Default: () => new Date().toISOString()
   */
  now?: () => string;

  /**
   * Learning persistence function — called for each candidate if provided.
   * Each candidate is persisted as a MemoryRecord (kind=semantic, type=learning_candidate).
   */
  persistLearningCandidate?: (
    candidate: LearningCandidate,
    authenticatedOwnerId: string,
  ) => Promise<MemoryRecord>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loop Stage Enum (for internal use)
// ═══════════════════════════════════════════════════════════════════════════════

/** Pipeline stages in order */
export const CONTEXT_LOOP_STAGES = [
  'validate',
  'retrieve_decision',
  'build_feedback',
  'resolve_graph',
  'traverse_graph',
  'build_collection',
  'assemble_context',
  'generate_learning',
  'persist_learning',
] as const;

export type ContextLoopStage = (typeof CONTEXT_LOOP_STAGES)[number];

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Build deterministic loop ID
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds a deterministic Loop ID from a Decision ID.
 *
 * Format: loop_${decisionId}
 * No UUID, no timestamp, no randomness.
 */
export function makeLoopId(decisionId: string): string {
  return `loop_${decisionId}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Build deterministic Learning Candidate ID
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds a deterministic Learning Candidate ID.
 *
 * Format: lc_${decisionId}_${type}
 * No UUID, no timestamp, no randomness.
 */
export function makeLearningCandidateId(
  decisionId: string,
  candidateType: LearningCandidateType,
): string {
  return `lc_${decisionId}_${candidateType}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Determine overall completeness from stage status
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the overall completeness status from stage results.
 *
 * Graph is an OPTIONAL enrichment phase — NOT a hard prerequisite
 * for Assembly or Learning. The pipeline continues regardless of
 * whether graph traversal produced contexts.
 *
 * Stage dependency graph:
 *
 *   Decision (required)
 *     ↓
 *   Outcome (required)
 *     ↓
 *   Feedback (required)
 *     ↓
 *   Graph (optional enrichment)
 *     ↓
 *   Assembly
 *     ↓
 *   Learning
 *
 * Possible states:
 *   no_decision        — decision not found
 *   no_outcome         — decision exists, no outcomes attributed
 *   outcome_available  — outcomes exist but feedback not built
 *   feedback_available — feedback built, no graph OR no assembly
 *   graph_available    — graph produced contexts but no assembly
 *   assembled          — assembly done but no learning candidates
 *   learned            — learning candidates generated
 */
export function determineLoopCompleteness(
  stageStatus: ContextLoopStageStatus,
): ContextLoopCompleteness {
  if (!stageStatus.decision) {
    return 'no_decision';
  }

  if (!stageStatus.outcome) {
    return 'no_outcome';
  }

  if (!stageStatus.feedback) {
    return 'outcome_available';
  }

  // Learning is the furthest possible stage
  if (stageStatus.learning) {
    return 'learned';
  }

  // Assembly occurred (possibly without graph)
  if (stageStatus.assembly) {
    return 'assembled';
  }

  // Graph enrichment occurred but no assembly attempted yet
  if (stageStatus.graph) {
    return 'graph_available';
  }

  // Feedback built but no graph/assembly/learning
  return 'feedback_available';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Empty stage status
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an initial (all-false) stage status.
 */
export function createInitialStageStatus(): ContextLoopStageStatus {
  return {
    decision: false,
    outcome: false,
    feedback: false,
    graph: false,
    assembly: false,
    learning: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Empty metrics
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create initial metrics with all counters at zero.
 */
export function createInitialMetrics(): ContextLoopMetrics {
  return {
    contextCount: 0,
    graphContextCount: 0,
    outcomeCount: 0,
    learningCandidateCount: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// All Learning Candidate Types (for iteration)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All valid LearningCandidateType values — for iteration and testing.
 */
export const LEARNING_CANDIDATE_TYPES: readonly LearningCandidateType[] = [
  'decision_pattern',
  'successful_pattern',
  'failure_pattern',
  'preference_signal',
  'strategy_signal',
] as const;
