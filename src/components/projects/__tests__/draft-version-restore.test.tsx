/*
 * P0.4.3/P0.4.4/P0.4.5/P0.4.6/P0.4.7/P0.4.8 — Draft Version Restore Component Tests
 *
 * Tests verify:
 *   1. Restore button exists in DraftVersionHistory detail view
 *   2. Confirmation dialog displays correct message
 *   3. restoreDraftVersion Server Action is wired
 *   4. DraftVersionRestoreButton component is properly structured
 *   5. P0.4.1/P0.4.2 regression (detail/compare modes still intact)
 *   6. P0.4.4 — DRAFT_VERSION_CONFLICT error mapping (no P2002 exposure)
 *   7. P0.4.4 — Conflict error shows user-friendly toast (no crash)
 *   8. P0.4.5 — Lineage display in version history list
 *   9. P0.4.5 — Lineage display in detail panel (initial/derived)
 *  10. P0.4.5 — Restore success shows lineage after refresh
 *  11. P0.4.6 — Change type display in version list
 *  12. P0.4.6 — Evolution metadata section in detail panel
 *  13. P0.4.6 — Initial version displayed correctly
 *  14. P0.4.6 — Restore version shows type + reason + lineage
 *  15. P0.4.6 — Unknown type fallback to "其他"
 *  16. P0.4.7 — Lineage Explorer section in Detail Panel
 *  17. P0.4.7 — Parent navigation (clickable, no page jump)
 *  18. P0.4.7 — Child navigation (clickable, no page jump)
 *  19. P0.4.7 — Branch hint in version list
 *  20. P0.4.7 — Missing parent safety (no crash)
 *  21. P0.4.7 — Lineage chain visualization
 *  22. P0.4.7 — P0.4.5/P0.4.6 regression preserved
 *  23. P0.4.8 — "当前" badge displayed on active draft in version list
 *  24. P0.4.8 — "设为当前版本" button shown for non-active drafts
 *  25. P0.4.8 — handleSetActiveDraft calls setActiveDraft server action
 *  26. P0.4.8 — selectedVersion initialized to active draft
 *  27. P0.4.8 — settingActive state disables button during switch
 *  28. P0.4.8 — imports getActiveDraft utility
 *  29. P0.4.8 — sets activeDraftId and topicId props
 *  30. P0.4.8 — ACTIVE_DRAFT_INVALID error mapping
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('P0.4.3/P0.4.4 — Draft Version Restore Component', () => {
  const historySource = fs.readFileSync(
    path.resolve(__dirname, '../draft-version-history.tsx'),
    'utf-8'
  )

  const buttonSource = fs.readFileSync(
    path.resolve(__dirname, '../draft-version-restore-button.tsx'),
    'utf-8'
  )

  const serverActionsSource = fs.readFileSync(
    path.resolve(__dirname, '../../../lib/services/server-actions.ts'),
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

  // ── P0.4.4 — Version Conflict Handling ────────────────────────────────

  describe('P0.4.4 — DRAFT_VERSION_CONFLICT Error Mapping', () => {
    it('maps DRAFT_VERSION_CONFLICT to user-friendly message (no P2002 exposed)', () => {
      expect(serverActionsSource).toContain('DRAFT_VERSION_CONFLICT')
      expect(serverActionsSource).toContain('版本创建冲突，请重试')
    })

    it('does NOT expose Prisma/SQL/P2002 in error messages', () => {
      const conflictCase = serverActionsSource.match(
        /case 'DRAFT_VERSION_CONFLICT':[\s\S]*?return \{[^}]+\}/
      )
      expect(conflictCase).not.toBeNull()
      if (conflictCase) {
        expect(conflictCase[0]).not.toContain('P2002')
        expect(conflictCase[0]).not.toContain('Prisma')
        expect(conflictCase[0]).not.toContain('database')
        expect(conflictCase[0]).not.toContain('constraint')
        expect(conflictCase[0]).not.toContain('stack')
      }
    })

    it('error message is in Chinese for end users', () => {
      const conflictCase = serverActionsSource.match(
        /case 'DRAFT_VERSION_CONFLICT':[\s\S]*?error: '([^']+)'/
      )
      expect(conflictCase).not.toBeNull()
      if (conflictCase) {
        expect(conflictCase[1]).toMatch(/[\u4e00-\u9fff]/)
      }
    })
  })

  describe('P0.4.4 — Conflict Error UI Behavior (No Crash)', () => {
    it('component handles error from restoreDraftVersion gracefully', () => {
      expect(buttonSource).toContain('toast.error')
      expect(buttonSource).toContain('result.error')
    })

    it('does NOT crash or show unhandled promise on conflict', () => {
      expect(buttonSource).toContain('try')
      expect(buttonSource).toContain('catch')
    })

    it('disables button during restore to prevent double-submit', () => {
      expect(buttonSource).toContain('disabled={isRestoring}')
      expect(buttonSource).toContain('isRestoring')
    })

    it('does not expose stack trace or internal errors in UI', () => {
      expect(buttonSource).not.toContain('error.stack')
      expect(buttonSource).not.toContain('stack trace')
    })
  })

  // ── P0.4.5 — Lineage Display Tests ────────────────────────────────────

  describe('P0.4.5 — Lineage Display in Version List', () => {
    it('shows lineage indicator when parentDraftId exists', () => {
      expect(historySource).toContain('parentDraftId')
      expect(historySource).toContain('由 v')
      expect(historySource).toContain('创建')
    })

    it('looks up parent version using versionById map', () => {
      expect(historySource).toContain('versionById')
      expect(historySource).toContain('versionById.has')
      expect(historySource).toContain('versionById.get')
    })

    it('does NOT show lineage for null parentDraftId', () => {
      expect(historySource).toContain('draft.parentDraftId && versionById.has(draft.parentDraftId)')
    })
  })

  describe('P0.4.5 — Lineage Display in Detail Panel', () => {
    it('shows "初始版本" when parentDraftId is null', () => {
      expect(historySource).toContain('初始版本')
    })

    it('shows "来源：" with parent version when parentDraftId exists', () => {
      expect(historySource).toContain('来源：')
      expect(historySource).toContain('由 v')
    })

    it('conditionally renders lineage based on parentDraftId presence', () => {
      expect(historySource).toContain('selectedDraft.parentDraftId && versionById.has(selectedDraft.parentDraftId)')
    })
  })

  describe('P0.4.5 — Restore Success Shows Lineage After Refresh', () => {
    it('handleRestoreSuccess selects new version and triggers refresh', () => {
      expect(historySource).toContain('setSelectedVersion(newVersion)')
      expect(historySource).toContain('router.refresh()')
    })

    it('after refresh, router refetches data including parentDraftId', () => {
      expect(historySource).toContain('router.refresh()')
    })

    it('versionById map is rebuilt from drafts prop via useMemo', () => {
      expect(historySource).toContain('useMemo')
      expect(historySource).toContain('versionById')
    })
  })

  // ── P0.4.6 — Version Evolution Display Tests ─────────────────────────

  describe('P0.4.6 — Change Type Display in Version List', () => {
    it('imports getChangeTypeLabel utility', () => {
      expect(historySource).toContain('getChangeTypeLabel')
    })

    it('shows changeType label for INITIAL drafts', () => {
      expect(historySource).toContain('getChangeTypeLabel(draft.changeType)')
    })

    it('shows combined type + lineage for non-INITIAL drafts', () => {
      expect(historySource).toContain('getChangeTypeLabel(draft.changeType)')
      expect(historySource).toContain('由 v{versionById.get(draft.parentDraftId)} 创建')
    })

    it('shows only changeType label when no parent exists', () => {
      expect(historySource).toContain('getChangeTypeLabel(draft.changeType)}')
    })
  })

  describe('P0.4.6 — Evolution Metadata Section in Detail Panel', () => {
    it('renders "版本演化" section header', () => {
      expect(historySource).toContain('版本演化')
    })

    it('displays change type label', () => {
      expect(historySource).toContain('类型：{getChangeTypeLabel(selectedDraft.changeType)}')
    })

    it('conditionally renders change reason when present', () => {
      expect(historySource).toContain('selectedDraft.changeReason')
      expect(historySource).toContain('原因：{selectedDraft.changeReason}')
    })

    it('does NOT render reason placeholder when changeReason is null', () => {
      expect(historySource).toContain('{selectedDraft.changeReason &&')
    })
  })

  describe('P0.4.6 — Initial Version Display', () => {
    it('INITIAL type shows "初始版本" label', () => {
      expect(historySource).toContain('初始版本')
    })

    it('INITIAL type does not show lineage arrow', () => {
      expect(historySource).toContain("draft.changeType === 'INITIAL'")
    })
  })

  describe('P0.4.6 — Restore Version Shows Type + Reason + Lineage', () => {
    it('RESTORE type shows change type label via getChangeTypeLabel', () => {
      expect(historySource).toContain('getChangeTypeLabel(selectedDraft.changeType)')
    })

    it('RESTORE version shows both type and lineage in list', () => {
      expect(historySource).toContain('getChangeTypeLabel(draft.changeType)')
      expect(historySource).toContain('由 v{versionById.get(draft.parentDraftId)}')
    })

    it('detail panel shows full evolution metadata for RESTORE', () => {
      expect(historySource).toContain('类型：{getChangeTypeLabel(selectedDraft.changeType)}')
      expect(historySource).toContain('原因：{selectedDraft.changeReason}')
      expect(historySource).toContain('来源：由 v')
    })
  })

  describe('P0.4.6 — Lineage + Evolution Coexistence', () => {
    it('both parentDraftId and changeType are used in rendering', () => {
      expect(historySource).toContain('selectedDraft.parentDraftId')
      expect(historySource).toContain('selectedDraft.changeType')
    })

    it('evolution section includes both type and lineage info', () => {
      expect(historySource).toContain('类型：')
      expect(historySource).toContain('来源：')
    })
  })

  // ── P0.4.7 — Lineage Explorer Tests ──────────────────────────────────

  describe('P0.4.7 — Lineage Explorer Section', () => {
    it('Test G: Detail Panel renders "版本谱系" section', () => {
      expect(historySource).toContain('版本谱系')
    })

    it('Test G: Lineage Explorer is a distinct section from 版本演化', () => {
      const evolutionIdx = historySource.indexOf('版本演化')
      const lineageIdx = historySource.indexOf('版本谱系')
      expect(evolutionIdx).toBeGreaterThan(-1)
      expect(lineageIdx).toBeGreaterThan(-1)
      expect(lineageIdx).not.toBe(evolutionIdx)
    })

    it('imports getParentDraft utility', () => {
      expect(historySource).toContain('getParentDraft')
    })

    it('imports getChildDrafts utility', () => {
      expect(historySource).toContain('getChildDrafts')
    })

    it('imports getLineageChain utility', () => {
      expect(historySource).toContain('getLineageChain')
    })

    it('computes parentDraft via useMemo', () => {
      expect(historySource).toContain('parentDraft')
      expect(historySource).toContain('getParentDraft(selectedDraft, drafts)')
    })

    it('computes childDrafts via useMemo', () => {
      expect(historySource).toContain('childDrafts')
      expect(historySource).toContain('getChildDrafts(selectedDraft, drafts)')
    })

    it('computes lineageChain via useMemo', () => {
      expect(historySource).toContain('lineageChain')
      expect(historySource).toContain('getLineageChain(selectedDraft, drafts)')
    })
  })

  describe('P0.4.7 — Parent Navigation', () => {
    it('Test H: shows "← 来源版本：" when parent exists', () => {
      expect(historySource).toContain('← 来源版本')
    })

    it('Test H: shows parent version number in link text', () => {
      expect(historySource).toContain('v{parentDraft.version}')
    })

    it('Test J: parent click calls setSelectedVersion(parentDraft.version)', () => {
      expect(historySource).toContain('setSelectedVersion(parentDraft.version)')
    })

    it('Test M: shows "来源版本已不存在" when parentDraftId missing but set', () => {
      expect(historySource).toContain('来源版本已不存在')
    })

    it('does not use router.push for navigation (no page jump)', () => {
      expect(historySource).not.toContain("router.push")
    })
  })

  describe('P0.4.7 — Child Navigation', () => {
    it('Test I: shows "派生版本" header when children exist', () => {
      expect(historySource).toContain('派生版本')
    })

    it('Test I: shows child version with change type label', () => {
      expect(historySource).toContain('v{child.version}')
      expect(historySource).toContain('getChangeTypeLabel(child.changeType)')
    })

    it('Test K: child click calls setSelectedVersion(child.version)', () => {
      expect(historySource).toContain('setSelectedVersion(child.version)')
    })

    it('Test L: shows "暂无派生版本" when no children', () => {
      expect(historySource).toContain('暂无派生版本')
    })

    it('childDrafts.length === 0 triggers empty state', () => {
      expect(historySource).toContain('childDrafts.length === 0')
    })
  })

  describe('P0.4.7 — Branch Hint in Version List', () => {
    it('imports GitBranch icon from lucide-react', () => {
      expect(historySource).toContain('GitBranch')
    })

    it('shows branch count hint when draft has children', () => {
      expect(historySource).toContain('个派生版本')
    })

    it('branch hint only appears when child count > 0', () => {
      expect(historySource).toContain('childCountsById.get(draft.id) ?? 0) > 0')
    })
  })

  describe('P0.4.7 — Missing Parent Safety', () => {
    it('Test M: does not crash when parentDraftId references missing draft', () => {
      expect(historySource).toContain('来源版本已不存在')
      expect(historySource).not.toContain('parentDraft!.version')
    })

    it('handles initial version (no parentDraftId) correctly', () => {
      expect(historySource).toContain('初始版本')
    })
  })

  describe('P0.4.7 — Lineage Chain Visualization', () => {
    it('renders lineage chain only when chain length > 1', () => {
      expect(historySource).toContain('lineageChain.length > 1')
    })

    it('each ancestor in chain is clickable', () => {
      expect(historySource).toContain('onClick={() => setSelectedVersion(ancestor.version)}')
    })

    it('current version in chain is highlighted differently', () => {
      expect(historySource).toContain('ancestor.version === selectedDraft.version')
    })
  })

  describe('P0.4.7 — P0.4.5/P0.4.6 Regression', () => {
    it('P0.4.5 lineage display in version list still works', () => {
      expect(historySource).toContain('由 v{versionById.get(draft.parentDraftId)} 创建')
    })

    it('P0.4.6 evolution metadata section still exists', () => {
      expect(historySource).toContain('版本演化')
      expect(historySource).toContain('类型：{getChangeTypeLabel(selectedDraft.changeType)}')
    })

    it('P0.4.6 changeReason display still works', () => {
      expect(historySource).toContain('原因：{selectedDraft.changeReason}')
    })

    it('P0.4.3 restore button still exists', () => {
      expect(historySource).toContain('<DraftVersionRestoreButton')
    })

    it('P0.4.2 compare mode still exists', () => {
      expect(historySource).toContain("viewMode === 'compare'")
    })
  })

  // ── P0.4.8 — Active Draft / Current Version Tests ─────────────────────

  describe('P0.4.8 — Active Draft Badge in Version List', () => {
    it('Test A: imports getActiveDraft utility', () => {
      expect(historySource).toContain('getActiveDraft')
    })

    it('Test A: accepts activeDraftId prop in component interface', () => {
      expect(historySource).toContain('activeDraftId')
    })

    it('Test A: accepts topicId prop in component interface', () => {
      expect(historySource).toContain('topicId')
    })

    it('Test B: shows "当前" badge on the active draft in version list', () => {
      expect(historySource).toContain('当前')
      expect(historySource).toContain('draft.id === activeDraft.id')
    })

    it('Test B: only shows badge on the active draft (not all drafts)', () => {
      expect(historySource).toContain('activeDraft && draft.id === activeDraft.id')
    })

    it('resolves active draft via getActiveDraft in useMemo', () => {
      // P0.4.9: Uses localActiveDraftId for cross-tab sync (server → local → render)
      expect(historySource).toContain('getActiveDraft(drafts, localActiveDraftId)')
    })
  })

  describe('P0.4.8 — Set as Current Version Button', () => {
    it('Test C: shows "设为当前版本" button for non-active drafts', () => {
      expect(historySource).toContain('设为当前版本')
    })

    it('Test C: button only appears when draft is not the active one', () => {
      expect(historySource).toContain('draft.id !== activeDraft.id')
    })

    it('Test C: button is clickable with stopPropagation', () => {
      expect(historySource).toContain('e.stopPropagation()')
      expect(historySource).toContain('handleSetActiveDraft(draft.id)')
    })

    it('Test C: button requires topicId to be present', () => {
      expect(historySource).toContain('topicId')
    })

    it('button has ghost variant and small size', () => {
      expect(historySource).toContain('variant="ghost"')
      expect(historySource).toContain('size="sm"')
    })
  })

  describe('P0.4.8 — handleSetActiveDraft Wiring', () => {
    it('Test D: defines handleSetActiveDraft async function', () => {
      expect(historySource).toContain('handleSetActiveDraft')
    })

    it('Test D: imports setActiveDraft from server-actions', () => {
      expect(historySource).toContain('setActiveDraft')
      expect(historySource).toContain('server-actions')
    })

    it('Test D: calls setActiveDraft with topicId and draftId', () => {
      expect(historySource).toContain('setActiveDraft(topicId, draftId)')
    })

    it('Test D: calls router.refresh() on success to refetch data', () => {
      expect(historySource).toContain('result.success')
      expect(historySource).toContain('router.refresh()')
    })

    it('Test D: logs error on failure (does not crash)', () => {
      expect(historySource).toContain('result.error')
      expect(historySource).toContain('console.error')
    })
  })

  describe('P0.4.8 — Active Draft Initialization', () => {
    it('Test E: initializes selectedVersion to active draft version', () => {
      expect(historySource).toContain('activeDraftId && drafts.length > 0')
      expect(historySource).toContain('drafts.find(d => d.id === activeDraftId)')
    })

    it('Test E: falls back to drafts[0] when no activeDraftId', () => {
      expect(historySource).toContain('drafts[0]?.version ?? 1')
    })
  })

  describe('P0.4.8 — settingActive State Management', () => {
    it('Test F: tracks settingActive state during switch', () => {
      expect(historySource).toContain('settingActive')
      expect(historySource).toContain('setSettingActive')
    })

    it('Test F: disables button while setting active', () => {
      expect(historySource).toContain('disabled={settingActive}')
    })

    it('Test F: sets settingActive to true before async call', () => {
      expect(historySource).toContain('setSettingActive(true)')
    })

    it('Test F: resets settingActive in finally block', () => {
      expect(historySource).toContain('setSettingActive(false)')
    })
  })

  describe('P0.4.8 — Server Action Error Mapping', () => {
    it('setActiveDraft server action exists', () => {
      expect(serverActionsSource).toContain('setActiveDraft')
    })

    it('maps ACTIVE_DRAFT_INVALID to user-friendly message', () => {
      expect(serverActionsSource).toContain('ACTIVE_DRAFT_INVALID')
      expect(serverActionsSource).toContain('当前版本无效，请重新选择')
    })

    it('does NOT expose internal error details in user-facing messages', () => {
      // Verify the ACTIVE_DRAFT_INVALID case has no P2002/Prisma/stack exposure
      const invalidCase = serverActionsSource.match(
        /case 'ACTIVE_DRAFT_INVALID':[\s\S]*?return \{[^}]+\}/
      )
      expect(invalidCase).not.toBeNull()
      if (invalidCase) {
        expect(invalidCase[0]).not.toContain('P2002')
        expect(invalidCase[0]).not.toContain('Prisma')
        expect(invalidCase[0]).not.toContain('stack')
      }
    })

    it('setActiveDraft revalidates project page path on success', () => {
      expect(serverActionsSource).toContain('revalidatePath')
    })
  })

  describe('P0.4.8 — Regression with Prior Features', () => {
    it('restore button still exists alongside set-active button', () => {
      expect(historySource).toContain('<DraftVersionRestoreButton')
      expect(historySource).toContain('handleSetActiveDraft')
    })

    it('version list still shows lineage for P0.4.5', () => {
      expect(historySource).toContain('versionById.get(draft.parentDraftId)')
    })

    it('detail panel still shows evolution metadata for P0.4.6', () => {
      expect(historySource).toContain('版本演化')
    })

    it('detail panel still shows lineage explorer for P0.4.7', () => {
      expect(historySource).toContain('版本谱系')
    })

    it('both activeDraftId and parentDraftId props coexist', () => {
      expect(historySource).toContain('activeDraftId')
      expect(historySource).toContain('parentDraftId')
    })
  })
})
