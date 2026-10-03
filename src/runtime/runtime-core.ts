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
 *   Create Run → Retrieve Context → Assemble Context → Package
 *         ↓
 *   CreateRunResult { run, contextPackage }
 *
 * Responsibilities:
 *   1. Create a deterministic Run record
 *   2. Delegate retrieval to injected dependency (P0.7.2 specializes this)
 *   3. Delegate assembly to injected dependency (P0.7.3 specializes this)
 *   4. Package result with usage tracking metadata
 *
 * NON-Responsibilities (future phases):
 *   - Agent execution (P0.7.4)
 *   - Decision recording (P0.7.4)
 *   - Outcome evaluation (P0.7.5)
 *   - Learning generation (P0.7.5)
 *   - Memory persistence (P0.7.5)
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

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Full Dependencies (P0.7.1 defines the contract)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full dependency injection interface for runContextOS.
 *
 * P0.7.1 defines this contract.
 * P0.7.2 specializes retrieveContext with unified retrieval.
 * P0.7.3 specializes assembleContext with full assembly pipeline.
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
  validateRuntimeRequest(request);

  // ─── Stage 1: Create Run ────────────────────────────────────────────────
  const run = createRuntimeRun(request, timestamp);

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

    return {
      run: completedRun,
      contextPackage,
    };
  } catch (error) {
    // Mark run as failed
    const failedRun: ContextOSRun = {
      ...run,
      status: 'failed',
      completedAt: now(),
    };

    // Re-throw with run context
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
