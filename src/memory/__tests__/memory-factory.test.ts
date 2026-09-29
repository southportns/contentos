/**
 * P0.6.3.1 — Memory Factory Tests
 *
 * Tests for createMemoryRecord and convenience factories.
 */

import { describe, it, expect } from 'vitest';
import {
  createMemoryRecord,
  createStaticMemory,
  createDynamicMemory,
  createEpisodicMemory,
  createSemanticMemory,
} from '../memory-factory';

describe('Memory Factory', () => {
  describe('createMemoryRecord', () => {
    it('should auto-generate id', () => {
      const record = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: { data: 1 },
        source: 'test',
      });
      expect(record.id).toBeDefined();
      expect(record.id.length).toBeGreaterThan(0);
      expect(record.id.startsWith('mem_')).toBe(true);
    });

    it('should use provided id', () => {
      const record = createMemoryRecord({
        id: 'custom-id',
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
      });
      expect(record.id).toBe('custom-id');
    });

    it('should auto-set createdAt and updatedAt', () => {
      const before = Date.now();
      const record = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
      });
      const after = Date.now();

      const createdAt = new Date(record.createdAt).getTime();
      expect(createdAt).toBeGreaterThanOrEqual(before);
      expect(createdAt).toBeLessThanOrEqual(after);
      expect(record.updatedAt).toBe(record.createdAt);
    });

    it('should use provided timestamps', () => {
      const record = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
      });
      expect(record.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(record.updatedAt).toBe('2026-06-01T00:00:00Z');
    });

    it('should set default values', () => {
      const record = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
      });
      expect(record.accessCount).toBe(0);
      expect(record.version).toBe(1);
      expect(record.status).toBe('active');
      expect(record.confidence).toBe(0.5);
      expect(record.importance).toBe(0.5);
      expect(record.lastAccessedAt).toBeNull();
      expect(record.expiresAt).toBeNull();
    });

    it('should clamp confidence to 0-1', () => {
      const record1 = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
        confidence: 1.5,
      });
      expect(record1.confidence).toBe(1);

      const record2 = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
        confidence: -0.5,
      });
      expect(record2.confidence).toBe(0);
    });

    it('should clamp importance to 0-1', () => {
      const record = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
        importance: 2.0,
      });
      expect(record.importance).toBe(1);
    });

    it('should auto-derive scope from topicId', () => {
      const record = createMemoryRecord({
        kind: 'dynamic',
        type: 'draft',
        payload: null,
        source: 'test',
        topicId: 'topic-1',
      });
      expect(record.scope).toBe('topic');
    });

    it('should auto-derive scope from projectId when no topicId', () => {
      const record = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
        projectId: 'project-1',
      });
      expect(record.scope).toBe('project');
    });

    it('should default to global scope when no IDs', () => {
      const record = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
      });
      expect(record.scope).toBe('global');
    });

    it('should respect explicit scope over derivation', () => {
      const record = createMemoryRecord({
        kind: 'static',
        type: 'test',
        payload: null,
        source: 'test',
        scope: 'session',
        topicId: 'topic-1',
      });
      expect(record.scope).toBe('session');
    });
  });

  describe('Convenience factories', () => {
    it('createStaticMemory should set kind to static', () => {
      const record = createStaticMemory({
        type: 'test',
        payload: null,
        source: 'test',
      });
      expect(record.kind).toBe('static');
    });

    it('createDynamicMemory should set kind to dynamic', () => {
      const record = createDynamicMemory({
        type: 'test',
        payload: null,
        source: 'test',
      });
      expect(record.kind).toBe('dynamic');
    });

    it('createEpisodicMemory should set kind to episodic', () => {
      const record = createEpisodicMemory({
        type: 'test',
        payload: null,
        source: 'test',
      });
      expect(record.kind).toBe('episodic');
    });

    it('createSemanticMemory should set kind to semantic', () => {
      const record = createSemanticMemory({
        type: 'test',
        payload: null,
        source: 'test',
      });
      expect(record.kind).toBe('semantic');
    });
  });
});
