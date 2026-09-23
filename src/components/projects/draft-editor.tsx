'use client'

/**
 * P0.5.1 — Active Draft Editor
 *
 * A simple, focused editor for the active draft. Supports title editing,
 * content editing, and save functionality with proper dirty state management
 * and cross-tab conflict detection.
 *
 * Core rules:
 * - Editor ALWAYS binds to the active draft (never drafts[0])
 * - Save creates a new MANUAL_EDIT draft (never overwrites old versions)
 * - Dirty state prevents silent content loss on remote active draft change
 * - Broadcast notification after successful save
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Draft } from '@/generated/prisma'
import { getChangeTypeLabel } from './draft-version-utils'
import { useActiveDraftSync, broadcastActiveDraftChange } from './use-active-draft-sync'

// ── Types ────────────────────────────────────────────────────────────────

interface DraftEditorProps {
  /** The current active draft — editor binds to this */
  activeDraft: Draft
  /** All drafts in the topic (for version context) */
  allDrafts: Draft[]
  /** Topic ID for broadcast and server action */
  topicId: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface RemoteConflict {
  detected: boolean
  remoteDraftId: string
}

// ── Component ────────────────────────────────────────────────────────────

export function DraftEditor({ activeDraft, allDrafts, topicId }: DraftEditorProps) {
  const router = useRouter()

  // Editor state
  const [title, setTitle] = useState(activeDraft.title ?? '')
  const [content, setContent] = useState(activeDraft.content)
  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [remoteConflict, setRemoteConflict] = useState<RemoteConflict>({ detected: false, remoteDraftId: '' })

  // Refs for initial values (stable across renders)
  const initialTitleRef = useRef(activeDraft.title ?? '')
  const initialContentRef = useRef(activeDraft.content)

  // Cross-tab sync
  const { sourceId } = useActiveDraftSync({
    topicId,
    currentDraftId: activeDraft.id,
    onRemoteChange: (draftId) => {
      // P0.5.1 — Dirty state protection
      if (isDirty) {
        // User has unsaved changes — DO NOT silently overwrite
        setRemoteConflict({ detected: true, remoteDraftId: draftId })
        return
      }
      // Clean editor — safe to refresh
      router.refresh()
    },
  })

  // Draft version lookup for display
  const draftVersionMap = useRef(new Map<string, number>())
  // Compute parent version from the map (stored in ref but read via useMemo key pattern)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const map = new Map<string, number>()
    for (const d of allDrafts) {
      map.set(d.id, d.version)
    }
    draftVersionMap.current = map
  }, [allDrafts])

  // Sync editor when active draft changes from props (e.g., after router.refresh())
  // Only sync if NOT dirty to avoid overwriting user's current work
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!isDirty) {
      setTitle(activeDraft.title ?? '')
      setContent(activeDraft.content)
      initialTitleRef.current = activeDraft.title ?? ''
      initialContentRef.current = activeDraft.content
      setSaveStatus('idle')
      setErrorMessage(null)
      setRemoteConflict({ detected: false, remoteDraftId: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDraft.id])

  // Track dirty state
  useEffect(() => {
    const titleChanged = title !== initialTitleRef.current
    const contentChanged = content !== initialContentRef.current
    setIsDirty(titleChanged || contentChanged)
  }, [title, content])

  // Handlers
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    setErrorMessage(null)
  }, [])

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    setErrorMessage(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!isDirty || saveStatus === 'saving') return

    setSaveStatus('saving')
    setErrorMessage(null)

    try {
      const { saveManualDraftEdit } = await import('@/lib/services/server-actions')
      const result = await saveManualDraftEdit(
        activeDraft.id,
        content,
        title || null,
      )

      if (result.success && result.draft) {
        setSaveStatus('saved')
        // Update initial refs to new baseline
        initialTitleRef.current = title
        initialContentRef.current = content
        setIsDirty(false)
        // Broadcast to other tabs AFTER successful save
        broadcastActiveDraftChange(topicId, result.draft.id, sourceId)
        // Refresh to update props (new active draft)
        router.refresh()
        // Reset status after short delay
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
        setErrorMessage(result.error ?? '保存失败，请稍后重试')
      }
    } catch {
      setSaveStatus('error')
      setErrorMessage('保存失败，请稍后重试')
    }
  }, [activeDraft.id, content, title, isDirty, saveStatus, topicId, sourceId, router])

  const handleDismissConflict = useCallback(() => {
    setRemoteConflict({ detected: false, remoteDraftId: '' })
  }, [])

  // P0.5.1 Fix — "刷新当前版本" must discard local changes, restore baseline from props.
  // User explicitly chose to abandon unsaved work → load remote active draft.
  const handleRefreshFromRemote = useCallback(() => {
    // 1. Clear dirty state
    // 2. Clear local error
    // 3. Clear conflict
    // 4. Restore editor to current props baseline
    // 5. Then router.refresh() to pick up latest server data
    setTitle(activeDraft.title ?? '')
    setContent(activeDraft.content)
    initialTitleRef.current = activeDraft.title ?? ''
    initialContentRef.current = activeDraft.content
    setIsDirty(false)
    setErrorMessage(null)
    setRemoteConflict({ detected: false, remoteDraftId: '' })
    router.refresh()
  }, [router, activeDraft])

  // Compute parent version info (useMemo reads ref initial value; subsequent updates via useEffect re-render)
  const parentVersion = useMemo(
    () => activeDraft.parentDraftId
      ? Array.from(allDrafts).find(d => d.id === activeDraft.parentDraftId)?.version ?? null
      : null,
    [activeDraft.parentDraftId, allDrafts],
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            编辑内容
            {isDirty && (
              <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                (未保存)
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              v{activeDraft.version}
            </span>
            <span className="text-xs text-muted-foreground">
              {getChangeTypeLabel(activeDraft.changeType)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Remote conflict warning */}
        {remoteConflict.detected && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 flex items-start gap-2">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                当前版本已在其他标签页发生变化，请刷新后继续编辑。
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshFromRemote}
              className="shrink-0 text-amber-700 hover:text-amber-800 dark:text-amber-300"
            >
              <RotateCcw className="size-3" />
              刷新当前版本
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissConflict}
              className="shrink-0 text-amber-700 hover:text-amber-800 dark:text-amber-300"
            >
              忽略
            </Button>
          </div>
        )}

        {/* Version context */}
        <div className="rounded-lg bg-muted/30 p-3 space-y-1">
          <div className="text-xs text-muted-foreground">
            <span>版本 v{activeDraft.version}</span>
            {parentVersion != null && (
              <span> · 来源：v{parentVersion}</span>
            )}
            {activeDraft.changeReason && (
              <span> · {activeDraft.changeReason}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {activeDraft.wordCount ?? content.length} 字
          </div>
        </div>

        {/* Title editor */}
        <div className="space-y-1.5">
          <label htmlFor="draft-title" className="text-sm font-medium">
            标题
          </label>
          <Input
            id="draft-title"
            value={title}
            onChange={handleTitleChange}
            placeholder="输入标题..."
            className="text-sm"
          />
        </div>

        {/* Content editor */}
        <div className="space-y-1.5">
          <label htmlFor="draft-content" className="text-sm font-medium">
            正文
          </label>
          <textarea
            id="draft-content"
            value={content}
            onChange={handleContentChange}
            placeholder="输入内容..."
            rows={12}
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
              'ring-offset-background placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'resize-y min-h-[200px]',
            )}
          />
        </div>

        {/* Error message */}
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}

        {/* Save button */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">
            {saveStatus === 'saved' && (
              <span className="text-green-600">已保存</span>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={!isDirty || saveStatus === 'saving'}
            className="gap-1.5"
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {saveStatus === 'saving' ? '保存中...' : '保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
