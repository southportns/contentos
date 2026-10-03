/**
 * P0.6.6 — Context Graph Validation
 *
 * Validates structural integrity of a ContextGraph.
 *
 * Architecture Position:
 *   Validation ensures graphs meet the P0.6.6 contract:
 *   - Unique node IDs
 *   - Valid edges (existent endpoints, no self-loops, valid types)
 *   - No duplicate edges
 *   - No orphan edges
 *
 * Design Principles:
 *   1. Pure function — no mutation of input graph
 *   2. Comprehensive — checks all critical structural properties
 *   3. Deterministic — same graph → same validation result
 */

import type {
  ContextGraph,
  ContextGraphEdgeType,
  ContextGraphValidationResult,
} from './context-graph-types';
import { CONTEXT_GRAPH_EDGE_TYPES } from './context-graph-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validates a ContextGraph for structural integrity.
 *
 * Validation rules:
 * - V1: All node IDs non-empty
 * - V2: All node IDs unique
 * - V3: All edge IDs unique
 * - V4: All edge.fromId references existing node
 * - V5: All edge.toId references existing node
 * - V6: All edge types are valid ContextGraphEdgeType
 * - V7: No self-loops (fromId !== toId)
 * - V8: No duplicate (type, fromId, toId) tuples
 *
 * @param graph - The ContextGraph to validate
 * @returns Validation result with detailed diagnostics
 */
export function validateContextGraph(
  graph: ContextGraph
): ContextGraphValidationResult {
  const errors: string[] = [];
  const invalidNodes: string[] = [];
  const orphanEdges: string[] = [];
  const missingNodeReferences: ContextGraphValidationResult['missingNodeReferences'] =
    [];
  const duplicateEdges: string[] = [];

  // ── Build node ID set ──
  const nodeIds = new Set<string>();
  const seenNodeIds = new Set<string>();

  for (const node of graph.nodes) {
    // V1: Non-empty node ID
    if (!node.id || node.id.trim() === '') {
      invalidNodes.push(node.id || '(empty)');
      errors.push(`Node has empty or invalid ID: "${node.id}"`);
      continue;
    }

    // V2: Unique node IDs
    if (seenNodeIds.has(node.id)) {
      invalidNodes.push(node.id);
      errors.push(`Duplicate node ID: "${node.id}"`);
    }
    seenNodeIds.add(node.id);
    nodeIds.add(node.id);
  }

  // ── Validate edges ──
  const seenEdgeIds = new Set<string>();
  const seenEdgeTriples = new Map<string, string>(); // triple → edgeId

  for (const edge of graph.edges) {
    // V3: Unique edge IDs
    if (seenEdgeIds.has(edge.id)) {
      duplicateEdges.push(edge.id);
      errors.push(`Duplicate edge ID: "${edge.id}"`);
    }
    seenEdgeIds.add(edge.id);

    // V4: fromId must reference existing node
    if (!nodeIds.has(edge.fromId)) {
      orphanEdges.push(edge.id);
      missingNodeReferences.push({
        sourceNodeId: edge.fromId,
        targetNodeId: edge.toId,
        edgeType: edge.type,
      });
      errors.push(
        `Edge "${edge.id}" has fromId "${edge.fromId}" which does not reference any node`
      );
    }

    // V5: toId must reference existing node
    if (!nodeIds.has(edge.toId)) {
      if (!orphanEdges.includes(edge.id)) {
        orphanEdges.push(edge.id);
      }
      if (
        !missingNodeReferences.find(
          (r) => r.sourceNodeId === edge.fromId && r.targetNodeId === edge.toId
        )
      ) {
        missingNodeReferences.push({
          sourceNodeId: edge.fromId,
          targetNodeId: edge.toId,
          edgeType: edge.type,
        });
      }
      errors.push(
        `Edge "${edge.id}" has toId "${edge.toId}" which does not reference any node`
      );
    }

    // V6: Valid edge type
    if (!isValidEdgeType(edge.type)) {
      errors.push(
        `Edge "${edge.id}" has invalid type: "${edge.type}"`
      );
    }

    // V7: No self-loops
    if (edge.fromId === edge.toId) {
      errors.push(
        `Edge "${edge.id}" is a self-loop: fromId === toId === "${edge.fromId}"`
      );
    }

    // V8: No duplicate (type, fromId, toId)
    const triple = `${edge.type}:${edge.fromId}:${edge.toId}`;
    if (seenEdgeTriples.has(triple)) {
      if (!duplicateEdges.includes(edge.id)) {
        duplicateEdges.push(edge.id);
      }
      errors.push(
        `Duplicate edge (type="${edge.type}", fromId="${edge.fromId}", toId="${edge.toId}") — first seen as "${seenEdgeTriples.get(
          triple
        )}"`
      );
    } else {
      seenEdgeTriples.set(triple, edge.id);
    }
  }

  const valid =
    errors.length === 0 &&
    invalidNodes.length === 0 &&
    orphanEdges.length === 0 &&
    duplicateEdges.length === 0 &&
    missingNodeReferences.length === 0;

  return {
    valid,
    orphanEdges,
    missingNodeReferences,
    duplicateEdges,
    invalidNodes,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Type Guards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if a value is a valid ContextGraphEdgeType.
 */
export function isValidEdgeType(value: unknown): value is ContextGraphEdgeType {
  return (
    typeof value === 'string' &&
    (CONTEXT_GRAPH_EDGE_TYPES as readonly string[]).includes(value)
  );
}
