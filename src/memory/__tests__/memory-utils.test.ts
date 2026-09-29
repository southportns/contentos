/**
 * P0.6.3.1 — Memory Utils Tests
 *
 * Tests for the Memory → Context bridge (memoryRecordToContext).
 */

import { describe, it, expect } from 'vitest';
import { memoryRecordToContext, memoryRecordsToContexts } from '../memory-utils';
import { createStaticMemory, createEpisodicMemory } from '../memory-factory';
import type { MemoryRecord } from '../memory-record';

describe('Memory → Context Bridge', () => {
  describe('memoryRecordToContext', () => {
    it('should map MemoryRecord.id to ContextObject.id', () => {
      const record = createStaticMemory({
        id: 'mem_test_123',
        type: 'writing_profile',
        payload: { name: 'test' },
        source: 'test',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.id).toBe('ctx_mem_mem_test_123');
    });

    it('should set ContextObject.kind to memory', () => {
      const record = createStaticMemory({
        type: 'persona',
        payload: { name: 'test' },
        source: 'test',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.kind).toBe('memory');
    });

    it('should set ContextObject.type based on memoryKind (Context Layer convention)', () => {
      const record = createStaticMemory({
        type: 'writing_profile',
        payload: { name: 'test' },
        source: 'test',
      });

      const ctx = memoryRecordToContext(record);
      // Note: Context Layer's createMemoryContext sets type = payload.memoryKind
      // The actual type ('writing_profile') is preserved in payload.memoryType
      expect(ctx.type).toBe('static');
      expect(ctx.payload.memoryType).toBe('writing_profile');
    });

    it('should map MemoryRecord.payload to MemoryContextPayload.value', () => {
      const record = createStaticMemory<{ name: string }>({
        type: 'persona',
        payload: { name: 'Creator Alex' },
        source: 'test',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.payload.value).toEqual({ name: 'Creator Alex' });
    });

    it('should set memoryKind in payload', () => {
      const record = createEpisodicMemory({
        type: 'agent_run',
        payload: { status: 'completed' },
        source: 'test',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.payload.memoryKind).toBe('episodic');
    });

    it('should set memoryType in payload', () => {
      const record = createStaticMemory({
        type: 'persona',
        payload: null,
        source: 'test',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.payload.memoryType).toBe('persona');
    });

    it('should map provenance fields correctly', () => {
      const record = createStaticMemory({
        type: 'persona',
        payload: null,
        source: 'persona:p1',
        sourceType: 'persona',
        ownerId: 'user-1',
        projectId: null,
        topicId: null,
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.provenance.source).toBe('persona:p1');
      expect(ctx.provenance.sourceType).toBe('persona');
      expect(ctx.provenance.ownerId).toBe('user-1');
    });

    it('should pass through topicId/projectId in provenance', () => {
      const record = createEpisodicMemory({
        type: 'content_archive',
        payload: null,
        source: 'archive:a1',
        projectId: 'proj-1',
        topicId: 'topic-1',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.provenance.projectId).toBe('proj-1');
      expect(ctx.provenance.topicId).toBe('topic-1');
    });

    it('should pass confidence to both ContextObject and payload', () => {
      const record = createStaticMemory({
        type: 'test',
        payload: null,
        source: 'test',
        confidence: 0.85,
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.confidence).toBe(0.85);
      expect(ctx.payload.confidence).toBe(0.85);
    });

    it('should set importance in payload', () => {
      const record = createStaticMemory({
        type: 'test',
        payload: null,
        source: 'test',
        importance: 0.75,
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.payload.importance).toBe(0.75);
    });

    it('should preserve createdAt/updatedAt', () => {
      const record = createStaticMemory({
        type: 'test',
        payload: null,
        source: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(ctx.updatedAt).toBe('2026-06-01T00:00:00Z');
    });

    it('should set lastAccessedAt in payload', () => {
      const record = createStaticMemory({
        type: 'test',
        payload: null,
        source: 'test',
      });
      // Patch lastAccessedAt
      const accessedRecord: MemoryRecord = {
        ...record,
        lastAccessedAt: '2026-09-01T00:00:00Z',
      };

      const ctx = memoryRecordToContext(accessedRecord);
      expect(ctx.payload.lastAccessedAt).toBe('2026-09-01T00:00:00Z');
    });

    it('should preserve status in payload', () => {
      const record = createEpisodicMemory({
        type: 'agent_run',
        payload: null,
        source: 'test',
        status: 'active',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.payload.status).toBe('active');
    });

    it('should set accessCount in payload', () => {
      const record = createStaticMemory({
        type: 'test',
        payload: null,
        source: 'test',
      });
      const accessedRecord: MemoryRecord = {
        ...record,
        accessCount: 42,
      };

      const ctx = memoryRecordToContext(accessedRecord);
      expect(ctx.payload.accessCount).toBe(42);
    });

    it('should set lifecycle to retrieved', () => {
      const record = createStaticMemory({
        type: 'test',
        payload: null,
        source: 'test',
      });

      const ctx = memoryRecordToContext(record);
      expect(ctx.lifecycle.stage).toBe('retrieved');
    });
  });

  describe('memoryRecordsToContexts', () => {
    it('should convert multiple records', () => {
      const records = [
        createStaticMemory({ id: 'r1', type: 'a', payload: null, source: 't' }),
        createEpisodicMemory({ id: 'r2', type: 'b', payload: null, source: 't' }),
      ];

      const contexts = memoryRecordsToContexts(records);
      expect(contexts).toHaveLength(2);
      expect(contexts[0].id).toBe('ctx_mem_r1');
      expect(contexts[1].id).toBe('ctx_mem_r2');
    });

    it('should handle empty array', () => {
      const contexts = memoryRecordsToContexts([]);
      expect(contexts).toHaveLength(0);
    });
  });
});
