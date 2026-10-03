/**
 * P0.6.6 - Context Graph Validation Tests
 */

import { describe, it, expect } from 'vitest';
import { validateContextGraph, isValidEdgeType } from '../context-graph-validation';
import { buildContextGraph } from '../context-graph-builder';
import type { ContextGraph, ContextGraphNode, ContextGraphEdge, ContextGraphEdgeType } from '../context-graph-types';
import { createTestContext } from './test-helpers';

function makeNode(id: string): ContextGraphNode {
  const ctx = createTestContext({ id });
  return { id, context: ctx };
}

function makeEdge(id: string, fromId: string, toId: string, type: ContextGraphEdge['type'] = 'derived_from'): ContextGraphEdge {
  return {
    id,
    fromId,
    toId,
    type,
    source: 'provenance',
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(nodes: ContextGraphNode[], edges: ContextGraphEdge[]): ContextGraph {
  return {
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

describe('P0.6.6 - Context Graph Validation', () => {
  describe('isValidEdgeType', () => {
    it('should accept valid edge types', () => {
      expect(isValidEdgeType('derived_from')).toBe(true);
      expect(isValidEdgeType('used_by')).toBe(true);
      expect(isValidEdgeType('supersedes')).toBe(true);
    });

    it('should reject invalid edge types', () => {
      expect(isValidEdgeType('similar_to')).toBe(false);
      expect(isValidEdgeType('related_to')).toBe(false);
      expect(isValidEdgeType('caused_by')).toBe(false);
      expect(isValidEdgeType('random')).toBe(false);
      expect(isValidEdgeType('')).toBe(false);
    });
  });

  describe('V1-V2: Node ID Validity', () => {
    it('should pass for valid node IDs', () => {
      const graph = makeGraph([makeNode('A')], []);
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(true);
    });

    it('should fail for empty node ID', () => {
      const graph = makeGraph([{ id: '', context: createTestContext({ id: 'X' }) }], []);
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.invalidNodes.length).toBeGreaterThan(0);
    });

    it('should fail for duplicate node IDs', () => {
      const graph = makeGraph([makeNode('A'), makeNode('A')], []);
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate node'))).toBe(true);
    });
  });

  describe('V3-V5: Edge Validity', () => {
    it('should fail for orphan edge.fromId', () => {
      const graph = makeGraph(
        [makeNode('A')],
        [makeEdge('e1', 'MISSING', 'A')]
      );
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.orphanEdges).toContain('e1');
    });

    it('should fail for orphan edge.toId', () => {
      const graph = makeGraph(
        [makeNode('A')],
        [makeEdge('e1', 'A', 'MISSING')]
      );
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(false);
    });

    it('should pass when both endpoints exist', () => {
      const graph = makeGraph(
        [makeNode('A'), makeNode('B')],
        [makeEdge('e1', 'A', 'B')]
      );
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(true);
    });
  });

  describe('V6: Invalid Edge Type', () => {
    it('should detect invalid edge type', () => {
      const graph = makeGraph(
        [makeNode('A'), makeNode('B')],
        [{ id: 'e1', fromId: 'A', toId: 'B', type: 'invalid_type' as ContextGraphEdgeType, source: 'provenance', createdAt: '' }]
      );
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid type'))).toBe(true);
    });
  });

  describe('V7: Self-Loop Prevention', () => {
    it('should reject self-loop edges', () => {
      const graph = makeGraph(
        [makeNode('A')],
        [makeEdge('e1', 'A', 'A')]
      );
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('self-loop'))).toBe(true);
    });
  });

  describe('V8: Duplicate Edge Detection', () => {
    it('should detect duplicate (type, fromId, toId)', () => {
      const graph = makeGraph(
        [makeNode('A'), makeNode('B')],
        [
          makeEdge('e1', 'A', 'B', 'derived_from'),
          makeEdge('e2', 'A', 'B', 'derived_from'),
        ]
      );
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.duplicateEdges.length).toBeGreaterThan(0);
    });

    it('should NOT flag different-type edges as duplicate', () => {
      const graph = makeGraph(
        [makeNode('A'), makeNode('B')],
        [
          makeEdge('e1', 'A', 'B', 'derived_from'),
          makeEdge('e2', 'A', 'B', 'used_by'),
        ]
      );
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(true);
    });
  });

  describe('No Orphan Edges (built graph)', () => {
    it('built graph should always pass validation', () => {
      const strategy = createTestContext({
        id: 's1',
        kind: 'strategy',
        usedBy: ['c1'],
      });
      const content = createTestContext({
        id: 'c1',
        kind: 'content',
        derivedFrom: ['s1'],
      });
      const graph = buildContextGraph([strategy, content]);
      const result = validateContextGraph(graph);
      expect(result.valid).toBe(true);
      expect(result.orphanEdges).toHaveLength(0);
    });
  });
});
