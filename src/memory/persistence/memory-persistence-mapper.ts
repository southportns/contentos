/**
 * P0.6.3.2.1 — Memory Persistence Mapper
 *
 * Bidirectional mapping between MemoryRecord (domain model) and
 * MemoryRecordRow (persistence model).
 *
 * Architecture Position:
 *
 *   MemoryRecord (domain)
 *       ↓ memoryRecordToPersistence
 *   MemoryRecordRow (persistence)
 *       ↓ persistenceToMemoryRecord
 *   MemoryRecord (domain)
 *
 * Field Mapping:
 *   MemoryRecord.id              ↔ row.id
 *   MemoryRecord.kind            ↔ row.kind
 *   MemoryRecord.type            ↔ row.type
 *   MemoryRecord.payload (T)     ↔ row.payload (unknown)
 *   MemoryRecord.scope           ↔ row.scope
 *   MemoryRecord.ownerId         ↔ row.ownerId
 *   MemoryRecord.projectId       ↔ row.projectId
 *   MemoryRecord.topicId         ↔ row.topicId
 *   MemoryRecord.source          ↔ row.source
 *   MemoryRecord.sourceType      ↔ row.sourceType
 *   MemoryRecord.derivedFrom     ↔ row.derivedFrom
 *   MemoryRecord.confidence      ↔ row.confidence
 *   MemoryRecord.importance      ↔ row.importance
 *   MemoryRecord.createdAt (ISO) ↔ row.createdAt (Date)
 *   MemoryRecord.updatedAt (ISO) ↔ row.updatedAt (Date)
 *   MemoryRecord.lastAccessedAt  ↔ row.lastAccessedAt
 *   MemoryRecord.accessCount     ↔ row.accessCount
 *   MemoryRecord.expiresAt (ISO) ↔ row.expiresAt (Date)
 *   MemoryRecord.version         ↔ row.version
 *   MemoryRecord.status          ↔ row.status
 *
 * DateTime Conversion:
 *   Domain → Persistence: ISO string → new Date(iso)
 *   Persistence → Domain: Date → date.toISOString()
 */

import type { MemoryRecord } from '../memory-record';
import type { MemoryRecordRow } from './memory-persistence-types';

/**
 * Map a domain MemoryRecord to a persistence row.
 *
 * Converts ISO 8601 timestamp strings to Date objects.
 * The payload and derivedFrom are passed through as-is (JSON serialization
 * is handled by Prisma).
 *
 * @param record - Domain model MemoryRecord
 * @return Persistence row representation
 */
export function memoryRecordToPersistence<T>(
  record: MemoryRecord<T>,
): MemoryRecordRow {
  return {
    id: record.id,
    kind: record.kind,
    type: record.type,
    payload: record.payload,
    scope: record.scope,
    ownerId: record.ownerId ?? '',
    projectId: record.projectId ?? null,
    topicId: record.topicId ?? null,
    source: record.source,
    sourceType: record.sourceType,
    derivedFrom: record.derivedFrom ?? null,
    confidence: record.confidence,
    importance: record.importance,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    lastAccessedAt: record.lastAccessedAt
      ? new Date(record.lastAccessedAt)
      : null,
    accessCount: record.accessCount,
    expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
    version: record.version,
    status: record.status,
  };
}

/**
 * Map a persistence row to a domain MemoryRecord.
 *
 * Converts Date objects to ISO 8601 timestamp strings.
 * The payload is returned as unknown (generic type is lost at persistence boundary).
 *
 * @param row - Persistence row from Prisma
 * @return Domain model MemoryRecord
 */
export function persistenceToMemoryRecord(
  row: MemoryRecordRow,
): MemoryRecord {
  return {
    id: row.id,
    kind: row.kind as MemoryRecord['kind'],
    type: row.type,
    payload: row.payload,
    scope: row.scope as MemoryRecord['scope'],
    ownerId: row.ownerId,
    projectId: row.projectId,
    topicId: row.topicId,
    source: row.source,
    sourceType: row.sourceType,
    derivedFrom: parseDerivedFrom(row.derivedFrom),
    confidence: row.confidence,
    importance: row.importance,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastAccessedAt: row.lastAccessedAt
      ? row.lastAccessedAt.toISOString()
      : null,
    accessCount: row.accessCount,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    version: row.version,
    status: row.status as MemoryRecord['status'],
  };
}

/**
 * Parse the derivedFrom field from persistence format.
 *
 * Handles:
 * - null/undefined → undefined
 * - string[] → readonly string[]
 *
 * @param value - Raw value from persistence
 * @return Parsed derivedFrom array or undefined
 */
function parseDerivedFrom(value: unknown): readonly string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return undefined;
}
