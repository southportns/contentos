/**
 * P0.6.6 - Context Graph Integration Tests
 */

import { describe, it, expect } from 'vitest';
import { buildContextGraph } from '../context-graph-builder';
import { validateContextGraph } from '../context-graph-validation';
import { traverseContextGraph, findContextPaths } from '../context-graph-query';
import { getContextGraphStats } from '../context-graph-stats';
import { getGraphContext, getGraphContextCollection, contextGraphToContexts } from '../context-graph-assembly-bridge';
import { ContextCollectionBuilder } from '../../context-collection';
import { createTestContext } from './test-helpers';

describe('P0.6.6 - Context Graph Integration', () => {
  describe('I1: Strategy - Decision graph', () => {
    it('should build strategy -> decision edge from explicit provenance', () => {
      const strategy = createTestContext({
        id: 'strategy_1',
        kind: 'strategy',
        usedBy: ['decision_1'],
      });
      const decision = createTestContext({
        id: 'decision_1',
        kind: 'decision',
        derivedFrom: ['strategy_1'],
      });

      const graph = buildContextGraph([strategy, decision]);

      expect(graph.nodeCount).toBe(2);
      expect(graph.edgeCount).toBeGreaterThanOrEqual(1);

      // strategy usedBy decision -> edge(strategy -> decision, used_by)
      const usedByEdge = graph.edges.find(e => e.type === 'used_by');
      expect(usedByEdge).toBeDefined();
      expect(usedByEdge!.fromId).toBe('strategy_1');
      expect(usedByEdge!.toId).toBe('decision_1');

      // decision derivedFrom strategy -> edge(strategy -> decision, derived_from)
      const derivedFromEdge = graph.edges.find(e => e.type === 'derived_from');
      expect(derivedFromEdge).toBeDefined();
    });

    it('should NOT create strategy -> decision edge without explicit provenance', () => {
      const strategy = createTestContext({
        id: 'strategy_2',
        kind: 'strategy',
      });
      const decision = createTestContext({
        id: 'decision_2',
        kind: 'decision',
      });

      const graph = buildContextGraph([strategy, decision]);

      // No explicit provenance relationship -> 0 edges
      expect(graph.edgeCount).toBe(0);
    });
  });

  describe('I2: Decision - Outcome - Feedback chain', () => {
    it('should build graph when provenance relationships exist', () => {
      const decision = createTestContext({
        id: 'dec_1',
        kind: 'decision',
        usedBy: ['out_1'],
      });
      const outcome = createTestContext({
        id: 'out_1',
        kind: 'outcome',
        derivedFrom: ['dec_1'],
      });

      const graph = buildContextGraph([decision, outcome]);

      expect(graph.nodeCount).toBe(2);
      expect(graph.edgeCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('I3: Outcome - Feedback', () => {
    it('should NOT create edge from feedback.outcomeIds (not provenance)', () => {
      const outcome = createTestContext({
        id: 'out_2',
        kind: 'outcome',
      });
      const feedback = createTestContext({
        id: 'fb_1',
        kind: 'memory',
        type: 'decision_feedback',
        // outcomeIds is NOT a provenance field in P0.6.6
      });

      const graph = buildContextGraph([outcome, feedback]);
      expect(graph.edgeCount).toBe(0);
    });
  });

  describe('I4: Draft version lineage (v1 -> v2 -> v3)', () => {
    it('should build version chain from derivedFrom', () => {
      const v1 = createTestContext({
        id: 'draft_v1',
        kind: 'content',
        type: 'draft',
      });
      const v2 = createTestContext({
        id: 'draft_v2',
        kind: 'content',
        type: 'draft',
        derivedFrom: ['draft_v1'],
      });
      const v3 = createTestContext({
        id: 'draft_v3',
        kind: 'content',
        type: 'draft',
        derivedFrom: ['draft_v2'],
      });

      const graph = buildContextGraph([v1, v2, v3]);

      expect(graph.nodeCount).toBe(3);
      expect(graph.edgeCount).toBe(2);

      const result = validateContextGraph(graph);
      expect(result.valid).toBe(true);

      // Traverse from v1
      const reachable = traverseContextGraph(graph, 'draft_v1', { maxDepth: 5, direction: 'outgoing' });
      const ids = reachable.map(n => n.id).sort();
      expect(ids).toEqual(['draft_v2', 'draft_v3']);

      // Path from v1 to v3
      const paths = findContextPaths(graph, 'draft_v1', 'draft_v3');
      expect(paths.length).toBe(1);
      expect(paths[0].map(n => n.id)).toEqual(['draft_v1', 'draft_v2', 'draft_v3']);
    });
  });

  describe('I5: Evaluation -> Draft lineage', () => {
    it('should build edge when evaluation context references draft', () => {
      const draft = createTestContext({
        id: 'draft_eval_1',
        kind: 'content',
        type: 'draft',
      });
      const evaluation = createTestContext({
        id: 'eval_1',
        kind: 'evaluation',
        usedBy: ['draft_eval_1'],
      });

      const graph = buildContextGraph([draft, evaluation]);
      expect(graph.edgeCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('I6: Multi-kind graph', () => {
    it('should handle mixed kinds correctly', () => {
      const knowledge = createTestContext({
        id: 'ku_1',
        kind: 'knowledge',
        usedBy: ['strategy_3'],
      });
      const strategy = createTestContext({
        id: 'strategy_3',
        kind: 'strategy',
        derivedFrom: ['ku_1'],
        usedBy: ['content_3'],
      });
      const content = createTestContext({
        id: 'content_3',
        kind: 'content',
        derivedFrom: ['strategy_3'],
      });

      const graph = buildContextGraph([knowledge, strategy, content]);

      expect(graph.nodeCount).toBe(3);
      expect(graph.edgeCount).toBeGreaterThanOrEqual(3);

      const result = validateContextGraph(graph);
      expect(result.valid).toBe(true);

      const stats = getContextGraphStats(graph);
      expect(stats.nodesByKind['knowledge']).toBe(1);
      expect(stats.nodesByKind['strategy']).toBe(1);
      expect(stats.nodesByKind['content']).toBe(1);
    });
  });

  describe('I7: Cross-project isolation', () => {
    it('should NOT connect contexts across projects', () => {
      const ctxA = createTestContext({
        id: 'ctx_a_proj1',
        kind: 'strategy',
        projectId: 'proj_a',
        usedBy: ['ctx_b_proj2'],
      });
      const ctxB = createTestContext({
        id: 'ctx_b_proj2',
        kind: 'content',
        projectId: 'proj_b',
        derivedFrom: ['ctx_a_proj1'],
      });

      const graph = buildContextGraph([ctxA, ctxB]);

      expect(graph.nodeCount).toBe(2);
      expect(graph.edgeCount).toBe(0);
    });
  });

  describe('I8: Context Graph -> ContextCollection', () => {
    it('should bridge graph to ContextCollection via assembly bridge', () => {
      const a = createTestContext({ id: 'ga', kind: 'strategy' });
      const b = createTestContext({ id: 'gb', kind: 'decision', derivedFrom: ['ga'] });
      const c = createTestContext({ id: 'gc', kind: 'content', derivedFrom: ['gb'] });

      const graph = buildContextGraph([a, b, c]);

      // getGraphContextCollection
      const collection = getGraphContextCollection(graph, 'ga', { maxDepth: 3 });
      expect(collection.size).toBe(2);
    });

    it('contextGraphToContexts should return only connected ContextObjects', () => {
      const a = createTestContext({ id: 'xca', kind: 'strategy' });
      const b = createTestContext({ id: 'xcb', kind: 'decision', derivedFrom: ['xca'] });
      const isolated = createTestContext({ id: 'isolated_ctx', kind: 'evaluation' });

      const graph = buildContextGraph([a, b, isolated]);
      const contexts = contextGraphToContexts(graph);

      // Only A and B are connected; isolated should be excluded
      expect(contexts).toHaveLength(2);
      const ids = contexts.map(c => c.id).sort();
      expect(ids).toEqual(['xca', 'xcb']);
    });
  });

  describe('I9: Context Graph -> Context Assembly (no bypass)', () => {
    it('getGraphContext returns ContextObjects compatible with collection pipeline', () => {
      const a = createTestContext({ id: 'sa', kind: 'strategy' });
      const b = createTestContext({ id: 'sb', kind: 'decision', derivedFrom: ['sa'] });

      const graph = buildContextGraph([a, b]);
      const contexts = getGraphContext(graph, 'sa', { maxDepth: 2 });

      // Feed into existing pipeline
      const collection = new ContextCollectionBuilder().addMany(contexts).build();
      expect(collection.size).toBe(1);
      expect(collection.contexts[0].id).toBe('sb');
    });
  });

  describe('I10: No Mutation of Original ContextObject', () => {
    it('should not modify input ContextObjects during graph building', () => {
      const original = createTestContext({
        id: 'mut_test',
        kind: 'strategy',
        derivedFrom: ['parent_1'],
      });

      // Deep clone for comparison
      const before = JSON.parse(JSON.stringify(original));

      buildContextGraph([original]);

      // Verify original is unchanged
      expect(original.id).toBe(before.id);
      expect(original.provenance.derivedFrom).toEqual(before.provenance.derivedFrom);
      expect(original.provenance.usedBy).toEqual(before.provenance.usedBy);
      expect(original.provenance.supersedes).toEqual(before.provenance.supersedes);
      expect(original.kind).toBe(before.kind);
      expect(original.type).toBe(before.type);
    });

    it('should not mutate provenance arrays', () => {
      const a = createTestContext({ id: 'arr_a', kind: 'strategy' });
      const b = createTestContext({
        id: 'arr_b',
        kind: 'content',
        derivedFrom: ['arr_a'],
        usedBy: ['arr_c'],
      });
      const c = createTestContext({ id: 'arr_c', kind: 'evaluation' });

      const beforeDerivedFrom = [...(b.provenance.derivedFrom ?? [])];
      const beforeUsedBy = [...(b.provenance.usedBy ?? [])];

      buildContextGraph([a, b, c]);

      expect(b.provenance.derivedFrom).toEqual(beforeDerivedFrom);
      expect(b.provenance.usedBy).toEqual(beforeUsedBy);
    });
  });

  describe('Graph Statistics', () => {
    it('should compute correct stats for a multi-node graph', () => {
      const a = createTestContext({ id: 'stat_a', kind: 'strategy' });
      const b = createTestContext({ id: 'stat_b', kind: 'decision', derivedFrom: ['stat_a'] });
      const c = createTestContext({ id: 'stat_c', kind: 'content', derivedFrom: ['stat_b'] });

      const graph = buildContextGraph([a, b, c]);
      const stats = getContextGraphStats(graph);

      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(2);
      expect(stats.nodesByKind['strategy']).toBe(1);
      expect(stats.nodesByKind['decision']).toBe(1);
      expect(stats.nodesByKind['content']).toBe(1);
      expect(stats.edgesByType['derived_from']).toBe(2);
      expect(stats.edgesByType['used_by']).toBe(0);
      expect(stats.edgesByType['supersedes']).toBe(0);
    });

    it('should handle empty graph stats', () => {
      const graph = buildContextGraph([]);
      const stats = getContextGraphStats(graph);

      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.edgesByType['derived_from']).toBe(0);
      expect(stats.edgesByType['used_by']).toBe(0);
      expect(stats.edgesByType['supersedes']).toBe(0);
    });
  });

  describe('Complete graph pipeline validation', () => {
    it('built graph should always pass full validation', () => {
      const strategy = createTestContext({
        id: 'full_s',
        kind: 'strategy',
        usedBy: ['full_d', 'full_c'],
      });
      const decision = createTestContext({
        id: 'full_d',
        kind: 'decision',
        derivedFrom: ['full_s'],
        usedBy: ['full_o'],
      });
      const content = createTestContext({
        id: 'full_c',
        kind: 'content',
        derivedFrom: ['full_s'],
      });
      const outcome = createTestContext({
        id: 'full_o',
        kind: 'outcome',
        derivedFrom: ['full_d'],
      });

      const graph = buildContextGraph([strategy, decision, content, outcome]);
      const result = validateContextGraph(graph);

      expect(result.valid).toBe(true);
      expect(result.orphanEdges).toHaveLength(0);
      expect(result.duplicateEdges).toHaveLength(0);
      expect(result.invalidNodes).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
