import { useEffect, useRef } from 'react'
import {
  ACTIVE_DRAFT_CHANNEL,
  generateSourceId,
  isValidActiveDraftMessage,
  shouldAcceptActiveDraftMessage,
  ActiveDraftChangeMessage,
} from './active-draft-sync-utils'

export interface UseActiveDraftSyncOptions {
  topicId: string
  currentDraftId: string | null | undefined
  onRemoteChange: (draftId: string) => void
}

export function useActiveDraftSync({ topicId, currentDraftId, onRemoteChange }: UseActiveDraftSyncOptions): void {
  const sourceIdRef = useRef<string>(generateSourceId())
  const lastEventTimestampRef = useRef<number>(0)
  const onRemoteChangeRef = useRef(onRemoteChange)
  const topicIdRef = useRef(topicId)
  const currentDraftIdRef = useRef(currentDraftId)

  onRemoteChangeRef.current = onRemoteChange
  topicIdRef.current = topicId
  currentDraftIdRef.current = currentDraftId

  useEffect(() => {
    let channel: BroadcastChannel | null = null

    try {
      if (typeof BroadcastChannel === 'undefined') {
        return
      }

      channel = new BroadcastChannel(ACTIVE_DRAFT_CHANNEL)

      channel.onmessage = (event: MessageEvent) => {
        const data = event.data
        if (!isValidActiveDraftMessage(data)) return
        const msg: ActiveDraftChangeMessage = data as ActiveDraftChangeMessage

        const decision = shouldAcceptActiveDraftMessage(
          msg,
          topicIdRef.current,
          sourceIdRef.current,
          currentDraftIdRef.current,
          lastEventTimestampRef.current
        )

        if (!decision.accept) return

        lastEventTimestampRef.current = msg.timestamp
        onRemoteChangeRef.current(msg.draftId)
      }
    } catch {
      // Graceful degradation: if BroadcastChannel fails, do nothing
    }

    return () => {
      if (channel) {
        channel.close()
        channel = null
      }
    }
  }, [])
}

export function broadcastActiveDraftChange(topicId: string, draftId: string): void {
  try {
    if (typeof BroadcastChannel === 'undefined') {
      return
    }

    const channel = new BroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const msg = {
      type: 'ACTIVE_DRAFT_CHANGED' as const,
      topicId,
      draftId,
      sourceId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
    }

    channel.postMessage(msg)
    channel.close()
  } catch {
    // Graceful degradation
  }
}
