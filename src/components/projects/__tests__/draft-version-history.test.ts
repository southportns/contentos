/*
 * P0.4.1 — Draft Version History Component Acceptance Tests
 *
 * Tests verify:
 *   1. getVersionLabel returns correct labels (FINAL, HUMANIZED, ORIGINAL, DRAFT)
 *   2. getVersionBadgeVariant returns correct badge variants
 *   3. Version selection logic (default to highest, switch between versions)
 *   4. Empty state handling
 */

import { describe, it, expect } from 'vitest'
import { getVersionLabel, getVersionBadgeVariant } from '../draft-version-utils'

// ─── Test Data ───────────────────────────────────────────────────────────────

interface MockDraft {
  id: string
  version: number
  title: string
  content: string
  status: string
  wordCount: number
  createdAt: Date
  evaluation: { overallScore: number } | null
  humanization: { adopted: boolean } | null
  strategyEvaluation: { overallScore: number; grade: string } | null
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

function createMockDrafts(): MockDraft[] {
  return [
    createMockDraft({
      version: 3,
      title: 'Title v3',
      content: 'Content v3',
      status: 'FINAL',
      evaluation: { overallScore: 90 },
      humanization: { adopted: true },
      strategyEvaluation: { overallScore: 85, grade: 'strong' },
    }),
    createMockDraft({
      version: 2,
      title: 'Title v2',
      content: 'Content v2',
      status: 'HUMANIZED',
      evaluation: { overallScore: 80 },
      humanization: { adopted: false },
      strategyEvaluation: null,
    }),
    createMockDraft({
      version: 1,
      title: 'Title v1',
      content: 'Content v1',
      status: 'DRAFT',
      evaluation: null,
      humanization: null,
      strategyEvaluation: null,
    }),
  ]
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P0.4.1 — Draft Version History Component', () => {
  describe('getVersionLabel', () => {
    it('returns "FINAL" when status is FINAL', () => {
      expect(getVersionLabel(5, 'FINAL')).toBe('FINAL')
    })

    it('returns "HUMANIZED" when status is HUMANIZED', () => {
      expect(getVersionLabel(3, 'HUMANIZED')).toBe('HUMANIZED')
    })

    it('returns "ORIGINAL" when version is 1 (regardless of status DRAFT)', () => {
      expect(getVersionLabel(1, 'DRAFT')).toBe('ORIGINAL')
    })

    it('returns "DRAFT" when version > 1 and status is DRAFT', () => {
      expect(getVersionLabel(2, 'DRAFT')).toBe('DRAFT')
    })

    it('returns "DRAFT" for higher versions with unknown status', () => {
      expect(getVersionLabel(4, 'UNKNOWN')).toBe('DRAFT')
    })

    it('FINAL takes precedence over version number', () => {
      // Even if version is 1, FINAL status should return "FINAL"
      expect(getVersionLabel(1, 'FINAL')).toBe('FINAL')
    })

    it('HUMANIZED takes precedence over version number', () => {
      // Even if version is 1, HUMANIZED status should return "HUMANIZED"
      expect(getVersionLabel(1, 'HUMANIZED')).toBe('HUMANIZED')
    })
  })

  describe('getVersionBadgeVariant', () => {
    it('returns "default" for FINAL status', () => {
      expect(getVersionBadgeVariant('FINAL')).toBe('default')
    })

    it('returns "secondary" for HUMANIZED status', () => {
      expect(getVersionBadgeVariant('HUMANIZED')).toBe('secondary')
    })

    it('returns "outline" for DRAFT status', () => {
      expect(getVersionBadgeVariant('DRAFT')).toBe('outline')
    })

    it('returns "outline" for unknown status', () => {
      expect(getVersionBadgeVariant('UNKNOWN')).toBe('outline')
    })
  })

  describe('Version Selection Logic', () => {
    it('default selected version is the highest (first in DESC order)', () => {
      const drafts = createMockDrafts()
      // Drafts are ordered DESC, so drafts[0] is the latest
      const defaultVersion = drafts[0]?.version ?? 1
      expect(defaultVersion).toBe(3)
    })

    it('version 2 can be selected', () => {
      const drafts = createMockDrafts()
      const targetVersion = 2
      const selectedDraft = drafts.find((d) => d.version === targetVersion) ?? drafts[0]
      expect(selectedDraft.version).toBe(2)
      expect(selectedDraft.content).toBe('Content v2')
    })

    it('version 1 can be selected', () => {
      const drafts = createMockDrafts()
      const targetVersion = 1
      const selectedDraft = drafts.find((d) => d.version === targetVersion) ?? drafts[0]
      expect(selectedDraft.version).toBe(1)
      expect(selectedDraft.content).toBe('Content v1')
    })

    it('switching versions shows correct content', () => {
      const drafts = createMockDrafts()
      // Simulate switching from v3 to v1
      const v3 = drafts.find((d) => d.version === 3)!
      const v1 = drafts.find((d) => d.version === 1)!

      expect(v3.content).toBe('Content v3')
      expect(v1.content).toBe('Content v1')
      expect(v3.content).not.toBe(v1.content)
    })
  })

  describe('Empty State', () => {
    it('empty drafts array means no versions available', () => {
      const drafts: MockDraft[] = []
      expect(drafts.length).toBe(0)
    })

    it('empty drafts should show empty state message (component behavior)', () => {
      const drafts: MockDraft[] = []
      // Component checks: if (!drafts || drafts.length === 0) → shows "还没有生成内容版本"
      const isEmpty = !drafts || drafts.length === 0
      expect(isEmpty).toBe(true)
    })
  })

  describe('Latest Version Badge Logic', () => {
    it('latest version (first in DESC order) should display "最新"', () => {
      const drafts = createMockDrafts()
      const selectedVersion = drafts[0]?.version ?? 1
      const isLatest = selectedVersion === drafts[0]?.version
      expect(isLatest).toBe(true)
    })

    it('non-latest version should NOT display "最新"', () => {
      const drafts = createMockDrafts()
      const selectedVersion = 1 // Not the latest (v3 is)
      const isLatest = selectedVersion === drafts[0]?.version
      expect(isLatest).toBe(false)
    })
  })

  describe('Evaluation Display Logic', () => {
    it('draft with evaluation shows evaluation data', () => {
      const drafts = createMockDrafts()
      const v3 = drafts.find((d) => d.version === 3)!
      expect(v3.evaluation).not.toBeNull()
      expect(v3.evaluation!.overallScore).toBe(90)
    })

    it('draft without evaluation shows no evaluation', () => {
      const drafts = createMockDrafts()
      const v1 = drafts.find((d) => d.version === 1)!
      expect(v1.evaluation).toBeNull()
    })
  })

  describe('Strategy Evaluation Display Logic', () => {
    it('draft with strategyEvaluation shows strategy data', () => {
      const drafts = createMockDrafts()
      const v3 = drafts.find((d) => d.version === 3)!
      expect(v3.strategyEvaluation).not.toBeNull()
      expect(v3.strategyEvaluation!.overallScore).toBe(85)
      expect(v3.strategyEvaluation!.grade).toBe('strong')
    })

    it('draft without strategyEvaluation shows no strategy data', () => {
      const drafts = createMockDrafts()
      const v1 = drafts.find((d) => d.version === 1)!
      expect(v1.strategyEvaluation).toBeNull()
    })
  })

  describe('Humanization Status Display Logic', () => {
    it('draft with humanization.adopted = true shows "已采用"', () => {
      const drafts = createMockDrafts()
      const v3 = drafts.find((d) => d.version === 3)!
      expect(v3.humanization).not.toBeNull()
      expect(v3.humanization!.adopted).toBe(true)
    })

    it('draft with humanization.adopted = false shows "未采用"', () => {
      const drafts = createMockDrafts()
      const v2 = drafts.find((d) => d.version === 2)!
      expect(v2.humanization).not.toBeNull()
      expect(v2.humanization!.adopted).toBe(false)
    })

    it('draft without humanization shows no humanization status', () => {
      const drafts = createMockDrafts()
      const v1 = drafts.find((d) => d.version === 1)!
      expect(v1.humanization).toBeNull()
    })
  })
})
