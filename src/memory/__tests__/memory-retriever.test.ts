/**
 * P0.6.3.1 — Memory Retriever Tests
 *
 * Tests for InMemoryRetriever with scope/kind/status/confidence/importance filtering.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryRetriever } from '../memory-retriever';
import type { MemoryRecord } from '../memory-record';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<MemoryRecord>): MemoryRecord {
  return {
    id: overrides.id ?? 'mem_default',
    kind: overrides.kind ?? 'static',
    type: overrides.type ?? 'test',
    payload: overrides.payload ?? {},
    scope: overrides.scope ?? 'global',
    ownerId: overrides.ownerId,
    projectId: overrides.projectId,
    topicId: overrides.topicId,
    source: overrides.source ?? 'test',
    sourceType: overrides.sourceType ?? 'test',
    derivedFrom: overrides.derivedFrom,
    confidence: overrides.confidence ?? 0.5,
    importance: overrides.importance ?? 0.5,
    createdAt: overrides.createdAt ?? '2026-06-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-06-01T00:00:00Z',
    lastAccessedAt: null,
    accessCount: overrides.accessCount ?? 0,
    expiresAt: overrides.expiresAt ?? null,
    version: overrides.version ?? 1,
    status: overrides.status ?? 'active',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('InMemoryRetriever', () => {
  // ─── Cross-project / Cross-topic Isolation ──────────────────────────────────

  describe('Scope isolation', () => {
    it('should include global memories for any project request', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'g1', scope: 'global' }),
        makeRecord({ id: 'p1', scope: 'project', projectId: 'proj-a' }),
      ]);

      const result = await retriever.retrieve({ projectId: 'proj-b' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('g1');
    });

    it('should include project memory only for matching project', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'p-a', scope: 'project', projectId: 'proj-a' }),
        makeRecord({ id: 'p-b', scope: 'project', projectId: 'proj-b' }),
      ]);

      const result = await retriever.retrieve({ projectId: 'proj-a' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p-a');
    });

    it('should exclude topic memories from different topics', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({
          id: 't-a',
          scope: 'topic',
          projectId: 'proj-a',
          topicId: 'topic-1',
        }),
        makeRecord({
          id: 't-b',
          scope: 'topic',
          projectId: 'proj-a',
          topicId: 'topic-2',
        }),
      ]);

      const result = await retriever.retrieve({
        projectId: 'proj-a',
        topicId: 'topic-1',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t-a');
    });

    it('should exclude session memories from retrieval', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'g1', scope: 'global' }),
        makeRecord({ id: 's1', scope: 'session' }),
      ]);

      const result = await retriever.retrieve({});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('g1');
    });

    it('should exclude topic memories when request has different project', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({
          id: 't1',
          scope: 'topic',
          projectId: 'proj-a',
          topicId: 'topic-1',
        }),
      ]);

      const result = await retriever.retrieve({
        projectId: 'proj-b',
        topicId: 'topic-1',
      });
      expect(result).toHaveLength(0);
    });
  });

  // ─── Status Filtering ──────────────────────────────────────────────────────

  describe('Status filtering', () => {
    it('should exclude expired memories by default', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a1', status: 'active' }),
        makeRecord({ id: 'e1', status: 'expired' }),
      ]);

      const result = await retriever.retrieve({});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('should exclude superseded memories by default', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a1', status: 'active' }),
        makeRecord({ id: 's1', status: 'superseded' }),
      ]);

      const result = await retriever.retrieve({});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('should exclude archived memories', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a1', status: 'active' }),
        makeRecord({ id: 'arch1', status: 'archived' }),
      ]);

      const result = await retriever.retrieve({});
      expect(result.map(m => m.id)).not.toContain('arch1');
    });

    it('should include expired when policy says so', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a1', status: 'active' }),
        makeRecord({ id: 'e1', status: 'expired' }),
      ]);

      const result = await retriever.retrieve({
        policy: { includeExpired: true },
      });
      expect(result).toHaveLength(2);
    });

    it('should include superseded when policy says so', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a1', status: 'active' }),
        makeRecord({ id: 's1', status: 'superseded' }),
      ]);

      const result = await retriever.retrieve({
        policy: { includeSuperseded: true },
      });
      expect(result).toHaveLength(2);
    });
  });

  // ─── Confidence / Importance Filtering ─────────────────────────────────────

  describe('Confidence filtering', () => {
    it('should filter by minConfidence', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'high', confidence: 0.9 }),
        makeRecord({ id: 'mid', confidence: 0.5 }),
        makeRecord({ id: 'low', confidence: 0.2 }),
      ]);

      const result = await retriever.retrieve({
        policy: { minConfidence: 0.5 },
      });
      expect(result.map(m => m.id)).toContain('high');
      expect(result.map(m => m.id)).toContain('mid');
      expect(result.map(m => m.id)).not.toContain('low');
    });

    it('should use default minConfidence of 0.3', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'ok', confidence: 0.3 }),
        makeRecord({ id: 'low', confidence: 0.29 }),
      ]);

      const result = await retriever.retrieve({});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ok');
    });
  });

  describe('Importance filtering', () => {
    it('should filter by minImportance', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'imp', importance: 0.8 }),
        makeRecord({ id: 'unimp', importance: 0.1 }),
      ]);

      const result = await retriever.retrieve({
        policy: { minImportance: 0.5 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('imp');
    });
  });

  // ─── Kind / Scope Filtering ────────────────────────────────────────────────

  describe('Kind filtering', () => {
    it('should filter by allowedKinds', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 's1', kind: 'static', scope: 'global' }),
        makeRecord({ id: 'd1', kind: 'dynamic', scope: 'global' }),
        makeRecord({ id: 'e1', kind: 'episodic', scope: 'global' }),
      ]);

      const result = await retriever.retrieve({
        policy: { allowedKinds: ['static', 'semantic'] },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1');
    });

    it('should filter by excludedKinds', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 's1', kind: 'static', scope: 'global' }),
        makeRecord({ id: 'd1', kind: 'dynamic', scope: 'global' }),
      ]);

      const result = await retriever.retrieve({
        policy: { excludedKinds: ['dynamic'] },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1');
    });
  });

  // ─── Owner Filtering ───────────────────────────────────────────────────────

  describe('Owner filtering', () => {
    it('should filter by ownerId', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'u1', ownerId: 'user-a', scope: 'global' }),
        makeRecord({ id: 'u2', ownerId: 'user-b', scope: 'global' }),
      ]);

      const result = await retriever.retrieve({ ownerId: 'user-a' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');
    });

    // ─── P0.6.3.1-R1: Cross-user isolation ────────────────────────────────────

    it('should NOT return user_B global memories when requesting user_A', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a1', ownerId: 'user_A', scope: 'global', importance: 0.9 }),
        makeRecord({ id: 'a2', ownerId: 'user_A', scope: 'project', projectId: 'P1', importance: 0.8 }),
        makeRecord({ id: 'b1', ownerId: 'user_B', scope: 'global', importance: 0.7 }),
        makeRecord({ id: 'b2', ownerId: 'user_B', scope: 'project', projectId: 'P1', importance: 0.6 }),
      ]);

      const result = await retriever.retrieve({ ownerId: 'user_A', projectId: 'P1' });
      expect(result).toHaveLength(2);
      expect(result.map(m => m.id)).toContain('a1');
      expect(result.map(m => m.id)).toContain('a2');
      expect(result.map(m => m.id)).not.toContain('b1');
      expect(result.map(m => m.id)).not.toContain('b2');
    });
  });

  // ─── maxResults ─────────────────────────────────────────────────────────────

  describe('maxResults', () => {
    it('should limit results to maxResults', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a', importance: 0.9, scope: 'global' }),
        makeRecord({ id: 'b', importance: 0.8, scope: 'global' }),
        makeRecord({ id: 'c', importance: 0.7, scope: 'global' }),
        makeRecord({ id: 'd', importance: 0.6, scope: 'global' }),
        makeRecord({ id: 'e', importance: 0.5, scope: 'global' }),
      ]);

      const result = await retriever.retrieve({
        policy: { maxResults: 3 },
      });
      expect(result).toHaveLength(3);
    });

    it('should use default maxResults of 20', async () => {
      const records = Array.from({ length: 25 }, (_, i) =>
        makeRecord({
          id: `r${i}`,
          importance: 0.5,
          scope: 'global',
        })
      );
      const retriever = new InMemoryRetriever(records);

      const result = await retriever.retrieve({});
      expect(result).toHaveLength(20);
    });
  });

  // ─── Sorting ────────────────────────────────────────────────────────────────

  describe('Sorting', () => {
    it('should sort by importance desc as primary', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'low', importance: 0.2, confidence: 0.5, scope: 'global' }),
        makeRecord({ id: 'high', importance: 0.9, confidence: 0.5, scope: 'global' }),
      ]);

      const result = await retriever.retrieve({});
      expect(result[0].id).toBe('high');
      expect(result[1].id).toBe('low');
    });

    it('should use confidence as secondary sort', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a', importance: 0.5, confidence: 0.6, scope: 'global' }),
        makeRecord({ id: 'b', importance: 0.5, confidence: 0.9, scope: 'global' }),
      ]);

      const result = await retriever.retrieve({});
      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('a');
    });
  });

  // ─── Exact ID Lookup (P0.6.5.5-R2) ──────────────────────────────────────

  describe('Exact ID lookup', () => {
    it('R-ID-1: should return only the record matching the exact ID', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a', ownerId: 'user-1', scope: 'global' }),
        makeRecord({ id: 'b', ownerId: 'user-1', scope: 'global' }),
        makeRecord({ id: 'c', ownerId: 'user-1', scope: 'global' }),
      ]);

      const result = await retriever.retrieve({
        ownerId: 'user-1',
        id: 'b',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b');
    });

    it('R-ID-2: should return empty when ID does not exist', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'a', scope: 'global' }),
      ]);

      const result = await retriever.retrieve({
        ownerId: 'user-1',
        id: 'nonexistent',
      });
      expect(result).toHaveLength(0);
    });

    it('R-ID-3: should respect owner isolation when ID belongs to other owner', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'shared-id', ownerId: 'user-2', scope: 'global' }),
      ]);

      const result = await retriever.retrieve({
        ownerId: 'user-1',
        id: 'shared-id',
      });
      expect(result).toHaveLength(0);
    });

    it('R-ID-4: should filter by ID and project scope together', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'dec-1', ownerId: 'user-1', scope: 'project', projectId: 'proj-A' }),
        makeRecord({ id: 'dec-2', ownerId: 'user-1', scope: 'project', projectId: 'proj-B' }),
      ]);

      const result = await retriever.retrieve({
        ownerId: 'user-1',
        id: 'dec-1',
        projectId: 'proj-A',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('dec-1');
    });

    it('R-ID-5: should filter by ID and topic scope together', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'dec-1', scope: 'topic', projectId: 'proj-A', topicId: 'topic-X' }),
      ]);

      const result = await retriever.retrieve({
        ownerId: 'user-1',
        id: 'dec-1',
        projectId: 'proj-A',
        topicId: 'topic-Y',
      });
      expect(result).toHaveLength(0);
    });

    it('R-ID-6: should filter by ID and type together', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'rec-1', ownerId: 'user-1', type: 'decision', scope: 'global' }),
      ]);

      const result = await retriever.retrieve({
        ownerId: 'user-1',
        id: 'rec-1',
        policy: { types: ['outcome'] },
      });
      expect(result).toHaveLength(0);
    });

    it('R-ID-7: should respect status filter with ID lookup (superseded)', async () => {
      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'sup-1', ownerId: 'user-1', status: 'superseded', scope: 'global' }),
      ]);

      // Default excludes superseded
      const resultDefault = await retriever.retrieve({
        ownerId: 'user-1',
        id: 'sup-1',
      });
      expect(resultDefault).toHaveLength(0);

      // With includeSuperseded
      const resultIncluded = await retriever.retrieve({
        ownerId: 'user-1',
        id: 'sup-1',
        policy: { includeSuperseded: true },
      });
      expect(resultIncluded).toHaveLength(1);
      expect(resultIncluded[0].id).toBe('sup-1');
    });
  });

  // ─── Age Filtering ─────────────────────────────────────────────────────────

  describe('Age filtering', () => {
    it('should exclude memories older than maxAgeDays', async () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago
      const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago

      const retriever = new InMemoryRetriever([
        makeRecord({ id: 'old', createdAt: oldDate, scope: 'global' }),
        makeRecord({ id: 'recent', createdAt: recentDate, scope: 'global' }),
      ]);

      const result = await retriever.retrieve({
        policy: { maxAgeDays: 30 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('recent');
    });
  });

  // ─── Utility Methods ────────────────────────────────────────────────────────

  describe('Utility methods', () => {
    it('getAll should return all records unfiltered', () => {
      const records = [makeRecord({ id: 'a' }), makeRecord({ id: 'b' })];
      const retriever = new InMemoryRetriever(records);
      expect(retriever.getAll()).toHaveLength(2);
    });

    it('addRecords should add records', () => {
      const retriever = new InMemoryRetriever();
      retriever.addRecords([makeRecord({ id: 'x' })]);
      expect(retriever.getAll()).toHaveLength(1);
    });

    it('clear should remove all records', () => {
      const retriever = new InMemoryRetriever([makeRecord({ id: 'a' })]);
      retriever.clear();
      expect(retriever.getAll()).toHaveLength(0);
    });
  });
});
