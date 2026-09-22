/*
 * P0.4.6 — Draft Version Evolution Utility Tests
 * P0.4.7 — Draft Version Lineage Traversal Utility Tests
 * P0.4.8 — Active Draft Utility Tests
 *
 * Tests verify:
 *   1. getChangeTypeLabel maps all known types correctly
 *   2. Unknown types fall back to "其他" (no crash)
 *   3. All 7 change types produce expected Chinese labels
 *   4. getParentDraft returns correct parent or null
 *   5. getChildDrafts returns children sorted by version
 *   6. getLineageChain walks up the parent chain correctly
 *   7. Cycle protection prevents infinite loops
 *   8. Missing parent handles gracefully
 *   9. getActiveDraft resolves by ID or falls back to highest version
 */

import { describe, it, expect } from 'vitest'
import { getChangeTypeLabel, getParentDraft, getChildDrafts, getLineageChain, getActiveDraft } from '../draft-version-utils'

// ── P0.4.7 Test Helpers ────────────────────────────────────────────────

interface TestDraft {
  id: string
  parentDraftId: string | null
  version: number
  changeType: string
}

function makeDraft(id: string, version: number, parentId: string | null = null, changeType: string = 'RESTORE'): TestDraft {
  return { id, parentDraftId: parentId, version, changeType }
}

describe('P0.4.6 — getChangeTypeLabel', () => {
  it('maps INITIAL to "初始版本"', () => {
    expect(getChangeTypeLabel('INITIAL')).toBe('初始版本')
  })

  it('maps RESTORE to "恢复版本"', () => {
    expect(getChangeTypeLabel('RESTORE')).toBe('恢复版本')
  })

  it('maps MANUAL_EDIT to "手动修改"', () => {
    expect(getChangeTypeLabel('MANUAL_EDIT')).toBe('手动修改')
  })

  it('maps REGENERATE to "重新生成"', () => {
    expect(getChangeTypeLabel('REGENERATE')).toBe('重新生成')
  })

  it('maps REFINE to "精修"', () => {
    expect(getChangeTypeLabel('REFINE')).toBe('精修')
  })

  it('maps HUMANIZATION to "真人化"', () => {
    expect(getChangeTypeLabel('HUMANIZATION')).toBe('真人化')
  })

  it('maps OTHER to "其他"', () => {
    expect(getChangeTypeLabel('OTHER')).toBe('其他')
  })

  it('falls back to "其他" for unknown type (no crash)', () => {
    expect(getChangeTypeLabel('SOMETHING_NEW')).toBe('其他')
  })

  it('falls back to "其他" for empty string', () => {
    expect(getChangeTypeLabel('')).toBe('其他')
  })

  it('falls back to "其他" for random garbage', () => {
    expect(getChangeTypeLabel('XYZ123')).toBe('其他')
  })
})

// ── P0.4.7 — Lineage Traversal Tests ───────────────────────────────────

describe('P0.4.7 — getParentDraft', () => {
  it('Test A: returns null when parentDraftId is null', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const drafts = [v1]
    expect(getParentDraft(v1, drafts)).toBeNull()
  })

  it('Test A: returns null when parentDraftId is undefined', () => {
    const draft = { id: 'd1', parentDraftId: undefined, version: 1, changeType: 'INITIAL' } as unknown as TestDraft
    expect(getParentDraft(draft, [draft])).toBeNull()
  })

  it('Test B: returns the parent draft when parentDraftId matches', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const v2 = makeDraft('d2', 2, 'd1')
    const drafts = [v1, v2]
    const parent = getParentDraft(v2, drafts)
    expect(parent).not.toBeNull()
    expect(parent!.id).toBe('d1')
    expect(parent!.version).toBe(1)
  })

  it('Test E: returns null when parent does not exist in drafts (no throw)', () => {
    const v2 = makeDraft('d2', 2, 'nonexistent-id')
    const drafts = [v2]
    expect(() => getParentDraft(v2, drafts)).not.toThrow()
    expect(getParentDraft(v2, drafts)).toBeNull()
  })
})

describe('P0.4.7 — getChildDrafts', () => {
  it('Test C: returns all children sorted by version ascending', () => {
    const v2 = makeDraft('d2', 2, 'd1')
    const v4 = makeDraft('d4', 4, 'd2', 'RESTORE')
    const v5 = makeDraft('d5', 5, 'd2', 'REFINE')
    const drafts = [v2, v4, v5]
    const children = getChildDrafts(v2, drafts)
    expect(children).toHaveLength(2)
    expect(children[0].id).toBe('d4')
    expect(children[1].id).toBe('d5')
    expect(children[0].version).toBeLessThan(children[1].version)
  })

  it('Test C: returns empty array when no children', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const drafts = [v1]
    expect(getChildDrafts(v1, drafts)).toEqual([])
  })

  it('Test C: does not include unrelated drafts', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const v2 = makeDraft('d2', 2, 'd1')
    const v3 = makeDraft('d3', 3, 'd1')
    const unrelated = makeDraft('d99', 99, 'other-parent')
    const drafts = [v1, v2, v3, unrelated]
    const children = getChildDrafts(v1, drafts)
    expect(children).toHaveLength(2)
    expect(children.map(c => c.id)).toContain('d2')
    expect(children.map(c => c.id)).toContain('d3')
  })
})

describe('P0.4.7 — getLineageChain', () => {
  it('Test D: returns full lineage chain from ancestor to current', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const v2 = makeDraft('d2', 2, 'd1')
    const v4 = makeDraft('d4', 4, 'd2')
    const drafts = [v1, v2, v4]
    const chain = getLineageChain(v4, drafts)
    expect(chain).toHaveLength(3)
    expect(chain[0].id).toBe('d1')
    expect(chain[1].id).toBe('d2')
    expect(chain[2].id).toBe('d4')
  })

  it('Test D: returns only current draft when no parent', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const drafts = [v1]
    const chain = getLineageChain(v1, drafts)
    expect(chain).toHaveLength(1)
    expect(chain[0].id).toBe('d1')
  })

  it('Test E: stops gracefully when parent missing (no throw)', () => {
    const v2 = makeDraft('d2', 2, 'missing-parent')
    const drafts = [v2]
    expect(() => getLineageChain(v2, drafts)).not.toThrow()
    const chain = getLineageChain(v2, drafts)
    expect(chain).toHaveLength(1) // Only current draft
    expect(chain[0].id).toBe('d2')
  })

  it('Test F: cycle protection prevents infinite loop (2-node cycle)', () => {
    // v1 -> v2 -> v1 (cycle)
    const v1 = makeDraft('d1', 1, 'd2')
    const v2 = makeDraft('d2', 2, 'd1')
    const drafts = [v1, v2]
    // Key assertion: function terminates (no infinite loop / no throw)
    expect(() => getLineageChain(v1, drafts)).not.toThrow()
    const chain = getLineageChain(v1, drafts)
    // Should contain at least the current draft; visits parent before detecting cycle
    expect(chain.length).toBeGreaterThanOrEqual(1)
    // Chain should not grow unbounded — at most all drafts in the cycle
    expect(chain.length).toBeLessThanOrEqual(drafts.length)
  })

  it('Test F: handles longer cycle without infinite loop (v1->v2->v3->v1)', () => {
    const v1 = makeDraft('d1', 1, 'd3')
    const v2 = makeDraft('d2', 2, 'd1')
    const v3 = makeDraft('d3', 3, 'd2')
    const drafts = [v1, v2, v3]
    // Key assertion: function terminates (no infinite loop / no throw)
    expect(() => getLineageChain(v1, drafts)).not.toThrow()
    const chain = getLineageChain(v1, drafts)
    // Should contain at least the current draft; bounded by total drafts
    expect(chain.length).toBeGreaterThanOrEqual(1)
    expect(chain.length).toBeLessThanOrEqual(drafts.length)
  })

  it('Test F: terminates within reasonable time even with cycle', () => {
    const v1 = makeDraft('d1', 1, 'd2')
    const v2 = makeDraft('d2', 2, 'd1')
    const drafts = [v1, v2]
    const start = Date.now()
    getLineageChain(v1, drafts)
    const elapsed = Date.now() - start
    // Should complete nearly instantly (< 100ms), proving no infinite loop
    expect(elapsed).toBeLessThan(100)
  })
})

// ── P0.4.8 — Active Draft Resolution Tests ───────────────────────────

describe('P0.4.8 — getActiveDraft', () => {
  it('Test A: returns the specified draft when activeDraftId matches', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const v2 = makeDraft('d2', 2, 'd1')
    const v3 = makeDraft('d3', 3, 'd2')
    const drafts = [v1, v2, v3]
    const active = getActiveDraft(drafts, 'd2')
    expect(active).not.toBeNull()
    expect(active!.id).toBe('d2')
    expect(active!.version).toBe(2)
  })

  it('Test B: falls back to highest version when activeDraftId is null', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const v2 = makeDraft('d2', 2, 'd1')
    const v3 = makeDraft('d3', 3, 'd2')
    const drafts = [v1, v2, v3]
    const active = getActiveDraft(drafts, null)
    expect(active).not.toBeNull()
    expect(active!.version).toBe(3) // Highest version
  })

  it('Test B: falls back to highest version when activeDraftId is undefined', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const v2 = makeDraft('d2', 2, 'd1')
    const drafts = [v1, v2]
    const active = getActiveDraft(drafts, undefined)
    expect(active).not.toBeNull()
    expect(active!.version).toBe(2)
  })

  it('Test C: falls back to highest version when activeDraftId not found', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const v2 = makeDraft('d2', 2, 'd1')
    const drafts = [v1, v2]
    const active = getActiveDraft(drafts, 'nonexistent-id')
    expect(active).not.toBeNull()
    expect(active!.version).toBe(2) // Falls back to highest
  })

  it('Test D: returns null when drafts array is empty', () => {
    const active = getActiveDraft([], 'some-id')
    expect(active).toBeNull()
  })

  it('Test D: returns null when drafts is empty and activeDraftId is null', () => {
    const active = getActiveDraft([], null)
    expect(active).toBeNull()
  })

  it('returns highest version with unsorted drafts array', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const v3 = makeDraft('d3', 3, 'd2')
    const v2 = makeDraft('d2', 2, 'd1')
    // Deliberately unsorted
    const drafts = [v3, v1, v2]
    const active = getActiveDraft(drafts, null)
    expect(active).not.toBeNull()
    expect(active!.version).toBe(3)
  })

  it('returns single draft when only one exists', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const drafts = [v1]
    const active = getActiveDraft(drafts, null)
    expect(active).not.toBeNull()
    expect(active!.id).toBe('d1')
  })

  it('returns single draft with matching activeDraftId', () => {
    const v1 = makeDraft('d1', 1, null, 'INITIAL')
    const drafts = [v1]
    const active = getActiveDraft(drafts, 'd1')
    expect(active).not.toBeNull()
    expect(active!.id).toBe('d1')
  })
})
