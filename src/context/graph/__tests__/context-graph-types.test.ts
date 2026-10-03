/**
 * P0.6.6 — Context Graph Types Tests
 *
 * Tests for type constants and type guards.
 */

import { describe, it, expect } from 'vitest';
import {
  CONTEXT_GRAPH_EDGE_TYPES,
  MAX_CONTEXT_GRAPH_DEPTH,
  DEFAULT_TRAVERSAL_DEPTH,
} from '../context-graph-types';

describe('P0.6.6 — Context Graph Types', () => {
  describe('CONTEXT_GRAPH_EDGE_TYPES', () => {
    it('should contain exactly 3 edge types', () => {
      expect(CONTEXT_GRAPH_EDGE_TYPES).toHaveLength(3);
    });

    it('should contain derived_from', () => {
      expect(CONTEXT_GRAPH_EDGE_TYPES).toContain('derived_from');
    });

    it('should contain used_by', () => {
      expect(CONTEXT_GRAPH_EDGE_TYPES).toContain('used_by');
    });

    it('should contain supersedes', () => {
      expect(CONTEXT_GRAPH_EDGE_TYPES).toContain('supersedes');
    });

    it('should NOT contain fuzzy relationship types', () => {
      expect(CONTEXT_GRAPH_EDGE_TYPES).not.toContain('similar_to');
      expect(CONTEXT_GRAPH_EDGE_TYPES).not.toContain('related_to');
      expect(CONTEXT_GRAPH_EDGE_TYPES).not.toContain('caused_by');
      expect(CONTEXT_GRAPH_EDGE_TYPES).not.toContain('influenced_by');
      expect(CONTEXT_GRAPH_EDGE_TYPES).not.toContain('supports');
      expect(CONTEXT_GRAPH_EDGE_TYPES).not.toContain('contradicts');
      expect(CONTEXT_GRAPH_EDGE_TYPES).not.toContain('about');
      expect(CONTEXT_GRAPH_EDGE_TYPES).not.toContain('depends_on');
    });

    // S1: Edge types contain exactly the 3 explicit types
    it('should contain only explicit provenance-derived types', () => {
      // P0.6.6: Only 3 edge types, all from explicit provenance fields
      expect(CONTEXT_GRAPH_EDGE_TYPES).toEqual(['derived_from', 'used_by', 'supersedes']);
    });
  });

  describe('Defaults', () => {
    it('MAX_CONTEXT_GRAPH_DEPTH should be 10', () => {
      expect(MAX_CONTEXT_GRAPH_DEPTH).toBe(10);
    });

    it('DEFAULT_TRAVERSAL_DEPTH should be 2', () => {
      expect(DEFAULT_TRAVERSAL_DEPTH).toBe(2);
    });
  });
});
