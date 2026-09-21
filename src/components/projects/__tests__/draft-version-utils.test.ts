/**
 * P0.4.2 — Draft Version Compare Tests
 * Tests the pure diff algorithm and version selection logic.
 */

import { describe, it, expect } from 'vitest'
import { compareDraftVersions, getVersionLabel, getVersionBadgeVariant } from '../draft-version-utils'

describe('getVersionLabel', () => {
  it('returns FINAL for FINAL status', () => { expect(getVersionLabel(3, 'FINAL')).toBe('FINAL') })
  it('returns HUMANIZED for HUMANIZED status', () => { expect(getVersionLabel(2, 'HUMANIZED')).toBe('HUMANIZED') })
  it('returns ORIGINAL for version 1', () => { expect(getVersionLabel(1, 'DRAFT')).toBe('ORIGINAL') })
  it('returns DRAFT for other versions', () => { expect(getVersionLabel(2, 'DRAFT')).toBe('DRAFT'); expect(getVersionLabel(5, 'GENERATED')).toBe('DRAFT') })
})

describe('getVersionBadgeVariant', () => {
  it('returns default for FINAL status', () => { expect(getVersionBadgeVariant('FINAL')).toBe('default') })
  it('returns secondary for HUMANIZED status', () => { expect(getVersionBadgeVariant('HUMANIZED')).toBe('secondary') })
  it('returns outline for other statuses', () => { expect(getVersionBadgeVariant('DRAFT')).toBe('outline'); expect(getVersionBadgeVariant('GENERATED')).toBe('outline') })
})

describe('compareDraftVersions', () => {
  it('returns empty array for two empty strings', () => { expect(compareDraftVersions('', '')).toEqual([]) })
  it('returns all unchanged for identical content', () => { const c = '第一行\n第二行\n第三行'; expect(compareDraftVersions(c, c)).toEqual([{ type: 'unchanged', content: '第一行' }, { type: 'unchanged', content: '第二行' }, { type: 'unchanged', content: '第三行' }]) })
  it('detects removed line when A is longer', () => { expect(compareDraftVersions('第一行\n第二行\n第三行', '第一行\n第三行')).toEqual([{ type: 'unchanged', content: '第一行' }, { type: 'removed', content: '第二行' }, { type: 'unchanged', content: '第三行' }]) })
  it('detects added line when B is longer', () => { expect(compareDraftVersions('第一行\n第三行', '第一行\n第二行\n第三行')).toEqual([{ type: 'unchanged', content: '第一行' }, { type: 'added', content: '第二行' }, { type: 'unchanged', content: '第三行' }]) })
  it('detects insertion in the middle', () => { expect(compareDraftVersions('开头\n结尾', '开头\n新增\n结尾')).toEqual([{ type: 'unchanged', content: '开头' }, { type: 'added', content: '新增' }, { type: 'unchanged', content: '结尾' }]) })
  it('detects deletion from the middle', () => { expect(compareDraftVersions('开头\n删除\n结尾', '开头\n结尾')).toEqual([{ type: 'unchanged', content: '开头' }, { type: 'removed', content: '删除' }, { type: 'unchanged', content: '结尾' }]) })
  it('handles simultaneous add and remove', () => { expect(compareDraftVersions('保持\n旧A\n旧B\n结尾', '保持\n新A\n新B\n结尾')).toEqual([{ type: 'unchanged', content: '保持' }, { type: 'removed', content: '旧A' }, { type: 'removed', content: '旧B' }, { type: 'added', content: '新A' }, { type: 'added', content: '新B' }, { type: 'unchanged', content: '结尾' }]) })
  it('returns all removed when B is empty', () => { expect(compareDraftVersions('第一行\n第二行', '')).toEqual([{ type: 'removed', content: '第一行' }, { type: 'removed', content: '第二行' }]) })
  it('returns all added when A is empty', () => { expect(compareDraftVersions('', '第一行\n第二行')).toEqual([{ type: 'added', content: '第一行' }, { type: 'added', content: '第二行' }]) })
  it('detects single line modification', () => { expect(compareDraftVersions('Hello World', 'Hello Universe')).toEqual([{ type: 'removed', content: 'Hello World' }, { type: 'added', content: 'Hello Universe' }]) })
  it('detects addition at the beginning', () => { expect(compareDraftVersions('第二行\n第三行', '第一行\n第二行\n第三行')).toEqual([{ type: 'added', content: '第一行' }, { type: 'unchanged', content: '第二行' }, { type: 'unchanged', content: '第三行' }]) })
  it('detects addition at the end', () => { expect(compareDraftVersions('第一行\n第二行', '第一行\n第二行\n第三行')).toEqual([{ type: 'unchanged', content: '第一行' }, { type: 'unchanged', content: '第二行' }, { type: 'added', content: '第三行' }]) })
  it('handles completely different content', () => { expect(compareDraftVersions('AAA\nBBB', 'CCC\nDDD')).toEqual([{ type: 'removed', content: 'AAA' }, { type: 'removed', content: 'BBB' }, { type: 'added', content: 'CCC' }, { type: 'added', content: 'DDD' }]) })
  it('handles Chinese text', () => { expect(compareDraftVersions('你好世界', '你好新世界')).toEqual([{ type: 'removed', content: '你好世界' }, { type: 'added', content: '你好新世界' }]) })
  it('handles empty lines and trailing newline', () => {
    expect(compareDraftVersions('第一行\n\n第三行\n', '第一行\n第二行\n第三行')).toEqual([
      { type: 'unchanged', content: '第一行' },
      { type: 'removed', content: '' },
      { type: 'added', content: '第二行' },
      { type: 'unchanged', content: '第三行' },
    ])
  })
})
