/*
 * P0.4.6 — Draft Version Evolution Utility Tests
 *
 * Tests verify:
 *   1. getChangeTypeLabel maps all known types correctly
 *   2. Unknown types fall back to "其他" (no crash)
 *   3. All 7 change types produce expected Chinese labels
 */

import { describe, it, expect } from 'vitest'
import { getChangeTypeLabel } from '../draft-version-utils'

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
