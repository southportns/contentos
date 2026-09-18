import { describe, it, expect } from 'vitest'
import {
  getNextDraftVersion,
  isFirstSave,
  getOriginalDraftVersion,
  getRefinedDraftVersion,
} from '../draft-version'

describe('draft-version', () => {
  describe('getNextDraftVersion', () => {
    it('returns 1 when no existing versions', () => {
      expect(getNextDraftVersion([])).toBe(1)
    })

    it('returns 2 when [1] exists', () => {
      expect(getNextDraftVersion([1])).toBe(2)
    })

    it('returns 3 when [1, 2] exist', () => {
      expect(getNextDraftVersion([1, 2])).toBe(3)
    })

    it('returns 4 when [1, 3] exist (gap in versions)', () => {
      expect(getNextDraftVersion([1, 3])).toBe(4)
    })

    it('returns max + 1 regardless of order', () => {
      expect(getNextDraftVersion([3, 1, 2])).toBe(4)
    })

    it('handles large version numbers', () => {
      expect(getNextDraftVersion([10, 20, 15])).toBe(21)
    })

    it('handles single non-1 version', () => {
      expect(getNextDraftVersion([5])).toBe(6)
    })
  })

  describe('isFirstSave', () => {
    it('returns true when 0 drafts', () => {
      expect(isFirstSave(0)).toBe(true)
    })

    it('returns false when 1+ drafts', () => {
      expect(isFirstSave(1)).toBe(false)
      expect(isFirstSave(3)).toBe(false)
    })
  })

  describe('getOriginalDraftVersion', () => {
    it('always returns 1', () => {
      expect(getOriginalDraftVersion()).toBe(1)
    })
  })

  describe('getRefinedDraftVersion', () => {
    it('always returns 2', () => {
      expect(getRefinedDraftVersion()).toBe(2)
    })
  })
})
