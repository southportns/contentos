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
 *   runtime-learning.ts      — P0.7.5 learning pipeline
 *
 * Future modules (P0.7.6+):
 *   runtime-injection.ts     — Context package formation
 *   runtime-run.ts           — Agent Run lifecycle
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
  // P0.7.2 — Retrieval diagnostics
  RuntimeContextSourceName,
  RuntimeContextSourceStatus,
  RuntimeContextSourceReport,
  RuntimeContextRetrievalResult,
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
  retrieveRuntimeContextWithMetadata,
  assembleRuntimeContext,
  resolveRuntimePolicy,
  createContextUsage,
  mapPurposeToAssembly,
  createRuntimeRunner,
} from './runtime-context';

export type {
  RuntimeRetrievalDependencies,
  RuntimeRunnerDependencies,
} from './runtime-context';

export { DEFAULT_RUNTIME_POLICY } from './runtime-context';

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.5 — Learning Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

export {
  runRuntimeLearning,
  evaluateLearningCandidate,
  validatePolicy,
  DEFAULT_LEARNING_POLICY,
  LearningAuthorizationError,
  LearningValidationError,
} from './runtime-learning';

export type {
  RuntimeLearningSource,
  RuntimeLearningDependencies,
  RuntimeLearningInput,
  ContextOSLearningPolicy,
  RuntimeLearningPolicyReasonCode,
  RuntimeLearningPolicyEvaluation,
  RuntimeLearningItemStatus,
  RuntimeLearningItemResult,
  RuntimeLearningResult,
} from './runtime-learning';

// ═══════════════════════════════════════════════════════════════════════════════
// P0.7.4 — Run Store (Persistence Abstraction)
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  ContextOSRunStore,
  ContextOSRunQuery,
  ContextOSRunListResult,
} from './run-store';

export {
  RunConflictError,
  RunNotFoundError,
  RunPersistenceError,
  RunValidationError,
  DEFAULT_RUN_LIMIT,
  MAX_RUN_LIMIT,
} from './run-store';

export { createPrismaRunStore } from './prisma-run-store';
export type { PrismaContextOSRunStore } from './prisma-run-store';
