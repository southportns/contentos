/**
 * P0.6.2 — Context Budget Manager
 *
 * Token estimation and budget-constrained selection.
 *
 * Architecture Position:
 *   Budget Manager is the gatekeeper that ensures the final context set
 *   stays within token and count limits. It operates AFTER selection,
 *   ranking, and deduplication.
 *
 * Token Estimation Method:
 *   - Character count / TOKEN_CHAR_RATIO (default 4 chars/token for English, 2 for CJK-heavy)
 *   - This is a FAST ESTIMATE — not a provider-specific tokenizer.
 *   - Documented as estimate to set correct expectations.
 *
 * Design Principles:
 *   1. Deterministic — pure function of input
 *   2. Required contexts survive — budget is NOT taken from required kinds
 *   3. Lowest-priority removed first when budget is exceeded
 *   4. Transparent — every removal is tracked with reason
 *
 * Non-goals:
 *   - Not calling a provider-specific tokenizer
 *   - Not modifying context content to fit budget
 *   - Not reorganizing contexts for optimal packing
 */

import type { ContextObject } from '../context-object';
import type { ContextKind } from '../context-kind';
import type {
  ContextBudget,
  ScoredContext,
  ExcludedContext,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimated characters per token.
 *
 * For mixed Chinese/English content (common in ContextOS):
 * - Chinese: ~1.5 chars/token
 * - English: ~4 chars/token
 * - We use 2.5 as a reasonable average for mixed content.
 *
 * NOTE: This is a rough estimate. Actual token count depends on the
 * specific tokenizer used by the LLM provider.
 */
export const CHARS_PER_TOKEN = 2.5;

// ═══════════════════════════════════════════════════════════════════════════════
// Token Estimation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate the token count for a single ContextObject.
 *
 * Uses a deterministic character-count approach:
 * 1. Serialize the context to a JSON string
 * 2. Divide by CHARS_PER_TOKEN
 * 3. Round up to nearest integer
 *
 * This is PURE and DETERMINISTIC.
 *
 * NOTE: This is an ESTIMATE. It does not call the provider's tokenizer.
 * The actual token count may differ by 10-30% depending on content.
 *
 * @param context - Context to estimate
 * @return Estimated token count (minimum 1)
 */
export function estimateContextTokens(context: ContextObject): number {
  // Serialize context fields that would go into a prompt
  const text = serializeForEstimation(context);
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/**
 * Estimate total tokens for a collection of contexts.
 *
 * @param contexts - Contexts to estimate
 * @return Total estimated token count
 */
export function estimateCollectionTokens(contexts: ScoredContext[]): number {
  return contexts.reduce(
    (sum, scored) => sum + estimateContextTokens(scored.context),
    0
  );
}

/**
 * Serialize context to a string for token estimation.
 *
 * Includes: kind, type, payload fields.
 */
function serializeForEstimation(context: ContextObject): string {
  const parts: string[] = [];

  parts.push(context.kind);
  parts.push(context.type);

  // Serialize payload (just the values, not keys, for estimation)
  const payload = context.payload;
  if (payload !== null && payload !== undefined && typeof payload === 'object') {
    serializeObjectValues(payload as Record<string, unknown>, parts);
  }

  return parts.join(' ');
}

/**
 * Recursively serialize object values into the parts array.
 */
function serializeObjectValues(obj: Record<string, unknown>, parts: string[]): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      parts.push(key, value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(key, String(value));
    } else if (Array.isArray(value)) {
      parts.push(key);
      for (const item of value) {
        if (typeof item === 'string') {
          parts.push(item);
        } else if (typeof item === 'object' && item !== null) {
          serializeObjectValues(item as Record<string, unknown>, parts);
        }
      }
    } else if (typeof value === 'object') {
      serializeObjectValues(value as Record<string, unknown>, parts);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Budget Application
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply budget constraints to a ranked, deduplicated context list.
 *
 * Strategy:
 * 1. Calculate effective budget (maxTokens - reservedTokens)
 * 2. Separate required contexts from optional
 * 3. Always include required contexts
 * 4. Add optional contexts in priority order until budget is exhausted
 * 5. Remove lowest-priority optional contexts first
 *
 * @param ranked - Ranked, deduplicated contexts (highest first)
 * @param budget - Budget constraints
 * @param requiredKinds - Kinds that cannot be removed
 * @return Object with selected contexts, excluded contexts, and token estimate
 */
export function applyBudget(
  ranked: ScoredContext[],
  budget: ContextBudget,
  requiredKinds?: ContextKind[]
): {
  selected: ScoredContext[];
  excluded: ExcludedContext[];
  tokenEstimate: number;
} {
  const selected: ScoredContext[] = [];
  const excluded: ExcludedContext[] = [];
  let currentTokens = 0;

  // Calculate effective token budget
  const effectiveMaxTokens = budget.maxTokens - (budget.reservedTokens ?? 0);
  const effectiveMaxContexts = budget.maxContexts ?? Infinity;

  // Separate required and optional
  const required: ScoredContext[] = [];
  const optional: ScoredContext[] = [];

  for (const scored of ranked) {
    if (requiredKinds && requiredKinds.includes(scored.context.kind)) {
      required.push(scored);
    } else {
      optional.push(scored);
    }
  }

  // Always include required contexts (they are budget-exempt)
  for (const scored of required) {
    const tokens = estimateContextTokens(scored.context);
    selected.push(scored);
    currentTokens += tokens;
  }

  // Track per-kind counts
  const kindCounts = new Map<ContextKind, number>();
  for (const scored of selected) {
    const kind = scored.context.kind;
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  // Add optional contexts in priority order
  for (const scored of optional) {
    const kind = scored.context.kind;
    const tokens = estimateContextTokens(scored.context);

    // Check max contexts limit
    if (selected.length >= effectiveMaxContexts) {
      excluded.push({
        contextId: scored.context.id,
        reason: 'budget',
        detail: `Max contexts limit reached (${effectiveMaxContexts})`,
      });
      continue;
    }

    // Check per-kind limit
    if (budget.maxPerKind) {
      const maxForKind = budget.maxPerKind[kind];
      if (maxForKind !== undefined && (kindCounts.get(kind) ?? 0) >= maxForKind) {
        excluded.push({
          contextId: scored.context.id,
          reason: 'budget',
          detail: `Max per-kind limit reached for '${kind}' (${maxForKind})`,
        });
        continue;
      }
    }

    // Check token budget (only for optional)
    if (currentTokens + tokens > effectiveMaxTokens) {
      excluded.push({
        contextId: scored.context.id,
        reason: 'budget',
        detail: `Token budget exceeded (${currentTokens + tokens}/${effectiveMaxTokens})`,
      });
      continue;
    }

    // Within budget — include
    selected.push(scored);
    currentTokens += tokens;
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  return { selected, excluded, tokenEstimate: currentTokens };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Budget
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a default budget with sensible defaults.
 */
export function createDefaultBudget(overrides?: Partial<ContextBudget>): ContextBudget {
  return {
    maxTokens: 4000,
    reservedTokens: 500,
    maxContexts: 20,
    ...overrides,
  };
}
