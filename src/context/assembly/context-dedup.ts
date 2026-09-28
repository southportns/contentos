/**
 * P0.6.2 — Context Deduplicator
 *
 * Deterministic deduplication of ContextObjects.
 *
 * Architecture Position:
 *   Deduplicator removes duplicate contexts AFTER selection and ranking.
 *   It operates on deterministic fingerprints, not semantic similarity.
 *
 * Deduplication Rules (deterministic):
 * 1. Same context id → duplicate
 * 2. Same source + type → duplicate
 * 3. Same derivedFrom fingerprint → duplicate
 *
 * Design Principles:
 *   1. Deterministic — no randomness, no LLM calls
 *   2. Preserves highest-scored context when duplicates are found
 *   3. O(n) using a Set of fingerprints
 *   4. No semantic comparison (that is future work)
 *
 * Non-goals:
 *   - Not semantic dedup (no LLM/embedding-based similarity)
 *   - Not cross-kind dedup (only within same kind)
 *   - Not removing contexts based on age alone
 */

import type { ContextObject } from '../context-object';
import type { ScoredContext, ExcludedContext } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Dedup Result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of the deduplication phase.
 */
export interface DedupResult {
  /** Unique contexts (highest-scored kept) */
  unique: ScoredContext[];
  /** Duplicate contexts that were removed */
  duplicates: ExcludedContext[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fingerprint Generation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a deterministic fingerprint for a context.
 *
 * The fingerprint combines:
 * - Context ID (if present)
 * - Kind + Type + Provenance source
 * - Derived from (sorted, joined)
 *
 * This ensures the same logical context always produces the same fingerprint.
 */
export function getContextFingerprint(context: ContextObject): string {
  const parts: string[] = [];

  // Primary: context ID (most specific)
  parts.push(`id:${context.id}`);

  // Secondary: kind + type + source
  const source = context.provenance.source ?? 'unknown';
  parts.push(`kts:${context.kind}:${context.type}:${source}`);

  // Tertiary: derived from (sorted for consistency)
  if (context.provenance.derivedFrom && context.provenance.derivedFrom.length > 0) {
    const sorted = [...context.provenance.derivedFrom].sort();
    parts.push(`df:${sorted.join(',')}`);
  }

  return parts.join('|');
}

/**
 * Generate a source+type fingerprint for duplicate detection.
 *
 * Two contexts from the same source with the same type are considered
 * duplicates (even if they have different IDs — e.g., adapter re-runs).
 */
export function getSourceTypeFingerprint(context: ContextObject): string {
  const source = context.provenance.source ?? 'unknown';
  return `src:${source}:${context.kind}:${context.type}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deduplication Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Remove duplicate contexts from a ranked list.
 *
 * Since the input is already ranked (highest score first), the first
 * occurrence of each fingerprint is kept and subsequent duplicates
 * are removed.
 *
 * This ensures the highest-scored version of each unique context
 * survives deduplication.
 *
 * Algorithm: O(n) using two Sets for fingerprint tracking.
 *
 * @param ranked - Ranked contexts (must be sorted by score descending)
 * @return DedupResult with unique contexts and excluded duplicates
 */
export function deduplicateContexts(ranked: ScoredContext[]): DedupResult {
  const unique: ScoredContext[] = [];
  const duplicates: ExcludedContext[] = [];
  const seenIds = new Set<string>();
  const seenSourceTypes = new Set<string>();

  for (const scored of ranked) {
    const ctx = scored.context;
    const idFingerprint = getContextFingerprint(ctx);
    const sourceTypeFingerprint = getSourceTypeFingerprint(ctx);

    // Check for duplicate by ID
    if (seenIds.has(idFingerprint)) {
      duplicates.push({
        contextId: ctx.id,
        reason: 'duplicate',
        detail: `Duplicate ID fingerprint: ${idFingerprint}`,
      });
      continue;
    }

    // Check for duplicate by source+type
    if (seenSourceTypes.has(sourceTypeFingerprint)) {
      duplicates.push({
        contextId: ctx.id,
        reason: 'duplicate',
        detail: `Duplicate source+type: ${sourceTypeFingerprint}`,
      });
      continue;
    }

    // Unique — keep it
    seenIds.add(idFingerprint);
    seenSourceTypes.add(sourceTypeFingerprint);
    unique.push(scored);
  }

  return { unique, duplicates };
}
