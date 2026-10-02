/**
 * P0.6.5.2 — Outcome Memory Service
 *
 * Provides Outcome lifecycle operations: archive, restore, batch import.
 *
 * Architecture Position:
 *
 *   OutcomeMemoryService
 *       ↓
 *   MemoryStore (update with OCC)
 *       ↓
 *   Database
 *
 * State Machine:
 *
 *   active ──archive──→ archived
 *   archived ──restore──→ active
 *
 * Design Principles:
 *   1. Outcome payload is IMMUTABLE — never modified after creation
 *   2. Lifecycle status is the ONLY mutable aspect (active ↔ archived)
 *   3. All transitions require authenticatedOwnerId (authorization boundary)
 *   4. Never deletes records — status changes only
 *   5. Uses OCC (version-based) for concurrency safety
 *   6. Batch import validates entire batch before sequential persistence
 */

import type { MemoryStore } from './persistence/memory-store';
import type { OutcomeMemory } from './outcome-memory';
import type { MemoryStatus } from './memory-record';
import { OUTCOME_MEMORY_TYPE } from './outcome-memory';
import { validateOutcomePayload } from './outcome-memory';
import { validateMemoryRecord } from './persistence/memory-persistence-validation';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when an Outcome state transition violates the lifecycle rules.
 *
 * Valid transitions:
 * - active → archived
 * - archived → active
 *
 * Invalid transitions:
 * - active → active
 * - archived → archived
 */
export class OutcomeTransitionError extends Error {
  constructor(
    public readonly outcomeId: string,
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(
      `cannot transition outcome from "${fromStatus}" to "${toStatus}" — id=${outcomeId}`,
    );
    this.name = 'OutcomeTransitionError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Batch Import Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of a single outcome import within a batch import operation.
 */
export interface OutcomeImportItemResult {
  /** The memory ID that was imported (attempted) */
  id: string;

  /** Whether this individual import succeeded */
  success: boolean;

  /** Error message if this individual import failed */
  error?: string;
}

/**
 * Result of a batch import operation.
 *
 * Architecture note (P0.6.5.2): batch import uses sequential persistence
 * (not full transaction atomicity). If a mid-batch item fails, earlier
 * items remain persisted and later items may not be processed.
 *
 * Callers should inspect `results` to determine per-item success/failure.
 */
export interface OutcomeImportResult {
  /** Total number of outcomes in the input batch */
  total: number;

  /** Number of outcomes successfully persisted */
  imported: number;

  /** Number of outcomes that failed (validation or persistence error) */
  failed: number;

  /** Per-item results — index-aligned with input array */
  results: OutcomeImportItemResult[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Memory Service Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service interface for Outcome Memory lifecycle operations.
 *
 * Implementations use MemoryStore for persistence, enforcing:
 * - Owner authorization via authenticatedOwnerId
 * - Optimistic concurrency via expectedVersion
 * - No physical deletion on state transitions
 * - Immutable observation payload
 */
export interface OutcomeMemoryService {
  /**
   * Archive an active outcome (active → archived).
   *
   * @param outcomeId - The ID of the outcome to archive
   * @param authenticatedOwnerId - Authenticated caller's user ID
   * @param expectedVersion - Expected current version for OCC
   * @return The archived OutcomeMemory with status='archived' and version+1
   * @throws MemoryNotFoundError if outcome not found or wrong owner
   * @throws OutcomeTransitionError if outcome is not active
   * @throws MemoryConcurrencyError if version mismatch
   */
  archiveOutcome(
    outcomeId: string,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<OutcomeMemory>;

  /**
   * Restore an archived outcome (archived → active).
   *
   * @param outcomeId - The ID of the outcome to restore
   * @param authenticatedOwnerId - Authenticated caller's user ID
   * @param expectedVersion - Expected current version for OCC
   * @return The restored OutcomeMemory with status='active' and version+1
   * @throws MemoryNotFoundError if outcome not found or wrong owner
   * @throws OutcomeTransitionError if outcome is not archived
   * @throws MemoryConcurrencyError if version mismatch
   */
  restoreOutcome(
    outcomeId: string,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<OutcomeMemory>;

  /**
   * Batch import outcomes into the memory store.
   *
   * Each outcome is validated before any persistence. Validated outcomes
   * are persisted sequentially — if one fails, partial success is possible.
   *
   * @param outcomes - Array of OutcomeMemory to import (must have valid payloads)
   * @param authenticatedOwnerId - Authenticated caller's user ID (ownership check)
   * @return Result with per-item success/failure details
   * @throws (no exception for validation failures — they are captured in results)
   */
  importOutcomes(
    outcomes: OutcomeMemory[],
    authenticatedOwnerId: string,
  ): Promise<OutcomeImportResult>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OutcomeMemoryService implementation using MemoryStore.
 *
 * Delegates all persistence to the injected MemoryStore interface,
 * enabling both real SQLite and mock store testing.
 */
export class OutcomeMemoryServiceImpl implements OutcomeMemoryService {
  private _store: MemoryStore;

  constructor(store: MemoryStore) {
    this._store = store;
  }

  async archiveOutcome(
    outcomeId: string,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<OutcomeMemory> {
    const record = await this._fetchAndValidateOutcome(
      outcomeId,
      authenticatedOwnerId,
    );

    const currentStatus = record.status;

    // Validate state transition: active → archived only
    if (currentStatus === 'archived') {
      throw new OutcomeTransitionError(outcomeId, currentStatus, 'archived');
    }

    if (currentStatus !== 'active') {
      throw new OutcomeTransitionError(outcomeId, currentStatus, 'archived');
    }

    return this._transitionStatus(
      record,
      'archived',
      authenticatedOwnerId,
      expectedVersion,
    );
  }

  async restoreOutcome(
    outcomeId: string,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<OutcomeMemory> {
    const record = await this._fetchAndValidateOutcome(
      outcomeId,
      authenticatedOwnerId,
    );

    const currentStatus = record.status;

    // Validate state transition: archived → active only
    if (currentStatus === 'active') {
      throw new OutcomeTransitionError(outcomeId, currentStatus, 'active');
    }

    if (currentStatus !== 'archived') {
      throw new OutcomeTransitionError(outcomeId, currentStatus, 'active');
    }

    return this._transitionStatus(
      record,
      'active',
      authenticatedOwnerId,
      expectedVersion,
    );
  }

  async importOutcomes(
    outcomes: OutcomeMemory[],
    authenticatedOwnerId: string,
  ): Promise<OutcomeImportResult> {
    // Empty batch — return success with zero counts
    if (outcomes.length === 0) {
      return {
        total: 0,
        imported: 0,
        failed: 0,
        results: [],
      };
    }

    // ─── Phase 1: Validate entire batch ──────────────────────────────────────
    const validationErrors: Map<number, string> = new Map();

    for (let i = 0; i < outcomes.length; i++) {
      const outcome = outcomes[i];

      // Each outcome must have an ID for result tracking
      if (!outcome.id || typeof outcome.id !== 'string') {
        validationErrors.set(i, 'OutcomeMemory import: id is required');
        continue;
      }

      // Owner integrity check — strict: must be present AND match
      if (!outcome.ownerId) {
        validationErrors.set(
          i,
          `OutcomeMemory import: ownerId is required`,
        );
        continue;
      }

      if (outcome.ownerId !== authenticatedOwnerId) {
        validationErrors.set(
          i,
          `OutcomeMemory import: ownerId mismatch — expected "${authenticatedOwnerId}", got "${outcome.ownerId}"`,
        );
        continue;
      }

      // Type check
      if (outcome.type !== OUTCOME_MEMORY_TYPE) {
        validationErrors.set(
          i,
          `OutcomeMemory import: type must be "${OUTCOME_MEMORY_TYPE}", got "${outcome.type}"`,
        );
        continue;
      }

      try {
        validateOutcomePayload(outcome.payload);
      } catch (err) {
        validationErrors.set(
          i,
          `OutcomeMemory import: invalid payload — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // If the entire batch is invalid, return early (no DB writes)
    if (validationErrors.size === outcomes.length) {
      return {
        total: outcomes.length,
        imported: 0,
        failed: outcomes.length,
        results: outcomes.map((o, i) => ({
          id: o.id || `unknown_${i}`,
          success: false,
          error: validationErrors.get(i),
        })),
      };
    }

    // ─── Phase 2: Sequential persistence ─────────────────────────────────────
    // Successfully validated items are persisted one by one.
    // Partial success is possible — see OutcomeImportResult docs.
    const results: OutcomeImportItemResult[] = [];
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < outcomes.length; i++) {
      const outcome = outcomes[i];

      // Skip items that failed pre-validation
      if (validationErrors.has(i)) {
        results.push({
          id: outcome.id || `unknown_${i}`,
          success: false,
          error: validationErrors.get(i),
        });
        failed++;
        continue;
      }

      try {
        // Owner already validated — preserve original, do not rewrite
        const cleanOutcome: OutcomeMemory = {
          ...outcome,
          status: outcome.status ?? 'active',
          version: outcome.version ?? 1,
        };

        // Apply base MemoryRecord validation (id, kind, timestamps, etc.)
        validateMemoryRecord(cleanOutcome);

        // Persist via store
        const persisted = await this._store.create(cleanOutcome);

        results.push({
          id: persisted.id,
          success: true,
        });
        imported++;
      } catch (err) {
        results.push({
          id: outcome.id || `unknown_${i}`,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        failed++;
      }
    }

    return {
      total: outcomes.length,
      imported,
      failed,
      results,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch outcome by ID and validate it belongs to authenticated caller
   * and has type='outcome'.
   *
   * Reused by both archiveOutcome() and restoreOutcome().
   */
  private async _fetchAndValidateOutcome(
    outcomeId: string,
    authenticatedOwnerId: string,
  ): Promise<OutcomeMemory> {
    const record = await this._store.getById(outcomeId, authenticatedOwnerId);

    // getById returns null for both non-existent records AND cross-owner lookups.
    // We cannot distinguish — security: always return not found.
    if (!record) {
      const { MemoryNotFoundError } = await import('./persistence/memory-persistence-types');
      throw new MemoryNotFoundError(outcomeId);
    }

    // Type guard — must be outcome type
    if (record.type !== OUTCOME_MEMORY_TYPE) {
      throw new OutcomeTransitionError(
        outcomeId,
        record.status,
        'archived', // We don't know the intended target — this indicates wrong record type
      );
    }

    return record as OutcomeMemory;
  }

  /**
   * Transition lifecycle status using MemoryStore.update() with OCC.
   *
   * Guarantees:
   * - Payload is completely unchanged (immutable observation)
   * - Only status, version, updatedAt change
   * - OCC enforced via expectedVersion
   */
  private async _transitionStatus(
    record: OutcomeMemory,
    newStatus: MemoryStatus,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<OutcomeMemory> {
    // Build updated record: preserve payload exactly, change only lifecycle fields
    const updatedRecord: OutcomeMemory = {
      ...record,
      payload: { ...record.payload }, // defensive copy to enforce immutability
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    const result = await this._store.update(
      updatedRecord,
      authenticatedOwnerId,
      expectedVersion,
    );

    return result as OutcomeMemory;
  }
}
