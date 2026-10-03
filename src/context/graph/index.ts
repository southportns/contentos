/**
 * P0.6.6 — Context Graph Foundation
 *
 * Barrel exports for the Context Graph module.
 *
 * Architecture:
 *   ContextObject (source) → Provenance (evidence) → Graph (derived view)
 *
 * Usage:
 *   import { buildContextGraph, traverseContextGraph, type ContextGraph } from '@/context/graph';
 */

// ── Types ──

export type {
  ContextGraphEdgeType,
  ContextGraphEdgeSource,
  ContextGraphNode,
  ContextGraphEdge,
  ContextGraph,
  ContextGraphValidationResult,
  ContextGraphStats,
} from './context-graph-types';

export {
  CONTEXT_GRAPH_EDGE_TYPES,
  MAX_CONTEXT_GRAPH_DEPTH,
  DEFAULT_TRAVERSAL_DEPTH,
} from './context-graph-types';

export type { TraversalDirection } from './context-graph-query';

// ── Builder ──

export { buildContextGraph, isScopeCompatible, makeEdgeId } from './context-graph-builder';

// ── Validation ──

export { validateContextGraph, isValidEdgeType } from './context-graph-validation';

// ── Utilities ──

export {
  getNode,
  hasNode,
  getOutgoingEdges,
  getIncomingEdges,
  getAllEdges,
  getNeighbors,
  hasEdge,
  getOutgoingEdgesByType,
  getIncomingEdgesByType,
  getOutDegree,
  getInDegree,
  getDegree,
} from './context-graph-utils';

// ── Query / Traversal ──

export {
  getRelatedContexts,
  traverseContextGraph,
  findContextPaths,
  clampDepth,
} from './context-graph-query';

// ── Statistics ──

export { getContextGraphStats } from './context-graph-stats';

// ── Assembly Bridge ──

export {
  getGraphContext,
  getGraphContextCollection,
  contextGraphToContexts,
} from './context-graph-assembly-bridge';
