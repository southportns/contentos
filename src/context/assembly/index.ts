/**
 * P0.6.2 — Context Assembly Engine
 *
 * Assembles ContextObjects into purpose-specific ContextPackages
 * ready for Prompt injection.
 *
 * Architecture:
 *   Context Sources → Retrieval → Selection → Ranking → Deduplication → Budget → Package → Serialization → Prompt
 *
 * Usage:
 *   import { assembleContexts, serializeContextPackage, buildContextPackage } from '@/context/assembly';
 */

// ─── Types ──────────────────────────────────────────────────────────────────

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
} from './types';

export { ASSEMBLY_PURPOSES } from './types';

// ─── Core Assembly ──────────────────────────────────────────────────────────

export { assembleContexts, quickAssemble } from './context-assembler';
export { buildContextPackage } from './context-package';

// ─── Pipeline Stages ────────────────────────────────────────────────────────

export { selectContexts, PURPOSE_RELEVANT_KINDS } from './context-selector';
export type { SelectionResult } from './context-selector';

export {
  rankContexts,
  getBasePriority,
  getPurposeAdjustment,
  getConfidenceAdjustment,
  getRelevanceAdjustment,
  getRecencyAdjustment,
  BASE_PRIORITY,
} from './context-priority';
export type { RankingOptions } from './context-priority';

export {
  deduplicateContexts,
  getContextFingerprint,
  getSourceTypeFingerprint,
} from './context-dedup';
export type { DedupResult } from './context-dedup';

export {
  estimateContextTokens,
  estimateCollectionTokens,
  applyBudget,
  createDefaultBudget,
  CHARS_PER_TOKEN,
} from './context-budget';

// ─── Serialization ──────────────────────────────────────────────────────────

export { serializeContextPackage } from './context-serializer';
export type { SerializationOptions } from './context-serializer';

// ─── Package Utilities ──────────────────────────────────────────────────────

export {
  getPackageContextByKind,
  getPackageArrayByKind,
  getPackageContextCount,
  isPackageEmpty,
} from './context-package';

// ─── Retriever ──────────────────────────────────────────────────────────────

export { KnowledgeRetriever, knowledgeContextToObject } from './context-retriever';
export type { KnowledgeRetrieverOptions } from './context-retriever';
