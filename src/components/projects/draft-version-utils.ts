/**
 * P0.4.1 — Draft Version History Pure Helpers
 * P0.4.2 — Draft Version Compare Pure Helpers
 * P0.4.6 — Draft Version Evolution Pure Helpers
 * P0.4.7 — Draft Version Lineage Traversal Pure Helpers
 * P0.4.8 — Active Draft Pure Helpers
 *
 * Pure functions for version label determination, badge styling, diff computation,
 * evolution metadata display, lineage traversal, and active draft resolution.
 * Separated from the React component for testability.
 */

// ─────────────────────────────────────────────────────────────────────────────
// P0.4.6 — Version Evolution Metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0.4.6 — Allowed change types for draft version evolution.
 * Using string union (not Prisma Enum) for consistency with project conventions.
 */
export type DraftChangeType =
  | 'INITIAL'
  | 'RESTORE'
  | 'MANUAL_EDIT'
  | 'REGENERATE'
  | 'REFINE'
  | 'HUMANIZATION'
  | 'OTHER'

/**
 * P0.4.6 — Get the Chinese display label for a draft change type.
 * Unknown values fall back to "其他" to prevent UI crashes.
 */
export function getChangeTypeLabel(changeType: string): string {
  switch (changeType) {
    case 'INITIAL':
      return '初始版本'
    case 'RESTORE':
      return '恢复版本'
    case 'MANUAL_EDIT':
      return '手动修改'
    case 'REGENERATE':
      return '重新生成'
    case 'REFINE':
      return '精修'
    case 'HUMANIZATION':
      return '真人化'
    case 'OTHER':
      return '其他'
    default:
      return '其他'
  }
}

/**
 * Determine the display label for a draft version.
 * - FINAL status ? "FINAL"
 * - HUMANIZED status ? "HUMANIZED"
 * - Version 1 ? "ORIGINAL"
 * - Everything else ? "DRAFT"
 */
export function getVersionLabel(version: number, status: string): string {
  if (status === 'FINAL') return 'FINAL'
  if (status === 'HUMANIZED') return 'HUMANIZED'
  if (version === 1) return 'ORIGINAL'
  return 'DRAFT'
}

/**
 * Determine the Badge variant based on draft status.
 * - FINAL ? "default" (solid)
 * - HUMANIZED ? "secondary"
 * - Everything else ? "outline"
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

// ─────────────────────────────────────────────────────────────────────────────
// P0.4.7 — Lineage Traversal Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0.4.7 — Get the parent draft from a drafts array.
 *
 * @param draft - The draft whose parent to find
 * @param drafts - All drafts in the current topic
 * @returns The parent draft, or null if no parentDraftId or parent not found
 */
export function getParentDraft<T extends { id: string; parentDraftId?: string | null }>(
  draft: T,
  drafts: T[],
): T | null {
  if (!draft.parentDraftId) return null
  return drafts.find((d) => d.id === draft.parentDraftId) ?? null
}

/**
 * P0.4.7 — Get all direct child drafts of a given draft.
 *
 * @param draft - The draft whose children to find
 * @param drafts - All drafts in the current topic
 * @returns Array of child drafts, sorted by version ascending
 */
export function getChildDrafts<T extends { id: string; parentDraftId?: string | null }>(
  draft: T,
  drafts: T[],
): T[] {
  return drafts
    .filter((d) => d.parentDraftId === draft.id)
    .sort((a, b) => {
      // Sort by version if available, otherwise keep insertion order (stable)
      const va = (a as { version?: number }).version
      const vb = (b as { version?: number }).version
      if (va != null && vb != null) return va - vb
      return 0
    })
}

/**
 * P0.4.7 — Get the full lineage chain from the earliest ancestor to the current draft.
 *
 * Walks up the parent chain until reaching a draft with no parent or a cycle is detected.
 * Returns the chain in order: [earliest ancestor, ..., current draft].
 *
 * @param draft - The draft to trace lineage for
 * @param drafts - All drafts in the current topic
 * @returns Array of drafts from ancestor to current
 */
export function getLineageChain<T extends {
  id: string
  parentDraftId?: string | null
  version: number
}>(
  draft: T,
  drafts: T[],
): T[] {
  const visited = new Set<string>()
  const chain: T[] = [draft]
  visited.add(draft.id)

  let current: T | null = draft

  while (current && current.parentDraftId) {
    // Cycle protection: prevent infinite loop
    if (visited.has(current.parentDraftId)) {
      break
    }

    const parent = drafts.find((d) => d.id === current!.parentDraftId)
    if (!parent) break

    visited.add(parent.id)
    chain.unshift(parent)
    current = parent
  }

  return chain
}

// ─────────────────────────────────────────────────────────────────────────────
// P0.4.8 — Active Draft Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0.4.8 — Resolve the active draft from a drafts array.
 *
 * Pure function: no database access, no API calls, no AI.
 *
 * Resolution order:
 * 1. If activeDraftId is provided and matches a draft in the array → return that draft
 * 2. Otherwise → fallback to the draft with the highest version number
 * 3. If drafts array is empty → return null
 *
 * @param drafts - All drafts in the current topic
 * @param activeDraftId - The explicitly set active draft ID (may be null/undefined)
 * @returns The active draft, or null if no drafts exist
 */
export function getActiveDraft<T extends { id: string; version: number }>(
  drafts: T[],
  activeDraftId?: string | null,
): T | null {
  if (drafts.length === 0) return null

  // Case A: activeDraftId explicitly set — find matching draft
  if (activeDraftId) {
    const active = drafts.find((d) => d.id === activeDraftId)
    if (active) return active
    // Case C: activeDraftId points to non-existent draft → fallback
  }

  // Case B / fallback: return draft with highest version
  return drafts.reduce((max, d) => (d.version > max.version ? d : max), drafts[0])
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
