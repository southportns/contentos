/**
 * P0.6.6 — Context Graph Builder
 *
 * Builds a ContextGraph from an array of ContextObjects.
 *
 * Architecture Position:
 *   Builder reads ContextProvenance fields and creates explicit edges.
 *   It is the ONLY component that creates edges — ensuring all edges
 *   are derived from explicit evidence.
 *
 * Design Principles:
 *   1. Deterministic: same inputs → same graph (regardless of input order)
 *   2. No mutation: ContextObjects are never modified
 *   3. No dangling edges: targets must exist in the graph
 *   4. Scope isolation: owner/project/topic boundaries enforced
 *   5. Deduplication: duplicate (type, fromId, toId) collapsed to single edge
 *
 * Process:
 *   ContextObjects → Create Nodes → Index IDs → Read Provenance →
 *   Create Edges → Validate Scope → Deduplicate → Sort → ContextGraph
 */

import type { ContextObject } from '../context-object';
import type {
  ContextGraph,
  ContextGraphNode,
  ContextGraphEdge,
  ContextGraphEdgeType,
} from './context-graph-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds a ContextGraph from an array of ContextObjects.
 *
 * The graph is entirely derived from explicit ContextProvenance fields:
 * - derivedFrom → derived_from edges
 * - usedBy → used_by edges
 * - supersedes → supersedes edges
 *
 * Edges are only created when:
 * 1. The target node exists in the graph
 * 2. Owner isolation is satisfied (same ownerId)
 * 3. Scope isolation is compatible (project/topic boundaries)
 *
 * @param contexts - Array of ContextObjects to build the graph from
 * @returns A deterministic, immutable ContextGraph
 */
export function buildContextGraph(
  contexts: readonly ContextObject[]
): ContextGraph {
  // Step 1: Create nodes (deduplicate by ID — last one wins for same ID)
  const nodeMap = new Map<string, ContextGraphNode>();
  for (const ctx of contexts) {
    if (!ctx.id) continue; // Skip invalid nodes
    nodeMap.set(ctx.id, { id: ctx.id, context: ctx });
  }

  // Step 2: Build node ID set for existence checks
  const nodeIds = new Set(nodeMap.keys());

  // Step 3: Read provenance and create edges
  const edgeMap = new Map<string, ContextGraphEdge>();

  for (const [, node] of nodeMap) {
    const ctx = node.context;
    const provenance = ctx.provenance;

    // ── derived_from edges ──
    // provenance.derivedFrom = ['A', 'B'] → A → ctx.id, B → ctx.id
    if (provenance.derivedFrom) {
      for (const sourceId of provenance.derivedFrom) {
        if (
          nodeIds.has(sourceId) &&
          isScopeCompatible(nodeMap.get(sourceId)!.context, ctx)
        ) {
          const edge: ContextGraphEdge = {
            id: makeEdgeId('derived_from', sourceId, ctx.id),
            fromId: sourceId,
            toId: ctx.id,
            type: 'derived_from',
            source: 'provenance',
            createdAt: ctx.updatedAt,
          };
          edgeMap.set(edge.id, edge);
        }
      }
    }

    // ── used_by edges ──
    // provenance.usedBy = ['C', 'D'] → ctx.id → C, ctx.id → D
    if (provenance.usedBy) {
      for (const targetId of provenance.usedBy) {
        if (
          nodeIds.has(targetId) &&
          isScopeCompatible(ctx, nodeMap.get(targetId)!.context)
        ) {
          const edge: ContextGraphEdge = {
            id: makeEdgeId('used_by', ctx.id, targetId),
            fromId: ctx.id,
            toId: targetId,
            type: 'used_by',
            source: 'provenance',
            createdAt: ctx.updatedAt,
          };
          edgeMap.set(edge.id, edge);
        }
      }
    }

    // ── supersedes edges ──
    // provenance.supersedes = 'A' → A → ctx.id (A is superseded by ctx)
    if (provenance.supersedes) {
      const targetId = provenance.supersedes;
      if (
        nodeIds.has(targetId) &&
        isScopeCompatible(nodeMap.get(targetId)!.context, ctx)
      ) {
        const edge: ContextGraphEdge = {
          id: makeEdgeId('supersedes', targetId, ctx.id),
          fromId: targetId,
          toId: ctx.id,
          type: 'supersedes',
          source: 'provenance',
          createdAt: ctx.updatedAt,
        };
        edgeMap.set(edge.id, edge);
      }
    }
  }

  // Step 4: Sort nodes by id ASC
  const nodes = [...nodeMap.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );

  // Step 5: Sort edges by type ASC, fromId ASC, toId ASC
  const edges = [...edgeMap.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    if (a.fromId !== b.fromId) return a.fromId < b.fromId ? -1 : 1;
    return a.toId < b.toId ? -1 : a.toId > b.toId ? 1 : 0;
  });

  return {
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scope Compatibility Check
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if two ContextObjects are scope-compatible for edge creation.
 *
 * Rules:
 * 1. Owner isolation: If both have ownerId, must match
 * 2. Project isolation: If both have projectId, must match
 * 3. Topic isolation: If both have topicId, must match
 * 4. Unknown scope: isolated by default
 * 5. Global scope: can connect with compatible project/topic scopes
 *
 * @param source - Source ContextObject
 * @param target - Target ContextObject
 * @returns true if edge may be created between them
 */
export function isScopeCompatible(
  source: ContextObject,
  target: ContextObject
): boolean {
  const sProv = source.provenance;
  const tProv = target.provenance;

  // Rule 1: Owner isolation
  if (sProv.ownerId && tProv.ownerId && sProv.ownerId !== tProv.ownerId) {
    return false;
  }

  // Rule 2: Project isolation (if both have projectId, must match)
  if (sProv.projectId && tProv.projectId && sProv.projectId !== tProv.projectId) {
    return false;
  }

  // Rule 3: Topic isolation (if both have topicId, must match)
  if (sProv.topicId && tProv.topicId && sProv.topicId !== tProv.topicId) {
    return false;
  }

  // Rule 4: Unknown scope handling
  // If either context has scope='unknown', check for shared lineage
  if (sProv.scope === 'unknown' || tProv.scope === 'unknown') {
    // Unknown scope is isolated unless they share the same lineage context
    const sameOwner = sProv.ownerId && sProv.ownerId === tProv.ownerId;
    const sameProject = sProv.projectId && sProv.projectId === tProv.projectId;
    const sameTopic = sProv.topicId && sProv.topicId === tProv.topicId;

    // If neither shares any common context, deny
    if (!sameOwner && !sameProject && !sameTopic) {
      return false;
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deterministic Edge ID
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a deterministic edge ID.
 *
 * Format: edge_${type}_${fromId}_${toId}
 *
 * This ensures:
 * - Same (type, fromId, toId) → same ID
 * - Different (type, fromId, toId) → different ID
 * - No randomness, no timestamps, no UUIDs
 */
export function makeEdgeId(
  type: ContextGraphEdgeType,
  fromId: string,
  toId: string
): string {
  return `edge_${type}_${fromId}_${toId}`;
}
