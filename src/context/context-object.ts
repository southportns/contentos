/**
 * P0.6.1 — Context Object
 *
 * Core abstraction: a typed, provenance-tracked, lifecycle-aware container
 * for entity data consumed by ContextOS workflows.
 *
 * Design Principles:
 *   1. ContextObject wraps ANY entity kind behind a uniform interface
 *   2. Provenance is mandatory — every context knows its origin
 *   3. Lifecycle is explicit — context stage is always known
 *
 * Non-goals:
 *   - Not a database model (no Prisma schema)
 *   - Not a value object (mutable lifecycle, references to entities)
 *   - Not a generation context (no AI prompt state)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Core Interface
// ═══════════════════════════════════════════════════════════════════════════════

import type { ContextKind } from './context-kind';
import type { ContextProvenance } from './context-provenance';
import type { ContextLifecycleState } from './context-lifecycle';

/**
 * A ContextObject is the fundamental unit of the Context Layer.
 * Every piece of information that flows through ContextOS is represented
 * as a ContextObject with:
 * - A unique identifier
 * - A kind (identity/intent/knowledge/...)
 * - A type (specific discriminator)
 * - A typed payload
 * - Provenance (where it came from)
 * - Lifecycle state (what stage it is in)
 */
export interface ContextObject<TPayload = unknown> {
  /** Unique identifier for this context */
  id: string;

  /** The broad category of this context */
  kind: ContextKind;

  /** Specific discriminator within the kind */
  type: string;

  /** Typed payload — state/belief/data for this context */
  payload: TPayload;

  /** Where this context came from */
  provenance: ContextProvenance;

  /** Current lifecycle stage */
  lifecycle: ContextLifecycleState;

  /** Confidence in this context (0-1, null if unknown) */
  confidence?: number | null;

  /** When this context was created (ISO 8601) */
  createdAt: string;

  /** When this context was last updated (ISO 8601) */
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract the payload type from a ContextObject.
 */
export type ContextPayloadOf<T> = T extends ContextObject<infer P> ? P : never;

/**
 * A context with any payload.
 */
export type AnyContext = ContextObject<unknown>;

/**
 * Narrow a context to a specific kind.
 */
export type ContextOfKind<K extends ContextKind> = ContextObject<unknown> & {
  kind: K;
};