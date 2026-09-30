/**
 * P0.6.3.3 — Decision Memory Type & Retrieval Helpers
 *
 * Decision Memory is a specialized MemoryRecord:
 * - kind: 'semantic'
 * - type: 'decision'
 * - payload: DecisionMemoryPayload
 *
 * Architecture Position:
 *
 *   MemoryRecord<DecisionMemoryPayload>
 *       ↓
 *   DecisionMemory (type alias — no new persistence, no second DB)
 *       ↓
 *   DecisionMemoryFactory → createDecisionMemory()
 *       ↓
 *   DecisionMemoryService → supersedeDecision() / reverseDecision() / activateDecision()
 *       ↓
 *   Retrieval helpers → retrieveDecisionMemories() / getActiveDecisions() / getDecisionHistory()
 *
 * Design Principles:
 *   1. DecisionMemory IS-A MemoryRecord — no parallel type system
 *   2. Decision lifecycle (proposed/active/superseded/reversed) stored in payload
 *   3. MemoryRecord.status mirrors DecisionStatus for DB filtering compatibility
 *   4. Retrieval uses existing DatabaseMemoryRetriever — no second DB retriever
 *   5. Authorization via authenticatedOwnerId on every state transition
 */

import type { MemoryRecord } from './memory-record';
import type { DecisionMemoryPayload, DecisionStatus } from './memory-types';
import { DECISION_MEMORY_TYPE, DECISION_MEMORY_KIND } from './memory-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Memory Type
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DecisionMemory — type alias for MemoryRecord<DecisionMemoryPayload>.
 *
 * No new interface, no new base type. Decision Memory IS a MemoryRecord
 * with a specific kind/type/payload combination.
 */
export type DecisionMemory = MemoryRecord<DecisionMemoryPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Type Guards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a MemoryRecord is a Decision Memory.
 *
 * A record is a Decision Memory if type === 'decision' AND
 * payload has a decisionStatus field.
 *
 * @param record - MemoryRecord to check
 * @return True if the record is a Decision Memory
 */
export function isDecisionMemory(record: MemoryRecord): record is DecisionMemory {
  return record.type === DECISION_MEMORY_TYPE &&
    record.payload != null &&
    typeof record.payload === 'object' &&
    'decisionStatus' in record.payload;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The memory type discriminator for Decision Memory.
 */
export const DECISION_TYPE = DECISION_MEMORY_TYPE;

/**
 * The memory kind for Decision Memory.
 */
export const DECISION_KIND = DECISION_MEMORY_KIND;

// ═══════════════════════════════════════════════════════════════════════════════
// Status Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map DecisionStatus to MemoryStatus for DB-level filtering.
 *
 * Decision has 4 states: proposed, active, superseded, reversed.
 * MemoryRecord.status has 4 states: active, superseded, expired, archived.
 *
 * Mapping:
 * - proposed   → active     (in DB, treat proposed as active for retrieval)
 * - active     → active
 * - superseded → superseded
 * - reversed   → archived   (reversed = never was effective, archived in DB terms)
 *
 * @param decisionStatus - Decision lifecycle status
 * @return Corresponding MemoryStatus for persistence/retrieval
 */
export function decisionStatusToMemoryStatus(
  decisionStatus: DecisionStatus
): 'active' | 'superseded' | 'expired' | 'archived' {
  switch (decisionStatus) {
    case 'proposed':
      return 'active';
    case 'active':
      return 'active';
    case 'superseded':
      return 'superseded';
    case 'reversed':
      return 'archived';
  }
}

/**
 * Get the set of MemoryStatus values that should be included
 * when retrieving Decision Memories with a given target DecisionStatus.
 *
 * @param targetStatus - The desired DecisionStatus to filter for
 * @return Array of MemoryStatus values for DB query
 */
export function memoryStatusesForDecisionStatus(
  targetStatus: DecisionStatus
): string[] {
  switch (targetStatus) {
    case 'proposed':
      return ['active']; // proposed maps to active in DB
    case 'active':
      return ['active'];
    case 'superseded':
      return ['superseded'];
    case 'reversed':
      return ['archived'];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate DecisionMemoryPayload-specific fields.
 *
 * This is in addition to the base MemoryRecord validation.
 * Checks:
 * - decision is non-empty string
 * - decisionStatus is a valid DecisionStatus
 * - supersedes field format (must be string if present)
 *
 * @param payload - The DecisionMemoryPayload to validate
 * @throws Error if validation fails
 */
export function validateDecisionPayload(payload: DecisionMemoryPayload): void {
  // Validate decision field (required)
  if (!payload.decision || typeof payload.decision !== 'string' || payload.decision.trim().length === 0) {
    throw new Error('DecisionMemoryPayload.decision must be a non-empty string');
  }

  // Validate decisionStatus
  const validStatuses: DecisionStatus[] = ['proposed', 'active', 'superseded', 'reversed'];
  if (!validStatuses.includes(payload.decisionStatus)) {
    throw new Error(
      `DecisionMemoryPayload.decisionStatus must be one of: ${validStatuses.join(', ')}. Got: ${payload.decisionStatus}`
    );
  }

  // Validate supersedes field format (optional field, but must be string if present)
  if (payload.supersedes !== undefined && typeof payload.supersedes !== 'string') {
    throw new Error('DecisionMemoryPayload.supersedes must be a string when present');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Re-exports for convenience
// ═══════════════════════════════════════════════════════════════════════════════

export type { DecisionMemoryPayload, DecisionStatus } from './memory-types';
