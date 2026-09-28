/**
 * P0.6.2 — Context Assembly Engine Types
 *
 * Core type definitions for the Context Assembly layer.
 *
 * Architecture Position:
 *   These types define the contracts for assembling ContextObjects into
 *   purpose-specific ContextPackages ready for Prompt injection.
 *
 * Design Principles:
 *   1. All types are pure data — no behavior
 *   2. Explainable — every selection/exclusion has a reason
 *   3. Deterministic — same input always produces same output
 *   4. Budget-aware — token constraints are first-class
 *
 * Non-goals:
 *   - Not a database schema (no ORM)
 *   - Not a Prompt template (serialization is separate)
 *   - Not an AI system (no LLM calls)
 */

import type { ContextObject, ContextKind } from '../context-object';

// ═══════════════════════════════════════════════════════════════════════════════
// Assembly Purpose
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The purpose for which context is being assembled.
 *
 * Each purpose implies different priority weightings, required kinds,
 * and relevance matching rules.
 *
 * P0.6.2 delivers: generic, strategy, writing, evaluation
 * Future: decision, agent, research, publishing
 */
export type AssemblyPurpose =
  | 'generic'
  | 'strategy'
  | 'writing'
  | 'evaluation';

/**
 * All valid assembly purposes as a runtime array.
 */
export const ASSEMBLY_PURPOSES: readonly AssemblyPurpose[] = [
  'generic',
  'strategy',
  'writing',
  'evaluation',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Context Budget
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Token and count budget constraints for assembly.
 *
 * The budget ensures the final ContextPackage does not exceed
 * the token capacity of the target LLM or the practical limits
 * of prompt construction.
 */
export interface ContextBudget {
  /**
   * Maximum estimated tokens for the entire package.
   * This is an estimate — see estimateContextTokens() for methodology.
   */
  maxTokens: number;

  /**
   * Tokens reserved for system prompt / instructions.
   * The assembly budget is effectively maxTokens - reservedTokens.
   */
  reservedTokens?: number;

  /**
   * Maximum number of context objects allowed in the final package.
   * Provides a hard count limit independent of token estimation.
   */
  maxContexts?: number;

  /**
   * Maximum number of contexts per kind.
   * Prevents one kind from dominating the package.
   */
  maxPerKind?: Partial<Record<ContextKind, number>>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Assembly Request
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request to assemble a ContextPackage from available ContextObjects.
 *
 * Contains all the information needed for selection, ranking,
 * deduplication, budget allocation, and serialization.
 */
export interface ContextAssemblyRequest {
  /** Available context objects (pre-filtered by retrieval layer) */
  contexts: ContextObject[];

  /** Purpose of the assembly — drives priority and relevance */
  purpose: AssemblyPurpose;

  /** Token/count budget constraints */
  maxTokens?: number;
  maxContexts?: number;

  /** Kinds that MUST be included (budget exempt for required) */
  requiredKinds?: ContextKind[];

  /** Kinds that MUST NOT be included */
  excludedKinds?: ContextKind[];

  /** Project scope — contexts from other projects are excluded */
  projectId?: string;

  /** Topic scope — used for relevance scoring */
  topicId?: string;

  /** Query string — used for relevance matching */
  query?: string;

  /** Custom budget (overrides maxTokens/maxContexts) */
  budget?: ContextBudget;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scored Context
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A context object with an explainable priority score.
 *
 * The score is composed of multiple modifiers, each contributing
 * a transparent reason for the final ranking.
 */
export interface ScoredContext {
  /** The original context object */
  context: ContextObject;

  /** Final computed priority score (higher = more important) */
  score: number;

  /** Human-readable reasons for this score */
  reasons: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Excluded Context
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A context that was excluded from the assembly, with reason.
 */
export interface ExcludedContext {
  /** ID of the excluded context */
  contextId: string;

  /** Why it was excluded.
   *
   * P0.6.2-R1 additions:
   * - scope_mismatch: Context scope does not match assembly request scope
   * - unknown_scope: Context has unknown scope and assembly has project boundary
   */
  reason:
    | 'duplicate'
    | 'budget'
    | 'excluded_kind'
    | 'low_relevance'
    | 'invalid'
    | 'scope_mismatch'
    | 'unknown_scope';

  /** Optional detail */
  detail?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Assembly Warning
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A warning generated during assembly.
 *
 * Warnings indicate non-fatal issues that consumers should be aware of.
 */
export interface AssemblyWarning {
  /** Warning code */
  code:
    | 'EMPTY_CONTEXT'
    | 'BUDGET_EXCEEDED'
    | 'REQUIRED_CONTEXT_MISSING'
    | 'REQUIRED_KINDS_EXCEED_BUDGET'
    | 'ALL_CONTEXTS_EXCLUDED'
    | 'LOW_CONFIDENCE_DOMINANCE';

  /** Human-readable message */
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Assembly Result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of a context assembly operation.
 *
 * Always returns a valid result — never throws for recoverable issues.
 * Warnings capture any non-fatal problems encountered.
 */
export interface ContextAssemblyResult {
  /** Selected contexts in priority order (highest first) */
  selected: ScoredContext[];

  /** Contexts that were excluded, with reasons */
  excluded: ExcludedContext[];

  /** Estimated total tokens for the selected contexts */
  tokenEstimate: number;

  /** Budget that was applied */
  budget: ContextBudget;

  /** Warnings encountered during assembly */
  warnings: AssemblyWarning[];

  /** Assembly metadata */
  metadata: {
    purpose: AssemblyPurpose;
    assembledAt: string;
    inputCount: number;
    selectedCount: number;
    excludedCount: number;
    dedupCount: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Package
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The final assembled package of contexts, organized by kind.
 *
 * This is the output of the Assembly Engine and the input to
 * the Serialization layer for Prompt injection.
 */
export interface ContextPackage {
  /** Identity contexts (User, Persona, Audience) */
  identity?: IdentityContext;

  /** Intent context (Goal, Task, Constraints) */
  intent?: IntentContext;

  /** Knowledge contexts (sorted by relevance) */
  knowledge: ContextObject[];

  /** Strategy contexts */
  strategy: ContextObject[];

  /** Content contexts */
  content: ContextObject[];

  /** Evaluation contexts */
  evaluation: ContextObject[];

  /** Decision contexts */
  decision: ContextObject[];

  /** Outcome contexts */
  outcome: ContextObject[];

  /** Memory contexts */
  memory: ContextObject[];

  /** Package metadata */
  metadata: {
    purpose: AssemblyPurpose;
    tokenEstimate: number;
    contextCount: number;
    assembledAt: string;
  };
}

// Re-export for package construction
import type { IdentityContext as IdentityContextType } from '../context-types';
import type { IntentContext as IntentContextType } from '../context-types';

/** Re-declare for package */
type IdentityContext = IdentityContextType;
type IntentContext = IntentContextType;

// ═══════════════════════════════════════════════════════════════════════════════
// Retrieval Contract
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters for context retrieval.
 *
 * Retrievers use this to query their specific data source.
 */
export interface RetrievalRequest {
  /** What kind of context to retrieve */
  kind: ContextKind;

  /** Project scope */
  projectId?: string;

  /** Topic scope */
  topicId?: string;

  /** Query for relevance retrieval */
  query?: string;

  /** Maximum number of results */
  limit?: number;
}

/**
 * Context Retriever interface.
 *
 * Implementations retrieve contexts from specific data sources
 * (database, knowledge store, etc.) and return them as ContextObjects.
 *
 * Retrievers are responsible for ADAPTER calls — they must return
 * ContextObjects, not raw entities.
 */
export interface ContextRetriever {
  /** The kind of context this retriever handles */
  readonly kind: ContextKind;

  /**
   * Retrieve contexts for the given request.
   *
   * MUST return ContextObjects (adapted from entities if necessary).
   * MUST NOT throw — return empty array on failure.
   */
  retrieve(request: RetrievalRequest): Promise<ContextObject[]>;
}
