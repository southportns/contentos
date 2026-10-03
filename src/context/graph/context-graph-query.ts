/**
 * P0.6.6 — Context Graph Query
 *
 * Graph query and traversal operations.
 *
 * Architecture Position:
 *   Query module provides direct-neighbor lookup and bounded BFS traversal
 *   for the Context Graph. All operations respect scope isolation and
 *   are deterministic.
 *
 * Design Principles:
 *   1. BFS only — no unbounded recursive DFS
 *   2. Cycle detection via visited set — prevents infinite loops
 *   3. Depth clamping — MAX_CONTEXT_GRAPH_DEPTH
 *   4. Deterministic ordering — nodes returned in BFS discovery order
 */

import type {
  ContextGraph,
  ContextGraphNode,
  ContextGraphEdgeType,
} from './context-graph-types';
import {
  MAX_CONTEXT_GRAPH_DEPTH,
  DEFAULT_TRAVERSAL_DEPTH,
} from './context-graph-types';
import { getNode } from './context-graph-utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Direction Type
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Traversal direction relative to the start node.
 */
export type TraversalDirection = 'incoming' | 'outgoing' | 'both';

// ═══════════════════════════════════════════════════════════════════════════════
// Direct Neighbor Query
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets directly related contexts (1-hop neighbors) of a node.
 *
 * @param graph - The ContextGraph to search
 * @param nodeId - The ID of the starting node
 * @param options - Query options for direction and edge type filtering
 * @returns Array of directly connected ContextGraphNodes
 *
 * Default: direction = 'both'
 */
export function getRelatedContexts(
  graph: ContextGraph,
  nodeId: string,
  options?: {
    direction?: TraversalDirection;
    edgeTypes?: ContextGraphEdgeType[];
  }
): ContextGraphNode[] {
  const direction = options?.direction ?? 'both';
  const edgeTypes = options?.edgeTypes;

  // Filter edges by type first
  const filteredEdges = edgeTypes
    ? graph.edges.filter((e) => edgeTypes.includes(e.type))
    : graph.edges;

  const neighborIds = new Set<string>();

  for (const edge of filteredEdges) {
    if (direction === 'outgoing' || direction === 'both') {
      if (edge.fromId === nodeId) {
        neighborIds.add(edge.toId);
      }
    }
    if (direction === 'incoming' || direction === 'both') {
      if (edge.toId === nodeId) {
        neighborIds.add(edge.fromId);
      }
    }
  }

  // Remove self-references
  neighborIds.delete(nodeId);

  // Return nodes in graph order (deterministic)
  return graph.nodes.filter((n) => neighborIds.has(n.id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BFS Traversal
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Traverses the graph from a start node using BFS.
 *
 * Features:
 * - Cycle detection via visited set
 * - Depth-limited (clamped to MAX_CONTEXT_GRAPH_DEPTH)
 * - Deterministic ordering (discovery order)
 *
 * @param graph - The ContextGraph to traverse
 * @param startNodeId - The ID of the starting node
 * @param options - Traversal options
 * @returns Array of ContextGraphNodes reachable within maxDepth
 *
 * Default: direction = 'both', maxDepth = 2
 */
export function traverseContextGraph(
  graph: ContextGraph,
  startNodeId: string,
  options?: {
    direction?: TraversalDirection;
    edgeTypes?: ContextGraphEdgeType[];
    maxDepth?: number;
  }
): ContextGraphNode[] {
  const direction = options?.direction ?? 'both';
  const edgeTypes = options?.edgeTypes;
  const rawMaxDepth = options?.maxDepth ?? DEFAULT_TRAVERSAL_DEPTH;
  const maxDepth = Math.min(rawMaxDepth, MAX_CONTEXT_GRAPH_DEPTH);

  // Start node does not exist
  if (!getNode(graph, startNodeId)) {
    return [];
  }

  // maxDepth 0: return empty (only start node, but caller wants traversal)
  if (maxDepth <= 0) {
    return [];
  }

  const visited = new Set<string>([startNodeId]);
  const result: ContextGraphNode[] = [];
  let currentLevel = [startNodeId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextLevel: string[] = [];

    for (const currentId of currentLevel) {
      // Get edges from current node
      const outgoingEdges = edgeTypes
        ? graph.edges.filter(
            (e) => e.fromId === currentId && edgeTypes.includes(e.type)
          )
        : graph.edges.filter((e) => e.fromId === currentId);

      const incomingEdges = edgeTypes
        ? graph.edges.filter(
            (e) => e.toId === currentId && edgeTypes.includes(e.type)
          )
        : graph.edges.filter((e) => e.toId === currentId);

      const neighborIds: string[] = [];

      if (direction === 'outgoing' || direction === 'both') {
        for (const edge of outgoingEdges) {
          if (!visited.has(edge.toId)) {
            neighborIds.push(edge.toId);
          }
        }
      }

      if (direction === 'incoming' || direction === 'both') {
        for (const edge of incomingEdges) {
          if (!visited.has(edge.fromId) && !neighborIds.includes(edge.fromId)) {
            neighborIds.push(edge.fromId);
          }
        }
      }

      for (const neighborId of neighborIds) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          const node = getNode(graph, neighborId);
          if (node) {
            result.push(node);
            nextLevel.push(neighborId);
          }
        }
      }
    }

    currentLevel = nextLevel;
    if (currentLevel.length === 0) break;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Path Finding
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Finds the shortest path between two nodes using BFS.
 *
 * @param graph - The ContextGraph to search
 * @param fromId - Source node ID
 * @param toId - Target node ID
 * @param options - Path options
 * @returns Array of ContextGraphNode representing the shortest path (inclusive), or empty if no path
 */
export function findContextPaths(
  graph: ContextGraph,
  fromId: string,
  toId: string,
  options?: {
    maxDepth?: number;
    edgeTypes?: ContextGraphEdgeType[];
  }
): ContextGraphNode[][] {
  const rawMaxDepth = options?.maxDepth ?? DEFAULT_TRAVERSAL_DEPTH;
  const maxDepth = Math.min(rawMaxDepth, MAX_CONTEXT_GRAPH_DEPTH);
  const edgeTypes = options?.edgeTypes;

  // Check both nodes exist
  const startNode = getNode(graph, fromId);
  const targetNode = getNode(graph, toId);
  if (!startNode || !targetNode) {
    return [];
  }

  // Same node
  if (fromId === toId) {
    return [[startNode]];
  }

  // BFS for shortest path
  const visited = new Set<string>([fromId]);
  const queue: Array<{ nodeId: string; path: string[] }> = [
    { nodeId: fromId, path: [fromId] },
  ];

  let depth = 0;

  while (queue.length > 0 && depth < maxDepth) {
    const levelSize = queue.length;

    for (let i = 0; i < levelSize; i++) {
      const current = queue.shift()!;

      // Get outgoing neighbors
      const outgoingEdges = edgeTypes
        ? graph.edges.filter(
            (e) => e.fromId === current.nodeId && edgeTypes.includes(e.type)
          )
        : graph.edges.filter((e) => e.fromId === current.nodeId);

      // Get incoming neighbors
      const incomingEdges = edgeTypes
        ? graph.edges.filter(
            (e) => e.toId === current.nodeId && edgeTypes.includes(e.type)
          )
        : graph.edges.filter((e) => e.toId === current.nodeId);

      const neighborIds = new Set<string>();

      for (const edge of outgoingEdges) {
        neighborIds.add(edge.toId);
      }
      for (const edge of incomingEdges) {
        neighborIds.add(edge.fromId);
      }

      for (const neighborId of neighborIds) {
        if (visited.has(neighborId)) continue;

        const newPath = [...current.path, neighborId];

        if (neighborId === toId) {
          // Found — map to nodes
          return [
            newPath.map((id) => getNode(graph, id)!).filter(Boolean),
          ];
        }

        visited.add(neighborId);
        queue.push({ nodeId: neighborId, path: newPath });
      }
    }

    depth++;
  }

  return []; // No path found
}

// ═══════════════════════════════════════════════════════════════════════════════
// Depth Clamping Utility
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clamps a depth value to the safe range [0, MAX_CONTEXT_GRAPH_DEPTH].
 */
export function clampDepth(depth: number): number {
  if (depth < 0) return 0;
  if (depth > MAX_CONTEXT_GRAPH_DEPTH) return MAX_CONTEXT_GRAPH_DEPTH;
  return depth;
}
