/**
 * P0.7.1 — ContextOS Runtime Core (Main Orchestrator)
 *
 * Implements the runContextOS() entry point — the main orchestration
 * function for the ContextOS Runtime layer.
 *
 * Architecture Position:
 *
 *   ContextOSRuntimeRequest
 *         ↓
 *   runContextOS()
 *         ↓
 *   Create Run → [Persist started] → Retrieve Context → Assemble Context
 *         ↓
 *   [Persist completed/failed] → Package
 *         ↓
 *   CreateRunResult { run, contextPackage }
 *
 * Responsibilities:
 *   1. Create a deterministic Run record
 *   2. Persist Run lifecycle via injected Run Store (P0.7.4)
 *   3. Delegate retrieval to injected dependency (P0.7.2 specializes this)
 *   4. Delegate assembly to injected dependency (P0.7.3 specializes this)
 *   5. Package result with usage tracking metadata
 *
 * NON-Responsibilities (future phases):
 *   - Agent execution (P0.7.5)
 *   - Decision recording (P0.7.5)
 *   - Outcome evaluation (P0.7.5)
 *   - Learning generation (P0.7.5)
 *
 * Determinism: All IDs and timestamps are generated via injected `now()`.
 */

import type {
  ContextOSRuntimeRequest,
  ContextOSContextPolicy,
  ContextOSRun,
  RuntimeContextPackage,
  CreateRunResult,
} from './runtime-types';
import type { ContextObject } from '@/context/context-object';
// Import error classes directly to ensure proper runtime availability
import {
  ContextOSRuntimeError,
  RuntimeValidationError,
} from './runtime-types';
import type { ContextOSRunStore } from './run-store';

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Full Dependencies (P0.7.1 defines the contract)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full dependency injection interface for runContextOS.
 *
 * P0.7.1 defines this contract.
 * P0.7.2 specializes retrieveContext with unified retrieval.
 * P0.7.3 specializes assembleContext with full assembly pipeline.
 * P0.7.4 adds optional runStore for persistence.
 */
export interface ContextOSRuntimeFullDependencies {
  /**
   * Retrieve contexts for the runtime request.
   * MUST enforce owner isolation (ownerId-scoped).
   * MUST respect contextPolicy filters.
   *
   * P0.7.1: Basic implementation provided.
   * P0.7.2: Replaced with retrieveRuntimeContext().
   */
  retrieveContext: (
    request: ContextOSRuntimeRequest
  ) => Promise<ContextObject[]>;

  /**
   * Assemble contexts into a RuntimeContextPackage.
   * MUST enforce token/count budgets from policy.
   *
   * P0.7.1: Basic implementation provided.
   * P0.7.3: Replaced with assembleRuntimeContext().
   */
  assembleContext: (
    contexts: ContextObject[],
    policy: ContextOSContextPolicy | undefined,
    purpose: string
  ) => Promise<RuntimeContextPackage>;

  /**
   * Clock function for deterministic timestamps.
   * Default: () => new Date().toISOString()
   */
  now?: () => string;

  /**
   * P0.7.4 — Run Store for persistence.
   *
   * When provided:
   *   - Run is persisted with status='started' BEFORE retrieval
   *   - Run is updated with status='completed' after assembly
   *   - Run is updated with status='failed' on retrieval/assembly error
   *
   * When NOT provided (default, backward-compatible):
   *   - Run lifecycle stays in memory only (P0.7.1 — P0.7.3 behavior)
   *
   * Implementations MUST enforce owner isolation.
   */
  runStore?: ContextOSRunStore;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Orchestrator: runContextOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a complete ContextOS Runtime cycle.
 *
 * This is the PRIMARY entry point for the Runtime layer.
 * It orchestrates the full lifecycle:
 *
 *   1. Create Run (status: 'started')
 *   2. Retrieve Context (delegated to dependency)
 *   3. Assemble Context (delegated to dependency)
 *   4. Complete Run (status: 'completed')
 *   5. Return result
 *
 * Architecture:
 *   Runtime is ORCHESTRATION ONLY — it does NOT implement
 *   retrieval or assembly logic. Those are delegated to
 *   injected dependencies.
 *
 * Error Handling:
 *   - Run is created with status 'failed' on unrecoverable errors
 *   - ContextOSRuntimeError is thrown for runtime-specific issues
 *
 * @param request - The runtime request
 * @param dependencies - Injected retrieval/assembly/clock functions
 * @returns CreateRunResult with the run record and context package
 * @throws RuntimeValidationError if request is invalid
 * @throws ContextOSRuntimeError for runtime-level failures
 */
export async function runContextOS(
  request: ContextOSRuntimeRequest,
  dependencies: ContextOSRuntimeFullDependencies
): Promise<CreateRunResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const timestamp = now();

  // ─── Validate Request ───────────────────────────────────────────────────
  // Validation errors throw BEFORE any Run record is created (no spurious records)
  validateRuntimeRequest(request);

  // ─── Stage 1: Create Run (in memory) ───────────────────────────────────
  const run = createRuntimeRun(request, timestamp);

  // ─── Stage 1.5: Persist Run (if Store is configured) ───────────────────
  // P0.7.4: Persist BEFORE retrieval so the Run record exists even if we crash.
  // When runStore is NOT configured, skip persistence entirely (backward-compatible).
  if (dependencies.runStore) {
    try {
      await dependencies.runStore.create(run);
    } catch (persistError) {
      // Persist failure MUST NOT silently proceed to retrieval/assembly
      // The Run creation failed, so we cannot continue as if nothing happened
      throw new ContextOSRuntimeError(
        'RUNTIME_EXECUTION',
        `Failed to persist run: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
        run.id
      );
    }
  }

  try {
    // ─── Stage 2: Retrieve Context ─────────────────────────────────────────
    const contexts = await dependencies.retrieveContext(request);

    // ─── Stage 3: Assemble Context ────────────────────────────────────────
    const contextPackage = await dependencies.assembleContext(
      contexts,
      request.contextPolicy,
      request.purpose
    );

    // ─── Stage 4: Update Run with Results ──────────────────────────────────
    const completedRun: ContextOSRun = {
      ...run,
      status: 'completed',
      contextIds: contextPackage.contextIds,
      completedAt: now(),
    };

    // P0.7.4: Persist completed status
    if (dependencies.runStore) {
      try {
        await dependencies.runStore.update(completedRun);
      } catch (persistError) {
        // Completed status persist failure: do NOT return a success that isn't confirmed persisted
        throw new ContextOSRuntimeError(
          'RUNTIME_EXECUTION',
          `Run completed but failed to persist completion status: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
          completedRun.id
        );
      }
    }

    return {
      run: completedRun,
      contextPackage,
    };
  } catch (error) {
    // P0.7.4: Persist failed status (wrap around existing error)
    // We attempt to record the failure even though we're about to throw
    const failedRun: ContextOSRun = {
      ...run,
      status: 'failed',
      completedAt: now(),
    };

    if (dependencies.runStore) {
      try {
        await dependencies.runStore.update(failedRun);
      } catch (persistError) {
        // Both execution failed AND persist failed. Preserve both.
        throw new ContextOSRuntimeError(
          'RUNTIME_EXECUTION',
          `Runtime execution failed AND persist failed. Original: ${error instanceof Error ? error.message : String(error)}; Persist: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
          failedRun.id
        );
      }
    }

    // If the error is already a ContextOSRuntimeError (e.g. from persist failure above), re-throw as-is
    if (error instanceof ContextOSRuntimeError) {
      throw error;
    }

    // Re-throw with run correlation ID
    throw new ContextOSRuntimeError(
      'RUNTIME_EXECUTION',
      `Runtime execution failed: ${error instanceof Error ? error.message : String(error)}`,
      failedRun.id
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate a Runtime Request before processing.
 *
 * Throws RuntimeValidationError if validation fails.
 */
function validateRuntimeRequest(request: ContextOSRuntimeRequest): void {
  if (!request.ownerId || request.ownerId.trim() === '') {
    throw new RuntimeValidationError('ownerId is required');
  }

  if (!request.purpose || request.purpose.trim() === '') {
    throw new RuntimeValidationError('purpose is required');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run Lifecycle Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new ContextOSRun record.
 *
 * ID Format: run_${ownerId}_${timestamp}
 * Deterministic given same ownerId and timestamp.
 */
function createRuntimeRun(
  request: ContextOSRuntimeRequest,
  timestamp: string
): ContextOSRun {
  const runId = createRuntimeRunId(request.ownerId, timestamp);

  return {
    id: runId,
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

/**
 * Create a deterministic Run ID.
 *
 * Format: run_${ownerId}_${timestamp}
 * No UUID, no randomness.
 */
export function createRuntimeRunId(ownerId: string, timestamp: string): string {
  return `run_${ownerId}_${timestamp}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Error Re-exports (convenience)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ContextOSRuntimeError,
  RuntimeNotFoundError,
  RuntimeAuthorizationError,
  RuntimeValidationError,
} from './runtime-types';
