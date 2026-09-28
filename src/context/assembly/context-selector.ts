/**
 * P0.6.2 — Context Selector
 *
 * Filters context objects based on structural criteria:
 * - Required/excluded kinds
 * - Purpose compatibility
 * - Topic/Project scope
 *
 * Architecture Position:
 *   Selector is the FIRST stage of assembly. It narrows the input set
 *   based on deterministic structural rules with no scoring or ranking.
 *
 * Design Principles:
 *   1. No budget decisions — only structural filtering
 *   2. Pure function — same input always produces same output
 *   3. Transparent — every exclusion has a documented reason
 *   4. Project boundary enforcement — no cross-project leakage
 *
 * Non-goals:
 *   - Not scoring or ranking (that is ContextRanker)
 *   - Not budget allocation (that is ContextBudgetManager)
 *   - Not deduplication (that is ContextDeduplicator)
 */

import type { ContextObject } from '../context-object';
import type { ContextKind } from '../context-kind';
import type {
  AssemblyPurpose,
  ContextAssemblyRequest,
  ExcludedContext,
} from './types';
import { isContextObject } from '../context-utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Selection Result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of the selection phase.
 */
export interface SelectionResult {
  /** Contexts that passed selection */
  selected: ContextObject[];
  /** Contexts that were excluded, with reasons */
  excluded: ExcludedContext[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Purpose-to-Relevant-Kinds Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default relevant kinds for each purpose.
 *
 * Used for relevance scoring hints — contexts whose kind matches
 * the purpose get a relevance boost.
 */
export const PURPOSE_RELEVANT_KINDS: Record<AssemblyPurpose, ContextKind[]> = {
  generic: ['identity', 'intent', 'knowledge', 'strategy', 'content'],
  strategy: ['identity', 'intent', 'knowledge', 'strategy'],
  writing: ['identity', 'intent', 'strategy', 'knowledge', 'content'],
  evaluation: ['content', 'strategy', 'evaluation', 'knowledge'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Context Selector
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Select candidate contexts from the input set.
 *
 * Applies the following filters in order:
 * 1. Structural validity — must be valid ContextObject
 * 2. Excluded kinds — remove explicitly excluded kinds
 * 3. Required kinds — mark required kinds (but don't exclude others here)
 * 4. Project scope — remove contexts from other projects
 *
 * @param request - The assembly request containing contexts and filters
 * @return SelectionResult with selected and excluded contexts
 */
export function selectContexts(request: ContextAssemblyRequest): SelectionResult {
  const { contexts, excludedKinds, projectId } = request;
  const selected: ContextObject[] = [];
  const excluded: ExcludedContext[] = [];

  for (const ctx of contexts) {
    // 1. Structural validity
    if (!isContextObject(ctx)) {
      excluded.push({
        contextId: typeof (ctx as { id?: unknown })?.id === 'string'
          ? (ctx as { id: string }).id
          : 'unknown',
        reason: 'invalid',
        detail: 'Failed ContextObject structural validation',
      });
      continue;
    }

    // 2. Excluded kinds
    if (excludedKinds && excludedKinds.length > 0 && excludedKinds.includes(ctx.kind)) {
      excluded.push({
        contextId: ctx.id,
        reason: 'excluded_kind',
        detail: `Kind '${ctx.kind}' is in excluded list`,
      });
      continue;
    }

    // 3. Project scope enforcement
    // If projectId is specified, contexts without any project affinity
    // (both null) are allowed (they are global), but contexts from a
    // DIFFERENT project are excluded.
    if (projectId) {
      const ctxProjectId = ctx.provenance.projectId;
      if (ctxProjectId !== undefined && ctxProjectId !== null && ctxProjectId !== projectId) {
        excluded.push({
          contextId: ctx.id,
          reason: 'invalid',
          detail: `Context project '${ctxProjectId}' does not match request project '${projectId}'`,
        });
        continue;
      }
    }

    selected.push(ctx);
  }

  return { selected, excluded };
}
