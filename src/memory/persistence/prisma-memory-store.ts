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
 * Default batch size for outcome retrieval batches.
 * Used when the caller does not specify a larger per-batch take.
 */
const DEFAULT_OUTCOME_BATCH_SIZE = 50;

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
   * - type inclusion (types: type IN [...])
   * - updatedAfter (age filtering based on updatedAt)
   * - cursor (composite-keyset pagination)
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
   * Get the minimum batch size for target-complete retrieval.
   *
   * Used by outcome-memory-retrieval.ts as the default per-batch `take`.
   */
  getDefaultBatchSize(): number {
    return DEFAULT_OUTCOME_BATCH_SIZE;
  }

  /**
   * Atomically supersede an old record with a new record using Prisma transaction.
   *
   * Transaction flow:
   * 1. Validate old record (authorization, OCC version)
   * 2. Create new record with supersedes link
   * 3. Update old record to superseded status
   *
   * If ANY step fails, the entire transaction rolls back:
   * - No orphaned new record left on old update failure
   * - No updated old record left on new create failure
   *
   * @param oldRecord - Old record with updated payload (status=superseded)
   * @param newRecord - New record to create
   * @param authenticatedOwnerId - Authenticated caller's user ID
   * @param expectedVersion - Expected current version of old record in DB
   * @return The persisted new MemoryRecord
   */
  async supersede(
    oldRecord: MemoryRecord,
    newRecord: MemoryRecord,
    authenticatedOwnerId: string,
    expectedVersion: number,
  ): Promise<MemoryRecord> {
    // Step 0: Validation (before transaction for early error detection)
    validateMemoryRecord(oldRecord);
    validateMemoryRecord(newRecord);

    if (!authenticatedOwnerId || typeof authenticatedOwnerId !== 'string') {
      throw new MemoryAuthorizationError(oldRecord.id);
    }

    if (oldRecord.ownerId !== authenticatedOwnerId) {
      throw new MemoryAuthorizationError(oldRecord.id);
    }

    // OCC check: verify old record has expected version
    const currentOld = await prisma.memoryRecord.findFirst({
      where: {
        id: oldRecord.id,
        ownerId: authenticatedOwnerId,
      },
    });

    if (!currentOld) {
      throw new MemoryNotFoundError(oldRecord.id);
    }

    if (currentOld.version !== expectedVersion) {
      throw new MemoryConcurrencyError(
        oldRecord.id,
        expectedVersion,
        currentOld.version,
      );
    }

    // Step 1-3: Atomic transaction
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Step 1: Create new record
        const newRow = memoryRecordToPersistence(newRecord);
        const createdNew = await tx.memoryRecord.create({
          data: {
            id: newRow.id,
            kind: newRow.kind,
            type: newRow.type,
            payload: newRow.payload,
            scope: newRow.scope,
            ownerId: newRow.ownerId,
            projectId: newRow.projectId,
            topicId: newRow.topicId,
            source: newRow.source,
            sourceType: newRow.sourceType,
            derivedFrom: newRow.derivedFrom,
            confidence: newRow.confidence,
            importance: newRow.importance,
            createdAt: newRow.createdAt,
            updatedAt: newRow.updatedAt,
            lastAccessedAt: newRow.lastAccessedAt,
            accessCount: newRow.accessCount,
            expiresAt: newRow.expiresAt,
            version: newRow.version,
            status: newRow.status,
          },
        });

        // Step 2: Update old record to superseded (OCC via version)
        const oldRow = memoryRecordToPersistence(oldRecord);
        const updatedOld = await tx.memoryRecord.updateMany({
          where: {
            id: oldRecord.id,
            ownerId: authenticatedOwnerId,
            version: expectedVersion, // OCC: version must still match
          },
          data: {
            kind: oldRow.kind,
            type: oldRow.type,
            payload: oldRow.payload,
            scope: oldRow.scope,
            projectId: oldRow.projectId ?? null,
            topicId: oldRow.topicId ?? null,
            source: oldRow.source,
            sourceType: oldRow.sourceType,
            derivedFrom: oldRow.derivedFrom ?? null,
            confidence: oldRow.confidence,
            importance: oldRow.importance,
            lastAccessedAt: oldRow.lastAccessedAt
              ? new Date(oldRow.lastAccessedAt)
              : null,
            accessCount: oldRow.accessCount,
            expiresAt: oldRow.expiresAt ? new Date(oldRow.expiresAt) : null,
            version: expectedVersion + 1,
            status: oldRow.status,
            updatedAt: new Date(),
          },
        });

        // If updateMany didn't match, version changed → OCC failure
        if (updatedOld.count === 0) {
          throw new MemoryConcurrencyError(
            oldRecord.id,
            expectedVersion,
            expectedVersion + 1, // Unknown actual version
          );
        }

        return createdNew;
      });

      return persistenceToMemoryRecord(result);
    } catch (error: unknown) {
      // Re-throw our own errors
      if (
        error instanceof MemoryAuthorizationError ||
        error instanceof MemoryConcurrencyError ||
        error instanceof MemoryNotFoundError
      ) {
        throw error;
      }
      // Re-throw transaction errors (will trigger rollback)
      throw error;
    }
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
    } else {
      // No scopes to match — force zero results by adding an always-false
      // condition on `id`. This prevents the query from degenerating to
      // just `WHERE ownerId = ?`, which would leak records across boundaries.
      conditions.id = '__NEVER_MATCH__';
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

    // ─── Type filtering ───────────────────────────────────────────────────
    if (criteria.types && criteria.types.length > 0) {
      if (criteria.types.length === 1) {
        conditions.type = criteria.types[0];
      } else {
        conditions.type = { in: criteria.types };
      }
    }

    // ─── Age filtering (based on updatedAt for consistency) ───────────────
    if (criteria.updatedAfter) {
      conditions.updatedAt = { gte: criteria.updatedAfter };
    }

    // ─── Composite-cursor keyset pagination ──────────────────────────────
    // Decodes cursor (base64 JSON of last record's sort keys) and generates
    // a composite OR boundary that selects only records AFTER the cursor
    // position in the deterministic sort order:
    //   importance DESC → confidence DESC → updatedAt DESC → id ASC
    if (criteria.cursor) {
      const cursor = decodeCompositeCursor(criteria.cursor);
      if (cursor) {
        const cursorOr: Prisma.MemoryRecordWhereInput[] = [
          // Records with strictly lower importance
          { importance: { lt: cursor.imp } },
          // Same importance, lower confidence
          { importance: cursor.imp, confidence: { lt: cursor.conf } },
          // Same importance & confidence, earlier updatedAt
          { importance: cursor.imp, confidence: cursor.conf, updatedAt: { lt: cursor.upd } },
          // Same importance, confidence, updatedAt, higher id
          { importance: cursor.imp, confidence: cursor.conf, updatedAt: cursor.upd, id: { gt: cursor.id } },
        ];
        conditions.AND = [
          ...(Array.isArray(conditions.AND) ? conditions.AND : []),
          { OR: cursorOr },
        ];
      }
    }

    return conditions;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Composite Cursor Encoding / Decoding
// ═══════════════════════════════════════════════════════════════════════════════

/** Shape of the decoded composite cursor */
interface CompositeCursor {
  imp: number;
  conf: number;
  upd: Date;
  id: string;
}

/**
 * Encode a composite cursor from a record's sort keys.
 *
 * @param imp - importance value
 * @param conf - confidence value
 * @param upd - updatedAt Date
 * @param id - record id
 * @return Base64-encoded JSON string for use as cursor
 */
export function encodeCompositeCursor(
  imp: number,
  conf: number,
  upd: Date,
  id: string,
): string {
  const obj = {
    imp,
    conf,
    upd: upd.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

/**
 * Decode a cursor string back into a CompositeCursor.
 *
 * Returns null if the cursor is invalid/malformed (graceful degradation).
 *
 * @param cursor - base64-encoded JSON cursor
 * @return Decoded cursor or null if invalid
 */
function decodeCompositeCursor(cursor: string): CompositeCursor | null {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf-8');
    const obj = JSON.parse(json);
    if (
      typeof obj.imp !== 'number' ||
      typeof obj.conf !== 'number' ||
      typeof obj.upd !== 'string' ||
      typeof obj.id !== 'string'
    ) {
      return null;
    }
    const upd = new Date(obj.upd);
    if (isNaN(upd.getTime())) return null;
    return { imp: obj.imp, conf: obj.conf, upd, id: obj.id };
  } catch {
    return null;
  }
}
