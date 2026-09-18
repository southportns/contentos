/**
 * @file Pure helpers for draft version planning.
 * P0.3.9.5 — Draft Version Persistence
 *
 * These functions are intentionally pure (no DB, no side effects) so they
 * can be unit-tested in isolation.
 */

/**
 * Compute the next draft version number given existing versions.
 *
 * Rule: max(existingVersions) + 1, or 1 if empty.
 * Does NOT depend on array ordering.
 *
 * @example
 * getNextDraftVersion([])           // → 1
 * getNextDraftVersion([1])          // → 2
 * getNextDraftVersion([1, 2])       // → 3
 * getNextDraftVersion([1, 3])       // → 4
 * getNextDraftVersion([2, 5, 3])    // → 6
 */
export function getNextDraftVersion(existingVersions: number[]): number {
  if (existingVersions.length === 0) return 1
  return Math.max(...existingVersions) + 1
}

/**
 * Determine whether this is the first save (no existing drafts).
 */
export function isFirstSave(existingDraftCount: number): boolean {
  return existingDraftCount === 0
}

/**
 * Compute the version number for the original draft on first save.
 * Always 1.
 */
export function getOriginalDraftVersion(): number {
  return 1
}

/**
 * Compute the version number for the refined draft on first save.
 * Always 2 (only when refine exists).
 */
export function getRefinedDraftVersion(): number {
  return 2
}
