/**
 * P0.6.3.1 — Memory Utilities
 *
 * Provides the critical Memory → Context bridge.
 *
 * Architecture Position:
 *
 *   MemoryRecord
 *       ↓ (memoryRecordToContext)
 *   ContextObject<MemoryContextPayload>
 *       ↓
 *   Context Assembly
 *
 * This is the ONLY bridge between Memory Layer and Context Layer.
 * Memory Layer does NOT depend on Context Assembly — only on ContextObject construction.
 */

import type { MemoryRecord } from './memory-record';
import type { ContextObject } from '@/context/context-object';
import type { MemoryContextPayload } from './memory-types';
import { createMemoryContext } from '@/context/context-factory';

/**
 * Convert a MemoryRecord to a ContextObject<MemoryContextPayload>.
 *
 * Field mapping:
 *   MemoryRecord.id              → ContextObject.id
 *   MemoryRecord.kind            → MemoryContextPayload.memoryKind
 *   MemoryRecord.type            → ContextObject.type
 *   MemoryRecord.payload         → MemoryContextPayload.value
 *   MemoryRecord.source          → ContextObject.provenance.source
 *   MemoryRecord.sourceType      → ContextObject.provenance.sourceType
 *   MemoryRecord.ownerId         → ContextObject.provenance.ownerId
 *   MemoryRecord.projectId       → ContextObject.provenance.projectId
 *   MemoryRecord.topicId         → ContextObject.provenance.topicId
 *   MemoryRecord.derivedFrom     → ContextObject.provenance.derivedFrom
 *   MemoryRecord.confidence      → ContextObject.confidence + MemoryContextPayload.confidence
 *   MemoryRecord.importance      → MemoryContextPayload.importance
 *   MemoryRecord.createdAt       → ContextObject.createdAt
 *   MemoryRecord.updatedAt       → ContextObject.updatedAt
 *   MemoryRecord.lastAccessedAt  → MemoryContextPayload.lastAccessedAt
 *   MemoryRecord.accessCount     → MemoryContextPayload.accessCount
 *   MemoryRecord.expiresAt       → MemoryContextPayload.expiresAt
 *   MemoryRecord.status          → MemoryContextPayload.status
 *
 * @param record - The MemoryRecord to convert
 * @return A ContextObject wrapping the memory data
 */
export function memoryRecordToContext(
  record: MemoryRecord
): ContextObject<MemoryContextPayload> {
  const payload: MemoryContextPayload = {
    memoryKind: record.kind,
    memoryType: record.type,
    value: record.payload,
    importance: record.importance,
    confidence: record.confidence,
    accessCount: record.accessCount,
    lastAccessedAt: record.lastAccessedAt,
    expiresAt: record.expiresAt,
    status: record.status,
  };

  return createMemoryContext(payload, {
    id: `ctx_mem_${record.id}`,
    provenance: {
      source: record.source,
      sourceType: record.sourceType,
      ownerId: record.ownerId,
      projectId: record.projectId,
      topicId: record.topicId,
      derivedFrom: record.derivedFrom,
      confidence: record.confidence,
    },
    lifecycleStage: 'retrieved',
    confidence: record.confidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/**
 * Batch convert multiple MemoryRecords to ContextObjects.
 *
 * @param records - MemoryRecords to convert
 * @return ContextObjects wrapping the memory data
 */
export function memoryRecordsToContexts(
  records: MemoryRecord[]
): ContextObject<MemoryContextPayload>[] {
  return records.map(memoryRecordToContext);
}
