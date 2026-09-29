/**
 * P0.6.3.1 — Memory Record Tests
 *
 * Tests for MemoryRecord type constraints.
 */

import { describe, it, expect } from 'vitest';
import type { MemoryRecord } from '../memory-record';

describe('Memory Record', () => {
  describe('Interface structure', () => {
    it('should allow a valid MemoryRecord', () => {
      const record: MemoryRecord<{ name: string }> = {
        id: 'mem_1',
        kind: 'static',
        type: 'writing_profile',
        payload: { name: 'test' },
        scope: 'global',
        ownerId: 'user-1',
        projectId: null,
        topicId: null,
        source: 'user_writing_profile',
        sourceType: 'user_writing_profile',
        confidence: 0.8,
        importance: 0.6,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        lastAccessedAt: null,
        accessCount: 0,
        expiresAt: null,
        version: 1,
        status: 'active',
      };

      expect(record.id).toBe('mem_1');
      expect(record.kind).toBe('static');
      expect(record.payload.name).toBe('test');
    });

    it('should allow record with derivedFrom', () => {
      const record: MemoryRecord = {
        id: 'mem_2',
        kind: 'dynamic',
        type: 'draft',
        payload: { title: 'Test' },
        scope: 'topic',
        topicId: 'topic-1',
        source: 'draft',
        sourceType: 'draft',
        derivedFrom: ['draft-parent-1'],
        confidence: 0.7,
        importance: 0.8,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        accessCount: 5,
        version: 2,
        status: 'active',
      };

      expect(record.derivedFrom).toEqual(['draft-parent-1']);
      expect(record.accessCount).toBe(5);
    });

    it('should support all lifecycle statuses', () => {
      const statuses: MemoryRecord['status'][] = [
        'active',
        'superseded',
        'expired',
        'archived',
      ];

      for (const status of statuses) {
        const record: MemoryRecord = {
          id: `mem_${status}`,
          kind: 'episodic',
          type: 'agent_run',
          payload: {},
          scope: 'global',
          source: 'agent_run',
          sourceType: 'agent_run',
          confidence: 0.5,
          importance: 0.5,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          accessCount: 0,
          version: 1,
          status,
        };
        expect(record.status).toBe(status);
      }
    });

    it('should allow confidence and importance to be different values', () => {
      // Important but uncertain
      const record: MemoryRecord = {
        id: 'mem_3',
        kind: 'semantic',
        type: 'pattern',
        payload: { pattern: 'prefers short sentences' },
        scope: 'global',
        source: 'memory_extraction',
        sourceType: 'analysis',
        confidence: 0.4,
        importance: 0.9,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        accessCount: 0,
        version: 1,
        status: 'active',
      };

      expect(record.confidence).toBe(0.4);
      expect(record.importance).toBe(0.9);
      expect(record.confidence).not.toBe(record.importance);
    });
  });
});
