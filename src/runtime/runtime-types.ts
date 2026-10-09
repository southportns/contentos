/**
 * P0.7.0 — ContextOS Runtime Type Contracts
 *
 * Defines the core type contracts for the ContextOS Runtime layer.
 *
 * Architecture Position:
 *   These types define the boundaries between Runtime and its consumers
 *   (Agent, Skill, Tool) and its dependencies (P0.6 Context/Memory layer).
 *
 * Design Principles:
 *   1. Types are pure data — no behavior
 *   2. Runtime is business-agnostic — no domain-specific fields
 *   3. All contracts are stable — changes require architecture review
 *   4. Explicit over implicit — every field has a defined purpose
 *
 * Non-goals:
 *   - Not an implementation of the Runtime (P0.7.1+)
 *   - Not a replacement for P0.6 types
 *   - Not a database schema
 *
 * P0.7.0 delivers: Type contracts only.
 */

import type { ContextObject } from '@/context/context-object';
import type { ContextKind } from '@/context/context-kind';
import type { ContextProvenance } from '@/context/context-provenance';
import type { MemoryScope } from '@/memory/memory-scope';

// ═══════════════════════════════════════════════════════════════════════════════
// Section 4: Runtime Request
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request to ContextOS Runtime for an Agent execution cycle.
 *
 * This is the PRIMARY entry point for ContextOS Runtime.
 *
 * Architecture:
 *   Agent / App → ContextOSRuntimeRequest → Runtime
 *
 * Design:
 * - ownerId is MANDATORY — every Runtime operation is owner-scoped
 * - purpose is business-agnostic — describes WHY, not WHAT
 * - input is business-agnostic — structure is defined by Agent, not Runtime
 * - contextPolicy controls how much context Runtime provides
 *
 * Prohibited:
 * - douyinTopic, contentDraft, viralScore — NO business-specific fields
 * - Any field that couples Runtime to a specific Skill or product
 */
export interface ContextOSRuntimeRequest {
  /** Owner (user) ID — mandatory for isolation */
  ownerId: string;

  /** Project scope (optional) */
  projectId?: string;

  /** Topic scope (optional) */
  topicId?: string;

  /** Task/Run identifier (optional, for tracking) */
  taskId?: string;

  /**
   * Purpose of this Agent run — business agnostic.
   * Examples: "content_creation", "research", "evaluation"
   * NOT: "douyin_viral_analysis" (too specific)
   */
  purpose: string;

  /**
   * Input data for the Agent.
   * Structure is defined by the Agent contract, NOT by Runtime.
   * Runtime does NOT interpret this — it passes through.
   */
  input: unknown;

  /**
   * P0.7.2 — Optional query text for knowledge/context retrieval.
   *
   * Purpose: provides a clear, business-agnostic retrieval hint for
   * knowledge or semantic retrieval systems.
   *
   * Semantics:
   * - contextQuery is EXPLICITLY for retrieval — NOT derived from input.
   * - input remains the Agent's business input; contextQuery is the
   *   contextual retrieval query.
   * - When not provided, knowledge retrievers may use their own fallback.
   */
  contextQuery?: string;

  /** Context policy controlling retrieval and assembly */
  contextPolicy?: ContextOSContextPolicy;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 5: Context Policy
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Policy controlling how much context ContextOS provides to the Agent.
 *
 * Architecture:
 *   Request → Policy → Retrieval + Assembly
 *
 * Semantics:
 * - maxTokens: Hard cap on serialized context size
 * - maxContexts: Hard cap on number of context objects
 * - allowedKinds / excludedKinds: Category whitelist/blacklist
 * - allowedScopes: Memory scope restriction
 * - include*: Feature toggles for context sources
 *
 * When not provided, Runtime uses sensible defaults.
 */
export interface ContextOSContextPolicy {
  /** Maximum estimated tokens for context injection */
  maxTokens?: number;

  /** Maximum number of context objects */
  maxContexts?: number;

  /** Allowed context kinds (whitelist) */
  allowedKinds?: ContextKind[];

  /** Excluded context kinds (blacklist) */
  excludedKinds?: ContextKind[];

  /** Allowed memory scopes for retrieval */
  allowedScopes?: MemoryScope[];

  /** Whether to include graph-related contexts */
  includeGraph?: boolean;

  /** Maximum graph traversal depth */
  graphDepth?: number;

  /** Whether to include memory contexts */
  includeMemory?: boolean;

  /** Whether to include outcome contexts */
  includeOutcomes?: boolean;

  /** Whether to include decision contexts */
  includeDecisions?: boolean;

  /** Whether to include feedback contexts */
  includeFeedback?: boolean;

  /**
   * P0.7.2 — Whether to include knowledge contexts from knowledge retrievers.
   * Default: true (request retrieval; does not guarantee a provider exists).
   */
  includeKnowledge?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 8: Context Injection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The final context package delivered to the Agent.
 *
 * Architecture:
 *   Assembly → RuntimeContextPackage → Agent
 *
 * This is WHAT the Agent receives. It contains:
 * - contexts: Structured access to context objects
 * - serialized: Ready-to-inject prompt text
 * - contextIds: For usage tracking
 * - provenance: For traceability
 */
export interface RuntimeContextPackage {
  /** Selected context objects */
  contexts: ContextObject[];

  /** Serialized form ready for prompt injection */
  serialized: string;

  /** Estimated token count */
  tokenEstimate: number;

  /** IDs of all included contexts (for tracking) */
  contextIds: string[];

  /** Provenance of each context */
  provenance: ContextProvenance[];

  /** Timestamp of package generation (ISO 8601) */
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 10: Context Usage Tracking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record of a Context being used in an Agent Run.
 *
 * Architecture:
 *   Context → Runtime → Agent Run → ContextUsage
 *
 * Purpose:
 * - Impact Analysis: If a Context changes, which Runs are affected?
 * - Learning: Which Contexts correlate with successful Outcomes?
 * - Audit: Full trace of information influence on Agent decisions.
 */
export interface ContextUsage {
  /** Which context was used */
  contextId: string;

  /** In which run */
  runId: string;

  /** When it was used (ISO 8601) */
  usedAt: string;

  /** For what purpose */
  purpose: string;

  /** Position in the context package (optional) */
  position?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 9: Agent Run
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Status of an Agent Run lifecycle.
 */
export type ContextOSRunStatus =
  | 'started'
  | 'running'
  | 'completed'
  | 'failed';

/**
 * Record of a single Agent execution event.
 *
 * Architecture:
 *   Runtime Request → Create Run → Agent Execution → Complete Run
 *
 * A Run is NOT Memory. It is a record of one execution.
 * Memory persists across Runs.
 */
export interface ContextOSRun {
  /** Unique run identifier */
  id: string;

  /** Owner (user) ID */
  ownerId: string;

  /** Project scope */
  projectId?: string;

  /** Topic scope */
  topicId?: string;

  /** Purpose of this run */
  purpose: string;

  /** Input data (structure defined by Agent) */
  input: unknown;

  /** IDs of contexts used in this run */
  contextIds: string[];

  /** IDs of decisions made during this run */
  decisionIds: string[];

  /** IDs of outcomes observed from this run */
  outcomeIds: string[];

  /** Output of the Agent (structure defined by Agent) */
  output?: unknown;

  /** Run status */
  status: ContextOSRunStatus;

  /** Start timestamp (ISO 8601) */
  startedAt: string;

  /** Completion timestamp (ISO 8601) */
  completedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 15: Determinism — Runtime Dependencies
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dependencies injected into ContextOS Runtime.
 *
 * Architecture:
 *   Dependencies enable:
 *   - Testability (inject mock clock)
 *   - Determinism (controlled time)
 *   - Flexibility (swappable components)
 *
 * P0.7.0 defines the dependency contract.
 * P0.7.1+ implements the injection mechanism.
 */
export interface ContextOSRuntimeDependencies {
  /**
   * Clock function for deterministic timestamps.
   * Default: () => new Date().toISOString()
   */
  now?: () => string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Error Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error codes for ContextOS Runtime operations.
 */
export type RuntimeErrorCode =
  | 'RUNTIME_NOT_FOUND'
  | 'RUNTIME_AUTHORIZATION'
  | 'RUNTIME_VALIDATION'
  | 'RUNTIME_EXECUTION'
  | 'RUNTIME_POLICY';

/**
 * Base error class for ContextOS Runtime.
 *
 * All Runtime errors carry:
 * - code: Machine-readable error category
 * - message: Human-readable description
 * - requestId: Correlation ID for tracing (optional)
 */
export class ContextOSRuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly requestId?: string;

  constructor(code: RuntimeErrorCode, message: string, requestId?: string) {
    super(message);
    this.name = 'ContextOSRuntimeError';
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Thrown when a Run or Context is not found.
 */
export class RuntimeNotFoundError extends ContextOSRuntimeError {
  constructor(message: string, requestId?: string) {
    super('RUNTIME_NOT_FOUND', message, requestId);
    this.name = 'RuntimeNotFoundError';
  }
}

/**
 * Thrown when an authorization check fails.
 */
export class RuntimeAuthorizationError extends ContextOSRuntimeError {
  constructor(message: string, requestId?: string) {
    super('RUNTIME_AUTHORIZATION', message, requestId);
    this.name = 'RuntimeAuthorizationError';
  }
}

/**
 * Thrown when request validation fails.
 */
export class RuntimeValidationError extends ContextOSRuntimeError {
  constructor(message: string, requestId?: string) {
    super('RUNTIME_VALIDATION', message, requestId);
    this.name = 'RuntimeValidationError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of creating a new Run.
 */
export interface CreateRunResult {
  run: ContextOSRun;
  contextPackage: RuntimeContextPackage;
}

/**
 * Result of completing a Run.
 */
export interface CompleteRunResult {
  run: ContextOSRun;
  learningCandidateIds: string[];
}

/**
 * Options for createRunId — ensures deterministic ID generation.
 */
export interface CreateRunIdOptions {
  ownerId: string;
  purpose: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.2 — Retrieval Diagnostics Contracts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Name of a context source in the Runtime Retrieval pipeline.
 */
export type RuntimeContextSourceName =
  | 'memory'
  | 'decision'
  | 'outcome'
  | 'feedback'
  | 'knowledge'
  | 'graph';

/**
 * Status of a context source in the Runtime Retrieval pipeline.
 *
 * - included:    Source returned valid contexts that passed validation.
 * - disabled:    Policy explicitly disabled this source.
 * - unavailable: Required optional provider not configured.
 * - failed:      Source execution failed, or all results rejected by security.
 */
export type RuntimeContextSourceStatus =
  | 'included'
  | 'disabled'
  | 'unavailable'
  | 'failed';

/**
 * Report for a single context source in the Runtime Retrieval pipeline.
 */
export interface RuntimeContextSourceReport {
  /** Which source this report describes */
  source: RuntimeContextSourceName;

  /** Status of this source */
  status: RuntimeContextSourceStatus;

  /** Number of contexts contributed by this source (after validation) */
  contextCount: number;

  /** Optional warning message */
  warning?: string;
}

/**
 * Complete result of the Runtime Retrieval pipeline, including diagnostics.
 */
export interface RuntimeContextRetrievalResult {
  /** All validated context objects (deduplicated, merged) */
  contexts: import('@/context/context-object').ContextObject[];

  /** Per-source reports */
  sources: RuntimeContextSourceReport[];

  /** Aggregate warnings from any source */
  warnings: string[];
}
