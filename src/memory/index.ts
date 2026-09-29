/**
 * P0.6.3.1 — Memory Layer Foundation
 *
 * Unified Memory Layer for ContextOS.
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

export type { MemoryScope } from './memory-scope';
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

// ─── Memory → Context Bridge ────────────────────────────────────────────────

export { memoryRecordToContext, memoryRecordsToContexts } from './memory-utils';
