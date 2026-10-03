import type { MemoryKind } from './memory-kind';
export { MEMORY_KINDS, MEMORY_KIND_LABELS, MEMORY_KIND_SHORT_LABELS, STATIC, DYNAMIC, EPISODIC, SEMANTIC } from './memory-kind';

export type { MemoryContextPayload } from './memory-types';

export type { MemoryScope, PersistentMemoryScope } from './memory-scope';
export { MEMORY_SCOPES } from './memory-scope';
export { resolveMemoryScope } from './memory-scope';
export type { MemoryScopeInput } from './memory-scope';

// ─── Memory Record ───────────────────────────────────────────────────────────

export type { MemoryRecord, MemoryStatus } from './memory-record';
export { MEMORY_STATUSES } from './memory-record';

// ─── Memory Policy ───────────────────────────────────────────────────────────

export type { MemoryPolicy } from './memory-policy';
export { DEFAULT_MEMORY_POLICY, resolveMemoryPolicy } from './memory-policy';

// ─── Memory Factory ──────────────────────────────────────────────────────────

export type { CreateMemoryOptions } from './memory-factory';
export {
  createMemoryRecord,
  createStaticMemory,
  createDynamicMemory,
  createEpisodicMemory,
  createSemanticMemory,
} from './memory-factory';

// ─── Memory Collection ───────────────────────────────────────────────────────

export type { MemoryCollection } from './memory-collection';
export {
  MemoryCollectionBuilder,
  createMemoryCollection,
  filterByKind,
  filterByScope,
  filterByProject,
  filterByTopic,
  filterByStatus,
  sortByImportance,
  sortByRecency,
  sortByConfidence,
  sortByAccessCount,
  findById,
  getMemoryKinds,
  getMemoryScopes,
} from './memory-collection';

// ─── Memory Adapter ──────────────────────────────────────────────────────────

export type { MemoryAdapter, MemoryAdapterOptions } from './memory-adapter';

// ─── Concrete Adapters ───────────────────────────────────────────────────────

export {
  writingProfileAdapter,
  contentArchiveAdapter,
  personaAdapter,
  draftAdapter,
  agentRunAdapter,
} from './adapters';

export type {
  WritingProfileInput,
  WritingProfilePayload,
  ContentArchiveInput,
  ContentArchivePayload,
  PersonaInput,
  PersonaPayload,
  DraftInput,
  DraftPayload,
  AgentRunInput,
  AgentRunPayload,
} from './adapters';

// ─── Memory Retriever ────────────────────────────────────────────────────────

export type { MemoryRetrievalRequest, MemoryRetriever } from './memory-retriever';
export { InMemoryRetriever } from './memory-retriever';

// ─── Database Memory Retriever (P0.6.3.2.2) ────────────────────────────────

export { DatabaseMemoryRetriever } from './database-memory-retriever';
export { MemoryRetrievalError } from './database-memory-retriever';
export type { MemoryQueryCriteria } from './persistence/memory-query';

// ─── Memory → Context Bridge ────────────────────────────────────────────────

export { memoryRecordToContext, memoryRecordsToContexts } from './memory-utils';

// ─── Persistence Layer (P0.6.3.2.1) ────────────────────────────────────────

export type { MemoryStore } from './persistence/memory-store';
export { PrismaMemoryStore } from './persistence/prisma-memory-store';
export {
  memoryRecordToPersistence,
  persistenceToMemoryRecord,
} from './persistence/memory-persistence-mapper';
export { validateMemoryRecord } from './persistence/memory-persistence-validation';
export {
  MemoryConcurrencyError,
  MemoryNotFoundError,
  MemoryValidationError,
  MemoryAuthorizationError,
} from './persistence/memory-persistence-types';
export type { MemoryRecordRow } from './persistence/memory-persistence-types';

// ─── Decision Memory Types (P0.6.3.3) ────────────────────────────────────────

export type {
  DecisionMemoryPayload,
  DecisionAlternative,
  DecisionEvidence,
  DecisionStatus,
} from './memory-types';
export {
  DECISION_MEMORY_TYPE,
  DECISION_MEMORY_KIND,
  DECISION_STATUSES,
} from './memory-types';

// ─── Decision Memory Helpers (P0.6.3.3) ─────────────────────────────────────

export type { DecisionMemory } from './decision-memory';
export {
  isDecisionMemory,
  decisionStatusToMemoryStatus,
  memoryStatusesForDecisionStatus,
} from './decision-memory';
export { DECISION_TYPE, DECISION_KIND } from './decision-memory';

// ─── Decision Memory Factory (P0.6.3.3) ─────────────────────────────────────

export type { CreateDecisionMemoryOptions } from './decision-memory-factory';
export { createDecisionMemory } from './decision-memory-factory';

// ─── Decision Memory Service (P0.6.3.3) ─────────────────────────────────────

export type { DecisionMemoryService } from './decision-memory-service';
export { DecisionMemoryServiceImpl } from './decision-memory-service';
export { DecisionTransitionError } from './decision-memory-service';

// ─── Decision Memory Retrieval (P0.6.3.3) ───────────────────────────────────

export type { DecisionRetrievalParams, GetDecisionByIdParams } from './decision-memory-retrieval';
export {
  retrieveDecisionMemories,
  getActiveDecisions,
  getDecisionHistory,
  getDecisionById,
} from './decision-memory-retrieval';

// ─── Decision Memory → Context Bridge (P0.6.3.3) ────────────────────────────

export {
  decisionMemoryToContext,
  tryDecisionMemoryToContext,
} from './memory-utils';

// ─── Outcome Memory Types (P0.6.5.1) ────────────────────────────────────────

export type {
  OutcomeMemoryPayload,
  OutcomeMetric,
  OutcomeAttribution,
  OutcomeType,
  OutcomeTargetType,
} from './outcome-memory';
export {
  OUTCOME_MEMORY_TYPE,
  OUTCOME_MEMORY_KIND,
  OUTCOME_TYPES,
  OUTCOME_TARGET_TYPES,
} from './outcome-memory';

// ─── Outcome Memory Helpers (P0.6.5.1) ──────────────────────────────────────

export type { OutcomeMemory } from './outcome-memory';
export {
  isOutcomeMemory,
  validateOutcomePayload,
} from './outcome-memory';

// ─── Outcome Memory Factory (P0.6.5.1) ──────────────────────────────────────

export type { CreateOutcomeMemoryOptions } from './outcome-memory-factory';
export { createOutcomeMemory } from './outcome-memory-factory';

// ─── Outcome Memory Retrieval (P0.6.5.1, R1, R3) ────────────────────────────

export type {
  OutcomeRetrievalParams,
  OutcomeRetrievalMetadata,
  OutcomeRetrievalResult,
  OutcomeBatchCollectionResult,
} from './outcome-memory-retrieval';
export {
  retrieveOutcomeMemories,
  retrieveOutcomeMemoriesWithMetadata,
  getOutcomeHistory,
  getLatestOutcome,
  MAX_OUTCOME_HISTORY_LIMIT,
  MAX_OUTCOME_RETRIEVAL_BATCHES,
  DEFAULT_OUTCOME_BATCH_SIZE,
} from './outcome-memory-retrieval';

// ─── Outcome Memory → Context Bridge (P0.6.5.1) ─────────────────────────────

export {
  outcomeMemoryToContext,
  tryOutcomeMemoryToContext,
} from './memory-utils';

// ─── Outcome Memory Service (P0.6.5.2) ──────────────────────────────────────

export type { OutcomeMemoryService } from './outcome-memory-service';
export { OutcomeMemoryServiceImpl } from './outcome-memory-service';
export { OutcomeTransitionError } from './outcome-memory-service';
export type {
  OutcomeImportResult,
  OutcomeImportItemResult,
} from './outcome-memory-service';

// ─── Outcome Alert Types (P0.6.5.3) ─────────────────────────────────────────

/**
 * @defgroup outcome_alert P0.6.5.3 Outcome Alerting System
 * @brief Complete alerting framework for Outcome metric monitoring
 * @details Supports:
 * - Rule-based alerting with metric threshold conditions
 * - Alert lifecycle management (open → acknowledged → resolved/suppressed)
 * - Owner-based data isolation for multi-tenant security
 * - Optimistic concurrency control for concurrent updates
 * - Fingerprint-based deduplication to prevent duplicate alerts
 * - Custom message template rendering with {{placeholder}} substitution
 */

/** @ingroup outcome_alert */ export type { OutcomeAlert } from './outcome-alert';
/** @ingroup outcome_alert */ export { OUTCOME_ALERT_STATUSES } from './outcome-alert';
/** @ingroup outcome_alert */ export type { OutcomeAlertOperator, OutcomeAlertSeverity } from './outcome-alert-rule';
/** @ingroup outcome_alert */ export { OUTCOME_ALERT_OPERATORS, OUTCOME_ALERT_SEVERITIES, validateAlertRule } from './outcome-alert-rule';
/** @ingroup outcome_alert */ export type { OutcomeAlertMetricCondition, OutcomeAlertRule } from './outcome-alert-rule';
/** @ingroup outcome_alert */ export type { OutcomeAlertMatchedCondition, OutcomeAlertEvaluation } from './outcome-alert-evaluator';
/** @ingroup outcome_alert */ export { evaluateOutcomeAgainstRule, evaluateOutcomeAgainstRules, evaluateCondition, renderAlertMessage } from './outcome-alert-evaluator';
/** @ingroup outcome_alert */ export type { OutcomeAlertService } from './outcome-alert-service';
/** @ingroup outcome_alert */ export { OutcomeAlertServiceImpl } from './outcome-alert-service';
/** @ingroup outcome_alert */ export { OutcomeAlertTransitionError, OutcomeAlertOwnerError } from './outcome-alert-service';
/** @ingroup outcome_alert */ export type { OutcomeAlertEvaluateResult, OutcomeAlertEvaluateItem, OutcomeAlertBatchResult, OutcomeAlertLifecycleResult } from './outcome-alert-service';
/** @ingroup outcome_alert */ export type { OutcomeAlertStore, OutcomeAlertListFilters } from './persistence/outcome-alert-store';
/** @ingroup outcome_alert */ export { PrismaOutcomeAlertStore } from './persistence/outcome-alert-store';

// ─── Outcome Aggregation Types (P0.6.5.4) ───────────────────────────────────

/**
 * @defgroup outcome_aggregation P0.6.5.4 Outcome Aggregation Layer
 * @brief Deterministic aggregation over immutable Outcome observations
 * @details Supports:
 * - Statistical aggregation (count/sum/avg/min/max/median)
 * - Time-series bucketing (day/week, UTC boundaries)
 * - Trend comparison between adjacent windows
 * - Honest completeness reporting (complete vs bounded)
 * - Parameter-level filtering (owner/project/topic/target/type)
 * - On-demand computation — no persistence of derived results
 */

export type {
  OutcomeAggregationFunction,
  OutcomeMetricAggregation,
  OutcomeAggregationParams,
  OutcomeAggregation,
  OutcomeAggregationGranularity,
  OutcomeAggregationBucket,
  OutcomeAggregationSeries,
  OutcomeTrendDirection,
  OutcomeMetricTrend,
  OutcomeTrendParams,
  OutcomeTrendResult,
} from './outcome-aggregation';

export {
  OUTCOME_AGGREGATION_FUNCTIONS,
  DEFAULT_AGGREGATION_FUNCTIONS,
  MAX_OUTCOME_RETRIEVAL_BOUND,
  metricGroupingKey,
  metricKeyFromGroupingKey,
  unitFromGroupingKey,
  isFiniteNumber,
  computeMedian,
  computeMetricAggregation,
  validateTimeWindow,
  isWithinWindow,
  getUtcDayStart,
  getNextUtcDayStart,
  getUtcWeekStart,
  getNextUtcWeekStart,
  calculateMetricTrend,
  filterOutcomesByParams,
  clampRetrievalLimit,
} from './outcome-aggregation';

// ─── Outcome Aggregation Service (P0.6.5.4) ─────────────────────────────────

export type { OutcomeAggregationService } from './outcome-aggregation-service';
export {
  OutcomeAggregationServiceImpl,
  defaultOutcomeAggregationService,
  aggregateByDay,
  aggregateByWeek,
  compareOutcomeWindows,
} from './outcome-aggregation-service';

// ─── Outcome Aggregation Entry Point (P0.6.5.4) ─────────────────────────────

export {
  aggregateOutcomeMemories,
  aggregateOutcomeMemoriesTimeSeries,
  compareOutcomeMemoriesWindows,
} from './outcome-aggregation-entry';

// ─── Outcome Aggregation → Context Bridge (P0.6.5.4) ───────────────────────

export {
  outcomeAggregationToContext,
} from './outcome-aggregation-bridge';

export type {
  OutcomeAggregationContextMetadata,
} from './outcome-aggregation-bridge';

// ─── Decision Feedback Types (P0.6.5.5) ─────────────────────────────────────

/**
 * @defgroup decision_feedback P0.6.5.5 Decision Feedback Layer
 * @brief On-demand Decision → Outcome evidence feedback
 * @details Supports:
 * - Decision → Outcome attribution via attribution.decisionId
 * - Objective outcome count, metric aggregation, trend analysis
 * - Honest completeness reporting (complete vs bounded)
 * - Owner / Project / Topic isolation at every layer
 * - On-demand feedback — derived, not persisted
 * - NO causal inference, NO decision judgment
 */

export type {
  DecisionFeedback,
  DecisionFeedbackStatus,
  DecisionFeedbackParams,
  DecisionFeedbackBuildOptions,
  DecisionOutcomeRetrievalParams,
} from './decision-feedback';

export {
  isOutcomeAttributedToDecision,
  retrieveDecisionOutcomes,
  determineDecisionFeedbackCompleteness,
  determineDecisionFeedbackStatus,
  feedbackConfidence,
  resolveDecisionFeedbackWindow,
} from './decision-feedback';

// ─── Decision Feedback Service (P0.6.5.5) ───────────────────────────────────

export type { DecisionFeedbackService } from './decision-feedback-service';
export {
  DecisionFeedbackServiceImpl,
  defaultDecisionFeedbackService,
} from './decision-feedback-service';

// ─── Decision Feedback Entry Point (P0.6.5.5) ───────────────────────────────

export {
  buildDecisionFeedback,
} from './decision-feedback-entry';

// ─── Decision Feedback → Context Bridge (P0.6.5.5-R1) ──────────────────────

export {
  decisionFeedbackToContext,
} from './decision-feedback-bridge';

export type {
  DecisionFeedbackContextPayload,
} from './decision-feedback-bridge';
