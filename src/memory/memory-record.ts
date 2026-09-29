/**
 * P0.6.3.1 — Memory Record
 *
 * The unified memory record — the fundamental unit of the Memory Layer.
 *
 * Architecture Position:
 *   All existing memory sources (WritingProfile, Persona, Draft, etc.)
 *   are ADAPTED into MemoryRecord through MemoryAdapter implementations.
 *
 * Design Principles:
 *   1. confidence and importance are SEPARATE dimensions
 *   2. scope answers "can it be used?" not "should it be used?"
 *   3. Type is extensible — each adapter provides its own type
 */

import type { MemoryKind } from './memory-kind';
import type { MemoryScope } from './memory-scope';

/**
 * Lifecycle status of a memory record.
 */
export type MemoryStatus = 'active' | 'superseded' | 'expired' | 'archived';

/**
 * The unified MemoryRecord — the core abstraction of the Memory Layer.
 *
 * @template T - The type of the payload data
 */
export interface MemoryRecord<T = unknown> {
  /** Unique identifier for this memory */
  id: string;

  /** Memory kind classification (static/dynamic/episodic/semantic) */
  kind: MemoryKind;

  /** Specific type discriminator within the kind */
  type: string;

  /** The memory payload data */
  payload: T;

  /** Scope boundary (global/project/topic/session) */
  scope: MemoryScope;

  /** Owner (user) ID */
  ownerId?: string | null;

  /** Project ID if project-scoped */
  projectId?: string | null;

  /** Topic ID if topic-scoped */
  topicId?: string | null;

  /** Source description */
  source: string;

  /** Source type classification */
  sourceType: string;

  /** IDs of memories this was derived from */
  derivedFrom?: readonly string[];

  /** Confidence (0.0 - 1.0). How reliable this memory is. */
  confidence: number;

  /** Importance (0.0 - 1.0). How important for future context assembly. */
  importance: number;

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last update timestamp (ISO 8601) */
  updatedAt: string;

  /** Last access timestamp (ISO 8601) */
  lastAccessedAt?: string | null;

  /** Number of times this memory has been accessed */
  accessCount: number;

  /** Expiration timestamp (ISO 8601). null = never expires. */
  expiresAt?: string | null;

  /** Version number for OCC / lineage tracking */
  version: number;

  /** Lifecycle status */
  status: MemoryStatus;
}

/**
 * All valid MemoryStatus values.
 */
export const MEMORY_STATUSES: readonly MemoryStatus[] = [
  'active',
  'superseded',
  'expired',
  'archived',
] as const;
