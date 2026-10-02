/**
 * P0.6.3.3 — Memory Layer Foundation
 *
 * Unified Memory Layer for ContextOS with Decision Memory support.
 */

export type { MemoryKind } from './memory-kind';
export { MEMORY_KINDS, MEMORY_KIND_LABELS, MEMORY_KIND_SHORT_LABELS, STATIC, DYNAMIC, EPISODIC, SEMANTIC } from './memory-kind';
export type { MemoryContextPayload } from './memory-types';
export type { MemoryScope, PersistentMemoryScope } from './memory-scope';
export { MEMORY_SCOPES } from './memory-scope';
export { resolveMemoryScope } from './memory-scope';
export type { MemoryScopeInput } from './memory-scope';
export type { MemoryRecord, MemoryStatus } from './memory-record';
export { MEMORY_STATUSES } from './memory-record';
export type { MemoryPolicy } from './memory-policy';
export { DEFAULT_MEMORY_POLICY, resolveMemoryPolicy } from './memory-policy';
export type { CreateMemoryOptions } from './memory-factory';
export { createMemoryRecord, createStaticMemory, createDynamicMemory, createEpisodicMemory, createSemanticMemory } from './memory-factory';
export type { MemoryCollection } from './memory-collection';
export { MemoryCollectionBuilder, createMemoryCollection, filterByKind, filterByScope, filterByProject, filterByTopic, filterByStatus, sortByImportance, sortByRecency, sortByConfidence, sortByAccessCount, findById, getMemoryKinds, getMemoryScopes } from './memory-collection';
export type { MemoryAdapter, MemoryAdapterOptions } from './memory-adapter';
export { writingProfileAdapter, contentArchiveAdapter, personaAdapter, draftAdapter, agentRunAdapter } from './adapters';
export type { WritingProfileInput, WritingProfilePayload, ContentArchiveInput, ContentArchivePayload, PersonaInput, PersonaPayload, DraftInput, DraftPayload, AgentRunInput, AgentRunPayload } from './adapters';
export type { MemoryRetrievalRequest, MemoryRetriever } from './memory-retriever';
export { InMemoryRetriever } from './memory-retriever';
export { DatabaseMemoryRetriever } from './database-memory-retriever';
export { MemoryRetrievalError } from './database-memory-retriever';
export type { MemoryQueryCriteria } from './persistence/memory-query';
export { memoryRecordToContext, memoryRecordsToContexts } from './memory-utils';
export type { MemoryStore } from './persistence/memory-store';
export { PrismaMemoryStore } from './persistence/prisma-memory-store';
export { memoryRecordToPersistence, persistenceToMemoryRecord } from './persistence/memory-persistence-mapper';
export { validateMemoryRecord } from './persistence/memory-persistence-validation';
export { MemoryConcurrencyError, MemoryNotFoundError, MemoryValidationError, MemoryAuthorizationError } from './persistence/memory-persistence-types';
export type { MemoryRecordRow } from './persistence/memory-persistence-types';
export type { DecisionMemoryPayload, DecisionAlternative, DecisionEvidence, DecisionStatus } from './memory-types';
export { DECISION_MEMORY_TYPE, DECISION_MEMORY_KIND, DECISION_STATUSES } from './memory-types';
export type { DecisionMemory } from './decision-memory';
export { isDecisionMemory, decisionStatusToMemoryStatus, memoryStatusesForDecisionStatus } from './decision-memory';
export { DECISION_TYPE, DECISION_KIND } from './decision-memory';
export type { CreateDecisionMemoryOptions } from './decision-memory-factory';
export { createDecisionMemory } from './decision-memory-factory';
export type { DecisionMemoryService } from './decision-memory-service';
export { DecisionMemoryServiceImpl } from './decision-memory-service';
export { DecisionTransitionError } from './decision-memory-service';
export type { DecisionRetrievalParams } from './decision-memory-retrieval';
export { retrieveDecisionMemories, getActiveDecisions, getDecisionHistory } from './decision-memory-retrieval';
export { decisionMemoryToContext, tryDecisionMemoryToContext } from './memory-utils';
export type { OutcomeMemoryPayload, OutcomeMetric, OutcomeAttribution, OutcomeType, OutcomeTargetType } from './outcome-memory';
export { OUTCOME_MEMORY_TYPE, OUTCOME_MEMORY_KIND, OUTCOME_TYPES, OUTCOME_TARGET_TYPES } from './outcome-memory';
export type { OutcomeMemory } from './outcome-memory';
export { isOutcomeMemory, validateOutcomePayload } from './outcome-memory';
export type { CreateOutcomeMemoryOptions } from './outcome-memory-factory';
export { createOutcomeMemory } from './outcome-memory-factory';
export type { OutcomeRetrievalParams } from './outcome-memory-retrieval';
export { retrieveOutcomeMemories, getOutcomeHistory, getLatestOutcome, MAX_OUTCOME_HISTORY_LIMIT } from './outcome-memory-retrieval';
export { outcomeMemoryToContext, tryOutcomeMemoryToContext } from './memory-utils';
export type { OutcomeMemoryService } from './outcome-memory-service';
export { OutcomeMemoryServiceImpl } from './outcome-memory-service';
export { OutcomeTransitionError } from './outcome-memory-service';
export type { OutcomeImportResult, OutcomeImportItemResult } from './outcome-memory-service';

// ─── Outcome Alert Types (P0.6.5.3) ─────────────────────────────────────────

export type { OutcomeAlert } from './outcome-alert';
export { OUTCOME_ALERT_STATUSES } from './outcome-alert';
export type { OutcomeAlertOperator, OutcomeAlertSeverity } from './outcome-alert-rule';
export { OUTCOME_ALERT_OPERATORS, OUTCOME_ALERT_SEVERITIES, validateAlertRule } from './outcome-alert-rule';
export type { OutcomeAlertMetricCondition, OutcomeAlertRule } from './outcome-alert-rule';
export type { OutcomeAlertMatchedCondition, OutcomeAlertEvaluation } from './outcome-alert-evaluator';
export { evaluateOutcomeAgainstRule, evaluateOutcomeAgainstRules, evaluateCondition, renderAlertMessage } from './outcome-alert-evaluator';
export type { OutcomeAlertService } from './outcome-alert-service';
export { OutcomeAlertServiceImpl } from './outcome-alert-service';
export { OutcomeAlertTransitionError, OutcomeAlertOwnerError } from './outcome-alert-service';
export type { OutcomeAlertEvaluateResult, OutcomeAlertEvaluateItem, OutcomeAlertBatchResult, OutcomeAlertLifecycleResult } from './outcome-alert-service';
export type { OutcomeAlertStore, OutcomeAlertListFilters } from './persistence/outcome-alert-store';
export { PrismaOutcomeAlertStore } from './persistence/outcome-alert-store';
