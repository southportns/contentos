/**
 * P0.6.6 — Context Graph Utilities
 *
 * Pure utility functions for querying and inspecting ContextGraphs.
 *
 * Architecture Position:
 *   These are the fundamental read-only operations on ContextGraphs.
 *   They provide indexed access patterns without mutating the graph.
 *
 * Design Principles:
 *   1. Pure functions — no side effects, no mutation
 *   2. O(1) or O(n) — efficient for typical graph sizes
 *   3. Null-safe — return undefined/[] for missing nodes
 */

import type {
  ContextGraph,
  ContextGraphNode,
  ContextGraphEdge,
  ContextGraphEdgeType,
} from './context-graph-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Node Lookup
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets a node by ID.
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The ID of the node to find
 * @returns The ContextGraphNode, or undefined if not found
 */
export function getNode(
  graph: ContextGraph,
  nodeId: string
): ContextGraphNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}

/**
 * Checks if a node exists in the graph.
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The ID to check
 * @returns true if a node with the given ID exists
 */
export function hasNode(graph: ContextGraph, nodeId: string): boolean {
  return graph.nodes.some((n) => n.id === nodeId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Edge Lookup
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets all outgoing edges from a node.
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The ID of the source node
 * @returns Array of edges where fromId === nodeId
 */
export function getOutgoingEdges(
  graph: ContextGraph,
  nodeId: string
): ContextGraphEdge[] {
  return graph.edges.filter((e) => e.fromId === nodeId);
}

/**
 * Gets all incoming edges to a node.
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The ID of the target node
 * @returns Array of edges where toId === nodeId
 */
export function getIncomingEdges(
  graph: ContextGraph,
  nodeId: string
): ContextGraphEdge[] {
  return graph.edges.filter((e) => e.toId === nodeId);
}

/**
 * Gets all edges connected to a node (both directions).
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The ID of the node
 * @returns Array of edges connected to the node
 */
export function getAllEdges(
  graph: ContextGraph,
  nodeId: string
): ContextGraphEdge[] {
  return graph.edges.filter((e) => e.fromId === nodeId || e.toId === nodeId);
}

/**
 * Gets all neighboring nodes of a given node.
 *
 * Returns unique nodes that are directly connected by any edge
 * (either incoming or outgoing).
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The ID of the node
 * @returns Array of neighboring ContextGraphNodes
 */
export function getNeighbors(
  graph: ContextGraph,
  nodeId: string
): ContextGraphNode[] {
  const neighborIds = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.fromId === nodeId && edge.toId !== nodeId) {
      neighborIds.add(edge.toId);
    }
    if (edge.toId === nodeId && edge.fromId !== nodeId) {
      neighborIds.add(edge.fromId);
    }
  }

  return graph.nodes.filter((n) => neighborIds.has(n.id));
}

/**
 * Checks if an edge exists between two nodes.
 *
 * @param graph - The ContextGraph to search
 * @param fromId - Source node ID
 * @param toId - Target node ID
 * @param type - Optional edge type filter
 * @returns true if a matching edge exists
 */
export function hasEdge(
  graph: ContextGraph,
  fromId: string,
  toId: string,
  type?: ContextGraphEdgeType
): boolean {
  return graph.edges.some(
    (e) =>
      e.fromId === fromId && e.toId === toId && (type === undefined || e.type === type)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Edge by Type
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets outgoing edges filtered by type.
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The source node ID
 * @param type - Edge type to filter by
 * @returns Array of matching ContextGraphEdges
 */
export function getOutgoingEdgesByType(
  graph: ContextGraph,
  nodeId: string,
  type: ContextGraphEdgeType
): ContextGraphEdge[] {
  return graph.edges.filter((e) => e.fromId === nodeId && e.type === type);
}

/**
 * Gets incoming edges filtered by type.
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The target node ID
 * @param type - Edge type to filter by
 * @returns Array of matching ContextGraphEdges
 */
export function getIncomingEdgesByType(
  graph: ContextGraph,
  nodeId: string,
  type: ContextGraphEdgeType
): ContextGraphEdge[] {
  return graph.edges.filter((e) => e.toId === nodeId && e.type === type);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Node Degree
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets the out-degree of a node (number of outgoing edges).
 */
export function getOutDegree(graph: ContextGraph, nodeId: string): number {
  return getOutgoingEdges(graph, nodeId).length;
}

/**
 * Gets the in-degree of a node (number of incoming edges).
 */
export function getInDegree(graph: ContextGraph, nodeId: string): number {
  return getIncomingEdges(graph, nodeId).length;
}

/**
 * Gets the total degree of a node (incoming + outgoing edges).
 */
export function getDegree(graph: ContextGraph, nodeId: string): number {
  return getAllEdges(graph, nodeId).length;
}
