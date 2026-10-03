/**
 * P0.7.0 — ContextOS Runtime
 *
 * Architecture boundary: Runtime is the orchestration layer between
 * Agent execution and the P0.6 Context/Memory systems.
 *
 * Module Structure (P0.7.0 contract):
 *   runtime-types.ts    — Type contracts
 *
 * Future modules (P0.7.1+):
 *   runtime-context.ts       — Runtime context lifecycle
 *   runtime-retrieval.ts     — Unified retrieval entry point
 *   runtime-assembly.ts      — Assembly orchestration
 *   runtime-injection.ts     — Context package formation
 *   runtime-run.ts           — Agent Run lifecycle
 *   runtime-learning.ts      — Learning candidate generation
 *   runtime-policy.ts        — Memory policy evaluation
 *   runtime-errors.ts        — Error handling
 *
 * P0.7.0 delivers: Type contracts only.
 * No implementation code is created in P0.7.0.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Core Runtime Contracts
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
} from './runtime-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Errors
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ContextOSRuntimeError,
  RuntimeNotFoundError,
  RuntimeAuthorizationError,
  RuntimeValidationError,
} from './runtime-types';

export type { RuntimeErrorCode } from './runtime-types';
