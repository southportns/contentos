/**
 * P0.6.6 — Context Graph Statistics
 *
 * Aggregate statistics for a ContextGraph.
 *
 * Architecture Position:
 *   Stats provide observability into the graph structure:
 *   - Node/edge counts
 *   - Distribution by kind/type
 *
 * Design Principles:
 *   1. Pure function — no mutation
 *   2. O(n) — single pass over nodes and edges
 *   3. Complete — all kinds/types represented in output
 */

import type {
  ContextGraph,
  ContextGraphStats,
  ContextGraphEdgeType,
} from './context-graph-types';

/**
 * Computes aggregate statistics for a ContextGraph.
 *
 * @param graph - The ContextGraph to analyze
 * @returns ContextGraphStats with counts by kind and type
 */
export function getContextGraphStats(graph: ContextGraph): ContextGraphStats {
  // Count nodes by kind
  const nodesByKind: Record<string, number> = {};
  for (const node of graph.nodes) {
    const kind = node.context.kind;
    nodesByKind[kind] = (nodesByKind[kind] ?? 0) + 1;
  }

  // Count edges by type
  const edgesByType: Record<ContextGraphEdgeType, number> = {
    derived_from: 0,
    used_by: 0,
    supersedes: 0,
  };
  for (const edge of graph.edges) {
    edgesByType[edge.type]++;
  }

  return {
    nodeCount: graph.nodeCount,
    edgeCount: graph.edgeCount,
    nodesByKind,
    edgesByType,
  };
}
