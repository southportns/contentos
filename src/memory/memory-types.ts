/**
 * P0.6.3.3 — Memory Shared Types
 *
 * Shared type definitions for the Memory Layer.
 *
 * This module defines MemoryContextPayload and DecisionMemoryPayload
 * which are the Context Layer's view of memory data.
 *
 * Architecture Position:
 *   Memory Layer defines MemoryContextPayload and DecisionMemoryPayload.
 *   Context Layer imports them rather than defining its own duplicate.
 *
 * Design Principles:
 *   1. Single source of truth for MemoryContextPayload
 *   2. Memory Layer is the owner of memory payload structure
 *   3. Context Layer views MemoryContextPayload as a context sub-type
 *   4. Decision Memory is a specialized Memory — no parallel type system
 */

import type { MemoryKind } from './memory-kind';

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Context Payload (existing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Payload structure for memory data used in ContextObject.
 *
 * This interface is defined in the Memory Layer but consumed
 * by the Context Layer's ContextObject<MemoryContextPayload>.
 *
 * Fields:
 * - memoryKind: The memory kind (static/dynamic/episodic/semantic)
 * - memoryType: The memory type discriminator (e.g., 'writing_profile', 'draft')
 * - value: The actual memory payload data
 * - importance: Importance score (0.0 - 1.0) for context assembly ranking
 * - confidence: Confidence score (0.0 - 1.0) for reliability
 * - accessCount: Number of times this memory has been accessed
 * - lastAccessedAt: Last access timestamp
 * - expiresAt: Expiration timestamp
 * - status: Lifecycle status
 */
export interface MemoryContextPayload {
  /** The memory kind (static/dynamic/episodic/semantic) */
  memoryKind: MemoryKind;

  /** The memory type discriminator (e.g., 'writing_profile', 'draft') */
  memoryType?: string | null;

  /** The actual memory payload data */
  value?: unknown;

  /** Importance score (0.0 - 1.0) for context assembly ranking */
  importance?: number | null;

  /** Confidence score (0.0 - 1.0) for reliability assessment */
  confidence?: number | null;

  /** Number of times this memory has been accessed */
  accessCount?: number | null;

  /** Last access timestamp (ISO 8601) */
  lastAccessedAt?: string | null;

  /** Expiration timestamp (ISO 8601). null = never expires. */
  expiresAt?: string | null;

  /** Lifecycle status of this memory */
  status?: 'active' | 'superseded' | 'expired' | 'archived' | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Memory Types (P0.6.3.3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Decision status — the lifecycle state of a Decision Memory.
 *
 * - proposed:   Decision recorded but not yet the active decision
 * - active:     Currently the effective decision
 * - superseded: Replaced by a newer decision
 * - reversed:   Explicitly undone / canceled
 */
export type DecisionStatus = 'proposed' | 'active' | 'superseded' | 'reversed';

/**
 * All valid DecisionStatus values.
 */
export const DECISION_STATUSES: readonly DecisionStatus[] = [
  'proposed',
  'active',
  'superseded',
  'reversed',
] as const;

/**
 * An alternative considered but not selected.
 */
export interface DecisionAlternative {
  /** Unique identifier for this alternative */
  id: string;

  /** Description of the alternative */
  description: string;

  /** Whether this alternative was rejected */
  rejected: boolean;

  /** Reason for rejection (when rejected) */
  rejectionReason?: string;
}

/**
 * Evidence supporting or related to the decision.
 *
 * Evidence tracking: Decision → Evidence → Source.
 * This phase: only stores provided references. No automatic extraction.
 */
export interface DecisionEvidence {
  /** Unique identifier for this evidence */
  id: string;

  /** Evidence type classification */
  type: string;

  /** Reference (ID, URL, etc.) to the evidence source */
  reference?: string;

  /** Human-readable summary */
  summary?: string;
}

/**
 * Typed payload for Decision Memory.
 *
 * Decision Memory is a MemoryRecord with:
 * - kind: 'semantic'
 * - type: 'decision'
 * - payload: DecisionMemoryPayload
 *
 * Core fields capture the structured decision: what, why, alternatives,
 * evidence, constraints, assumptions, expected outcome, and status.
 */
export interface DecisionMemoryPayload {
  /** The decision statement — REQUIRED */
  decision: string;

  /** Reasoning behind the decision */
  rationale?: string;

  /** Alternatives that were considered */
  alternatives?: DecisionAlternative[];

  /** Supporting evidence references */
  evidence?: DecisionEvidence[];

  /** Constraints that shaped the decision */
  constraints?: string[];

  /** Assumptions made when making this decision */
  assumptions?: string[];

  /** What outcome was expected from this decision */
  expectedOutcome?: string;

  /** Current lifecycle status of this decision */
  decisionStatus: DecisionStatus;

  /** ID of the decision this supersedes (set when status=superseded) */
  supersedes?: string;
}

/**
 * Constant for the decision memory type discriminator.
 */
export const DECISION_MEMORY_TYPE = 'decision' as const;

/**
 * Memory kind for Decision Memory.
 *
 * Decision Memory represents abstracted, structured knowledge about
 * decisions made. It is classified as 'semantic' memory because it
 * captures reusable decision knowledge (not raw events).
 */
export const DECISION_MEMORY_KIND: MemoryKind = 'semantic';
