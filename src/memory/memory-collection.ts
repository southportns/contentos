/**
 * P0.6.3.1 — Memory Collection
 *
 * Immutable-style collection of MemoryRecords with filter/sort operations.
 *
 * Architecture Position:
 *   Collection is an in-memory container for MemoryRecords.
 *   Retriever returns a Collection. Adapters can bulk-add to a Collection.
 *
 * Design Principles:
 *   1. Deterministic — same input always produces same output
 *   2. Immutable-style — operations return NEW arrays, never mutate originals
 *   3. MemoryRecords themselves are NEVER modified by collection operations
 */

import type { MemoryKind } from './memory-kind';
import type { MemoryScope } from './memory-scope';
import type { MemoryRecord, MemoryStatus } from './memory-record';

/**
 * Immutable memory collection.
 */
export interface MemoryCollection {
  /** All memories in this collection */
  readonly memories: readonly MemoryRecord[];
  /** Number of memories */
  readonly size: number;
  /** Whether collection is empty */
  readonly isEmpty: boolean;
}

/**
 * Builder for constructing MemoryCollections.
 */
export class MemoryCollectionBuilder {
  private _memories: MemoryRecord[] = [];

  add(memory: MemoryRecord): this {
    this._memories.push(memory);
    return this;
  }

  addMany(memories: MemoryRecord[]): this {
    this._memories.push(...memories);
    return this;
  }

  build(): MemoryCollection {
    return {
      memories: [...this._memories],
      size: this._memories.length,
      isEmpty: this._memories.length === 0,
    };
  }
}

/**
 * Create a MemoryCollection from an array of MemoryRecords.
 */
export function createMemoryCollection(memories: MemoryRecord[]): MemoryCollection {
  return new MemoryCollectionBuilder().addMany(memories).build();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Filter Operations (all return NEW arrays, never mutate originals)
// ═══════════════════════════════════════════════

/**
 * Filter memories by kind.
 */
export function filterByKind(
  collection: MemoryCollection,
  kind: MemoryKind
): MemoryRecord[] {
  return collection.memories.filter((m) => m.kind === kind);
}

/**
 * Filter memories by scope.
 */
export function filterByScope(
  collection: MemoryCollection,
  scope: MemoryScope
): MemoryRecord[] {
  return collection.memories.filter((m) => m.scope === scope);
}

/**
 * Filter memories by project ID.
 */
export function filterByProject(
  collection: MemoryCollection,
  projectId: string
): MemoryRecord[] {
  return collection.memories.filter((m) => m.projectId === projectId);
}

/**
 * Filter memories by topic ID.
 */
export function filterByTopic(
  collection: MemoryCollection,
  topicId: string
): MemoryRecord[] {
  return collection.memories.filter((m) => m.topicId === topicId);
}

/**
 * Filter memories by status.
 */
export function filterByStatus(
  collection: MemoryCollection,
  status: MemoryStatus
): MemoryRecord[] {
  return collection.memories.filter((m) => m.status === status);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sort Operations (all return NEW arrays, never mutate originals)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sort memories by importance (highest first).
 */
export function sortByImportance(collection: MemoryCollection): MemoryRecord[] {
  return [...collection.memories].sort((a, b) => b.importance - a.importance);
}

/**
 * Sort memories by recency (most recently updated first).
 */
export function sortByRecency(collection: MemoryCollection): MemoryRecord[] {
  return [...collection.memories].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Sort memories by confidence (highest first).
 */
export function sortByConfidence(collection: MemoryCollection): MemoryRecord[] {
  return [...collection.memories].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Sort memories by access count (most accessed first).
 */
export function sortByAccessCount(collection: MemoryCollection): MemoryRecord[] {
  return [...collection.memories].sort((a, b) => b.accessCount - a.accessCount);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Query Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find a memory by ID.
 */
export function findById(
  collection: MemoryCollection,
  id: string
): MemoryRecord | undefined {
  return collection.memories.find((m) => m.id === id);
}

/**
 * Get all unique kinds in the collection.
 */
export function getMemoryKinds(collection: MemoryCollection): MemoryKind[] {
  const set = new Set<MemoryKind>();
  for (const m of collection.memories) {
    set.add(m.kind);
  }
  return [...set];
}

/**
 * Get all unique scopes in the collection.
 */
export function getMemoryScopes(collection: MemoryCollection): MemoryScope[] {
  const set = new Set<MemoryScope>();
  for (const m of collection.memories) {
    set.add(m.scope);
  }
  return [...set];
}
