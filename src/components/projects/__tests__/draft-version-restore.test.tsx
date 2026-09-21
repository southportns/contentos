/*
 * P0.4.3 — Draft Version Restore Component Tests
 *
 * Tests verify:
 *   1. Restore button exists in DraftVersionHistory detail view
 *   2. Confirmation dialog displays correct message
 *   3. restoreDraftVersion Server Action is wired
 *   4. DraftVersionRestoreButton component is properly structured
 *   5. P0.4.1/P0.4.2 regression (detail/compare modes still intact)
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('P0.4.3 — Draft Version Restore Component', () => {
  const historySource = fs.readFileSync(
    path.resolve(__dirname, '../draft-version-history.tsx'),
    'utf-8'
  )

  const buttonSource = fs.readFileSync(
    path.resolve(__dirname, '../draft-version-restore-button.tsx'),
    'utf-8'
  )

  describe('Restore Button in Detail View', () => {
    it('imports DraftVersionRestoreButton component', () => {
      expect(historySource).toContain("import { DraftVersionRestoreButton } from './draft-version-restore-button'")
    })

    it('renders DraftVersionRestoreButton in detail view', () => {
      expect(historySource).toContain('<DraftVersionRestoreButton')
    })

    it('passes draftId and version props', () => {
      expect(historySource).toContain('draftId={selectedDraft.id}')
      expect(historySource).toContain('version={selectedDraft.version}')
    })

    it('handles restore success to refresh and auto-select', () => {
      expect(historySource).toContain('onRestoreSuccess={handleRestoreSuccess}')
      expect(historySource).toContain('router.refresh()')
    })

    it('uses Separator before restore button', () => {
      expect(historySource).toContain('<Separator')
    })
  })

  describe('Restore Button Component Structure', () => {
    it('has "恢复此版本" button text', () => {
      expect(buttonSource).toContain('恢复此版本')
    })

    it('uses rotate icon (RotateCcw)', () => {
      expect(buttonSource).toContain('RotateCcw')
    })

    it('opens Dialog on button click', () => {
      expect(buttonSource).toContain('Dialog')
      expect(buttonSource).toContain('setIsDialogOpen(true)')
    })

    it('shows confirmation dialog with version number', () => {
      expect(buttonSource).toContain('恢复版本 v{version}？')
    })

    it('clarifies that a new version will be created', () => {
      expect(buttonSource).toContain('创建一个新的 Draft 版本')
    })

    it('clarifies that old versions will NOT be deleted or modified', () => {
      expect(buttonSource).toContain('原有版本不会被删除或修改')
    })

    it('has cancel button', () => {
      expect(buttonSource).toContain('取消')
    })

    it('has confirm button labeled "创建新版本"', () => {
      expect(buttonSource).toContain('创建新版本')
    })

    it('calls restoreDraftVersion server action with draftId', () => {
      expect(buttonSource).toContain('restoreDraftVersion')
      expect(buttonSource).toContain('draftId')
    })

    it('shows success toast on successful restore', () => {
      expect(buttonSource).toContain('toast.success')
      expect(buttonSource).toContain('已创建新版本')
    })

    it('shows error toast on failed restore', () => {
      expect(buttonSource).toContain('toast.error')
    })

    it('passes new version to onRestoreSuccess callback', () => {
      expect(buttonSource).toContain('onRestoreSuccess?.')
    })

    it('disables confirm button while restoring', () => {
      expect(buttonSource).toContain('isRestoring')
      expect(buttonSource).toContain('disabled={isRestoring}')
    })

    it('shows loading spinner during restore', () => {
      expect(buttonSource).toContain('Loader2')
      expect(buttonSource).toContain('animate-spin')
    })
  })

  describe('P0.4.1 Detail Mode Regression', () => {
    it('evaluation section still exists', () => {
      expect(historySource).toContain('evaluation.overallScore')
    })

    it('strategy evaluation section still exists', () => {
      expect(historySource).toContain('strategyEvaluation.overallScore')
    })

    it('humanization section still exists', () => {
      expect(historySource).toContain('humanization.adopted')
    })

    it('empty state fallback still exists', () => {
      expect(historySource).toContain('暂无分析数据')
    })
  })

  describe('P0.4.2 Compare Mode Regression', () => {
    it('still has compare mode toggle', () => {
      expect(historySource).toContain("viewMode === 'compare'")
    })

    it('DraftVersionCompare component still imported', () => {
      expect(historySource).toContain("import { DraftVersionCompare } from './draft-version-compare'")
    })

    it('canCompare still gated on drafts.length >= 2', () => {
      expect(historySource).toContain('drafts.length >= 2')
    })

    it('compare button still exists', () => {
      expect(historySource).toContain("setViewMode('compare')")
    })
  })

  describe('Auto-select New Version', () => {
    it('directly sets selected version in handleRestoreSuccess', () => {
      expect(historySource).toContain('setSelectedVersion(newVersion)')
    })

    it('handleRestoreSuccess calls router.refresh for data refetch', () => {
      expect(historySource).toContain('router.refresh()')
    })

    it('router imported for refresh capability', () => {
      expect(historySource).toContain("import { useRouter } from 'next/navigation'")
      expect(historySource).toContain('router.refresh()')
    })
  })
})
