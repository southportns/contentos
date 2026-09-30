/**
 * P0.6.3.3 — Decision Memory Service
 *
 * Provides Decision lifecycle operations: activate, supersede, reverse.
 *
 * Architecture Position:
 *
 *   DecisionMemoryService
 *       ↓
 *   MemoryStore (update with OCC)
 *       ↓
 *   Database
 *
 * State Machine:
 *
 *   proposed ──activate──→ active ──supersede──→ superseded
 *                             │
 *                             └──reverse──→ reversed
 *
 * Design Principles:
 *   1. All transitions require authenticatedOwnerId (authorization boundary)
 *   2. Never deletes records — status changes only
 *   3. Uses OCC (version-based) for concurrency safety
 *   4. Supersession creates relationship: new.supersedes = old.id
 *   5. All state transitions are validated before persistence
 */

import type { MemoryStore } from './persistence/memory-store';
import type { DecisionMemory } from './decision-memory';
import type { DecisionStatus, DecisionMemoryPayload } from './memory-types';
import { MemoryNotFoundError } from './persistence/memory-persistence-types';
import { decisionStatusToMemoryStatus } from './decision-memory';
import { DECISION_MEMORY_TYPE } from './memory-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when a Decision state transition violates the lifecycle rules.
 */
export class DecisionTransitionError extends Error {
  constructor(
    public readonly decisionId: string,
    public readonly fromStatus: DecisionStatus,
    public readonly toStatus: DecisionStatus,
  ) {
    super(
      `Invalid decision transition: id=${decisionId}, cannot transition from "${fromStatus}" to "${toStatus}"`
    );
    this.name = 'DecisionTransitionError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Memory Service Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service interface for Decision Memory lifecycle operations.
 *
 * Implementations use MemoryStore for persistence, enforcing:
 * - Owner authorization via authenticatedOwnerId
 * - Optimistic concurrency via expectedVersion
 * - No physical deletion on state transitions
 */
export interface DecisionMemoryService {
  /**
   * Activate a proposed decision (proposed → active).
   */
  activateDecision(
    decisionId: string,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<DecisionMemory>;

  /**
   * Supersede an existing active decision with a new one.
   */
  supersedeDecision(
    oldDecisionId: string,
    newDecision: DecisionMemory,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<DecisionMemory>;

  /**
   * Reverse an active decision (active → reversed).
   */
  reverseDecision(
    decisionId: string,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<DecisionMemory>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DecisionMemoryService implementation using MemoryStore.
 */
export class DecisionMemoryServiceImpl implements DecisionMemoryService {
  private _store: MemoryStore;

  constructor(store: MemoryStore) {
    this._store = store;
  }

  async activateDecision(
    decisionId: string,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<DecisionMemory> {
    const record = await this._store.getById(decisionId, authenticatedOwnerId);

    if (!record) {
      throw new MemoryNotFoundError(decisionId);
    }

    if (record.type !== DECISION_MEMORY_TYPE) {
      throw new DecisionTransitionError(
        decisionId,
        'unknown' as DecisionStatus,
        'active',
      );
    }

    const payload = record.payload as DecisionMemoryPayload;
    const currentStatus = payload.decisionStatus;

    if (currentStatus !== 'proposed') {
      throw new DecisionTransitionError(decisionId, currentStatus, 'active');
    }

    return this.transitionDecision(record, 'active', authenticatedOwnerId, expectedVersion);
  }

  async supersedeDecision(
    oldDecisionId: string,
    newDecision: DecisionMemory,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<DecisionMemory> {
    const record = await this._store.getById(oldDecisionId, authenticatedOwnerId);

    if (!record) {
      throw new MemoryNotFoundError(oldDecisionId);
    }

    if (record.type !== DECISION_MEMORY_TYPE) {
      throw new DecisionTransitionError(
        oldDecisionId,
        'unknown' as DecisionStatus,
        'superseded',
      );
    }

    const payload = record.payload as DecisionMemoryPayload;
    const currentStatus = payload.decisionStatus;

    if (currentStatus !== 'active') {
      throw new DecisionTransitionError(oldDecisionId, currentStatus, 'superseded');
    }

    const updatedPayload: DecisionMemoryPayload = {
      ...payload,
      decisionStatus: 'superseded',
      supersedes: undefined,
    };

    const updatedRecord: DecisionMemory = {
      ...record,
      payload: updatedPayload,
      status: decisionStatusToMemoryStatus('superseded'),
      updatedAt: new Date().toISOString(),
    };

    const result = await this._store.update(
      updatedRecord,
      authenticatedOwnerId,
      expectedVersion,
    );

    return result as DecisionMemory;
  }

  async reverseDecision(
    decisionId: string,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<DecisionMemory> {
    const record = await this._store.getById(decisionId, authenticatedOwnerId);

    if (!record) {
      throw new MemoryNotFoundError(decisionId);
    }

    if (record.type !== DECISION_MEMORY_TYPE) {
      throw new DecisionTransitionError(
        decisionId,
        'unknown' as DecisionStatus,
        'reversed',
      );
    }

    const payload = record.payload as DecisionMemoryPayload;
    const currentStatus = payload.decisionStatus;

    if (currentStatus !== 'active') {
      throw new DecisionTransitionError(decisionId, currentStatus, 'reversed');
    }

    return this.transitionDecision(record, 'reversed', authenticatedOwnerId, expectedVersion);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async transitionDecision(
    record: DecisionMemory,
    newStatus: DecisionStatus,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<DecisionMemory> {
    const payload = record.payload as DecisionMemoryPayload;

    const updatedPayload: DecisionMemoryPayload = {
      ...payload,
      decisionStatus: newStatus,
    };

    const updatedRecord: DecisionMemory = {
      ...record,
      payload: updatedPayload,
      status: decisionStatusToMemoryStatus(newStatus),
      updatedAt: new Date().toISOString(),
    };

    const result = await this._store.update(
      updatedRecord,
      authenticatedOwnerId,
      expectedVersion,
    );

    return result as DecisionMemory;
  }
}
