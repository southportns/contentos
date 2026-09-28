/**
 * P0.6.1 — Context Collection
 *
 * Composes multiple ContextObjects into a unified, queryable set.
 *
 * Architecture Position:
 *   Context collection is the foundation for future Prompt Assembly.
 *   It provides a typed container for grouping related contexts.
 *
 * Design Principles:
 *   1. Immutable — collections are built once and not mutated
 *   2. Typed — each collection has a known set of context kinds
 *   3. Filterable — consumers can query by kind or type
 *   4. Order-preserving — insertion order is maintained
 *
 * P0.6.1 SCOPE:
 *   - Structural composition only (grouping + querying)
 *   - No serialization (that is P0.6.2)
 *   - No prioritization (that is P0.6.2)
 *   - No budget management (that is P0.6.2)
 */

import type { ContextObject } from './context-object';
import type { ContextKind } from './context-kind';

export interface ContextCollection {
  readonly contexts: readonly ContextObject[];
  readonly size: number;
  readonly isEmpty: boolean;
}

export class ContextCollectionBuilder {
  private _contexts: ContextObject[] = [];

  add(context: ContextObject): this {
    this._contexts.push(context);
    return this;
  }

  addMany(contexts: ContextObject[]): this {
    this._contexts.push(...contexts);
    return this;
  }

  build(): ContextCollection {
    return {
      contexts: [...this._contexts],
      size: this._contexts.length,
      isEmpty: this._contexts.length === 0,
    };
  }
}

export function createContextCollection(
  contexts: ContextObject[]
): ContextCollection {
  return new ContextCollectionBuilder().addMany(contexts).build();
}

export function filterByKind(
  collection: ContextCollection,
  kind: ContextKind
): ContextObject[] {
  return collection.contexts.filter((ctx) => ctx.kind === kind);
}

export function filterByType(
  collection: ContextCollection,
  type: string
): ContextObject[] {
  return collection.contexts.filter((ctx) => ctx.type === type);
}

export function findByKind(
  collection: ContextCollection,
  kind: ContextKind
): ContextObject | undefined {
  return collection.contexts.find((ctx) => ctx.kind === kind);
}

export function findByType(
  collection: ContextCollection,
  type: string
): ContextObject | undefined {
  return collection.contexts.find((ctx) => ctx.type === type);
}

export function hasKind(collection: ContextCollection, kind: ContextKind): boolean {
  return collection.contexts.some((ctx) => ctx.kind === kind);
}

export function hasType(collection: ContextCollection, type: string): boolean {
  return collection.contexts.some((ctx) => ctx.type === type);
}

export function getKinds(collection: ContextCollection): ContextKind[] {
  const kindSet = new Set<ContextKind>();
  for (const ctx of collection.contexts) {
    kindSet.add(ctx.kind);
  }
  return [...kindSet];
}

export function getTypes(collection: ContextCollection): string[] {
  const typeSet = new Set<string>();
  for (const ctx of collection.contexts) {
    typeSet.add(ctx.type);
  }
  return [...typeSet];
}