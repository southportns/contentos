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
import type { ContextScope } from '../context-provenance';
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
// Scope Resolution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the effective scope of a context object.
 *
 * Resolution rules:
 * 1. If scope is explicitly set in provenance → use it
 * 2. If scope is not set but projectId exists → infer 'project'
 * 3. If scope is not set and no projectId → infer 'global'
 *
 * @param ctx - The context object
 * @return Resolved scope
 */
export function resolveContextScope(ctx: ContextObject): ContextScope {
  // 1. Explicit scope takes priority
  if (ctx.provenance.scope) {
    return ctx.provenance.scope;
  }

  // 2. Infer from provenance fields
  if (ctx.provenance.projectId) {
    return 'project';
  }

  // 3. Default: global (no project affinity)
  return 'global';
}

/**
 * Check if a context's scope is compatible with the assembly request scope.
 *
 * Scope compatibility matrix (when request has projectId):
 * - global → always compatible
 * - project → compatible only if projectId matches
 * - topic → compatible only if projectId matches (and topicId if specified)
 * - unknown → NOT compatible (conservative exclusion)
 *
 * When request has no projectId → all scopes compatible (no project boundary).
 *
 * @param ctxScope - Resolved scope of the context
 * @param ctx - The original context object
 * @param request - The assembly request
 * @return true if compatible, false otherwise
 */
export function isScopeCompatible(
  ctxScope: ContextScope,
  ctx: ContextObject,
  request: ContextAssemblyRequest
): boolean {
  // No project boundary → all scopes compatible
  if (!request.projectId) {
    return true;
  }

  switch (ctxScope) {
    case 'global':
      // Global contexts can be used across projects
      return true;

    case 'project':
      // Project-scoped contexts must match the request's project
      return ctx.provenance.projectId === request.projectId;

    case 'topic': {
      // Topic-scoped contexts must match project AND topic (if specified)
      const projectMatch = ctx.provenance.projectId === request.projectId;
      if (!projectMatch) return false;
      if (request.topicId && ctx.provenance.topicId !== request.topicId) {
        return false;
      }
      return true;
    }

    case 'unknown':
      // Unknown scope: conservative exclusion — never cross project boundary
      return false;

    default:
      return false;
  }
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
 * 3. Scope-based boundary enforcement — uses explicit scope or infers it:
 *    - global → always allowed (cross-project OK)
 *    - project → projectId must match request
 *    - topic → projectId must match (and topicId if specified)
 *    - unknown → excluded when project boundary exists
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

    // 3. Scope-based boundary enforcement
    // Uses explicit scope (if set) or infers from provenance fields.
    // Provides granular exclusion reasons for observability.
    const ctxScope = resolveContextScope(ctx);
    if (!isScopeCompatible(ctxScope, ctx, request)) {
      const reason = ctxScope === 'unknown' ? 'unknown_scope' : 'scope_mismatch';
      const detail = ctxScope === 'unknown'
        ? `Context has unknown scope — excluded from project boundary '${projectId}'`
        : `Context scope '${ctxScope}' (project: ${ctx.provenance.projectId ?? 'none'}, topic: ${ctx.provenance.topicId ?? 'none'}) incompatible with request (project: ${projectId}, topic: ${request.topicId ?? 'any'})`;
      excluded.push({
        contextId: ctx.id,
        reason,
        detail,
      });
      continue;
    }

    selected.push(ctx);
  }

  return { selected, excluded };
}
