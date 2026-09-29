/**
 * P0.6.3.1 — Memory Collection Tests
 *
 * Tests for MemoryCollection, filtering, sorting, and immutability.
 */

import { describe, it, expect } from 'vitest';
import {
  MemoryCollectionBuilder,
  createMemoryCollection,
  filterByKind,
  filterByScope,
  filterByProject,
  filterByTopic,
  filterByStatus,
  sortByImportance,
  sortByRecency,
  sortByConfidence,
  sortByAccessCount,
  findById,
  getMemoryKinds,
  getMemoryScopes,
} from '../memory-collection';
import { createMemoryRecord, createStaticMemory, createDynamicMemory, createEpisodicMemory, createSemanticMemory } from '../memory-factory';
import type { MemoryRecord } from '../memory-record';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<MemoryRecord>): MemoryRecord {
  return createMemoryRecord({
    kind: 'static',
    type: 'test',
    payload: { value: 'test' },
    source: 'test',
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('Memory Collection', () => {
  describe('Creation', () => {
    it('should create empty collection', () => {
      const col = createMemoryCollection([]);
      expect(col.size).toBe(0);
      expect(col.isEmpty).toBe(true);
      expect(col.memories).toEqual([]);
    });

    it('should create collection with records', () => {
      const records = [
        makeRecord({ id: 'm1' }),
        makeRecord({ id: 'm2' }),
      ];
      const col = createMemoryCollection(records);
      expect(col.size).toBe(2);
      expect(col.isEmpty).toBe(false);
    });

    it('should build via builder pattern', () => {
      const col = new MemoryCollectionBuilder()
        .add(makeRecord({ id: 'a' }))
        .addMany([makeRecord({ id: 'b' }), makeRecord({ id: 'c' })])
        .build();
      expect(col.size).toBe(3);
    });
  });

  describe('Immutability', () => {
    it('should not allow modifying the original array', () => {
      const records = [makeRecord({ id: 'm1' })];
      const col = createMemoryCollection(records);
      // Original should still have 1 element
      expect(col.memories).toHaveLength(1);
      // Sorting should return a new array
      const sorted = sortByImportance(col);
      expect(sorted).toHaveLength(1);
    });
  });

  describe('filterByKind', () => {
    it('should filter memory records by kind', () => {
      const col = createMemoryCollection([
        createStaticMemory({ type: 'profile', payload: null, source: 'test' }),
        createDynamicMemory({ type: 'draft', payload: null, source: 'test' }),
        createEpisodicMemory({ type: 'event', payload: null, source: 'test' }),
        createSemanticMemory({ type: 'fact', payload: null, source: 'test' }),
      ]);

      const statics = filterByKind(col, 'static');
      expect(statics).toHaveLength(1);
      expect(statics[0].kind).toBe('static');

      const dynamics = filterByKind(col, 'dynamic');
      expect(dynamics).toHaveLength(1);
      expect(dynamics[0].kind).toBe('dynamic');
    });
  });

  describe('filterByScope', () => {
    it('should filter by scope', () => {
      const col = createMemoryCollection([
        makeRecord({ scope: 'global' }),
        makeRecord({ scope: 'project', projectId: 'p1' }),
        makeRecord({ scope: 'topic', topicId: 't1' }),
        makeRecord({ scope: 'session' }),
      ]);

      expect(filterByScope(col, 'global')).toHaveLength(1);
      expect(filterByScope(col, 'project')).toHaveLength(1);
      expect(filterByScope(col, 'topic')).toHaveLength(1);
      expect(filterByScope(col, 'session')).toHaveLength(1);
    });
  });

  describe('filterByProject', () => {
    it('should filter by project ID', () => {
      const col = createMemoryCollection([
        makeRecord({ scope: 'project', projectId: 'p1' }),
        makeRecord({ scope: 'project', projectId: 'p2' }),
        makeRecord({ scope: 'global' }),
      ]);

      const result = filterByProject(col, 'p1');
      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe('p1');
    });
  });

  describe('filterByTopic', () => {
    it('should filter by topic ID', () => {
      const col = createMemoryCollection([
        makeRecord({ scope: 'topic', topicId: 't1' }),
        makeRecord({ scope: 'topic', topicId: 't2' }),
        makeRecord({ scope: 'global' }),
      ]);

      const result = filterByTopic(col, 't1');
      expect(result).toHaveLength(1);
      expect(result[0].topicId).toBe('t1');
    });
  });

  describe('filterByStatus', () => {
    it('should filter by status', () => {
      const col = createMemoryCollection([
        makeRecord({ status: 'active' }),
        makeRecord({ status: 'expired' }),
        makeRecord({ status: 'active' }),
        makeRecord({ status: 'superseded' }),
      ]);

      expect(filterByStatus(col, 'active')).toHaveLength(2);
      expect(filterByStatus(col, 'expired')).toHaveLength(1);
      expect(filterByStatus(col, 'superseded')).toHaveLength(1);
    });
  });

  describe('Sorting', () => {
    it('should sort by importance (highest first)', () => {
      const col = createMemoryCollection([
        makeRecord({ id: 'low', importance: 0.2 }),
        makeRecord({ id: 'high', importance: 0.9 }),
        makeRecord({ id: 'mid', importance: 0.5 }),
      ]);

      const sorted = sortByImportance(col);
      expect(sorted.map(m => m.id)).toEqual(['high', 'mid', 'low']);
    });

    it('should sort by confidence (highest first)', () => {
      const col = createMemoryCollection([
        makeRecord({ id: 'a', confidence: 0.3 }),
        makeRecord({ id: 'b', confidence: 0.9 }),
        makeRecord({ id: 'c', confidence: 0.6 }),
      ]);

      const sorted = sortByConfidence(col);
      expect(sorted.map(m => m.id)).toEqual(['b', 'c', 'a']);
    });

    it('should sort by recency (most recent first)', () => {
      const col = createMemoryCollection([
        makeRecord({ id: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
        makeRecord({ id: 'new', updatedAt: '2026-06-01T00:00:00Z' }),
        makeRecord({ id: 'mid', updatedAt: '2026-03-01T00:00:00Z' }),
      ]);

      const sorted = sortByRecency(col);
      expect(sorted.map(m => m.id)).toEqual(['new', 'mid', 'old']);
    });

    it('should sort by access count (most accessed first)', () => {
      const records = [
        { ...makeRecord({ id: 'rare' }), accessCount: 1 },
        { ...makeRecord({ id: 'freq' }), accessCount: 100 },
        { ...makeRecord({ id: 'mid' }), accessCount: 50 },
      ];
      const col = createMemoryCollection(records);

      const sorted = sortByAccessCount(col);
      expect(sorted.map(m => m.id)).toEqual(['freq', 'mid', 'rare']);
    });
  });

  describe('findById', () => {
    it('should find record by ID', () => {
      const records = [
        makeRecord({ id: 'x' }),
        makeRecord({ id: 'y' }),
        makeRecord({ id: 'z' }),
      ];
      const col = createMemoryCollection(records);

      const found = findById(col, 'y');
      expect(found).toBeDefined();
      expect(found!.id).toBe('y');
    });

    it('should return undefined for missing ID', () => {
      const col = createMemoryCollection([makeRecord({ id: 'a' })]);
      expect(findById(col, 'missing')).toBeUndefined();
    });
  });

  describe('getMemoryKinds / getMemoryScopes', () => {
    it('should get unique kinds', () => {
      const col = createMemoryCollection([
        createStaticMemory({ type: 'a', payload: null, source: 't' }),
        createStaticMemory({ type: 'b', payload: null, source: 't' }),
        createDynamicMemory({ type: 'c', payload: null, source: 't' }),
      ]);
      const kinds = getMemoryKinds(col);
      expect(kinds).toContain('static');
      expect(kinds).toContain('dynamic');
      expect(kinds).toHaveLength(2);
    });

    it('should get unique scopes', () => {
      const col = createMemoryCollection([
        makeRecord({ scope: 'global' }),
        makeRecord({ scope: 'global' }),
        makeRecord({ scope: 'topic', topicId: 't1' }),
      ]);
      const scopes = getMemoryScopes(col);
      expect(scopes).toContain('global');
      expect(scopes).toContain('topic');
      expect(scopes).toHaveLength(2);
    });
  });
});
