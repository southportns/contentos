/**
 * P0.4.1 → P0.4.2 Regression Test
 *
 * Proves that P0.4.1 Detail Mode (Evaluation / Strategy Evaluation / Humanization)
 * still exists AFTER P0.4.2 Compare Mode was added.
 *
 * Approach: Static source code regression.
 * We verify that:
 *   1. The detail-mode sections exist in the source AND reference the correct fields
 *   2. Compare Mode entry points (viewMode, DraftVersionCompare) remain intact
 *   3. Both modes coexist (no mutual exclusion)
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('P0.4.1 Detail Mode Regression (post P0.4.2)', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../draft-version-history.tsx'),
    'utf-8'
  )

  describe('Evaluation Section exists in Detail Mode', () => {
    it('renders evaluation dimensions with correct field names', () => {
      expect(source).toContain('evaluation.overallScore')
      expect(source).toContain('evaluation.emotionalImpactScore')
      expect(source).toContain('evaluation.logicalClarityScore')
      expect(source).toContain('evaluation.noveltyScore')
      expect(source).toContain('evaluation.readabilityScore')
      expect(source).toContain('evaluation.platformFitScore')
    })

    it('has evaluation section label', () => {
      expect(source).toContain('评估分数')
    })

    it('passes selectedDraft.evaluation to the section', () => {
      expect(source).toContain('evaluation={selectedDraft.evaluation}')
    })
  })

  describe('Strategy Evaluation Section exists in Detail Mode', () => {
    it('renders strategy dimensions with correct field names', () => {
      expect(source).toContain('strategyEvaluation.overallScore')
      expect(source).toContain('strategyEvaluation.grade')
      expect(source).toContain('strategyEvaluation.platformFit')
      expect(source).toContain('strategyEvaluation.strategyConsistency')
    })

    it('has strategy section label', () => {
      expect(source).toContain('策略评估')
    })

    it('passes selectedDraft.strategyEvaluation to the section', () => {
      expect(source).toContain('strategyEvaluation={selectedDraft.strategyEvaluation}')
    })
  })

  describe('Humanization Section exists in Detail Mode', () => {
    it('references humanization.adopted field', () => {
      expect(source).toContain('humanization.adopted')
    })

    it('shows 已采用 / 未采用 status labels', () => {
      expect(source).toContain('已采用')
      expect(source).toContain('未采用')
    })

    it('has 真人化 section label', () => {
      expect(source).toContain('真人化')
    })

    it('passes selectedDraft.humanization to the section', () => {
      expect(source).toContain('humanization={selectedDraft.humanization}')
    })
  })

  describe('Empty state fallback', () => {
    it('shows fallback when no analysis data exists', () => {
      expect(source).toContain('暂无分析数据')
    })
  })
})

describe('P0.4.2 Compare Mode still intact', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../draft-version-history.tsx'),
    'utf-8'
  )

it('canCompare still gated on sortedDrafts.length >= 2', () => {
// P0.5.2: Now uses sortedDrafts for version ordering
expect(source).toContain('sortedDrafts.length >= 2')
})

  it('setViewMode compare button still exists', () => {
    expect(source).toContain("setViewMode('compare')")
  })

  it('DraftVersionCompare component is still imported', () => {
    expect(source).toContain("import { DraftVersionCompare } from './draft-version-compare'")
  })

it('DraftVersionCompare is rendered in compare mode', () => {
// P0.5.2: Now passes sortedDrafts for consistent ordering
expect(source).toContain('<DraftVersionCompare drafts={sortedDrafts} />')
})

  it('Detail Mode and Compare Mode share the same DraftVersionHistory wrapper', () => {
    // Both view modes must coexist in the same component
    expect(source).toContain("viewMode === 'compare'")
    expect(source).toContain('selectedDraft')
  })
})
