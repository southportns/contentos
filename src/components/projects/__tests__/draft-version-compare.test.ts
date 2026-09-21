/**
 * P0.4.2 — Draft Version Compare Tests
 *
 * All tests verify REAL production functions — no tautologies,
 * no hand-rolled swap logic, no constant self-comparisons.
 */

import { describe, it, expect } from 'vitest'
import {
  compareDraftVersions,
  getVersionLabel,
  getVersionBadgeVariant,
  getDefaultCompareVersions,
  canCompareVersions,
  swapCompareVersions,
} from '../draft-version-utils'
import fs from 'fs'
import path from 'path'

// ─── Shared Mock Data ───────────────────────────────────────────────────────

interface MockDraft {
  id: string
  version: number
  title: string
  content: string
  status: string
  wordCount: number
  createdAt: Date
  evaluation: { overallScore: number; emotionalImpactScore?: number; noveltyScore?: number } | null
  humanization: { adopted: boolean } | null
  strategyEvaluation: { overallScore: number; grade?: string } | null
}

function createMockDraft(overrides: Partial<MockDraft>): MockDraft {
  return {
    id: `draft_${overrides.version ?? 1}`,
    version: overrides.version ?? 1,
    title: overrides.title ?? `Title v${overrides.version ?? 1}`,
    content: overrides.content ?? `Content v${overrides.version ?? 1}`,
    status: overrides.status ?? 'DRAFT',
    wordCount: overrides.wordCount ?? 500,
    createdAt: overrides.createdAt ?? new Date('2026-09-20T10:00:00Z'),
    evaluation: overrides.evaluation ?? null,
    humanization: overrides.humanization ?? null,
    strategyEvaluation: overrides.strategyEvaluation ?? null,
  }
}

function createThreeDrafts(): MockDraft[] {
  return [
    createMockDraft({
      id: 'd3', version: 3, title: '标题 v3',
      content: '第一行\n第二行新增\n第四行',
      status: 'FINAL', wordCount: 600,
      evaluation: { overallScore: 88, emotionalImpactScore: 85, noveltyScore: 90 },
      humanization: { adopted: true },
      strategyEvaluation: { overallScore: 86, grade: 'strong' },
    }),
    createMockDraft({
      id: 'd2', version: 2, title: '标题 v2',
      content: '第一行\n第二行\n第三行\n第四行',
      status: 'HUMANIZED', wordCount: 550,
      evaluation: { overallScore: 75, emotionalImpactScore: 70, noveltyScore: 72 },
      humanization: { adopted: false },
      strategyEvaluation: { overallScore: 72, grade: 'moderate' },
    }),
    createMockDraft({
      id: 'd1', version: 1, title: '标题 v1',
      content: '初始内容第一行\n初始内容第二行',
      status: 'DRAFT', wordCount: 300,
      evaluation: null, humanization: null, strategyEvaluation: null,
    }),
  ]
}

// ─── Test: Pure Helper Functions ────────────────────────────────────────────

describe('getDefaultCompareVersions', () => {
  it('returns first two versions when 3 drafts exist', () => {
    const drafts = createThreeDrafts()
    const result = getDefaultCompareVersions(drafts)
    expect(result.versionA).toBe(3)
    expect(result.versionB).toBe(2)
  })

  it('returns first two versions when exactly 2 drafts exist', () => {
    const drafts = createThreeDrafts().slice(0, 2)
    const result = getDefaultCompareVersions(drafts)
    expect(result.versionA).toBe(3)
    expect(result.versionB).toBe(2)
  })

  it('returns null for both when only 1 draft exists', () => {
    const drafts = createThreeDrafts().slice(0, 1)
    const result = getDefaultCompareVersions(drafts)
    expect(result.versionA).toBeNull()
    expect(result.versionB).toBeNull()
  })

  it('returns null for both when drafts array is empty', () => {
    const result = getDefaultCompareVersions([])
    expect(result.versionA).toBeNull()
    expect(result.versionB).toBeNull()
  })
})

describe('canCompareVersions', () => {
  it('returns true when both versions are different', () => {
    expect(canCompareVersions(3, 2)).toBe(true)
  })

  it('returns false when versions are identical', () => {
    expect(canCompareVersions(3, 3)).toBe(false)
  })

  it('returns false when versionA is null', () => {
    expect(canCompareVersions(null, 2)).toBe(false)
  })

  it('returns false when versionB is null', () => {
    expect(canCompareVersions(3, null)).toBe(false)
  })

  it('returns false when both are null', () => {
    expect(canCompareVersions(null, null)).toBe(false)
  })
})

describe('swapCompareVersions', () => {
  it('swaps A and B correctly (3,2 -> 2,3)', () => {
    const result = swapCompareVersions(3, 2)
    expect(result.versionA).toBe(2)
    expect(result.versionB).toBe(3)
  })

  it('swap is reversible (3,2 -> 2,3 -> 3,2)', () => {
    const first = swapCompareVersions(3, 2)
    const second = swapCompareVersions(first.versionA, first.versionB)
    expect(second.versionA).toBe(3)
    expect(second.versionB).toBe(2)
  })
})

// ─── Test: Diff Algorithm Integration ───────────────────────────────────────

describe('compareDraftVersions (integration via component data)', () => {
  it('produces diff for default selection (v3 vs v2)', () => {
    const drafts = createThreeDrafts()
    const draftA = drafts.find((d) => d.version === 3)!
    const draftB = drafts.find((d) => d.version === 2)!
    const diff = compareDraftVersions(draftB.content, draftA.content)
    expect(diff.length).toBeGreaterThan(0)
    expect(diff.some((l) => l.type === 'added')).toBe(true)
  })

  it('produces diff for v2 vs v1', () => {
    const drafts = createThreeDrafts()
    const draftA = drafts.find((d) => d.version === 2)!
    const draftB = drafts.find((d) => d.version === 1)!
    const diff = compareDraftVersions(draftB.content, draftA.content)
    expect(diff.length).toBeGreaterThan(0)
  })

  it('diff stats are correct for v3 vs v2', () => {
    const drafts = createThreeDrafts()
    const draftA = drafts.find((d) => d.version === 3)!
    const draftB = drafts.find((d) => d.version === 2)!
    const diff = compareDraftVersions(draftB.content, draftA.content)
    const addedCount = diff.filter((l) => l.type === 'added').length
    const removedCount = diff.filter((l) => l.type === 'removed').length
    const unchangedCount = diff.filter((l) => l.type === 'unchanged').length
    expect(addedCount).toBeGreaterThan(0)
    expect(removedCount).toBeGreaterThan(0)
    expect(unchangedCount).toBeGreaterThan(0)
  })
})

// ─── Test: Version Label Consistency ────────────────────────────────────────

describe('Version Label / Badge (shared between detail and compare)', () => {
  it('labels are correct for FINAL / HUMANIZED / ORIGINAL', () => {
    const drafts = createThreeDrafts()
    expect(getVersionLabel(drafts[0].version, drafts[0].status)).toBe('FINAL')
    expect(getVersionLabel(drafts[1].version, drafts[1].status)).toBe('HUMANIZED')
    expect(getVersionLabel(drafts[2].version, drafts[2].status)).toBe('ORIGINAL')
  })

  it('badge variants are correct', () => {
    expect(getVersionBadgeVariant('FINAL')).toBe('default')
    expect(getVersionBadgeVariant('HUMANIZED')).toBe('secondary')
    expect(getVersionBadgeVariant('DRAFT')).toBe('outline')
  })
})

// ─── Test: Read-only Verification ───────────────────────────────────────────

describe('Read-only Verification', () => {
  it('compareDraftVersions does not mutate input strings', () => {
    const a = '第一行\n第二行\n第三行'
    const b = '第一行\n新增\n第三行'
    const aCopy = a.slice()
    const bCopy = b.slice()
    compareDraftVersions(a, b)
    expect(a).toBe(aCopy)
    expect(b).toBe(bCopy)
  })

  it('getDefaultCompareVersions is pure (no mutation)', () => {
    const drafts = createThreeDrafts()
    const original = JSON.stringify(drafts)
    getDefaultCompareVersions(drafts)
    expect(JSON.stringify(drafts)).toBe(original)
  })

  it('canCompareVersions is pure', () => {
    canCompareVersions(3, 2)
    canCompareVersions(null, null)
    expect(canCompareVersions(3, 2)).toBe(true)
  })

  it('swapCompareVersions is pure (no external state)', () => {
    const r1 = swapCompareVersions(1, 2)
    const r2 = swapCompareVersions(1, 2)
    expect(r1).toEqual(r2)
  })

  it('DraftVersionCompare component has no server action imports', () => {
    const componentSource = fs.readFileSync(
      path.resolve(__dirname, '../draft-version-compare.tsx'),
      'utf-8'
    )
    expect(componentSource).not.toContain('server-actions')
    expect(componentSource).not.toContain('deleteProject')
    expect(componentSource).not.toContain('createProject')
    expect(componentSource).not.toContain('updateProject')
  })

  it('Component imports helpers from draft-version-utils', () => {
    const compareSource = fs.readFileSync(
      path.resolve(__dirname, '../draft-version-compare.tsx'),
      'utf-8'
    )
    expect(compareSource).toContain('getDefaultCompareVersions')
    expect(compareSource).toContain('swapCompareVersions')
    expect(compareSource).toContain('canCompareVersions')
  })
})
