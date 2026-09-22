export const ACTIVE_DRAFT_CHANNEL = 'contentos:active-draft'
export const ACTIVE_DRAFT_CHANGED_TYPE = 'ACTIVE_DRAFT_CHANGED'

export interface ActiveDraftChangeMessage {
  type: typeof ACTIVE_DRAFT_CHANGED_TYPE
  topicId: string
  draftId: string
  sourceId: string
  timestamp: number
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

export function shouldAcceptActiveDraftMessage(
  msg: ActiveDraftChangeMessage,
  localTopicId: string,
  localSourceId: string,
  localCurrentDraftId: string | null | undefined,
  lastEventTimestamp: number
): { accept: boolean; reason: 'wrong-topic' | 'self-message' | 'stale' | 'no-change' | 'valid' } {
  if (msg.topicId !== localTopicId) return { accept: false, reason: 'wrong-topic' }
  if (msg.sourceId === localSourceId) return { accept: false, reason: 'self-message' }
  if (msg.timestamp <= lastEventTimestamp) return { accept: false, reason: 'stale' }
  if (msg.draftId === localCurrentDraftId) return { accept: false, reason: 'no-change' }
  return { accept: true, reason: 'valid' }
}
