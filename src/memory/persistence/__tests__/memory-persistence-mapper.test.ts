/**
 * P0.6.3.2.1 — Memory Persistence Mapper Tests
 *
 * Tests bidirectional mapping between MemoryRecord (domain) and
 * MemoryRecordRow (persistence).
 *
 * Covers:
 * - Domain → Persistence conversion
 * - Persistence → Domain conversion
 * - DateTime ISO ↔ Date conversion
 * - Payload and derivedFrom preservation
 * - Null handling for optional fields
 * - Round-trip fidelity
 */

import { describe, it, expect } from 'vitest';
import { memoryRecordToPersistence, persistenceToMemoryRecord } from '../memory-persistence-mapper';
import type { MemoryRecord } from '../../memory-record';
import type { MemoryRecordRow } from '../memory-persistence-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createTestRecord(): MemoryRecord {
  return {
    id: 'mem_test_001',
    kind: 'static',
    type: 'writing_profile',
    payload: { tone: 'formal', preferences: ['concise'] },
    scope: 'global',
    ownerId: 'user_123',
    projectId: null,
    topicId: null,
    source: 'test_factory',
    sourceType: 'test',
    derivedFrom: ['mem_parent_1', 'mem_parent_2'],
    confidence: 0.85,
    importance: 0.72,
    createdAt: '2026-09-29T10:30:00.000Z',
    updatedAt: '2026-09-29T11:00:00.000Z',
    lastAccessedAt: '2026-09-29T12:00:00.000Z',
    accessCount: 5,
    expiresAt: null,
    version: 1,
    status: 'active',
  };
}

function createTestRow(): MemoryRecordRow {
  return {
    id: 'mem_test_001',
    kind: 'static',
    type: 'writing_profile',
    payload: { tone: 'formal', preferences: ['concise'] },
    scope: 'global',
    ownerId: 'user_123',
    projectId: null,
    topicId: null,
    source: 'test_factory',
    sourceType: 'test',
    derivedFrom: ['mem_parent_1', 'mem_parent_2'],
    confidence: 0.85,
    importance: 0.72,
    createdAt: new Date('2026-09-29T10:30:00.000Z'),
    updatedAt: new Date('2026-09-29T11:00:00.000Z'),
    lastAccessedAt: new Date('2026-09-29T12:00:00.000Z'),
    accessCount: 5,
    expiresAt: null,
    version: 1,
    status: 'active',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Domain → Persistence
// ═══════════════════════════════════════════════════════════════════════════════

describe('memoryRecordToPersistence', () => {
  it('should convert all basic fields correctly', () => {
    const record = createTestRecord();
    const row = memoryRecordToPersistence(record);

    expect(row.id).toBe('mem_test_001');
    expect(row.kind).toBe('static');
    expect(row.type).toBe('writing_profile');
    expect(row.scope).toBe('global');
    expect(row.ownerId).toBe('user_123');
    expect(row.source).toBe('test_factory');
    expect(row.sourceType).toBe('test');
    expect(row.confidence).toBe(0.85);
    expect(row.importance).toBe(0.72);
    expect(row.accessCount).toBe(5);
    expect(row.version).toBe(1);
    expect(row.status).toBe('active');
  });

  it('should convert ISO strings to Date objects', () => {
    const record = createTestRecord();
    const row = memoryRecordToPersistence(record);

    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
    expect(row.lastAccessedAt).toBeInstanceOf(Date);

    expect(row.createdAt.toISOString()).toBe('2026-09-29T10:30:00.000Z');
    expect(row.updatedAt.toISOString()).toBe('2026-09-29T11:00:00.000Z');
    expect(row.lastAccessedAt!.toISOString()).toBe('2026-09-29T12:00:00.000Z');
  });

  it('should preserve payload as-is', () => {
    const record = createTestRecord();
    const row = memoryRecordToPersistence(record);

    expect(row.payload).toEqual({ tone: 'formal', preferences: ['concise'] });
  });

  it('should preserve derivedFrom as-is', () => {
    const record = createTestRecord();
    const row = memoryRecordToPersistence(record);

    expect(row.derivedFrom).toEqual(['mem_parent_1', 'mem_parent_2']);
  });

  it('should handle null optional fields', () => {
    const record = createTestRecord();
    const row = memoryRecordToPersistence(record);

    expect(row.projectId).toBeNull();
    expect(row.topicId).toBeNull();
    expect(row.expiresAt).toBeNull();
    expect(row.lastAccessedAt).toBeInstanceOf(Date); // This one is non-null in test
  });

  it('should handle null lastAccessedAt', () => {
    const record = createTestRecord();
    record.lastAccessedAt = null;
    const row = memoryRecordToPersistence(record);

    expect(row.lastAccessedAt).toBeNull();
  });

  it('should handle undefined ownerId as empty string', () => {
    const record = createTestRecord();
    record.ownerId = undefined;
    const row = memoryRecordToPersistence(record);

    expect(row.ownerId).toBe('');
  });

  it('should handle undefined derivedFrom as null', () => {
    const record = createTestRecord();
    record.derivedFrom = undefined;
    const row = memoryRecordToPersistence(record);

    expect(row.derivedFrom).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Persistence → Domain
// ═══════════════════════════════════════════════════════════════════════════════

describe('persistenceToMemoryRecord', () => {
  it('should convert all basic fields correctly', () => {
    const row = createTestRow();
    const record = persistenceToMemoryRecord(row);

    expect(record.id).toBe('mem_test_001');
    expect(record.kind).toBe('static');
    expect(record.type).toBe('writing_profile');
    expect(record.scope).toBe('global');
    expect(record.ownerId).toBe('user_123');
    expect(record.source).toBe('test_factory');
    expect(record.sourceType).toBe('test');
    expect(record.confidence).toBe(0.85);
    expect(record.importance).toBe(0.72);
    expect(record.accessCount).toBe(5);
    expect(record.version).toBe(1);
    expect(record.status).toBe('active');
  });

  it('should convert Date objects to ISO strings', () => {
    const row = createTestRow();
    const record = persistenceToMemoryRecord(row);

    expect(record.createdAt).toBe('2026-09-29T10:30:00.000Z');
    expect(record.updatedAt).toBe('2026-09-29T11:00:00.000Z');
    expect(record.lastAccessedAt).toBe('2026-09-29T12:00:00.000Z');
  });

  it('should preserve payload as unknown', () => {
    const row = createTestRow();
    const record = persistenceToMemoryRecord(row);

    expect(record.payload).toEqual({ tone: 'formal', preferences: ['concise'] });
  });

  it('should parse derivedFrom from JSON', () => {
    const row = createTestRow();
    const record = persistenceToMemoryRecord(row);

    expect(record.derivedFrom).toEqual(['mem_parent_1', 'mem_parent_2']);
  });

  it('should handle null optional fields', () => {
    const row = createTestRow();
    const record = persistenceToMemoryRecord(row);

    expect(record.projectId).toBeNull();
    expect(record.topicId).toBeNull();
    expect(record.expiresAt).toBeNull();
  });

  it('should handle null lastAccessedAt', () => {
    const row = createTestRow();
    row.lastAccessedAt = null;
    const record = persistenceToMemoryRecord(row);

    expect(record.lastAccessedAt).toBeNull();
  });

  it('should handle null derivedFrom', () => {
    const row = createTestRow();
    row.derivedFrom = null;
    const record = persistenceToMemoryRecord(row);

    expect(record.derivedFrom).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Round-trip
// ═══════════════════════════════════════════════════════════════════════════════

describe('round-trip fidelity', () => {
  it('should preserve all fields through domain → persistence → domain', () => {
    const original = createTestRecord();
    const row = memoryRecordToPersistence(original);
    const restored = persistenceToMemoryRecord(row);

    expect(restored.id).toBe(original.id);
    expect(restored.kind).toBe(original.kind);
    expect(restored.type).toBe(original.type);
    expect(restored.scope).toBe(original.scope);
    expect(restored.ownerId).toBe(original.ownerId);
    expect(restored.projectId).toBe(original.projectId);
    expect(restored.topicId).toBe(original.topicId);
    expect(restored.source).toBe(original.source);
    expect(restored.sourceType).toBe(original.sourceType);
    expect(restored.derivedFrom).toEqual(original.derivedFrom);
    expect(restored.confidence).toBe(original.confidence);
    expect(restored.importance).toBe(original.importance);
    expect(restored.createdAt).toBe(original.createdAt);
    expect(restored.updatedAt).toBe(original.updatedAt);
    expect(restored.lastAccessedAt).toBe(original.lastAccessedAt);
    expect(restored.accessCount).toBe(original.accessCount);
    expect(restored.expiresAt).toBe(original.expiresAt);
    expect(restored.version).toBe(original.version);
    expect(restored.status).toBe(original.status);
  });

  it('should preserve complex nested payload', () => {
    const original = createTestRecord();
    original.payload = {
      title: '测试',
      preferences: ['短句', '直接'],
      nested: { score: 0.92, deep: { value: true } },
    };

    const row = memoryRecordToPersistence(original);
    const restored = persistenceToMemoryRecord(row);

    expect(restored.payload).toEqual(original.payload);
  });

  it('should handle topic-scoped record with all IDs', () => {
    const original = createTestRecord();
    original.scope = 'topic';
    original.projectId = 'proj_1';
    original.topicId = 'topic_1';

    const row = memoryRecordToPersistence(original);
    const restored = persistenceToMemoryRecord(row);

    expect(restored.scope).toBe('topic');
    expect(restored.projectId).toBe('proj_1');
    expect(restored.topicId).toBe('topic_1');
  });

  it('should handle project-scoped record', () => {
    const original = createTestRecord();
    original.scope = 'project';
    original.projectId = 'proj_1';
    original.topicId = null;

    const row = memoryRecordToPersistence(original);
    const restored = persistenceToMemoryRecord(row);

    expect(restored.scope).toBe('project');
    expect(restored.projectId).toBe('proj_1');
    expect(restored.topicId).toBeNull();
  });

  it('should handle expiresAt as Date', () => {
    const original = createTestRecord();
    original.expiresAt = '2027-01-01T00:00:00.000Z';

    const row = memoryRecordToPersistence(original);
    expect(row.expiresAt).toBeInstanceOf(Date);
    expect(row.expiresAt!.toISOString()).toBe('2027-01-01T00:00:00.000Z');

    const restored = persistenceToMemoryRecord(row);
    expect(restored.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });
});
