/**
 * P0.6.2 — Context Package Builder
 *
 * Assembles the final ContextPackage from scored contexts.
 *
 * Architecture Position:
 *   Takes the SELECTED contexts (post-budget) and organizes them
 *   into a structured package grouped by kind.
 *
 * Design Principles:
 *   1. Organized by kind — easy for serializer to consume
 *   2. Identity/Intent are singular (first one wins)
 *   3. All other kinds are arrays
 *   4. Metadata carries assembly provenance
 *
 * Non-goals:
 *   - Not serializing to text (that is ContextSerializer)
 *   - Not modifying context content
 *   - Not making decisions about what to include
 */

import type { ContextObject } from '../context-object';
import type { ContextKind } from '../context-kind';
import type {
  ContextAssemblyResult,
  ContextPackage,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Package Builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a ContextPackage from the assembly result.
 *
 * Organizes contexts by kind:
 * - identity: first context of kind 'identity' (singular)
 * - intent: first context of kind 'intent' (singular)
 * - All others: array of contexts for that kind
 *
 * @param result - The assembly result with selected contexts
 * @return ContextPackage organized by kind
 */
export function buildContextPackage(result: ContextAssemblyResult): ContextPackage {
  const { selected, metadata } = result;

  // Find singular contexts (identity, intent)
  let identity: ContextObject | undefined;
  let intent: ContextObject | undefined;

  // Collect by kind
  const byKind = new Map<ContextKind, ContextObject[]>();

  for (const scored of selected) {
    const ctx = scored.context;
    const kind = ctx.kind;

    // Identity: first one wins (singular)
    if (kind === 'identity' && identity === undefined) {
      identity = ctx;
      continue;
    }

    // Intent: first one wins (singular)
    if (kind === 'intent' && intent === undefined) {
      intent = ctx;
      continue;
    }

    // All others: aggregate into arrays
    const existing = byKind.get(kind) ?? [];
    existing.push(ctx);
    byKind.set(kind, existing);
  }

  return {
    identity,
    intent,
    knowledge: byKind.get('knowledge') ?? [],
    strategy: byKind.get('strategy') ?? [],
    content: byKind.get('content') ?? [],
    evaluation: byKind.get('evaluation') ?? [],
    decision: byKind.get('decision') ?? [],
    outcome: byKind.get('outcome') ?? [],
    memory: byKind.get('memory') ?? [],
    metadata: {
      purpose: metadata.purpose,
      tokenEstimate: result.tokenEstimate,
      contextCount: selected.length,
      assembledAt: metadata.assembledAt,
    },
  };
}

/**
 * Find the best (first) context of a given kind in a package.
 *
 * @param pkg - The context package
 * @param kind - The kind to find
 * @return The context object, or undefined if not present
 */
export function getPackageContextByKind(
  pkg: ContextPackage,
  kind: ContextKind
): ContextObject | undefined {
  switch (kind) {
    case 'identity':
      return pkg.identity;
    case 'intent':
      return pkg.intent;
    default:
      const arr = getPackageArrayByKind(pkg, kind);
      return arr.length > 0 ? arr[0] : undefined;
  }
}

/**
 * Get the array of contexts for a given kind in a package.
 *
 * For identity/intent (singular fields), returns a 0 or 1 element array.
 */
export function getPackageArrayByKind(
  pkg: ContextPackage,
  kind: ContextKind
): ContextObject[] {
  switch (kind) {
    case 'identity':
      return pkg.identity ? [pkg.identity] : [];
    case 'intent':
      return pkg.intent ? [pkg.intent] : [];
    case 'knowledge':
      return pkg.knowledge;
    case 'strategy':
      return pkg.strategy;
    case 'content':
      return pkg.content;
    case 'evaluation':
      return pkg.evaluation;
    case 'decision':
      return pkg.decision;
    case 'outcome':
      return pkg.outcome;
    case 'memory':
      return pkg.memory;
  }
}

/**
 * Get the total number of contexts in a package.
 */
export function getPackageContextCount(pkg: ContextPackage): number {
  let count = 0;
  if (pkg.identity) count++;
  if (pkg.intent) count++;
  count += pkg.knowledge.length;
  count += pkg.strategy.length;
  count += pkg.content.length;
  count += pkg.evaluation.length;
  count += pkg.decision.length;
  count += pkg.outcome.length;
  count += pkg.memory.length;
  return count;
}

/**
 * Check if a package is effectively empty.
 */
export function isPackageEmpty(pkg: ContextPackage): boolean {
  return getPackageContextCount(pkg) === 0;
}
