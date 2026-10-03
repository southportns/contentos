/**
 * P0.7.1 — ContextOS Runtime
 *
 * Architecture boundary: Runtime is the orchestration layer between
 * Agent execution and the P0.6 Context/Memory systems.
 *
 * Module Structure:
 *   runtime-types.ts         — Type contracts
 *   runtime-core.ts          — Main orchestrator (runContextOS)
 *   runtime-context.ts       — Context lifecycle (retrieval + assembly)
 *
 * Future modules (P0.7.2+):
 *   runtime-retrieval.ts     — Unified retrieval entry point
 *   runtime-assembly.ts      — Assembly orchestration
 *   runtime-injection.ts     — Context package formation
 *   runtime-run.ts           — Agent Run lifecycle
 *   runtime-learning.ts      — Learning candidate generation
 *   runtime-policy.ts        — Memory policy evaluation
 *   runtime-errors.ts        — Error handling
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Core Runtime Contracts (Types)
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  ContextOSRuntimeRequest,
  ContextOSContextPolicy,
  RuntimeContextPackage,
  ContextUsage,
  ContextOSRun,
  ContextOSRunStatus,
  ContextOSRuntimeDependencies,
  CreateRunResult,
  CompleteRunResult,
  CreateRunIdOptions,
  RuntimeErrorCode,
} from './runtime-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Core Runtime Contracts (Values)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ContextOSRuntimeError,
  RuntimeNotFoundError,
  RuntimeAuthorizationError,
  RuntimeValidationError,
} from './runtime-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Core (Orchestrator)
// ═══════════════════════════════════════════════════════════════════════════════

export { runContextOS, createRuntimeRunId } from './runtime-core';
export type { ContextOSRuntimeFullDependencies } from './runtime-core';

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Context (Retrieval + Assembly)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  retrieveRuntimeContext,
  assembleRuntimeContext,
  resolveRuntimePolicy,
  createContextUsage,
  mapPurposeToAssembly,
  createRuntimeRunner,
} from './runtime-context';

export type {
  RuntimeRetrievalDependencies,
} from './runtime-context';

export { DEFAULT_RUNTIME_POLICY } from './runtime-context';
