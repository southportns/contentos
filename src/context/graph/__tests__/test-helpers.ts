/**
 * P0.6.6 — Test Helpers for Context Graph
 *
 * Factory functions for creating ContextObjects with specific provenance
 * relationships for graph testing.
 */

import type { ContextObject } from '../../context-object';
import type { ContextProvenance } from '../../context-provenance';
import type { ContextKind } from '../../context-kind';

/**
 * Creates a minimal ContextObject for graph testing.
 */
export function createTestContext(options: {
  id: string;
  kind?: ContextKind;
  type?: string;
  ownerId?: string | null;
  projectId?: string | null;
  topicId?: string | null;
  scope?: ContextProvenance['scope'];
  derivedFrom?: string[];
  usedBy?: string[];
  supersedes?: string | null;
}): ContextObject {
  const now = new Date().toISOString();
  const provenance: ContextProvenance = {
    source: 'test:' + options.id,
    sourceType: 'test',
    ownerId: options.ownerId ?? null,
    projectId: options.projectId ?? null,
    topicId: options.topicId ?? null,
    scope: options.scope ?? 'project',
    derivedFrom: options.derivedFrom ? [...options.derivedFrom] : undefined,
    usedBy: options.usedBy ? [...options.usedBy] : undefined,
    supersedes: options.supersedes ?? null,
  };

  return {
    id: options.id,
    kind: options.kind ?? 'strategy',
    type: options.type ?? options.kind ?? 'strategy',
    payload: { testId: options.id },
    provenance,
    lifecycle: { stage: 'captured', updatedAt: now },
    confidence: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates a ContextGraph with unrelated nodes (no edges).
 */
export function createIsolatedContexts(count: number, baseId = 'node'): ContextObject[] {
  return Array.from({ length: count }, (_, i) =>
    createTestContext({ id: baseId + '_' + i })
  );
}
