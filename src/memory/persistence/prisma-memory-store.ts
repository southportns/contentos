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

import type { MemoryStore } from './memory-store';
import type { MemoryRecord } from '../memory-record';
import { MemoryConcurrencyError, MemoryNotFoundError } from './memory-persistence-types';
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
   * Update an existing memory record with optimistic concurrency control.
   *
   * The update WHERE clause includes id + ownerId + version.
   * If no record matches (version mismatch or wrong owner), throws.
   *
   * On success, version is incremented by 1 in the database.
   *
   * @param record - Updated MemoryRecord
   * @param expectedVersion - Expected current version in DB
   * @return Updated MemoryRecord (version incremented)
   */
  async update(
    record: MemoryRecord,
    expectedVersion: number,
  ): Promise<MemoryRecord> {
    // Validate before write
    validateMemoryRecord(record);

    // New version = expectedVersion + 1
    const newVersion = expectedVersion + 1;

    try {
      const updated = await prisma.memoryRecord.updateMany({
        where: {
          id: record.id,
          ownerId: record.ownerId ?? '',
          version: expectedVersion,
        },
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

      // If no rows were updated, either:
      // 1. Record doesn't exist
      // 2. Owner doesn't match
      // 3. Version doesn't match (concurrency conflict)
      if (updated.count === 0) {
        // Determine the specific cause
        const existing = await prisma.memoryRecord.findFirst({
          where: { id: record.id },
        });

        if (!existing) {
          throw new MemoryNotFoundError(record.id);
        }

        // Record exists but version mismatch or owner mismatch
        throw new MemoryConcurrencyError(
          record.id,
          expectedVersion,
          existing.version,
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
      if (error instanceof MemoryConcurrencyError || error instanceof MemoryNotFoundError) {
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
}
