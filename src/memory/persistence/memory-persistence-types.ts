/**
 * P0.6.3.2.1 — Memory Persistence Types
 *
 * Defines the persistence-layer representation of a MemoryRecord.
 *
 * Architecture Position:
 *   MemoryRecord (domain model) ←→ MemoryRecordRow (persistence model)
 *
 *   The persistence model uses Date instead of ISO strings,
 *   and stores payload/derivedFrom as raw JSON (unknown).
 *
 * Design Principles:
 *   1. MemoryRecordRow is the Prisma return type shape
 *   2. No generic type parameter — payload is unknown at persistence layer
 *   3. Date objects for all timestamp fields (Prisma convention)
 */

/**
 * Persistence-layer representation of a MemoryRecord.
 *
 * This is the shape returned by Prisma queries. All timestamps are
 * JavaScript Date objects (Prisma convention), and JSON fields are
 * stored as unknown (serialized/deserialized by the mapper).
 */
export interface MemoryRecordRow {
  /** Unique identifier */
  id: string;

  /** Memory kind (static/dynamic/episodic/semantic) */
  kind: string;

  /** Type discriminator */
  type: string;

  /** Serialized payload data */
  payload: unknown;

  /** Scope (global/project/topic/session) */
  scope: string;

  /** Owner (user) ID — always required */
  ownerId: string;

  /** Project ID (null if not project-scoped) */
  projectId: string | null;

  /** Topic ID (null if not topic-scoped) */
  topicId: string | null;

  /** Source description */
  source: string;

  /** Source type classification */
  sourceType: string;

  /** IDs of parent memories (null if none) */
  derivedFrom: unknown;

  /** Confidence score (0.0 - 1.0) */
  confidence: number;

  /** Importance score (0.0 - 1.0) */
  importance: number;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Last access timestamp (null if never accessed) */
  lastAccessedAt: Date | null;

  /** Number of times accessed */
  accessCount: number;

  /** Expiration timestamp (null if never expires) */
  expiresAt: Date | null;

  /** Version number for OCC */
  version: number;

  /** Lifecycle status */
  status: string;
}

/**
 * Data required to create a new MemoryRecord in persistence.
 *
 * Excludes auto-generated fields (createdAt, updatedAt, accessCount).
 */
export interface CreateMemoryRecordData {
  id: string;
  kind: string;
  type: string;
  payload: unknown;
  scope: string;
  ownerId: string;
  projectId?: string | null;
  topicId?: string | null;
  source: string;
  sourceType: string;
  derivedFrom?: readonly string[];
  confidence: number;
  importance: number;
  lastAccessedAt?: Date | null;
  expiresAt?: Date | null;
  version?: number;
  status?: string;
}

/**
 * Error thrown when an optimistic concurrency conflict occurs.
 */
export class MemoryConcurrencyError extends Error {
  constructor(
    public readonly id: string,
    public readonly expectedVersion: number,
    public readonly actualVersion?: number,
  ) {
    super(
      `Memory concurrency conflict: id=${id}, expected version=${expectedVersion}` +
        (actualVersion !== undefined ? `, actual version=${actualVersion}` : ''),
    );
    this.name = 'MemoryConcurrencyError';
  }
}

/**
 * Error thrown when a memory record is not found.
 */
export class MemoryNotFoundError extends Error {
  constructor(
    public readonly id: string,
  ) {
    super(`Memory record not found: id=${id}`);
    this.name = 'MemoryNotFoundError';
  }
}

/**
 * Error thrown when memory validation fails.
 */
export class MemoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryValidationError';
  }
}
