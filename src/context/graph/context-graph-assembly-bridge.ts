/**
 * P0.6.6 — Context Graph → Context Assembly Bridge
 *
 * Bridges Context Graph traversal results to the existing Context Assembly pipeline.
 *
 * Architecture Position:
 *   Graph traversal produces ContextObjects. These are then fed into
 *   the existing ContextCollection → Context Assembly pipeline for
 *   ranking, deduplication, budgeting, and serialization.
 *
 * Design Principles:
 *   1. Graph does NOT bypass Context Assembly
 *   2. All context retrieval goes through the existing pipeline
 *   3. Graph is only the retrieval mechanism — not the packaging mechanism
 */

import type { ContextObject } from '../context-object';
import type {
  ContextGraph,
  ContextGraphEdgeType,
} from './context-graph-types';
import {
  DEFAULT_TRAVERSAL_DEPTH,
  MAX_CONTEXT_GRAPH_DEPTH,
} from './context-graph-types';
import { traverseContextGraph } from './context-graph-query';
import { createContextCollection } from '../context-collection';

/**
 * Retrieves ContextObjects from graph traversal, suitable for
 * feeding into the existing Context Assembly pipeline.
 *
 * Flow:
 *   Graph traversal → ContextObjects → ContextCollection → (Assembly)
 *
 * @param graph - The ContextGraph to traverse
 * @param nodeId - The starting node ID
 * @param options - Options for traversal
 * @returns Array of ContextObjects (excluding the start node)
 *
 * Note:
 *   This does NOT modify the Writing Prompt. The returned ContextObjects
 *   should be fed into the existing Context Assembly pipeline.
 */
export function getGraphContext(
  graph: ContextGraph,
  nodeId: string,
  options?: {
    maxDepth?: number;
    edgeTypes?: ContextGraphEdgeType[];
    direction?: 'incoming' | 'outgoing' | 'both';
  }
): ContextObject[] {
  const maxDepth = options?.maxDepth ?? DEFAULT_TRAVERSAL_DEPTH;
  const clampedDepth = Math.min(maxDepth, MAX_CONTEXT_GRAPH_DEPTH);
  const edgeTypes = options?.edgeTypes;
  const direction = options?.direction ?? 'both';

  const nodes = traverseContextGraph(graph, nodeId, {
    maxDepth: clampedDepth,
    edgeTypes,
    direction,
  });

  return nodes.map((n) => n.context);
}

/**
 * Retrieves graph context and wraps it in a ContextCollection
 * for direct integration with the Context Assembly pipeline.
 *
 * @param graph - The ContextGraph to traverse
 * @param nodeId - The starting node ID
 * @param options - Options for traversal
 * @returns ContextCollection containing traversed ContextObjects
 */
export function getGraphContextCollection(
  graph: ContextGraph,
  nodeId: string,
  options?: {
    maxDepth?: number;
    edgeTypes?: ContextGraphEdgeType[];
    direction?: 'incoming' | 'outgoing' | 'both';
  }
): ReturnType<typeof createContextCollection> {
  const contexts = getGraphContext(graph, nodeId, options);
  return createContextCollection(contexts);
}

/**
 * Converts a ContextGraph to a flat array of all unique ContextObjects
 * that participate in any edge relationship.
 *
 * Useful for getting the "connected subset" of the graph.
 *
 * @param graph - The ContextGraph
 * @returns Array of ContextObjects that are endpoints of at least one edge
 */
export function contextGraphToContexts(graph: ContextGraph): ContextObject[] {
  const contextIds = new Set<string>();
  for (const edge of graph.edges) {
    contextIds.add(edge.fromId);
    contextIds.add(edge.toId);
  }

  return graph.nodes
    .filter((n) => contextIds.has(n.id))
    .map((n) => n.context);
}
