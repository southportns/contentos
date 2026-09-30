/**
 * P0.6.3.2.1 — Prisma Memory Store
 *
 * Prisma-backed implementation of the MemoryStore interface.
 *
 * Architecture Position:
 *
 *   MemoryStore (interface)
 *       ↓
 *   PrismaMemoryStore (this file)
 *       ↓
 *   PrismaClient → MemoryRecord table → SQLite
 *
 * Design Principles:
 *   1. Uses existing Prisma client singleton (src/lib/prisma.ts)
 *   2. ownerId enforced at database level (WHERE clause)
 *   3. Optimistic concurrency via version-based updates
 *   4. Idempotent delete
 *   5. Validation before every write
 */

import type { Prisma } from '@/generated/prisma';
import type { MemoryStore } from './memory-store';
import type { MemoryRecord } from '../memory-record';
import type { MemoryQueryCriteria } from './memory-query';
import { MemoryConcurrencyError, MemoryNotFoundError, MemoryAuthorizationError } from './memory-persistence-types';
import { memoryRecordToPersistence, persistenceToMemoryRecord } from './memory-persistence-mapper';
import { validateMemoryRecord } from './memory-persistence-validation';
import { prisma } from '@/lib/prisma';

/**
 * Prisma-backed implementation of MemoryStore.
 *
 * All operations enforce owner-level isolation. The database query
 * itself includes ownerId in the WHERE clause — never relies on
 * application-level filtering.
 */
export class PrismaMemoryStore implements MemoryStore {
  /**
   * Create a new memory record in the database.
   *
   * Validates the record before insertion.
   * ownerId must be present (enforced by validation).
   *
   * @param record - MemoryRecord to persist
   * @return The persisted MemoryRecord
   */
  async create(record: MemoryRecord): Promise<MemoryRecord> {
    // Validate before write
    validateMemoryRecord(record);

    // Persistence-layer transformation
    const row = memoryRecordToPersistence(record);

    try {
      const created = await prisma.memoryRecord.create({
        data: {
          id: row.id,
          kind: row.kind,
          type: row.type,
          payload: row.payload,
          scope: row.scope,
          ownerId: row.ownerId,
          projectId: row.projectId,
          topicId: row.topicId,
          source: row.source,
          sourceType: row.sourceType,
          derivedFrom: row.derivedFrom,
          confidence: row.confidence,
          importance: row.importance,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastAccessedAt: row.lastAccessedAt,
          accessCount: row.accessCount,
          expiresAt: row.expiresAt,
          version: row.version,
          status: row.status,
        },
      });

      return persistenceToMemoryRecord(created);
    } catch (error: unknown) {
      // Handle unique constraint violation (duplicate ID)
      if (error && typeof error === 'object' && 'code' in error) {
        const prismaError = error as { code: string; meta?: { target?: string[] } };
        if (prismaError.code === 'P2002') {
          throw new MemoryConcurrencyError(
            record.id,
            record.version,
          );
        }
      }
      throw error;
    }
  }

  /**
   * Retrieve a memory record by ID, scoped to the owner.
   *
   * Uses composite WHERE (id + ownerId) to enforce cross-user isolation.
   * Returns null if not found OR if owned by another user.
   *
   * @param id - Memory record ID
   * @param ownerId - Owner (user) ID
   * @return MemoryRecord or null
   */
  async getById(id: string, ownerId: string): Promise<MemoryRecord | null> {
    const row = await prisma.memoryRecord.findFirst({
      where: {
        id,
        ownerId,
      },
    });

    if (!row) return null;

    return persistenceToMemoryRecord(row);
  }

  /**
   * Update an existing memory record with optimistic concurrency control
   * and authenticated owner authorization.
   *
   * Security model:
   * - record.ownerId = resource owner (from domain model)
   * - ownerId = authenticated caller (authorization boundary)
   *
   * Flow:
   * 1. Validate record data
   * 2. Validate authenticated ownerId (non-empty)
   * 3. Verify record.ownerId === ownerId (authorization check)
   * 4. UPDATE WHERE: id + ownerId + version
   * 5. On failure: query scoped to authenticated owner to avoid leaking existence
   *
   * IMPORTANT: The UPDATE WHERE uses the authenticated ownerId, NOT record.ownerId.
   * The data clause does NOT include ownerId (owner cannot be changed via update).
   *
   * @param record - Updated MemoryRecord (record.ownerId = resource owner)
   * @param ownerId - Authenticated caller's user ID (authorization boundary)
   * @param expectedVersion - Expected current version in DB
   * @return Updated MemoryRecord (version incremented)
   */
  async update(
    record: MemoryRecord,
    ownerId: string,
    expectedVersion: number,
  ): Promise<MemoryRecord> {
    // Step 1: Validate record data
    validateMemoryRecord(record);

    // Step 2: Validate authenticated ownerId
    if (!ownerId || typeof ownerId !== 'string') {
      throw new MemoryAuthorizationError(record.id);
    }

    // Step 3: Authorization check — resource owner must match authenticated caller
    if (record.ownerId !== ownerId) {
      throw new MemoryAuthorizationError(record.id);
    }

    // Step 4: Optimistic concurrency update
    const newVersion = expectedVersion + 1;

    try {
      // CRITICAL: WHERE uses authenticated ownerId, NOT record.ownerId
      // This prevents a tampered record.ownerId from bypassing authorization
      const updated = await prisma.memoryRecord.updateMany({
        where: {
          id: record.id,
          ownerId: ownerId, // <-- authenticated caller IS the DB authorization
          version: expectedVersion,
        },
        // IMPORTANT: data does NOT include ownerId — owner cannot be changed
        data: {
          kind: record.kind,
          type: record.type,
          payload: record.payload,
          scope: record.scope,
          projectId: record.projectId ?? null,
          topicId: record.topicId ?? null,
          source: record.source,
          sourceType: record.sourceType,
          derivedFrom: record.derivedFrom ?? null,
          confidence: record.confidence,
          importance: record.importance,
          lastAccessedAt: record.lastAccessedAt
            ? new Date(record.lastAccessedAt)
            : null,
          accessCount: record.accessCount,
          expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
          version: newVersion,
          status: record.status,
          updatedAt: new Date(),
        },
      });

      // Step 5: Handle update failure
      if (updated.count === 0) {
        // Query scoped to the AUTHENTICATED owner to avoid leaking
        // whether the record exists under a different owner
        const existingForCaller = await prisma.memoryRecord.findFirst({
          where: {
            id: record.id,
            ownerId: ownerId, // scoped to authenticated caller
          },
        });

        if (!existingForCaller) {
          // Record doesn't exist for this authenticated owner
          throw new MemoryNotFoundError(record.id);
        }

        // Record exists for this owner but version mismatch
        throw new MemoryConcurrencyError(
          record.id,
          expectedVersion,
          existingForCaller.version,
        );
      }

      // Return the updated record
      const refreshed = await prisma.memoryRecord.findUnique({
        where: { id: record.id },
      });

      if (!refreshed) {
        throw new MemoryNotFoundError(record.id);
      }

      return persistenceToMemoryRecord(refreshed);
    } catch (error: unknown) {
      // Re-throw our own errors
      if (
        error instanceof MemoryAuthorizationError ||
        error instanceof MemoryConcurrencyError ||
        error instanceof MemoryNotFoundError
      ) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Delete a memory record by ID, scoped to the owner.
   *
   * Uses composite WHERE (id + ownerId) for safety.
   * If record doesn't exist, succeeds silently (idempotent).
   *
   * @param id - Memory record ID
   * @param ownerId - Owner (user) ID
   */
  async delete(id: string, ownerId: string): Promise<void> {
    await prisma.memoryRecord.deleteMany({
      where: {
        id,
        ownerId,
      },
    });

    // Idempotent: no error if nothing was deleted
  }

  /**
   * Count the number of memory records for an owner.
   *
   * @param ownerId - Owner (user) ID
   * @return Count of records owned by the user
   */
  async count(ownerId: string): Promise<number> {
    return prisma.memoryRecord.count({
      where: {
        ownerId,
      },
    });
  }

  /**
   * Query memory records matching the given criteria.
   *
   * Pushes ALL filtering to the database WHERE clause:
   * - ownerId (mandatory)
   * - scopes (OR-based: global always, project/topic conditional)
   * - status (active/expired/superseded)
   * - confidence/importance thresholds
   * - kind inclusion/exclusion
   * - updatedAfter (age filtering based on updatedAt)
   *
   * Sorting (deterministic):
   * importance DESC → confidence DESC → updatedAt DESC → id ASC
   *
   * Limit applied at database level (take = LIMIT).
   *
   * @param criteria - Query criteria
   * @return Matching records, sorted and limited
   */
  async findMany(criteria: MemoryQueryCriteria): Promise<MemoryRecord[]> {
    const where = this.buildWhereClause(criteria);

    const rows = await prisma.memoryRecord.findMany({
      where,
      orderBy: [
        { importance: 'desc' },
        { confidence: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      take: criteria.take,
    });

    return rows.map((row) => persistenceToMemoryRecord(row));
  }

  /**
   * Build the Prisma WHERE clause from query criteria.
   *
   * Scope/Project/Topic logic generates an OR-based array of conditions
   * that implement the cross-scope isolation rules:
   *
   * - global: always allowed within owner boundary
   * - project: only records matching criteria.projectId
   * - topic: only records matching criteria.projectId + criteria.topicId
   * - session: never included in persistent retrieval
   *
   * The allowedScopes filter further narrows which scopes can match.
   *
   * @param criteria - The query criteria
   * @return Prisma-compatible where clause
   */
  private buildWhereClause(
    criteria: MemoryQueryCriteria,
  ): Prisma.MemoryRecordWhereInput {
    const conditions: Prisma.MemoryRecordWhereInput = {
      ownerId: criteria.ownerId,
    };

    // ─── Scope/Project/Topic filtering (OR-based) ────────────────────────
    const scopeOrConditions: Prisma.MemoryRecordWhereInput[] = [];

    const allowedScopes = criteria.allowedScopes ?? ['global'];

    for (const scope of allowedScopes) {
      switch (scope) {
        case 'global':
          // Global records: just match scope = 'global'
          scopeOrConditions.push({
            scope: 'global',
          });
          break;

        case 'project':
          // Project records: match scope = 'project' AND projectId
          if (criteria.projectId) {
            scopeOrConditions.push({
              scope: 'project',
              projectId: criteria.projectId,
            });
          }
          break;

        case 'topic':
          // Topic records: match scope = 'topic' AND projectId AND topicId
          if (criteria.projectId && criteria.topicId) {
            scopeOrConditions.push({
              scope: 'topic',
              projectId: criteria.projectId,
              topicId: criteria.topicId,
            });
          }
          break;

        case 'session':
          // Session: excluded from persistent retrieval
          break;
      }
    }

    if (scopeOrConditions.length > 0) {
      conditions.OR = scopeOrConditions;
    }

    // ─── Status filtering ─────────────────────────────────────────────────
    if (criteria.status && criteria.status.length > 0) {
      if (criteria.status.length === 1) {
        conditions.status = criteria.status[0];
      } else {
        conditions.status = { in: criteria.status };
      }
    }

    // ─── Confidence threshold ─────────────────────────────────────────────
    if (criteria.minConfidence != null) {
      conditions.confidence = { gte: criteria.minConfidence };
    }

    // ─── Importance threshold ─────────────────────────────────────────────
    if (criteria.minImportance != null) {
      conditions.importance = { gte: criteria.minImportance };
    }

    // ─── Kind filtering ───────────────────────────────────────────────────
    if (criteria.kinds && criteria.kinds.length > 0) {
      conditions.kind = { in: criteria.kinds };
    }
    if (criteria.excludedKinds && criteria.excludedKinds.length > 0) {
      const existingKindFilter = conditions.kind as { in?: string[] } | undefined;
      conditions.kind = {
        ...existingKindFilter,
        notIn: criteria.excludedKinds,
      };
    }

    // ─── Age filtering (based on updatedAt for consistency) ───────────────
    if (criteria.updatedAfter) {
      conditions.updatedAt = { gte: criteria.updatedAfter };
    }

    return conditions;
  }
}
