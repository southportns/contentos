/**
 * P0.7.6 — End-to-End Agent Context Loop
 *
 * Orchestrates the complete Agent execution lifecycle:
 *
 *   Validate Request
 *     → Create Run (started) → Persist
 *     → Retrieve Contexts
 *     → Assemble RuntimeContextPackage
 *     → Persist Run (running + contextIds)
 *     → Execute Agent (provider-agnostic)
 *     → Capture Agent Output + Decision/Outcome IDs
 *     → Resolve Learning Evidence from persisted records
 *     → Execute P0.7.5 Policy Evaluation + Memory Persistence
 *     → Persist Run (completed + output + IDs + completedAt)
 *     → Return Typed Result
 *
 * Architecture Position:
 *
 *   This module is the COMPOSITE entry point that wires P0.7.2–P0.7.5
 *   subsystems into a single durable execution path.
 *
 *   It does NOT replace runContextOS(). Instead, it implements a parallel
 *   lifecycle that extends the Run status to include 'running' (after
 *   assembly, before Agent execution) so that a crash mid-execution
 *   leaves a recoverable state.
 *
 * Critical lifecycle constraint:
 *   The Agent executes AFTER assembly and BEFORE the Run is marked completed.
 *   This is the key difference from runContextOS(), which marks the Run
 *   completed immediately after assembly.
 *
 * Design Principles:
 *   1. Orchestration only — no domain logic, no provider coupling
 *   2. Business-agnostic — no ContextOS/Douyin/content hardcoding
 *   3. Deterministic — injected clock, stable IDs, no randomness in core
 *   4. Owner isolation — enforced at every stage
 *   5. Honest reporting — failures, partial successes, and no-evidence states
 *      are all surfaced distinctly
 */

import { createHash } from 'node:crypto';
import type {
  ContextOSRuntimeRequest,
  ContextOSContextPolicy,
  ContextOSRun,
  RuntimeContextPackage,
} from './runtime-types';
import {
  ContextOSRuntimeError,
  RuntimeValidationError,
} from './runtime-types';
import type { ContextOSRunStore } from './run-store';
import type { MemoryStore } from '@/memory/persistence/memory-store';
import type { RuntimeLearningSource } from './runtime-learning';
import type { ContextOSLearningPolicy } from './runtime-learning';
import { runRuntimeLearning } from './runtime-learning';

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Executor Contract (Provider-Agnostic)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input to the Agent executor callback.
 *
 * Contains everything the Agent needs:
 * - The original runtime request (for input, purpose, scope)
 * - The current Run record (for lifecycle tracking)
 * - The assembled context package (for injection into the Agent)
 */
export interface RuntimeAgentExecutionInput {
  request: ContextOSRuntimeRequest;
  run: ContextOSRun;
  contextPackage: RuntimeContextPackage;
}

/**
 * Result from the Agent executor callback.
 *
 * The executor returns:
 * - output: arbitrary Agent output (structure defined by application)
 * - decisionIds: IDs of decisions made during execution (optional)
 * - outcomeIds: IDs of outcomes observed during execution (optional)
 *
 * IMPORTANT: These IDs must correspond to ACTUAL persisted records
 * when the application contract says they do. Do not fabricate IDs.
 */
export interface RuntimeAgentExecutionResult {
  output: unknown;
  decisionIds?: string[];
  outcomeIds?: string[];
}

/**
 * Agent executor callback type.
 *
 * This is the ONLY provider-specific injection point.
 * Runtime does NOT contain OpenAI/Anthropic/other SDK dependencies.
 *
 * Implementations MUST:
 * - Be async (return Promise)
 * - NOT directly persist learning evidence (that is the resolver's job)
 * - NOT mark the Run as completed (that is the orchestrator's job)
 */
export type RuntimeAgentExecutor = (
  input: RuntimeAgentExecutionInput
) => Promise<RuntimeAgentExecutionResult>;

// ═══════════════════════════════════════════════════════════════════════════════
// Learning Evidence Resolver Contract
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Callback that resolves learning sources from the executed request,
 * current Run, and Agent result.
 *
 * This is an ADAPTER for application-specific persistence/retrieval.
 * It must return ACTUAL existing DecisionMemory + DecisionFeedback pairs,
 * not inferred or fabricated records.
 *
 * An empty array is valid: means no suitable evidence exists.
 */
export type RuntimeLearningEvidenceResolver = (
  request: ContextOSRuntimeRequest,
  run: ContextOSRun,
  agentResult: RuntimeAgentExecutionResult
) => Promise<readonly RuntimeLearningSource[]>;

// ═══════════════════════════════════════════════════════════════════════════════
// Dependency Injection Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dependencies injected into runContextOSAgentLoop.
 *
 * All callbacks are async to support I/O-bound implementations.
 * The clock (now) is injected for deterministic timestamps.
 */
export interface RuntimeAgentLoopDependencies {
  /**
   * Retrieve contexts for the runtime request.
   * MUST enforce owner isolation (ownerId-scoped).
   * Reuse: P0.7.2 retrieveRuntimeContext() or equivalent.
   */
  retrieveContext: (
    request: ContextOSRuntimeRequest
  ) => Promise<import('@/context/context-object').ContextObject[]>;

  /**
   * Assemble contexts into a RuntimeContextPackage.
   * MUST enforce token/count budgets from policy.
   * Reuse: P0.7.3 assembleRuntimeContext() or equivalent.
   */
  assembleContext: (
    contexts: import('@/context/context-object').ContextObject[],
    policy: ContextOSContextPolicy | undefined,
    purpose: string
  ) => Promise<RuntimeContextPackage>;

  /**
   * Agent executor — provider-agnostic callback.
   * Receives the assembled context package and returns Agent output.
   */
  executeAgent: RuntimeAgentExecutor;

  /**
   * Learning evidence resolver — returns actual persisted evidence sources.
   * Called after Agent execution to resolve what learning can occur.
   */
  resolveLearningEvidence: RuntimeLearningEvidenceResolver;

  /**
   * Clock function for deterministic timestamps.
   * Default: () => new Date().toISOString()
   */
  now?: () => string;

  /**
   * Required Run Store for durable end-to-end execution.
   * Unlike runContextOS() which treats it as optional, the E2E loop
   * REQUIRES persistence to maintain the full lifecycle.
   */
  runStore: ContextOSRunStore;

  /**
   * Memory Store for learning persistence (P0.7.5).
   * If not provided, the learning stage is skipped entirely.
   */
  memoryStore?: MemoryStore;

  /**
   * Optional learning policy overrides.
   * Merged over DEFAULT_LEARNING_POLICY by validatePolicy().
   */
  learningPolicy?: Partial<ContextOSLearningPolicy>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stage Diagnostics
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Status of a single pipeline stage.
 */
export type RuntimeAgentLoopStageStatus =
  | 'completed'
  | 'skipped'
  | 'failed';

/**
 * Diagnostics for each stage of the agent loop.
 * Provides observability into which stages succeeded, were skipped, or failed.
 */
export interface RuntimeAgentLoopDiagnostics {
  validate: RuntimeAgentLoopStageStatus;
  createRun: RuntimeAgentLoopStageStatus;
  retrieveContext: RuntimeAgentLoopStageStatus;
  assembleContext: RuntimeAgentLoopStageStatus;
  persistRunning: RuntimeAgentLoopStageStatus;
  executeAgent: RuntimeAgentLoopStageStatus;
  resolveEvidence: RuntimeAgentLoopStageStatus;
  learning: RuntimeAgentLoopStageStatus;
  persistCompleted: RuntimeAgentLoopStageStatus;
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loop Result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Learning stage outcome — distinguishes success, no-evidence, and failure.
 */
export type RuntimeAgentLearningStageOutcome =
  | 'completed'           // Learning pipeline executed normally
  | 'no_evidence'         // Resolver returned zero sources — no candidates to evaluate
  | 'skipped'             // No memoryStore configured — learning not attempted
  | 'failed';             // Pipeline threw or per-candidate errors occurred

/**
 * Result of the end-to-end Agent loop.
 *
 * Contains:
 * - run: The final persisted Run record
 * - contextPackage: The assembled context package (as delivered to Agent)
 * - agentResult: The raw Agent execution result
 * - learningResult: P0.7.5 learning result (or null if skipped/no evidence)
 * - learningOutcome: Typed learning-stage status
 * - diagnostics: Stage-by-stage status and warnings
 */
export interface RuntimeAgentLoopResult {
  run: ContextOSRun;
  contextPackage: RuntimeContextPackage;
  agentResult: RuntimeAgentExecutionResult;
  learningResult: import('./runtime-learning').RuntimeLearningResult | null;
  learningOutcome: RuntimeAgentLearningStageOutcome;
  diagnostics: RuntimeAgentLoopDiagnostics;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate the runtime request before any lifecycle operations.
 *
 * Throws RuntimeValidationError if validation fails.
 * This ensures NO spurious Run records are created for invalid requests.
 */
function validateAgentLoopRequest(request: ContextOSRuntimeRequest): void {
  if (!request.ownerId || request.ownerId.trim() === '') {
    throw new RuntimeValidationError('ownerId is required');
  }

  if (!request.purpose || request.purpose.trim() === '') {
    throw new RuntimeValidationError('purpose is required');
  }

  // input is required and MUST NOT be undefined.
  // input: null is allowed (explicit null identity).
  // input: undefined triggers an explicit validation error so that it never
  // hashes to the same value as input: null.
  if (request.input === undefined) {
    throw new RuntimeValidationError('input is required and cannot be undefined');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ID Sanitization
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sanitize Agent-returned ID arrays.
 *
 * - Deduplicates (preserving first-occurrence order)
 * - Filters out non-string, empty, and whitespace-only values
 * - Returns a new array (does not mutate input)
 *
 * Defensive: the Agent result is external input — never trust it blindly.
 */
function sanitizeIdArray(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run Lifecycle Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new Run record in 'started' status.
 *
 * Reuses the same deterministic ID scheme as runContextOS().
 */
/**
 * Deterministic Run ID generator using SHA-256.
 *
 * ID Format: `run_{ownerId}_{taskId?}_{sha256hex}_{timestamp}`
 *
 * Contract:
 *   - `taskId` (optional) is a TRACKING identifier, NOT an idempotency key.
 *     When present, it is embedded in the ID for observability.
 *   - `sha256hex` is the full 64-character SHA-256 hex digest of a canonical
 *     serialization of the request's identity fields: taskId, projectId,
 *     topicId, purpose, input, and contextPolicy.
 *   - Two requests with identical identity fields and timestamp produce the
 *     same ID (deterministic; intended for stable retries). The first write
 *     wins — duplicate IDs are rejected by RunStore.create() with
 *     RunConflictError (no overwrite).
 *   - SHA-256 provides 2^128 collision resistance (birthday bound). For any
 *     practical request volume, collisions are astronomically improbable.
 *     However, no hash function can guarantee mathematical uniqueness —
 *     the system relies on the RunStore to enforce uniqueness at write time.
 *   - Backward compatibility with runContextOS() is NOT required because
 *     runContextOS() uses its own `createRuntimeRunId()` function; P0.7.6
 *     Agent Loop establishes its own ID contract.
 */
export function generateRunId(request: ContextOSRuntimeRequest, timestamp: string): string {
  const identity = canonicalJson({
    taskId: request.taskId ?? null,
    projectId: request.projectId ?? null,
    topicId: request.topicId ?? null,
    purpose: request.purpose,
    input: request.input,
    contextQuery: request.contextQuery ?? null,
    contextPolicy: request.contextPolicy ?? null,
  });
  const sha256hex = sha256Hash(identity);
  const trackingPart = request.taskId ? `${request.taskId}_` : '';
  return `run_${request.ownerId}_${trackingPart}${sha256hex}_${timestamp}`;
}

/**
 * Compute the SHA-256 hex digest of a string.
 * Produces a full 64-character lowercase hexadecimal string.
 */
export function sha256Hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Strict plain-object check.
 *
 * Returns true only for objects whose prototype is exactly `Object.prototype`
 * or `null` (Object.create(null)). Rejects Date, Map, Set, RegExp, class
 * instances, and any other non-plain object with custom prototype.
 */
function isPlainObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deterministic JSON serialization with strict type enforcement.
 *
 * Guarantees that plain objects with identical key-value pairs always produce
 * the same string regardless of key order.
 *
 * Supported types: null, string, finite number, boolean, Array, plain object.
 *
 * Explicitly rejected (throws Error, no silent fallback):
 * - Date, Map, Set, RegExp, class instances (non-plain objects)
 * - Function, Symbol, BigInt
 * - undefined, NaN, Infinity, -Infinity
 * - Circular references (detected via seen-set)
 * - Sparse arrays (missing indices — would silently serialize as empty)
 *
 * Negative zero (-0) is normalized to "0" (consistent with JSON.stringify).
 */
export function canonicalJson(value: unknown): string {
  return canonicalJsonInner(value, new Set<object>());
}

/** Internal implementation with circular-reference detection. */
function canonicalJsonInner(value: unknown, seen: Set<object>): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `canonicalJson: non-finite number (${String(value)}) — cannot serialize deterministically`
      );
    }
    // Normalize -0 to "0" to match JSON.stringify semantics deterministically.
    if (Object.is(value, -0)) {
      return '0';
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error('canonicalJson: circular reference detected in array');
    }
    seen.add(value);
    // Sparse array detection: every index 0..length-1 MUST be an OWN property.
    // value.map() silently skips empty holes, which would cause
    // canonicalJson([]) === canonicalJson(new Array(1)) — identity corruption.
    // Object.hasOwn (NOT `i in value`) prevents prototype chain pollution
    // from masking genuine holes (e.g. Array.prototype[0] = 'x' must not
    // fill a sparse array's missing index 0).
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) {
        seen.delete(value);
        throw new Error(
          `canonicalJson: sparse arrays are not supported (missing index ${i})`
        );
      }
    }
    // Explicit index loop: avoids calling value.map() which could be
    // overridden by an instance-level or prototype-polluted map method.
    const items: string[] = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      items[i] = canonicalJsonInner(value[i], seen);
    }
    seen.delete(value);
    return '[' + items.join(',') + ']';
  }
  if (isPlainObject(value)) {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) {
      throw new Error('canonicalJson: circular reference detected in object');
    }
    seen.add(obj);
    const sortedKeys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of sortedKeys) {
      const v = obj[key];
      if (v === undefined) {
        throw new Error(
          `canonicalJson: undefined value for key "${key}" — cannot serialize deterministically`
        );
      }
      parts.push(`${JSON.stringify(key)}:${canonicalJsonInner(v, seen)}`);
    }
    seen.delete(obj);
    return '{' + parts.join(',') + '}';
  }
  throw new Error(
    `canonicalJson: unsupported type "${typeof value}" (${value?.constructor?.name ?? String(value)}) — cannot serialize deterministically`
  );
}

function createStartedRun(
  request: ContextOSRuntimeRequest,
  timestamp: string
): ContextOSRun {
  return {
    id: generateRunId(request, timestamp),
    ownerId: request.ownerId,
    projectId: request.projectId,
    topicId: request.topicId,
    purpose: request.purpose,
    input: request.input,
    contextIds: [],
    decisionIds: [],
    outcomeIds: [],
    output: undefined,
    status: 'started',
    startedAt: timestamp,
    completedAt: undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public Entry Point: runContextOSAgentLoop
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute the complete end-to-end Agent Context Loop.
 *
 * This is the E2E entry point that orchestrates:
 *
 *   1. Validate request (no Run created on failure)
 *   2. Create Run (status: 'started')
 *   3. Persist started Run
 *   4. Retrieve contexts (delegated)
 *   5. Assemble RuntimeContextPackage (delegated)
 *   6. Persist Run (status: 'running' + contextIds)
 *   7. Execute Agent (delegated to injected executor)
 *   8. Resolve learning evidence from actual persisted records
 *   9. Execute P0.7.5 learning pipeline (if memoryStore provided)
 *   10. Persist Run (status: 'completed' + output + IDs + completedAt)
 *   11. Return typed result with diagnostics
 *
 * Failure semantics:
 *   - Any retrieval/assembly/Agent failure marks the Run as 'failed'
 *   - Learning failure does NOT mark the Run as failed
 *   - Persist failure of the failed-state is reported without losing original error
 *
 * @param request - The runtime request (ownerId, purpose, input required)
 * @param dependencies - Injected callbacks, stores, and clock
 * @returns RuntimeAgentLoopResult with the completed run and all stage outputs
 * @throws RuntimeValidationError if request is invalid
 * @throws ContextOSRuntimeError for unrecoverable lifecycle failures
 */
export async function runContextOSAgentLoop(
  request: ContextOSRuntimeRequest,
  dependencies: RuntimeAgentLoopDependencies
): Promise<RuntimeAgentLoopResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());

  // Initialize diagnostics
  const diagnostics: RuntimeAgentLoopDiagnostics = {
    validate: 'failed',
    createRun: 'failed',
    retrieveContext: 'failed',
    assembleContext: 'failed',
    persistRunning: 'failed',
    executeAgent: 'failed',
    resolveEvidence: 'failed',
    learning: 'skipped',
    persistCompleted: 'failed',
    warnings: [],
  };

  // ─── Stage 1: Validate Request ────────────────────────────────────────────
  // Invalid requests MUST fail without creating any Run record.
  validateAgentLoopRequest(request);
  diagnostics.validate = 'completed';

  // ─── Stage 2: Create Run (status: 'started') ──────────────────────────────
  const timestamp = now();
  const run = createStartedRun(request, timestamp);
  diagnostics.createRun = 'completed';

  // ─── Stage 3: Persist Started Run ─────────────────────────────────────────
  // This is REQUIRED (runStore is mandatory for the E2E loop).
  // If persist fails, we cannot proceed — throw immediately.
  try {
    await dependencies.runStore.create(run);
  } catch (persistError) {
    throw new ContextOSRuntimeError(
      'RUNTIME_EXECUTION',
      `Failed to persist started run: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
      run.id
    );
  }

  // Context package (for use in Agent execution and final result)
  let contextPackage: RuntimeContextPackage;
  let agentResult: RuntimeAgentExecutionResult;
  let learningResult: import('./runtime-learning').RuntimeLearningResult | null = null;
  let learningOutcome: RuntimeAgentLearningStageOutcome = 'skipped';

  try {
    // ─── Stage 4: Retrieve Contexts ────────────────────────────────────────
    const contexts = await dependencies.retrieveContext(request);
    diagnostics.retrieveContext = 'completed';

    // ─── Stage 5: Assemble Contexts ────────────────────────────────────────
    contextPackage = await dependencies.assembleContext(
      contexts,
      request.contextPolicy,
      request.purpose
    );
    diagnostics.assembleContext = 'completed';

    // ─── Stage 6: Persist Run (status: 'running') ─────────────────────────
    // Record the contextIds BEFORE Agent execution so that even if the Agent
    // crashes, we know what contexts were prepared.
    const runningRun: ContextOSRun = {
      ...run,
      status: 'running',
      contextIds: contextPackage.contextIds,
    };

    try {
      await dependencies.runStore.update(runningRun);
    } catch (persistError) {
      throw new ContextOSRuntimeError(
        'RUNTIME_EXECUTION',
        `Failed to persist running run: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
        run.id
      );
    }
    diagnostics.persistRunning = 'completed';

    // ─── Stage 7: Execute Agent ────────────────────────────────────────────
    // The executor receives the assembled package. Runtime does NOT interpret
    // the output — it merely stores it.
    agentResult = await dependencies.executeAgent({
      request,
      run: runningRun,
      contextPackage,
    });
    diagnostics.executeAgent = 'completed';

    // ─── Stage 8: Resolve Learning Evidence ───────────────────────────────
    // The resolver returns ACTUAL persisted evidence (not fabricated).
    let learningSources: readonly RuntimeLearningSource[] = [];
    let evidenceResolutionFailed = false;
    try {
      learningSources = await dependencies.resolveLearningEvidence(
        request,
        runningRun,
        agentResult
      );
      diagnostics.resolveEvidence = 'completed';
    } catch (resolveError) {
      // Resolution failure is reported truthfully — do not fabricate sources.
      // This is DISTINCT from "no evidence": the resolver itself broke.
      evidenceResolutionFailed = true;
      diagnostics.resolveEvidence = 'failed';
      diagnostics.warnings.push(
        `Learning evidence resolution failed: ${resolveError instanceof Error ? resolveError.message : String(resolveError)}`
      );
    }

    // ─── Stage 9: P0.7.5 Learning Pipeline ────────────────────────────────
    // Only execute if memoryStore is configured AND we have evidence.
    // Critical state distinctions (R1 contract):
    //   - memoryStore missing  → 'skipped' (never attempted)
    //   - resolver threw       → 'failed'  (NOT no_evidence)
    //   - resolver returned [] → 'no_evidence' (valid empty state)
    //   - pipeline ran, items failed → 'failed' (persistence errors)
    if (!dependencies.memoryStore) {
      learningOutcome = 'skipped';
      diagnostics.learning = 'skipped';
    } else if (evidenceResolutionFailed) {
      // Resolution itself failed — NOT the same as 'no evidence'
      learningOutcome = 'failed';
      diagnostics.learning = 'failed';
    } else if (learningSources.length === 0) {
      // Valid state: no evidence available — not a failure.
      learningOutcome = 'no_evidence';
      diagnostics.learning = 'skipped';
      diagnostics.warnings.push(
        'No learning evidence sources available — learning skipped'
      );
    } else {
      // Execute P0.7.5 pipeline via runRuntimeLearning()
      try {
        learningResult = await runRuntimeLearning(
          {
            authenticatedOwnerId: request.ownerId,
            sources: learningSources,
            policy: dependencies.learningPolicy,
          },
          {
            memoryStore: dependencies.memoryStore,
            now,
          }
        );
        // Distinguish pipeline completion from successful persistence:
        //   - counts.failed > 0 means some candidates failed to persist → 'failed'
        //   - counts.failed === 0 means all candidates processed cleanly → 'completed'
        if (learningResult.counts.failed > 0) {
          learningOutcome = 'failed';
          diagnostics.learning = 'failed';
          diagnostics.warnings.push(
            `Learning pipeline completed with ${learningResult.counts.failed} failed persistence/${learningResult.counts.total} total candidates`
          );
        } else {
          learningOutcome = 'completed';
          diagnostics.learning = 'completed';
        }
      } catch (learningError) {
        // Learning failure (including owner mismatch) is reported,
        // NOT treated as a Run failure. The Agent succeeded even if learning didn't.
        learningOutcome = 'failed';
        diagnostics.learning = 'failed';
        diagnostics.warnings.push(
          `Learning pipeline failed: ${learningError instanceof Error ? learningError.message : String(learningError)}`
        );
      }
    }

    // ─── Stage 10: Persist Completed Run ──────────────────────────────────
    // Sanitize Agent-returned IDs defensively
    const decisionIds = sanitizeIdArray(agentResult.decisionIds);
    const outcomeIds = sanitizeIdArray(agentResult.outcomeIds);

    const completedRun: ContextOSRun = {
      ...runningRun,
      status: 'completed',
      contextIds: contextPackage.contextIds,
      decisionIds,
      outcomeIds,
      output: agentResult.output,
      completedAt: now(),
    };

    try {
      await dependencies.runStore.update(completedRun);
    } catch (persistError) {
      // Completed-state persistence failure: do NOT report success.
      throw new ContextOSRuntimeError(
        'RUNTIME_EXECUTION',
        `Agent completed but failed to persist completion status: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
        run.id
      );
    }
    diagnostics.persistCompleted = 'completed';

    // ─── Stage 11: Return Result ──────────────────────────────────────────
    return {
      run: completedRun,
      contextPackage,
      agentResult,
      learningResult,
      learningOutcome,
      diagnostics,
    };
  } catch (error) {
    // ─── Failure Recovery: Persist Run as 'failed' ──────────────────────────
    // Preserve all known information from the partial execution.
    const failedRun: ContextOSRun = {
      ...run,
      status: 'failed',
      completedAt: now(),
      // Include contextIds if assembly succeeded
      contextIds: diagnostics.assembleContext === 'completed' && contextPackage
        ? contextPackage.contextIds
        : [],
      // Include output if Agent succeeded
      output: diagnostics.executeAgent === 'completed' ? agentResult?.output : undefined,
      // Include Agent IDs if Agent succeeded
      decisionIds: diagnostics.executeAgent === 'completed' && agentResult
        ? sanitizeIdArray(agentResult.decisionIds)
        : [],
      outcomeIds: diagnostics.executeAgent === 'completed' && agentResult
        ? sanitizeIdArray(agentResult.outcomeIds)
        : [],
    };

    try {
      await dependencies.runStore.update(failedRun);
    } catch (persistError) {
      // Both execution failed AND persist failed. Preserve both errors.
      throw new ContextOSRuntimeError(
        'RUNTIME_EXECUTION',
        `Runtime execution failed AND persist failed. Original: ${error instanceof Error ? error.message : String(error)}; Persist: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
        run.id
      );
    }

    // If the error is already a ContextOSRuntimeError, re-throw as-is
    if (error instanceof ContextOSRuntimeError) {
      throw error;
    }

    // Re-wrap with run correlation ID
    throw new ContextOSRuntimeError(
      'RUNTIME_EXECUTION',
      `Agent loop execution failed: ${error instanceof Error ? error.message : String(error)}`,
      run.id
    );
  }
}
