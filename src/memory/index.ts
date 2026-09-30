/**
 * P0.6.3.3 — Memory Layer Foundation
 *
 * Unified Memory Layer for ContextOS with Decision Memory support.
 *
 * Architecture:
 *   Existing Sources → Adapters → MemoryRecord → Collection → Retriever → ContextObject
 *
 * This module exports the complete Memory Layer public API.
 */

// ─── Core Types ──────────────────────────────────────────────────────────────

export type { MemoryKind } from './memory-kind';
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

export type { DecisionRetrievalParams } from './decision-memory-retrieval';
export {
  retrieveDecisionMemories,
  getActiveDecisions,
  getDecisionHistory,
} from './decision-memory-retrieval';

// ─── Decision Memory → Context Bridge (P0.6.3.3) ────────────────────────────

export {
  decisionMemoryToContext,
  tryDecisionMemoryToContext,
} from './memory-utils';
