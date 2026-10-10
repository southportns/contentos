/**
 * P0.7.4 — ContextOS Run Store Contract
 *
 * Defines the persistence abstraction for ContextOS Agent Runs.
 *
 * Architecture Position:
 *   Runtime Core → ContextOSRunStore (interface) → PrismaContextOSRunStore (impl)
 *
 * Design Principles:
 *   1. Owner isolation — every query MUST carry ownerId
 *   2. Explicit errors — not-found, conflict, and persistence failures are distinct
 *   3. Deterministic ordering — pagination sorted by (createdAt, id)
 *   4. Business-agnostic — no domain-specific fields
 *
 * Boundary:
 *   This is P0.7.4 infrastructure ONLY. It does NOT implement Agent execution,
 *   Decision generation, Outcome evaluation, or Learning (those are P0.7.5+).
 */

import type { ContextOSRun, ContextOSRunStatus } from './runtime-types';
import { ContextOSRuntimeError } from './runtime-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Thrown when a Run with the same ID already exists.
 * Persistence semantics: reject creation, do NOT overwrite.
 */
export class RunConflictError extends ContextOSRuntimeError {
  constructor(message: string, requestId?: string) {
    super('RUNTIME_EXECUTION', message, requestId);
    this.name = 'RunConflictError';
  }
}

/**
 * Thrown when a Run cannot be found or the caller lacks authorization.
 * Authorization failure is intentionally merged with not-found to avoid
 * leaking the existence of other owners' Runs.
 */
export class RunNotFoundError extends ContextOSRuntimeError {
  constructor(message: string, requestId?: string) {
    super('RUNTIME_NOT_FOUND', message, requestId);
    this.name = 'RunNotFoundError';
  }
}

/**
 * Thrown when persistence operations fail unexpectedly.
 * Wraps the original storage-layer error for diagnostics.
 */
export class RunPersistenceError extends ContextOSRuntimeError {
  readonly cause?: Error;

  constructor(message: string, requestId?: string, cause?: Error) {
    super('RUNTIME_EXECUTION', message, requestId);
    this.name = 'RunPersistenceError';
    this.cause = cause;
  }
}

/**
 * Thrown when a Run Store query contains invalid parameters.
 * Distinguishes client input errors from database failures so callers
 * can differentiate a bad request from an infrastructure outage.
 */
export class RunValidationError extends ContextOSRuntimeError {
  constructor(message: string, requestId?: string) {
    super('RUNTIME_VALIDATION', message, requestId);
    this.name = 'RunValidationError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Query & Pagination Types
// ═════════════════════════════════════════════════════════════════════════════==

/**
 * Query parameters for listing Runs.
 *
 * ownerId is MANDATORY for every query — owner isolation is non-optional.
 * All other filters are optional and AND-combined.
 */
export interface ContextOSRunQuery {
  /** MANDATORY owner scope */
  ownerId: string;

  /** Filter by project scope */
  projectId?: string;

  /** Filter by topic scope */
  topicId?: string;

  /** Filter by run status */
  status?: ContextOSRunStatus;

  /** Maximum number of results (default: 20, max: 100) */
  limit?: number;

  /** Cursor for pagination (opaque, from previous response) */
  cursor?: string;
}

/**
 * Paginated result of a Run listing.
 */
export interface ContextOSRunListResult {
  /** Runs matching the query */
  runs: ContextOSRun[];

  /** Cursor for the next page, or null if no more results */
  nextCursor: string | null;

  /** Total count matching filters (before pagination) — may be -1 if not computed */
  totalCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Store Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Persistence contract for ContextOS Agent Runs.
 *
 * Implementations MUST enforce:
 *   - Owner isolation on every operation
 *   - No overwrite on ID conflict
 *   - Deterministic ordering for pagination
 *   - Explicit error semantics
 *
 * Implementations MUST NOT:
 *   - Fabricate data
 *   - Silently swallow errors
 *   - Leak one owner's data to another
 *   - Use uncontrolled system clocks
 */
export interface ContextOSRunStore {
  /**
   * Create a new Run record.
   *
   * @param run - The run to persist (must have valid id, ownerId, status, startedAt)
   * @throws RunConflictError if a run with the same id already exists
   * @throws RunPersistenceError if the storage layer fails
   */
  create(run: ContextOSRun): Promise<ContextOSRun>;

  /**
   * Update an existing Run record.
   *
   * @param run - The run with updated fields (id, ownerId identify the record)
   * @throws RunNotFoundError if no run exists with the given id for this owner
   * @throws RunPersistenceError if the storage layer fails
   */
  update(run: ContextOSRun): Promise<ContextOSRun>;

  /**
   * Get a single Run by ownerId and runId.
   *
   * @param ownerId - Owner scope (mandatory)
   * @param runId - The run's unique id
   * @returns The run, or null if not found or not owned by the caller
   * @throws RunPersistenceError if the storage layer fails
   */
  getById(ownerId: string, runId: string): Promise<ContextOSRun | null>;

  /**
   * List Runs for an owner with optional filters and pagination.
   *
   * @param query - Query parameters (ownerId mandatory)
   * @returns Paginated result with nextCursor
   * @throws RunPersistenceError if the storage layer fails
   */
  list(query: ContextOSRunQuery): Promise<ContextOSRunListResult>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Limits
// ═══════════════════════════════════════════════════════════════════════════════

/** Default page size for list() */
export const DEFAULT_RUN_LIMIT = 20;

/** Maximum allowed page size for list() */
export const MAX_RUN_LIMIT = 100;
