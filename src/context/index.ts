/**
 * P0.6.1 — Context Object Foundation
 *
 * Unified Context abstraction for ContextOS.
 *
 * This module provides the type system and utilities for representing
 * all context in the system as ContextObjects.
 *
 * Architecture:
 *   Database Entity → Adapter → ContextObject → Collection → Assembly → Prompt
 *
 * Usage:
 *   import { createIdentityContext, topicAdapter, isContextObject } from '@/context';
 */

// Core Types

export type { ContextKind } from './context-kind';
export { CONTEXT_KINDS, CONTEXT_KIND_LABELS } from './context-kind';

export type { ContextProvenance } from './context-provenance';

export type { ContextLifecycleStage, ContextLifecycleState } from './context-lifecycle';
export { CONTEXT_LIFECYCLE_STAGES, createInitialLifecycleState } from './context-lifecycle';

export type { ContextObject } from './context-object';

export type {
  IdentityContext,
  IdentityContextPayload,
  IntentContext,
  IntentContextPayload,
  KnowledgeContextObject,
  StrategyContext,
  StrategyContextPayload,
  ContentContext,
  ContentContextPayload,
  EvaluationContext,
  EvaluationContextPayload,
  DecisionContext,
  DecisionContextPayload,
  OutcomeContext,
  OutcomeContextPayload,
  MemoryContext,
} from './context-types';

// Factory

export type { CreateContextOptions } from './context-factory';
export {
  createContextObject,
  createIdentityContext,
  createIntentContext,
  createStrategyContext,
  createContentContext,
  createEvaluationContext,
  createDecisionContext,
  createOutcomeContext,
  createMemoryContext,
  createKnowledgeContext,
} from './context-factory';

// Adapters

export type { ContextAdapter, AdapterOptions, TopicInput } from './context-adapter';
export {
  topicAdapter,
  adaptTopicToStrategy,
  strategyAdapter,
  draftAdapter,
  evaluationAdapter,
} from './context-adapter';

// Collection / Composition

export type { ContextCollection } from './context-collection';
export {
  ContextCollectionBuilder,
  createContextCollection,
  filterByKind,
  filterByType,
  findByKind,
  findByType,
  hasKind,
  hasType,
  getKinds,
  getTypes,
} from './context-collection';

// Utilities

export {
  isContextObject,
  isContextKind,
  isContextLifecycleStage,
  isContextLifecycleState,
  isContextOfKind,
  getContextId,
  getContextKind,
  getContextType,
  getContextProvenance,
  getContextLifecycleStage,
  getContextConfidence,
  hasSource,
  belongsToTopic,
  belongsToProject,
  hasSourceType,
  isAtOrBeyondLifecycleStage,
} from './context-utils';

// Assembly Engine (P0.6.2)

export type {
  AssemblyPurpose,
  ContextBudget,
  ContextAssemblyRequest,
  ScoredContext,
  ExcludedContext,
  AssemblyWarning,
  ContextAssemblyResult,
  ContextPackage,
  RetrievalRequest,
  ContextRetriever,
} from './assembly';

export { ASSEMBLY_PURPOSES } from './assembly';

export { assembleContexts, quickAssemble } from './assembly';
export { buildContextPackage } from './assembly';

export {
  selectContexts,
  PURPOSE_RELEVANT_KINDS,
} from './assembly';

export {
  rankContexts,
  getBasePriority,
  getPurposeAdjustment,
  getConfidenceAdjustment,
  getRelevanceAdjustment,
  getRecencyAdjustment,
  BASE_PRIORITY,
} from './assembly';

export {
  deduplicateContexts,
  getContextFingerprint,
  getSourceTypeFingerprint,
} from './assembly';

export {
  estimateContextTokens,
  estimateCollectionTokens,
  applyBudget,
  createDefaultBudget,
  CHARS_PER_TOKEN,
} from './assembly';

export { serializeContextPackage } from './assembly';

export {
  getPackageContextByKind,
  getPackageArrayByKind,
  getPackageContextCount,
  isPackageEmpty,
} from './assembly';

export { KnowledgeRetriever, knowledgeContextToObject } from './assembly';

// Memory Bridge (P0.6.3.1)

export { memoryRecordToContext } from '@/memory/memory-utils';
