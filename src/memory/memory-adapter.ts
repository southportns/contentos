/**
 * P0.6.3.1 — Memory Adapter Interface
 *
 * Defines the contract for adapting domain entities to MemoryRecords.
 *
 * Architecture Position:
 *
 *   Domain Entity (UserWritingProfile, Persona, Draft, ...)
 *     ↓ (MemoryAdapter)
 *   MemoryRecord
 *
 * Design Principles:
 *   1. Adapters are READ-ONLY — never modify source entities
 *   2. Each adapter declares its sourceType
 *   3. Adapters use the Memory Factory internally
 */

import type { MemoryRecord } from './memory-record';
import type { MemoryScope } from './memory-scope';

/**
 * Options passed to adapter.adapt().
 */
export interface MemoryAdapterOptions {
  /** Owner (user) ID */
  ownerId?: string | null;
  /** Project ID */
  projectId?: string | null;
  /** Topic ID */
  topicId?: string | null;
  /** Explicit scope (overrides auto-derivation) */
  scope?: MemoryScope;
  /** Confidence override */
  confidence?: number;
  /** Importance override */
  importance?: number;
}

/**
 * Adapter contract: converts a domain entity to a MemoryRecord.
 *
 * @template TEntity - The source entity type
 * @template TPayload - The extracted payload type
 */
export interface MemoryAdapter<TEntity, TPayload = unknown> {
  /** Source type identifier */
  readonly sourceType: string;

  /**
   * Adapt an entity to a MemoryRecord.
   *
   * @param entity - The source entity
   * @param options - Optional overrides for scope, confidence, importance
   * @return A MemoryRecord
   */
  adapt(
    entity: TEntity,
    options?: MemoryAdapterOptions
  ): MemoryRecord<TPayload>;
}
