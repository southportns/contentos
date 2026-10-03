/**
 * P0.6.6 - Context Graph Builder Tests
 */

import { describe, it, expect } from 'vitest';
import { buildContextGraph, isScopeCompatible, makeEdgeId } from '../context-graph-builder';
import { createTestContext } from './test-helpers';

describe('P0.6.6 - Context Graph Builder', () => {
  describe('B1: Empty Graph', () => {
    it('should return empty graph for empty input', () => {
      const graph = buildContextGraph([]);
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.nodeCount).toBe(0);
      expect(graph.edgeCount).toBe(0);
    });
  });

  describe('B2: Single Node', () => {
    it('should create graph with single node and no edges', () => {
      const ctx = createTestContext({ id: 'single' });
      const graph = buildContextGraph([ctx]);
      expect(graph.nodeCount).toBe(1);
      expect(graph.edgeCount).toBe(0);
      expect(graph.nodes[0].id).toBe('single');
    });
  });

  describe('B3: derived_from Edge', () => {
    it('should create derived_from edge when target exists', () => {
      const source = createTestContext({ id: 'source' });
      const derived = createTestContext({
        id: 'derived',
        kind: 'content',
        derivedFrom: ['source'],
      });
      const graph = buildContextGraph([source, derived]);
      expect(graph.nodeCount).toBe(2);
      expect(graph.edgeCount).toBe(1);
      expect(graph.edges[0].type).toBe('derived_from');
      expect(graph.edges[0].fromId).toBe('source');
      expect(graph.edges[0].toId).toBe('derived');
    });

    it('should skip derived_from edge when target is missing', () => {
      const derived = createTestContext({
        id: 'derived',
        derivedFrom: ['nonexistent'],
      });
      const graph = buildContextGraph([derived]);
      expect(graph.nodeCount).toBe(1);
      expect(graph.edgeCount).toBe(0);
    });
  });

  describe('B4: used_by Edge', () => {
    it('should create used_by edge when target exists', () => {
      const producer = createTestContext({
        id: 'producer',
        usedBy: ['consumer'],
      });
      const consumer = createTestContext({ id: 'consumer', kind: 'content' });
      const graph = buildContextGraph([producer, consumer]);
      expect(graph.edgeCount).toBe(1);
      expect(graph.edges[0].type).toBe('used_by');
      expect(graph.edges[0].fromId).toBe('producer');
      expect(graph.edges[0].toId).toBe('consumer');
    });
  });

  describe('B5: supersedes Edge', () => {
    it('should create supersedes edge when target exists', () => {
      const old = createTestContext({ id: 'old_version' });
      const newCtx = createTestContext({
        id: 'new_version',
        supersedes: 'old_version',
      });
      const graph = buildContextGraph([old, newCtx]);
      expect(graph.edgeCount).toBe(1);
      expect(graph.edges[0].type).toBe('supersedes');
      expect(graph.edges[0].fromId).toBe('old_version');
      expect(graph.edges[0].toId).toBe('new_version');
    });
  });

  describe('B6: Multiple Edges', () => {
    it('should handle all three edge types in one graph', () => {
      const strategy = createTestContext({
        id: 'strategy_1',
        kind: 'strategy',
        usedBy: ['content_1'],
      });
      const decision = createTestContext({
        id: 'decision_1',
        kind: 'decision',
        derivedFrom: ['strategy_1'],
        usedBy: ['content_1'],
      });
      const content = createTestContext({
        id: 'content_1',
        kind: 'content',
        derivedFrom: ['strategy_1', 'decision_1'],
      });
      const graph = buildContextGraph([strategy, decision, content]);
      expect(graph.nodeCount).toBe(3);
      // strategy -> content (used_by), strategy -> decision (derived_from), decision -> content (used_by), strategy -> content (derived_from), decision -> content (derived_from)
      expect(graph.edgeCount).toBe(5);
    });
  });

  describe('B7: Missing Target Ignored', () => {
    it('should not create dangling edges', () => {
      const ctx = createTestContext({
        id: 'ctx_1',
        derivedFrom: ['missing_1'],
        usedBy: ['missing_2'],
        supersedes: 'missing_3',
      });
      const graph = buildContextGraph([ctx]);
      expect(graph.edgeCount).toBe(0);
    });
  });

  describe('B8: Deduplication', () => {
    it('should produce exactly one edge per (type, fromId, toId)', () => {
      const a = createTestContext({ id: 'A' });
      const b = createTestContext({
        id: 'B',
        derivedFrom: ['A'],
      });
      const graph = buildContextGraph([a, b]);
      expect(graph.edgeCount).toBe(1);
    });
  });

  describe('B9: Deterministic Output', () => {
    it('should produce identical graph regardless of input order (full equality)', () => {
      const a = createTestContext({ id: 'A' });
      const b = createTestContext({ id: 'B', derivedFrom: ['A'] });
      const c = createTestContext({ id: 'C', derivedFrom: ['B'] });
      const d = createTestContext({ id: 'D', usedBy: ['C'] });

      const graph1 = buildContextGraph([a, b, c, d]);
      const graph2 = buildContextGraph([d, c, b, a]);

      expect(graph1.nodeCount).toBe(graph2.nodeCount);
      expect(graph1.edgeCount).toBe(graph2.edgeCount);
      expect(graph1.nodes.map(n => n.id)).toEqual(graph2.nodes.map(n => n.id));
      expect(graph1.edges.map(e => e.id)).toEqual(graph2.edges.map(e => e.id));
      // Full graph equality incl. createdAt
      expect(graph1.edges).toEqual(graph2.edges);
    });

    // Test A: same input → same graph twice
    it('Test A: same input produces identical graph on repeated build', () => {
      const a = createTestContext({ id: 'X' });
      const b = createTestContext({ id: 'Y', derivedFrom: ['X'] });
      const c = createTestContext({ id: 'Z', usedBy: ['Y'] });

      const graph1 = buildContextGraph([a, b, c]);
      const graph2 = buildContextGraph([a, b, c]);

      expect(graph1).toEqual(graph2);
    });

    // Test B: derived_from uses declaring context's updatedAt
    it('Test B: derived_from edge createdAt === declaring context updatedAt', () => {
      const t1 = '2026-01-01T00:00:00.000Z';
      const t2 = '2026-06-15T12:30:00.000Z';
      const a = createTestContext({ id: 'A', updatedAt: t1 });
      const b = createTestContext({ id: 'B', updatedAt: t2, derivedFrom: ['A'] });

      const graph = buildContextGraph([a, b]);

      // derived_from: A → B, declaring context is B, createdAt = B.updatedAt
      const edge = graph.edges[0];
      expect(edge.createdAt).toBe(t2);
    });

    // Test C: used_by uses declaring context's updatedAt
    it('Test C: used_by edge createdAt === declaring context updatedAt', () => {
      const t1 = '2026-03-10T08:00:00.000Z';
      const t2 = '2026-09-20T16:45:00.000Z';
      const a = createTestContext({ id: 'P', updatedAt: t1, usedBy: ['Q'] });
      const b = createTestContext({ id: 'Q', updatedAt: t2 });

      const graph = buildContextGraph([a, b]);

      // used_by: P → Q, declaring context is P, createdAt = P.updatedAt
      const edge = graph.edges[0];
      expect(edge.createdAt).toBe(t1);
    });

    // Test D: supersedes uses declaring context's updatedAt
    it('Test D: supersedes edge createdAt === declaring context updatedAt', () => {
      const t1 = '2026-02-28T00:00:00.000Z';
      const t2 = '2026-12-25T00:00:00.000Z';
      const a = createTestContext({ id: 'OLD', updatedAt: t1 });
      const b = createTestContext({ id: 'NEW', updatedAt: t2, supersedes: 'OLD' });

      const graph = buildContextGraph([a, b]);

      // supersedes: OLD → NEW, declaring context is NEW, createdAt = NEW.updatedAt
      const edge = graph.edges[0];
      expect(edge.createdAt).toBe(t2);
    });
  });

  describe('B10: Owner Isolation', () => {
    it('should not create edge between different owners', () => {
      const ownerA = createTestContext({
        id: 'ctx_a',
        ownerId: 'user_1',
        usedBy: ['ctx_b'],
      });
      const ownerB = createTestContext({
        id: 'ctx_b',
        ownerId: 'user_2',
        derivedFrom: ['ctx_a'],
      });
      const graph = buildContextGraph([ownerA, ownerB]);
      expect(graph.nodeCount).toBe(2);
      expect(graph.edgeCount).toBe(0);
    });

    it('should create edge when owners match', () => {
      const ctxA = createTestContext({
        id: 'ctx_a',
        ownerId: 'user_1',
        usedBy: ['ctx_b'],
      });
      const ctxB = createTestContext({
        id: 'ctx_b',
        ownerId: 'user_1',
      });
      const graph = buildContextGraph([ctxA, ctxB]);
      expect(graph.edgeCount).toBe(1);
    });
  });

  describe('B11: Project Isolation', () => {
    it('should not create edge between different projects', () => {
      const ctxA = createTestContext({
        id: 'ctx_a',
        ownerId: 'user_1',
        projectId: 'proj_1',
        usedBy: ['ctx_b'],
      });
      const ctxB = createTestContext({
        id: 'ctx_b',
        ownerId: 'user_1',
        projectId: 'proj_2',
        derivedFrom: ['ctx_a'],
      });
      const graph = buildContextGraph([ctxA, ctxB]);
      expect(graph.edgeCount).toBe(0);
    });

    it('should create edge when projects match', () => {
      const ctxA = createTestContext({
        id: 'ctx_a',
        projectId: 'proj_1',
        usedBy: ['ctx_b'],
      });
      const ctxB = createTestContext({
        id: 'ctx_b',
        projectId: 'proj_1',
      });
      const graph = buildContextGraph([ctxA, ctxB]);
      expect(graph.edgeCount).toBe(1);
    });
  });

  describe('B12: Topic Isolation', () => {
    it('should not create edge between different topics', () => {
      const ctxA = createTestContext({
        id: 'ctx_a',
        projectId: 'proj_1',
        topicId: 'topic_1',
        usedBy: ['ctx_b'],
      });
      const ctxB = createTestContext({
        id: 'ctx_b',
        projectId: 'proj_1',
        topicId: 'topic_2',
        derivedFrom: ['ctx_a'],
      });
      const graph = buildContextGraph([ctxA, ctxB]);
      expect(graph.edgeCount).toBe(0);
    });
  });

  describe('Edge ID Determinism', () => {
    it('should produce deterministic edge ID', () => {
      const id1 = makeEdgeId('derived_from', 'A', 'B');
      const id2 = makeEdgeId('derived_from', 'A', 'B');
      expect(id1).toBe(id2);
      expect(id1).toBe('edge_derived_from_A_B');
    });

    it('should produce different IDs for different edges', () => {
      const id1 = makeEdgeId('derived_from', 'A', 'B');
      const id2 = makeEdgeId('used_by', 'A', 'B');
      expect(id1).not.toBe(id2);
    });
  });

  describe('Graph Structure', () => {
    it('should have nodes sorted by id ASC', () => {
      const contexts = [
        createTestContext({ id: 'z_3' }),
        createTestContext({ id: 'a_1' }),
        createTestContext({ id: 'm_2' }),
      ];
      const graph = buildContextGraph(contexts);
      expect(graph.nodes.map(n => n.id)).toEqual(['a_1', 'm_2', 'z_3']);
    });

    it('should not contain duplicate node IDs', () => {
      const a1 = createTestContext({ id: 'X' });
      const a2 = createTestContext({ id: 'X' });
      const graph = buildContextGraph([a1, a2]);
      expect(graph.nodeCount).toBe(1);
    });
  });

  describe('isScopeCompatible', () => {
    it('should allow same owner', () => {
      const a = createTestContext({ id: 'a', ownerId: 'u1' });
      const b = createTestContext({ id: 'b', ownerId: 'u1' });
      expect(isScopeCompatible(a, b)).toBe(true);
    });

    it('should reject different owners', () => {
      const a = createTestContext({ id: 'a', ownerId: 'u1' });
      const b = createTestContext({ id: 'b', ownerId: 'u2' });
      expect(isScopeCompatible(a, b)).toBe(false);
    });

    it('should allow same project', () => {
      const a = createTestContext({ id: 'a', projectId: 'p1' });
      const b = createTestContext({ id: 'b', projectId: 'p1' });
      expect(isScopeCompatible(a, b)).toBe(true);
    });

    it('should reject different projects', () => {
      const a = createTestContext({ id: 'a', projectId: 'p1' });
      const b = createTestContext({ id: 'b', projectId: 'p2' });
      expect(isScopeCompatible(a, b)).toBe(false);
    });

    it('should reject different topics', () => {
      const a = createTestContext({ id: 'a', projectId: 'p1', topicId: 't1' });
      const b = createTestContext({ id: 'b', projectId: 'p1', topicId: 't2' });
      expect(isScopeCompatible(a, b)).toBe(false);
    });

    it('should handle null values as compatible', () => {
      const a = createTestContext({ id: 'a', ownerId: null, projectId: null });
      const b = createTestContext({ id: 'b', ownerId: null, projectId: null });
      expect(isScopeCompatible(a, b)).toBe(true);
    });

    it('should allow one side null, one side defined', () => {
      const a = createTestContext({ id: 'a', projectId: 'p1' });
      const b = createTestContext({ id: 'b', projectId: null });
      expect(isScopeCompatible(a, b)).toBe(true);
    });

    it('should isolate unknown scope without shared lineage', () => {
      const a = createTestContext({ id: 'a', scope: 'unknown', ownerId: null });
      const b = createTestContext({ id: 'b', scope: 'unknown', ownerId: null });
      expect(isScopeCompatible(a, b)).toBe(false);
    });

    it('should allow unknown scope with shared owner', () => {
      const a = createTestContext({ id: 'a', scope: 'unknown', ownerId: 'u1' });
      const b = createTestContext({ id: 'b', scope: 'topic', ownerId: 'u1' });
      expect(isScopeCompatible(a, b)).toBe(true);
    });

    it('should allow global scope with compatible project', () => {
      const a = createTestContext({ id: 'a', scope: 'global', projectId: 'p1' });
      const b = createTestContext({ id: 'b', scope: 'project', projectId: 'p1' });
      expect(isScopeCompatible(a, b)).toBe(true);
    });
  });
});
