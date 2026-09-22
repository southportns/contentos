/**
 * P0.4.9 — Active Draft Cross-Tab Sync Pure Helpers
 *
 * Pure functions for BroadcastChannel message filtering, validation,
 * and ordering. Separated from the React hook and broadcast logic for
 * testability and reusability.
 *
 * Source of Truth: Database (Topic.activeDraftId)
 * This module: Client-side message filtering ONLY
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0.4.9 — BroadcastChannel name for active draft sync.
 * Single constant used across the application to ensure consistency.
 */
export const ACTIVE_DRAFT_CHANNEL = 'contentos:active-draft'

/**
 * P0.4.9 — Message type discriminator.
 * Only messages with this type are processed; all others are ignored.
 */
export const ACTIVE_DRAFT_CHANGED_TYPE = 'ACTIVE_DRAFT_CHANGED'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0.4.9 — Broadcast message structure for active draft changes.
 * Minimal, serializable, no draft content — only IDs and metadata.
 */
export interface ActiveDraftChangeMessage {
  type: typeof ACTIVE_DRAFT_CHANGED_TYPE
  topicId: string
  draftId: string
  sourceId: string
  timestamp: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0.4.9 — Check if a message is a valid ActiveDraftChangeMessage.
 *
 * Pure function: type guard that validates the message structure.
 * Does NOT filter by topicId, sourceId, or timestamp — only validates type.
 *
 * @param message - The message to validate (unknown type from BroadcastChannel)
 * @returns True if message has type === ACTIVE_DRAFT_CHANGED_TYPE
 */
export function isActiveDraftChangeMessage(message: unknown): message is ActiveDraftChangeMessage {
  if (typeof message !== 'object' || message === null) return false
  return (message as ActiveDraftChangeMessage).type === ACTIVE_DRAFT_CHANGED_TYPE
}

/**
 * P0.4.9 — Check if a message is intended for the given topic.
 *
 * Pure function: prevents cross-Topic pollution.
 * Messages for different topics are ignored.
 *
 * @param message - The validated message
 * @param topicId - The current tab's topic ID
 * @returns True if message.topicId matches the given topicId
 */
export function isForTopic(message: ActiveDraftChangeMessage, topicId: string): boolean {
  return message.topicId === topicId
}

/**
 * P0.4.9 — Check if a message originated from this tab.
 *
 * Pure function: prevents self-message processing.
 * Each tab has a unique sourceId (crypto.randomUUID()).
 * Messages from self are ignored to prevent loops.
 *
 * @param message - The validated message
 * @param sourceId - The current tab's source ID
 * @returns True if message.sourceId matches the given sourceId (i.e., it's from self)
 */
export function isFromSelf(message: ActiveDraftChangeMessage, sourceId: string): boolean {
  return message.sourceId === sourceId
}

/**
P.4.9 — Check if a message has a newer timestamp than the last processed event.
 *
 * Pure function: prevents old messages from overwriting newer state.
 * Uses strict less-than: same timestamp is also rejected (should not happen
 * in practice with client timestamps, but provides safety).
 *
 * Note: timestamp is for client-side event ordering ONLY.
 * It does NOT determine which Draft is more recent.
 * The authoritative state always comes from the database.
 *
 * @param message - The validated message
 * @param lastEventTimestamp - The timestamp of the last processed message
 * @returns True if message.timestamp is strictly greater than lastEventTimestamp
 */
export function isNewerThanLastEvent(message: ActiveDraftChangeMessage, lastEventTimestamp: number): boolean {
  return message.timestamp > lastEventTimestamp
}

/**
 * P0.4.9 — Check if a message indicates a different draft than the current active.
 *
 * Pure function: prevents unnecessary processing when the active draft hasn't changed.
 * If the draftId matches what we already have, the message can be safely ignored
 * to avoid redundant router.refresh() calls.
 *
 * @param message - The validated message
 * @param currentDraftId - The current active draft ID (may be null/undefined)
 * @returns True if message.draftId differs from currentDraftId
 */
export function isDifferentDraft(message: ActiveDraftChangeMessage, currentDraftId: string | null | undefined): boolean {
  return message.draftId !== currentDraftId
}

/**
 * P0.4.9 — Combined filter: should a message be accepted for processing?
 *
 * Pure function: all-in-one filter combining all individual checks.
 * Returns true only if ALL conditions are met:
 *   1. Valid ACTIVE_DRAFT_CHANGED message
 *   2. Intended for this topic (not cross-topic pollution)
 *   3. Not from this tab (self-message prevention)
 *   4. Newer than last processed event (ordering protection)
 *   5. Different draft from current (no redundant refresh)
 *
 * @param message - The raw message from BroadcastChannel
 * @param context - Filtering context (topicId, sourceId, lastEventTimestamp, currentDraftId)
 * @returns True if the message should be accepted and processed
 */
export function shouldAcceptActiveDraftMessage(
  message: unknown,
  context: {
    topicId: string
    sourceId: string
    lastEventTimestamp: number
    currentDraftId: string | null | undefined
  }
): boolean {
  // Check 1: Valid message type
  if (!isActiveDraftChangeMessage(message)) return false

  // Check 2: Topic filtering
  if (!isForTopic(message, context.topicId)) return false

  // Check 3: Self-message prevention
  if (isFromSelf(message, context.sourceId)) return false

  // Check 4: Timestamp ordering (reject old or same-timestamp messages)
  if (!isNewerThanLastEvent(message, context.lastEventTimestamp)) return false

  // Check 5: Different draft (skip if same as current)
  if (!isDifferentDraft(message, context.currentDraftId)) return false

  return true
}
