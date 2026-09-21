/*
 * P0.4.2 — Draft Version Compare Tests
 *
 * Tests the pure diff algorithm and version selection logic.
 * These are pure function tests — no React rendering, no mocks needed.
 */

import { describe, it, expect } from 'vitest'
import { compareDraftVersions, getVersionLabel, getVersionBadgeVariant, type DiffLine } from '../draft-version-utils'

describe('getVersionLabel', () => {
  it('returns FINAL for FINAL status', () => {
    expect(getVersionLabel(3, 'FINAL')).toBe('FINAL')
  })
})
