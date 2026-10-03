/**
 * P0.6.6 — Context Graph Types
 *
 * Core type definitions for the Context Graph.
 *
 * Architecture Position:
 *   ContextGraph represents explicit relationships between ContextObjects
 *   derived from their provenance metadata. It is a derived, in-memory
 *   relationship structure — NOT a database, NOT a vector store, NOT an
 *   inference engine.
 *
 * Design Principles:
 *   1. Graph = relationship structure derived from explicit provenance
 *   2. Nodes reference ContextObjects (graph does NOT own them)
 *   3. Edges are deterministic and reproducible from same inputs
 *   4. No fuzzy/no inferred/no LLM-generated relationships
 *   5. No mutation of source ContextObjects
 *
 * Non-goals:
 *   - Not a graph database (no Neo4j, no Prisma model)
 *   - Not a knowledge graph (no concept/entity/fact reasoning)
 *   - Not an LLM inference engine
 *   - Not a replacement for ContextProvenance
 */

import type { ContextObject } from '../context-object';

// ═══════════════════════════════════════════════════════════════════════════════
// Edge Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Finite, explicit edge types for P0.6.6.
 *
 * Each edge type maps directly to a ContextProvenance field:
 * - derived_from → context.provenance.derivedFrom
 * - used_by     → context.provenance.usedBy
 * - supersedes  → context.provenance.supersedes
 *
 * Explicitly EXCLUDED (require explicit evidence, not graph-inferred):
 * - similar_to, related_to, caused_by, influenced_by
 * - supports, contradicts, about, depends_on
 */
export type ContextGraphEdgeType =
  | 'derived_from'
  | 'used_by'
  | 'supersedes';

/**
 * All valid edge types — for iteration and validation.
 */
export const CONTEXT_GRAPH_EDGE_TYPES: readonly ContextGraphEdgeType[] = [
  'derived_from',
  'used_by',
  'supersedes',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Edge Source
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Identifies where an edge's relationship evidence comes from.
 *
 * P0.6.6: All edges come from 'provenance' — the ContextProvenance
 * fields on ContextObjects. Future versions may add other sources.
 */
export type ContextGraphEdgeSource = 'provenance';

// ═══════════════════════════════════════════════════════════════════════════════
// Graph Node
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A node in the Context Graph.
 *
 * References a ContextObject by ID. The graph does NOT own the
 * ContextObject — it only holds a reference. This ensures:
 * 1. ContextObject remains the single source of truth
 * 2. Graph is a derived relationship view
 * 3. No data duplication
 */
export interface ContextGraphNode {
  /** Unique identifier (same as the referenced ContextObject.id) */
  id: string;

  /** The ContextObject this node represents */
  context: ContextObject;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Graph Edge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * An explicit, evidence-backed relationship between two ContextObjects.
 *
 * Edge direction convention: fromId → toId
 *
 * Specific semantics by type:
 * - derived_from: A → B means "B derived from A"
 * - used_by:     A → B means "B used A" (A was consumed by B)
 * - supersedes:  A → B means "B supersedes A"
 *
 * Edge IDs are deterministic: edge_${type}_${fromId}_${toId}
 * No UUIDs, no timestamps, no randomness.
 */
export interface ContextGraphEdge {
  /** Deterministic edge ID */
  id: string;

  /** Source node ID (relationship origin) */
  fromId: string;

  /** Target node ID (relationship destination) */
  toId: string;

  /** Type of relationship */
  type: ContextGraphEdgeType;

  /** Where this relationship evidence comes from */
  source: ContextGraphEdgeSource;

  /** When this edge was created in the graph (ISO 8601) */
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Graph
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The Context Graph — a derived relationship structure built from
 * ContextObjects and their provenance.
 *
 * Properties:
 * - Immutable (readonly nodes/edges arrays)
 * - Deterministic (same inputs → same graph)
 * - In-memory (no persistence, no database)
 * - Derived (all edges come from explicit provenance)
 */
export interface ContextGraph {
  /** All nodes in the graph, sorted by id ASC */
  readonly nodes: readonly ContextGraphNode[];

  /** All edges in the graph, sorted by type ASC, fromId ASC, toId ASC */
  readonly edges: readonly ContextGraphEdge[];

  /** Number of nodes */
  readonly nodeCount: number;

  /** Number of edges */
  readonly edgeCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of validating a ContextGraph for structural integrity.
 */
export interface ContextGraphValidationResult {
  /** True if graph passes all validation rules */
  valid: boolean;

  /** Edge IDs where fromId or toId references non-existent node */
  orphanEdges: string[];

  /** Detailed missing node references */
  missingNodeReferences: {
    sourceNodeId: string;
    targetNodeId: string;
    edgeType: ContextGraphEdgeType;
  }[];

  /** Edge IDs that appear more than once */
  duplicateEdges: string[];

  /** Node IDs that are empty or invalid */
  invalidNodes: string[];

  /** Human-readable error messages */
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Graph Statistics
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aggregate statistics about a ContextGraph.
 */
export interface ContextGraphStats {
  /** Total number of nodes */
  nodeCount: number;

  /** Total number of edges */
  edgeCount: number;

  /** Node count grouped by ContextKind */
  nodesByKind: Record<string, number>;

  /** Edge count grouped by edge type */
  edgesByType: Record<ContextGraphEdgeType, number>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Traversal Defaults
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum allowed traversal depth to prevent unbounded graph walks.
 * Any maxDepth > MAX_CONTEXT_GRAPH_DEPTH is clamped to this value.
 */
export const MAX_CONTEXT_GRAPH_DEPTH = 10;

/**
 * Default traversal depth when not specified.
 */
export const DEFAULT_TRAVERSAL_DEPTH = 2;
