'use client'

/**
 * P0.4.9 — Active Draft Cross-Tab Sync Hook
 *
 * Provides real-time synchronization of active draft state across multiple
 * browser tabs viewing the same topic, using BroadcastChannel.
 *
 * SOURCE OF TRUTH: Database (Topic.activeDraftId via Server Action)
 * THIS HOOK: Notification mechanism ONLY — never the authoritative source.
 *
 * Flow:
 *   Tab A: User clicks "设为当前版本"
 *     → Server Action (DB write)
 *     → broadcastActiveDraftChange()
 *     → Tab B receives message
 *     → Tab B calls onRemoteChange(draftId)
 *     → Tab B calls router.refresh()
 *     → Tab B reads authoritative state from DB
 *
 * SSR Safety: All BroadcastChannel access is inside useEffect. Hook returns
 * safely (no-ops) when BroadcastChannel is unavailable (SSR or old browser).
 */

import { useEffect, useRef, useCallback } from 'react'
import {
  ACTIVE_DRAFT_CHANNEL,
  type ActiveDraftChangeMessage,
  shouldAcceptActiveDraftMessage,
} from './active-draft-sync-utils'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseActiveDraftSyncOptions {
  /** The topic ID to filter messages for. If undefined, sync is disabled. */
  topicId?: string
  /** The current active draft ID (for deduplication filtering). */
  currentDraftId?: string | null
  /** Called when a valid remote change is received. */
  onRemoteChange: (draftId: string) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0.4.9 — Subscribe to active draft changes from other tabs.
 *
 * @param options - Configuration options
 *
 * SSR safe: If BroadcastChannel is undefined (SSR or unsupported), hook no-ops.
 * Cleanup: channel.close() and removeListener on unmount.
 */
export function useActiveDraftSync({
  topicId,
  currentDraftId,
  onRemoteChange,
}: UseActiveDraftSyncOptions): void {
  // Generate a unique sourceId for this tab instance
  const sourceIdRef = useRef<string>(generateSourceId())
  // Track last processed event timestamp (monotonic within this tab)
  const lastEventTimestampRef = useRef<number>(0)
  // Keep onRemoteChange in a ref to avoid re-subscribing on every render
  const onRemoteChangeRef = useRef(onRemoteChange)
  onRemoteChangeRef.current = onRemoteChange

  useEffect(() => {
    // SSR safety: BroadcastChannel may not exist
    if (typeof BroadcastChannel === 'undefined') {
      return
    }

    // No topicId means sync is disabled
    if (!topicId) {
      return
    }

    let channel: BroadcastChannel | null = null

    try {
      channel = new BroadcastChannel(ACTIVE_DRAFT_CHANNEL)

      channel.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data

        // Apply all filtering via pure utility functions
        const shouldAccept = shouldAcceptActiveDraftMessage(message, {
          topicId,
          sourceId: sourceIdRef.current,
          lastEventTimestamp: lastEventTimestampRef.current,
          currentDraftId,
        })

        if (!shouldAccept) return

        // Update last processed timestamp
        lastEventTimestampRef.current = message.timestamp

        // Notify the component (which will call router.refresh() for DB re-fetch)
        onRemoteChangeRef.current(message.draftId)
      }
    } catch (error) {
      // BroadcastChannel creation or listening failed — degrade gracefully
      console.error('[P0.4.9] BroadcastChannel setup failed:', error)
      channel = null
    }

    return () => {
      // Cleanup: prevent memory leaks
      if (channel) {
        try {
          channel.close()
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }, [topicId, currentDraftId])
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0.4.9 — Broadcast an active draft change to other tabs.
 *
 * Should ONLY be called AFTER a successful Server Action that updated the DB.
 * Never broadcast on failure — DB is the source of truth.
 *
 * Failure handling: All operations wrapped in try/catch. Broadcast failure
 * must NOT throw or interfere with the business logic.
 *
 * @param topicId - The topic whose active draft changed
 * @param draftId - The new active draft ID
 */
export function broadcastActiveDraftChange(
  topicId: string,
  draftId: string,
): void {
  // SSR safety
  if (typeof BroadcastChannel === 'undefined') {
    return
  }

  try {
    const channel = new BroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const message: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId,
      draftId,
      sourceId: generateSourceId(),
      timestamp: Date.now(),
    }

    channel.postMessage(message)

    // Close after sending (one-shot channel for broadcast)
    // Note: postMessage is async; closing immediately may cause issues in some browsers.
    // Using setTimeout to ensure delivery before close.
    setTimeout(() => {
      try {
        channel.close()
      } catch {
        // Ignore cleanup errors
      }
    }, 50)
  } catch (error) {
    // Broadcast failure must NOT throw — it's a notification, not the source of truth
    console.error('[P0.4.9] broadcastActiveDraftChange failed:', error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a unique source identifier for this tab instance.
 * Uses crypto.randomUUID() when available, falls back to random string.
 */
function generateSourceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to fallback
  }
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
