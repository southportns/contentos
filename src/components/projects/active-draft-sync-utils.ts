export const ACTIVE_DRAFT_CHANNEL = 'contentos:active-draft'
export const ACTIVE_DRAFT_CHANGED_TYPE = 'ACTIVE_DRAFT_CHANGED'

export interface ActiveDraftChangeMessage {
  type: typeof ACTIVE_DRAFT_CHANGED_TYPE
  topicId: string
  draftId: string
  sourceId: string
  timestamp: number
}

/**
 * P0.4.9.1 — Filter options for shouldAcceptActiveDraftMessage.
 * Encapsulates all local-state parameters needed to decide whether
 * a remote message should be acted upon.
 */
export interface ActiveDraftSyncFilterOptions {
  /** The topic ID this tab is currently viewing */
  topicId: string
  /** The stable source ID of this tab (self-message rejection) */
  sourceId: string
  /** Monotonic timestamp of last processed event (stale rejection) */
  lastEventTimestamp: number
  /** Current active draft ID in this tab (no-change rejection) */
  currentDraftId: string | null | undefined
}

export function generateSourceId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createActiveDraftChangeMessage(params: {
  topicId: string
  draftId: string
  sourceId: string
}): ActiveDraftChangeMessage {
  return {
    type: ACTIVE_DRAFT_CHANGED_TYPE,
    topicId: params.topicId,
    draftId: params.draftId,
    sourceId: params.sourceId,
    timestamp: Date.now(),
  }
}

export function isValidActiveDraftMessage(value: unknown): value is ActiveDraftChangeMessage {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  return (
    msg.type === ACTIVE_DRAFT_CHANGED_TYPE &&
    typeof msg.topicId === 'string' && msg.topicId.length > 0 &&
    typeof msg.draftId === 'string' && msg.draftId.length > 0 &&
    typeof msg.sourceId === 'string' && msg.sourceId.length > 0 &&
    typeof msg.timestamp === 'number' && msg.timestamp > 0
  )
}

/**
 * P0.4.9.1 — Unified filter: accepts an options object instead of
 * individual positional parameters. Returns a boolean for direct
 * use in conditional checks (no `.accept` property access needed).
 */
export function shouldAcceptActiveDraftMessage(
  msg: unknown,
  options: ActiveDraftSyncFilterOptions
): boolean {
  // Type guard first — reject non-conforming payloads
  if (!isValidActiveDraftMessage(msg)) return false

  if (msg.topicId !== options.topicId) return false
  if (msg.sourceId === options.sourceId) return false
  if (msg.timestamp <= options.lastEventTimestamp) return false
  if (msg.draftId === options.currentDraftId) return false

  return true
}

/**
 * Pure helper: determine if a message originated from this tab.
 * Used in tests and as a standalone predicate.
 */
export function isFromSelf(
  msg: ActiveDraftChangeMessage,
  selfSourceId: string
): boolean {
  return msg.sourceId === selfSourceId
}
