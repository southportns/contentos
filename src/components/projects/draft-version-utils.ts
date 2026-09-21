/**
 * P0.4.1 — Draft Version History Pure Helpers
 * P0.4.2 — Draft Version Compare Pure Helpers
 *
 * Pure functions for version label determination, badge styling, version selection, and diff computation.
 * Separated from the React component for testability.
 */

/**
 * Determine the display label for a draft version.
 * - FINAL status → "FINAL"
 * - HUMANIZED status → "HUMANIZED"
 * - Version 1 → "ORIGINAL"
 * - Everything else → "DRAFT"
 */
export function getVersionLabel(version: number, status: string): string {
  if (status === 'FINAL') return 'FINAL'
  if (status === 'HUMANIZED') return 'HUMANIZED'
  if (version === 1) return 'ORIGINAL'
  return 'DRAFT'
}

/**
 * Determine the Badge variant based on draft status.
 * - FINAL → "default" (solid)
 * - HUMANIZED → "secondary"
 * - Everything else → "outline"
 */
export function getVersionBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'FINAL') return 'default'
  if (status === 'HUMANIZED') return 'secondary'
  return 'outline'
}

// ─────────────────────────────────────────────────────────────────────────────
// P0.4.2 — Version Selection Pure Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the default A/B versions for comparison from a drafts array.
 * Returns { versionA: null, versionB: null } if fewer than 2 drafts.
 */
export function getDefaultCompareVersions(
  drafts: Array<{ version: number }>
): { versionA: number | null; versionB: number | null } {
  if (drafts.length < 2) {
    return { versionA: null, versionB: null }
  }
  return {
    versionA: drafts[0].version,
    versionB: drafts[1].version,
  }
}

/**
 * Determine whether two versions can be compared.
 * Returns false if either is null or if they are the same version.
 */
export function canCompareVersions(
  versionA: number | null,
  versionB: number | null
): boolean {
  return versionA !== null && versionB !== null && versionA !== versionB
}

/**
 * Swap A/B version positions.
 */
export function swapCompareVersions(
  versionA: number,
  versionB: number
): { versionA: number; versionB: number } {
  return {
    versionA: versionB,
    versionB: versionA,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// P0.4.2 — Diff Algorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents a single line in the diff output.
 * - 'added': line exists only in the newer version (B)
 * - 'removed': line exists only in the older version (A)
 * - 'unchanged': line is identical in both versions
 */
export type DiffLine = {
  type: 'added' | 'removed' | 'unchanged'
  content: string
}

/**
 * P0.4.2 — Compare two draft versions using line-based LCS (Longest Common Subsequence).
 *
 * Pure function: no side effects, no I/O, deterministic output.
 *
 * @param previousContent - Content of version A (older version)
 * @param currentContent - Content of version B (newer version)
 * @returns Array of DiffLine objects representing the unified diff
 *
 * Design decisions:
 * - Line-based diff (not character-level) for readability with scripts/posts
 * - LCS algorithm ensures minimal diff and stable ordering
 * - Empty lines are treated as valid lines
 * - Trailing newlines are trimmed before splitting to avoid phantom empty lines
 * - Whitespace within lines is preserved
 */
export function compareDraftVersions(previousContent: string, currentContent: string): DiffLine[] {
  // Handle null/undefined gracefully
  const a = (previousContent ?? '').trimEnd()
  const b = (currentContent ?? '').trimEnd()

  // Handle empty inputs
  if (a === '' && b === '') return []
  if (a === '') return b.split('\n').map((line) => ({ type: 'added' as const, content: line }))
  if (b === '') return a.split('\n').map((line) => ({ type: 'removed' as const, content: line }))

  const linesA = a.split('\n')
  const linesB = b.split('\n')

  // Compute LCS table
  const m = linesA.length
  const n = linesB.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      // Unchanged line
      result.unshift({ type: 'unchanged', content: linesA[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Line added in B
      result.unshift({ type: 'added', content: linesB[j - 1] })
      j--
    } else if (i > 0) {
      // Line removed from A
      result.unshift({ type: 'removed', content: linesA[i - 1] })
      i--
    }
  }

  return result
}
