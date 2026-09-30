/**
 * P0.6.3.2.1 — Memory Store Interface
 *
 * Defines the contract for persistent memory storage.
 *
 * Architecture Position:
 *
 *   Memory Layer
 *       ↓
 *   MemoryStore (interface)
 *       ↓
 *   PrismaMemoryStore (implementation)
 *       ↓
 *   Prisma / SQLite
 *
 * Design Principles:
 *   1. ownerId is REQUIRED — no "ownerless" memories in persistence
 *   2. All queries enforce owner boundary at the database level
 *   3. Update uses optimistic concurrency control (version-based)
 *   4. Delete is idempotent — no error on missing record
 *   5. Criteria-based queries push filtering to the database layer
 */

import type { MemoryRecord } from '../memory-record';
import type { MemoryQueryCriteria } from './memory-query';

/**
 * Persistent storage interface for MemoryRecords.
 *
 * Implementations must enforce:
 * - Cross-user isolation (ownerId boundary)
 * - Optimistic concurrency control (version-based updates)
 * - Idempotent delete
 */
export interface MemoryStore {
  /**
   * Create a new memory record in persistent storage.
   *
   * @param record - The MemoryRecord to persist
   * @return The persisted MemoryRecord (with any auto-generated fields)
   * @throws MemoryValidationError if record is invalid
   * @throws MemoryConcurrencyError if ID already exists
   */
  create(record: MemoryRecord): Promise<MemoryRecord>;

  /**
   * Retrieve a memory record by ID, scoped to the owner.
   *
   * The query MUST include ownerId in the WHERE clause to prevent
   * cross-user data access. Never returns records belonging to
   * other users.
   *
   * @param id - Memory record ID
   * @param ownerId - Owner (user) ID for access control
   * @return The MemoryRecord if found and owned by user, null otherwise
   */
  getById(id: string, ownerId: string): Promise<MemoryRecord | null>;

  /**
   * Update an existing memory record with optimistic concurrency control
   * and authenticated owner authorization.
   *
   * Security model:
   * - record.ownerId = resource owner (from domain model)
   * - authenticatedOwnerId = authenticated caller (authorization boundary)
   *
   * Flow:
   * 1. Verify record.ownerId === authenticatedOwnerId
   * 2. UPDATE WHERE: id + ownerId (= authenticatedOwnerId) + version
   * 3. On failure: query scoped to authenticated owner to avoid leaking existence
   *
   * @param record - The updated MemoryRecord (record.ownerId = resource owner)
   * @param authenticatedOwnerId - Authenticated caller's user ID (authorization boundary)
   * @param expectedVersion - The version expected in the database
   * @return The updated MemoryRecord (with incremented version)
   * @throws MemoryAuthorizationError if record.ownerId !== authenticatedOwnerId
   * @throws MemoryConcurrencyError if version mismatch
   * @throws MemoryNotFoundError if record not found for this owner
   */
  update(
    record: MemoryRecord,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<MemoryRecord>;

  /**
   * Delete a memory record by ID, scoped to the owner.
   *
   * The query MUST include ownerId in the WHERE clause.
   * If the record doesn't exist, succeeds silently (idempotent).
   *
   * @param id - Memory record ID
   * @param ownerId - Owner (user) ID for access control
   */
  delete(id: string, ownerId: string): Promise<void>;

  /**
   * Count the number of memory records for an owner.
   *
   * @param ownerId - Owner (user) ID
   * @return Number of memory records belonging to the owner
   */
  count(ownerId: string): Promise<number>;

  /**
   * Query memory records matching the given criteria.
   *
   * All filtering (owner, scope, kind, status, confidence, importance, age)
   * MUST be pushed to the database query layer (WHERE clause).
   *
   * Sorting MUST be deterministic: importance DESC → confidence DESC →
   * updatedAt DESC → id ASC.
   *
   * Results MUST be limited at the database level (take).
   *
   * @param criteria - Query criteria for database-level filtering
   * @return Matching memory records, sorted and limited
   */
  findMany(criteria: MemoryQueryCriteria): Promise<MemoryRecord[]>;
}
