/**
 * P0.6.6 - Context Graph Query Tests
 */

import { describe, it, expect } from 'vitest';
import { buildContextGraph } from '../context-graph-builder';
import { getRelatedContexts, traverseContextGraph, findContextPaths, clampDepth } from '../context-graph-query';
import { getNode, hasNode, getOutgoingEdges, getIncomingEdges, getNeighbors, hasEdge } from '../context-graph-utils';
import { MAX_CONTEXT_GRAPH_DEPTH } from '../context-graph-types';
import { createTestContext } from './test-helpers';

/*
 * Graph for tests:
 *   A --derived_from--> B --derived_from--> C
 *   D --used_by--> B
 *   E (isolated)
 */
function buildTestGraph() {
  const a = createTestContext({ id: 'A', kind: 'strategy' });
  const b = createTestContext({ id: 'B', kind: 'decision', derivedFrom: ['A'] });
  const c = createTestContext({ id: 'C', kind: 'content', derivedFrom: ['B'] });
  const d = createTestContext({ id: 'D', kind: 'knowledge', usedBy: ['B'] });
  const e = createTestContext({ id: 'E', kind: 'evaluation' });
  return buildContextGraph([a, b, c, d, e]);
}

/*
 * Graph with cycle: X -> Y -> Z -> X
 */
function buildCyclicGraph() {
  const x = createTestContext({ id: 'X', kind: 'strategy', usedBy: ['Y'] });
  const y = createTestContext({ id: 'Y', kind: 'decision', usedBy: ['Z'] });
  const z = createTestContext({ id: 'Z', kind: 'content', usedBy: ['X'] });
  return buildContextGraph([x, y, z]);
}

describe('P0.6.6 - Context Graph Query', () => {
  describe('getNode / hasNode', () => {
    it('should get node by ID', () => {
      const graph = buildTestGraph();
      expect(getNode(graph, 'A')).toBeDefined();
      expect(getNode(graph, 'A')!.id).toBe('A');
    });

    it('should return undefined for missing node', () => {
      const graph = buildTestGraph();
      expect(getNode(graph, 'MISSING')).toBeUndefined();
    });

    it('should check node existence', () => {
      const graph = buildTestGraph();
      expect(hasNode(graph, 'A')).toBe(true);
      expect(hasNode(graph, 'MISSING')).toBe(false);
    });
  });

  describe('getOutgoingEdges / getIncomingEdges', () => {
    it('should get outgoing edges', () => {
      const graph = buildTestGraph();
      // D has usedBy: ['B'] which means edge D -> B (used_by)
      const outgoing = getOutgoingEdges(graph, 'D');
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].toId).toBe('B');
    });

    it('should get incoming edges', () => {
      const graph = buildTestGraph();
      // B has derivedFrom: ['A'] which means edge A -> B (derived_from)
      // Also D has usedBy: ['B'] which means edge D -> B (used_by)
      // So incoming to B are edges where toId = 'B'
      const incoming = getIncomingEdges(graph, 'B');
      expect(incoming.length).toBeGreaterThanOrEqual(1);
      expect(incoming.some(e => e.fromId === 'A')).toBe(true);
    });
  });

  describe('getNeighbors / hasEdge', () => {
    it('should get all neighbors', () => {
      const graph = buildTestGraph();
      const neighbors = getNeighbors(graph, 'B');
      // A -> B (derived_from), B -> C (derived_from), D -> B (used_by)
      // Neighbors of B: A, C, D
      const neighborIds = neighbors.map(n => n.id).sort();
      expect(neighborIds).toEqual(['A', 'C', 'D']);
    });

    it('should check edge existence', () => {
      const graph = buildTestGraph();
      // A -> B is derived_from
      expect(hasEdge(graph, 'A', 'B', 'derived_from')).toBe(true);
      expect(hasEdge(graph, 'A', 'B', 'used_by')).toBe(false);
      expect(hasEdge(graph, 'C', 'A')).toBe(false);
    });
  });

  describe('Q1: Direct Outgoing', () => {
    it('should get outgoing neighbors only', () => {
      const graph = buildTestGraph();
      // B -> C (derived_from)
      const related = getRelatedContexts(graph, 'B', { direction: 'outgoing' });
      expect(related.map(n => n.id)).toEqual(['C']);
    });
  });

  describe('Q2: Direct Incoming', () => {
    it('should get incoming neighbors only', () => {
      const graph = buildTestGraph();
      // A -> B (derived_from), D -> B (used_by)
      const related = getRelatedContexts(graph, 'B', { direction: 'incoming' });
      expect(related.map(n => n.id).sort()).toEqual(['A', 'D']);
    });
  });

  describe('Q3: Both Directions', () => {
    it('should get all neighbors by default (both)', () => {
      const graph = buildTestGraph();
      const related = getRelatedContexts(graph, 'B');
      expect(related.map(n => n.id).sort()).toEqual(['A', 'C', 'D']);
    });
  });

  describe('Q4: Edge Type Filter', () => {
    it('should filter by edge type', () => {
      const graph = buildTestGraph();
      // A -> B (derived_from), D -> B (used_by), B -> C (derived_from)
      // With edgeTypes: ['derived_from'], only A and C should be returned
      const related = getRelatedContexts(graph, 'B', { edgeTypes: ['derived_from'] });
      expect(related.map(n => n.id).sort()).toEqual(['A', 'C']);
    });

    it('should return only used_by neighbors when filtered', () => {
      const graph = buildTestGraph();
      const related = getRelatedContexts(graph, 'B', { edgeTypes: ['used_by'] });
      // Only D -> B is used_by
      expect(related.map(n => n.id)).toEqual(['D']);
    });
  });

  describe('Q5: Missing Node', () => {
    it('should return empty for missing start node', () => {
      const graph = buildTestGraph();
      const related = getRelatedContexts(graph, 'NONEXISTENT');
      expect(related).toHaveLength(0);
    });
  });

  describe('Q6-Q7: Traversal maxDepth', () => {
    describe('Q6: maxDepth=1', () => {
      it('should only return direct neighbors at depth 1', () => {
        const graph = buildTestGraph();
        // Start from A, depth 1: A -> B
        const result = traverseContextGraph(graph, 'A', { maxDepth: 1, direction: 'outgoing' });
        expect(result.map(n => n.id)).toEqual(['B']);
      });
    });

    describe('Q7: maxDepth=2', () => {
      it('should return neighbors up to depth 2', () => {
        const graph = buildTestGraph();
        // Start from A, depth 2: A -> B -> C
        const result = traverseContextGraph(graph, 'A', { maxDepth: 2, direction: 'outgoing' });
        expect(result.map(n => n.id).sort()).toEqual(['B', 'C']);
      });
    });
  });

  describe('Q8: maxDepth Clamp', () => {
    it('should clamp depth to MAX_CONTEXT_GRAPH_DEPTH', () => {
      const graph = buildTestGraph();
      const result = traverseContextGraph(graph, 'A', { maxDepth: 100 });
      // Should not crash, should clamp
      expect(result).toBeDefined();
    });

    it('clampDepth helper should work correctly', () => {
      expect(clampDepth(5)).toBe(5);
      expect(clampDepth(0)).toBe(0);
      expect(clampDepth(11)).toBe(MAX_CONTEXT_GRAPH_DEPTH);
      expect(clampDepth(100)).toBe(MAX_CONTEXT_GRAPH_DEPTH);
      expect(clampDepth(-1)).toBe(0);
    });
  });

  describe('Q9: Cycle Handling', () => {
    it('should not infinite loop on cyclic graph', () => {
      const graph = buildCyclicGraph();
      const result = traverseContextGraph(graph, 'X', { maxDepth: 5 });
      // Should terminate and return nodes (X is visited, then Y, then Z, then cycle detected)
      expect(result.length).toBeGreaterThanOrEqual(2);
      const ids = result.map(n => n.id).sort();
      expect(ids).toContain('Y');
      expect(ids).toContain('Z');
    });

    it('should not duplicate nodes after cycle detection', () => {
      const graph = buildCyclicGraph();
      const result = traverseContextGraph(graph, 'X', { maxDepth: 10 });
      const ids = result.map(n => n.id);
      const uniqueIds = new Set(ids);
      // No duplicates
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('Q10: Deterministic Traversal', () => {
    it('should return consistent results regardless of input order', () => {
      const a = createTestContext({ id: 'A', kind: 'strategy' });
      const b = createTestContext({ id: 'B', kind: 'decision', derivedFrom: ['A'] });
      const c = createTestContext({ id: 'C', kind: 'content', derivedFrom: ['B'] });

      const g1 = buildContextGraph([a, b, c]);
      const g2 = buildContextGraph([c, b, a]);

      const r1 = traverseContextGraph(g2, 'A', { maxDepth: 3, direction: 'outgoing' });
      const r2 = traverseContextGraph(g1, 'A', { maxDepth: 3, direction: 'outgoing' });

      expect(r1.map(n => n.id)).toEqual(r2.map(n => n.id));
    });
  });

  describe('findContextPaths', () => {
    it('should find shortest path between connected nodes', () => {
      const graph = buildTestGraph();
      // A -> B -> C (derived_from chain)
      const paths = findContextPaths(graph, 'A', 'C', { maxDepth: 3 });
      expect(paths.length).toBeGreaterThan(0);
      const pathIds = paths[0].map(n => n.id);
      expect(pathIds).toEqual(['A', 'B', 'C']);
    });

    it('should return empty for disconnected nodes', () => {
      const graph = buildTestGraph();
      // E is isolated
      const paths = findContextPaths(graph, 'A', 'E', { maxDepth: 5 });
      expect(paths).toHaveLength(0);
    });

    it('should return same-node path for identical IDs', () => {
      const graph = buildTestGraph();
      const paths = findContextPaths(graph, 'A', 'A');
      expect(paths).toHaveLength(1);
      expect(paths[0]).toHaveLength(1);
      expect(paths[0][0].id).toBe('A');
    });

    it('should return empty for nonexistent nodes', () => {
      const graph = buildTestGraph();
      const paths = findContextPaths(graph, 'MISSING', 'A');
      expect(paths).toHaveLength(0);
    });
  });
});
