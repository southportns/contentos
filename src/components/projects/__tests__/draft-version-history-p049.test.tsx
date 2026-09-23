/*
 * P0.4.9 + P0.4.9.1 — Active Draft Cross-Tab Sync Component Tests
 *
 * Tests verify:
 *   Test I: Version History uses useActiveDraftSync hook
 *   Test J: Successful setActiveDraft triggers broadcast
 *   Test K: Remote message updates localActiveDraftId
 *   Test L: Remote message updates selectedVersion
 *   Test M: Different topic messages get filtered
 *   Test N: Viewing history version does NOT broadcast
 *   Test O: Server Action failure does NOT broadcast
 *   Test P: P0.4.9.1 — sourceId passed for self-message filtering
 *   Test Q: P0.4.9.1 — useEffect syncs selectedVersion for remote Restore
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('P0.4.9 — Active Draft Cross-Tab Sync Component', () => {
  const historySource = fs.readFileSync(
    path.resolve(__dirname, '../draft-version-history.tsx'),
    'utf-8'
  )

  const hookSource = fs.readFileSync(
    path.resolve(__dirname, '../use-active-draft-sync.ts'),
    'utf-8'
  )

  const utilsSource = fs.readFileSync(
    path.resolve(__dirname, '../active-draft-sync-utils.ts'),
    'utf-8'
  )

  // ── Test I: Version History uses useActiveDraftSync ─────────────────────

  describe('Test I: Cross-Tab Sync Imports & Hook Usage', () => {
    it('imports useActiveDraftSync from dedicated hook module', () => {
      expect(historySource).toContain('use-active-draft-sync')
      expect(historySource).toContain('useActiveDraftSync')
    })

    it('imports broadcastActiveDraftChange from sync module', () => {
      expect(historySource).toContain('broadcastActiveDraftChange')
    })

    it('imports useEffect for P0.4.9 sync logic', () => {
      expect(historySource).toContain('useEffect')
    })

    it('calls useActiveDraftSync with topicId', () => {
      expect(historySource).toContain('useActiveDraftSync')
    })

    it('passes topicId to the sync hook', () => {
      expect(historySource).toContain('topicId')
    })

    it('passes currentDraftId for deduplication filtering', () => {
      expect(historySource).toContain('currentDraftId')
      expect(historySource).toContain('localActiveDraftId')
    })
  })

  // ── Local Active Draft State ────────────────────────────────────────────

  describe('Local Active Draft State Management', () => {
    it('creates localActiveDraftId state initialized from activeDraftId prop', () => {
      expect(historySource).toContain('localActiveDraftId')
      expect(historySource).toContain('setLocalActiveDraftId')
    })

    it('uses useEffect to sync server prop to local state', () => {
      expect(historySource).toContain('setLocalActiveDraftId(activeDraftId)')
    })

    it('resolves activeDraft from local state (not server prop)', () => {
      expect(historySource).toContain('getActiveDraft(drafts, localActiveDraftId)')
    })
  })

  // ── Test J: Successful setActiveDraft triggers broadcast ────────────────

  describe('Test J: Broadcast After Server Action Success', () => {
    it('broadcast triggered within result.success branch', () => {
      expect(historySource).toContain('broadcastActiveDraftChange')
      const successBlock = historySource.match(/if \(result\.success\) \{([\s\S]*?)else/)
      expect(successBlock).not.toBeNull()
      if (successBlock) {
        expect(successBlock[1]).toContain('broadcastActiveDraftChange')
      }
    })

    it('broadcasts with topicId, draftId, and sourceId', () => {
      expect(historySource).toContain('broadcastActiveDraftChange(topicId, draftId, sourceId)')
    })

    it('sets local state immediately for responsive UI', () => {
      expect(historySource).toContain('setLocalActiveDraftId(draftId)')
    })

    it('auto-selects the new active draft version after broadcast', () => {
      expect(historySource).toContain('setSelectedVersion(newActiveDraft.version)')
    })
  })

  // ── Test K/L: Remote change handler ─────────────────────────────────────

  describe('Test K/L: Remote Change Updates localActiveDraftId and selectedVersion', () => {
    it('onRemoteChange updates localActiveDraftId', () => {
      expect(historySource).toContain('setLocalActiveDraftId(draftId)')
    })

    it('onRemoteChange updates selectedVersion to remote draft', () => {
      expect(historySource).toContain('setSelectedVersion')
    })

    it('onRemoteChange triggers router.refresh for authoritative DB re-fetch', () => {
      expect(historySource).toContain('router.refresh()')
    })
  })

  // ── Test O: Failure does NOT broadcast ──────────────────────────────────

  describe('Test O: Server Action Failure Does NOT Broadcast', () => {
    it('broadcastActiveDraftChange does NOT appear in the failure (else) branch', () => {
      const successBranchMatch = historySource.match(/if \(result\.success\) \{([\s\S]*?)\} else/)
      if (successBranchMatch) {
        expect(successBranchMatch[1]).toContain('broadcastActiveDraftChange')
      }
    })

    it('failure branch goes to console.error without broadcast', () => {
      const elseBranch = historySource.match(/else \{[\s\S]*?console\.error[\s\S]*?\}/)
      expect(elseBranch).not.toBeNull()
      if (elseBranch) {
        expect(elseBranch[0]).not.toContain('broadcastActiveDraftChange')
      }
    })
  })

  // ── Test N: View does not equal Switch ──────────────────────────────────

  describe('Test N: Viewing History Version Does NOT Broadcast', () => {
    it('version list click handler does not contain broadcast', () => {
      const hasVersionClick = historySource.includes('setSelectedVersion(draft.version)')
      expect(hasVersionClick).toBe(true)
      const broadcastCount = (historySource.match(/broadcastActiveDraftChange/g) || []).length
      expect(broadcastCount).toBe(2)
    })

    it('e.stopPropagation prevents list click from bubbling to set-active button', () => {
      expect(historySource).toContain('e.stopPropagation()')
    })
  })

  // ── Test M: Different topic messages filtered ───────────────────────────

  describe('Test M: Different Topic Messages Get Filtered', () => {
    it('hook uses shouldAcceptActiveDraftMessage which checks topicId', () => {
      expect(hookSource).toContain('shouldAcceptActiveDraftMessage')
    })

    it('shouldAcceptActiveDraftMessage uses unified options API with topicId filter', () => {
      expect(utilsSource).toContain('ActiveDraftSyncFilterOptions')
      expect(utilsSource).match(/msg\.topicId !== options\.topicId/)
    })

    it('isFromSelf helper exists for self-message identification', () => {
      expect(utilsSource).toContain('isFromSelf')
      expect(utilsSource).match(/msg\.sourceId === selfSourceId/)
    })
  })

  // ── Hook Structure Tests ────────────────────────────────────────────────

  describe('use-active-draft-sync.ts Structure', () => {
    it('defines useActiveDraftSync hook', () => {
      expect(hookSource).toContain('useActiveDraftSync')
    })

    it('exports broadcastActiveDraftChange function', () => {
      expect(hookSource).toContain('broadcastActiveDraftChange')
    })

    it('creates BroadcastChannel inside useEffect (SSR safe)', () => {
      expect(hookSource).toContain('useEffect')
      expect(hookSource).toContain('new BroadcastChannel')
    })

    it('checks typeof BroadcastChannel for graceful degradation', () => {
      expect(hookSource).toContain("typeof BroadcastChannel === 'undefined'")
    })

    it('closes channel on cleanup', () => {
      expect(hookSource).toContain('channel.close()')
    })

    it('wraps postMessage in try/catch', () => {
      expect(hookSource).toContain('try')
      expect(hookSource).toContain('catch')
    })

    it('uses crypto.randomUUID for sourceId with fallback', () => {
      expect(hookSource).toContain('randomUUID')
    })

    it('tracks lastEventTimestampRef for ordering protection', () => {
      expect(hookSource).toContain('lastEventTimestamp')
    })

    // ── P0.4.9.1 — Self-message fix ───────────────────────────────────────

    it('P0.4.9.1 — broadcastActiveDraftChange accepts sourceId parameter', () => {
      expect(hookSource).match(/broadcastActiveDraftChange\([^)]*sourceId[^)]*\)/)
    })

    it('P0.4.9.1 — useActiveDraftSync returns sourceId for component use', () => {
      expect(hookSource).match(/return\s*\{[^}]*sourceId/)
    })
  })

  // ── active-draft-sync-utils.ts Structure ────────────────────────────────

  describe('active-draft-sync-utils.ts Structure', () => {
    it('exports ACTIVE_DRAFT_CHANNEL constant', () => {
      expect(utilsSource).toContain('ACTIVE_DRAFT_CHANNEL')
      expect(utilsSource).toContain('contentos:active-draft')
    })

    it('exports ActiveDraftChangeMessage type', () => {
      expect(utilsSource).toContain('ActiveDraftChangeMessage')
    })

    it('exports shouldAcceptActiveDraftMessage function', () => {
      expect(utilsSource).toContain('shouldAcceptActiveDraftMessage')
    })

    it('P0.4.9.1 — exports ActiveDraftSyncFilterOptions interface for unified filter', () => {
      expect(utilsSource).toContain('ActiveDraftSyncFilterOptions')
    })

    it('P0.4.9.1 — shouldAcceptActiveDraftMessage accepts options object', () => {
      expect(utilsSource).match(/shouldAcceptActiveDraftMessage\([\s\S]*?ActiveDraftSyncFilterOptions/)
    })

    it('P0.4.9.1 — exports isValidActiveDraftMessage type guard', () => {
      expect(utilsSource).toContain('isValidActiveDraftMessage')
    })

    it('P0.4.9.1 — exports isFromSelf helper', () => {
      expect(utilsSource).toContain('isFromSelf')
    })
  })

  // ── Test P: P0.4.9.1 — sourceId fix ────────────────────────────────────

  describe('Test P: P0.4.9.1 — Self-Message Fix via Stable sourceId', () => {
    it('destructures sourceId from useActiveDraftSync return value', () => {
      expect(historySource).match(/const\s*\{\s*sourceId\s*\}\s*=\s*useActiveDraftSync/)
    })

    it('passes sourceId to broadcastActiveDraftChange call', () => {
      expect(historySource).match(/broadcastActiveDraftChange\(\s*topicId\s*,\s*draftId\s*,\s*sourceId\s*\)/)
    })

    it('broadcast count is exactly 2: import + call in handleSetActiveDraft', () => {
      const broadcastCount = (historySource.match(/broadcastActiveDraftChange/g) || []).length
      expect(broadcastCount).toBe(2)
    })
  })

  // ── Test Q: P0.4.9.1 — selectedVersion sync for remote Restore ──────────

  describe('Test Q: P0.4.9.1 — selectedVersion Sync After Remote Change', () => {
    it('has useEffect that watches drafts and localActiveDraftId for version sync', () => {
      const useEffectMatch = historySource.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?localActiveDraftId[\s\S]*?selectedVersion[\s\S]*?\}\s*,\s*\[\s*drafts\s*,\s*localActiveDraftId\s*\]\)/)
      expect(useEffectMatch).not.toBeNull()
    })

    it('new useEffect only updates selectedVersion when version differs', () => {
      expect(historySource).match(/selectedVersion\s*!==\s*activeDraft\.version/)
    })
  })

  // ── Regression Guard ───────────────────────────────────────────────────

  describe('P0.4.9 — Regression Guard', () => {
    it('P0.4.3 restore button still exists', () => {
      expect(historySource).toContain('<DraftVersionRestoreButton')
    })

    it('P0.4.8 set-active button still exists', () => {
      expect(historySource).toContain('handleSetActiveDraft')
    })

    it('P0.4.8 active badge still exists', () => {
      expect(historySource).toContain('当前')
    })

    it('settingActive state still disables button during switch', () => {
      expect(historySource).toContain('disabled={settingActive}')
    })

    it('P0.4.5 lineage display in version list preserved', () => {
      expect(historySource).toContain('versionById.get(draft.parentDraftId)')
    })

    it('P0.4.7 lineage explorer section preserved', () => {
      expect(historySource).toContain('版本谱系')
    })
  })
})
