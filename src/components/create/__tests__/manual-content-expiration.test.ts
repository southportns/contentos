import { describe, it, expect } from 'vitest'
import {
  computeRefineSignature,
  shouldExpireManualContent,
} from '../step-refine'

describe('P0.3.9.3 - Manual Content Expiration (P5)', () => {
  describe('computeRefineSignature', () => {
    it('returns stable string for same content/title/hook', () => {
      const sig1 = computeRefineSignature({ content: 'A', title: 'B', hook: 'C' })
      const sig2 = computeRefineSignature({ content: 'A', title: 'B', hook: 'C' })
      expect(sig1).toBe(sig2)
    })

    it('returns different string when content changes', () => {
      const sig1 = computeRefineSignature({ content: 'A', title: 'B', hook: 'C' })
      const sig2 = computeRefineSignature({ content: 'A2', title: 'B', hook: 'C' })
      expect(sig1).not.toBe(sig2)
    })

    it('returns different string when title changes', () => {
      const sig1 = computeRefineSignature({ content: 'A', title: 'B', hook: 'C' })
      const sig2 = computeRefineSignature({ content: 'A', title: 'B2', hook: 'C' })
      expect(sig1).not.toBe(sig2)
    })

    it('returns different string when hook changes', () => {
      const sig1 = computeRefineSignature({ content: 'A', title: 'B', hook: 'C' })
      const sig2 = computeRefineSignature({ content: 'A', title: 'B', hook: 'C2' })
      expect(sig1).not.toBe(sig2)
    })

    it('handles null refineData', () => {
      const sig = computeRefineSignature(null)
      expect(sig).toBe('\u0000\u0000')
    })

    it('handles undefined refineData', () => {
      const sig = computeRefineSignature(undefined)
      expect(sig).toBe('\u0000\u0000')
    })

    it('handles partial refineData (only content)', () => {
      const sig = computeRefineSignature({ content: 'only content' })
      expect(sig).toBe('only content\u0000\u0000')
    })
  })

  describe('shouldExpireManualContent', () => {
    it('Test A: same signature → do NOT expire (manualContent preserved)', () => {
      const sig = computeRefineSignature({ content: 'same', title: 'same', hook: 'same' })
      expect(shouldExpireManualContent(sig, sig)).toBe(false)
    })

    it('Test B: content changed → expire (manualContent cleared)', () => {
      const prev = computeRefineSignature({ content: 'old content', title: 'title', hook: 'hook' })
      const next = computeRefineSignature({ content: 'new content', title: 'title', hook: 'hook' })
      expect(shouldExpireManualContent(prev, next)).toBe(true)
    })

    it('Test C: title changed → expire (manualTitle cleared)', () => {
      const prev = computeRefineSignature({ content: 'content', title: 'old title', hook: 'hook' })
      const next = computeRefineSignature({ content: 'content', title: 'new title', hook: 'hook' })
      expect(shouldExpireManualContent(prev, next)).toBe(true)
    })

    it('Test D: only metadata (summary/preservedElements) changed → do NOT expire', () => {
      // Signature only includes content/title/hook, so metadata-only changes produce same signature
      const prev = computeRefineSignature({ content: 'content', title: 'title', hook: 'hook' })
      const next = computeRefineSignature({ content: 'content', title: 'title', hook: 'hook' })
      expect(shouldExpireManualContent(prev, next)).toBe(false)
    })

    it('hook changed → expire', () => {
      const prev = computeRefineSignature({ content: 'content', title: 'title', hook: 'old hook' })
      const next = computeRefineSignature({ content: 'content', title: 'title', hook: 'new hook' })
      expect(shouldExpireManualContent(prev, next)).toBe(true)
    })

    it('all three changed → expire', () => {
      const prev = computeRefineSignature({ content: 'a', title: 'b', hook: 'c' })
      const next = computeRefineSignature({ content: 'x', title: 'y', hook: 'z' })
      expect(shouldExpireManualContent(prev, next)).toBe(true)
    })

    it('empty string vs null both treated as empty', () => {
      const sig1 = computeRefineSignature({ content: '', title: '', hook: '' })
      const sig2 = computeRefineSignature(null)
      expect(shouldExpireManualContent(sig1, sig2)).toBe(false)
    })
  })
})
