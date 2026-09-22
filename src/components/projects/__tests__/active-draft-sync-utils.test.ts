/*
 * P0.4.9 — Active Draft Cross-Tab Sync Utility Tests
 *
 * Tests verify pure message filtering logic from active-draft-sync-utils.ts:
 *   Test A: Correct type (ACTIVE_DRAFT_CHANGED) accepted
 *   Test B: Wrong type (SOMETHING_ELSE) rejected
 *   Test C: Different topic rejected
 *   Test D: Self sourceId rejected
 *   Test E: Old timestamp rejected
 *   Test F: Same timestamp rejected
 *   Test G: New timestamp accepted
 *   Test H: Same draftId rejected
 */

import { describe, it, expect } from 'vitest'
import {
  isActiveDraftChangeMessage,
  isForTopic,
  isFromSelf,
  isNewerThanLastEvent,
  isDifferentDraft,
  shouldAcceptActiveDraftMessage,
  type ActiveDraftChangeMessage,
} from '../active-draft-sync-utils'

// ── Test Data Helpers ──────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ActiveDraftChangeMessage> = {}): ActiveDraftChangeMessage {
  return {
    type: 'ACTIVE_DRAFT_CHANGED',
    topicId: 'topic_123',
    draftId: 'draft_v5',
    sourceId: 'tab_abc',
    timestamp: 200,
    ...overrides,
  }
}

describe('P0.4.9 — isActiveDraftChangeMessage', () => {
  it('Test A: accepts ACTIVE_DRAFT_CHANGED message', () => {
    const msg = makeMessage()
    expect(isActiveDraftChangeMessage(msg)).toBe(true)
  })

  it('Test B: rejects message with wrong type', () => {
    const msg = makeMessage({ type: 'SOMETHING_ELSE' })
    expect(isActiveDraftChangeMessage(msg)).toBe(false)
  })

  it('Test B: rejects null message', () => {
    expect(isActiveDraftChangeMessage(null)).toBe(false)
  })

  it('Test B: rejects undefined message', () => {
    expect(isActiveDraftChangeMessage(undefined)).toBe(false)
  })

  it('Test B: rejects string message', () => {
    expect(isActiveDraftChangeMessage('ACTIVE_DRAFT_CHANGED')).toBe(false)
  })

  it('Test B: rejects number message', () => {
    expect(isActiveDraftChangeMessage(123)).toBe(false)
  })

  it('Test B: rejects empty object', () => {
    expect(isActiveDraftChangeMessage({})).toBe(false)
  })
})

describe('P0.4.9 — isForTopic', () => {
  it('Test C: accepts message for matching topic', () => {
    const msg = makeMessage({ topicId: 'topic_123' })
    expect(isForTopic(msg, 'topic_123')).toBe(true)
  })

  it('Test C: rejects message for different topic', () => {
    const msg = makeMessage({ topicId: 'topic_456' })
    expect(isForTopic(msg, 'topic_123')).toBe(false)
  })

  it('Test C: rejects message for empty topic when current has topic', () => {
    const msg = makeMessage({ topicId: '' })
    expect(isForTopic(msg, 'topic_123')).toBe(false)
  })
})

describe('P0.4.9 — isFromSelf', () => {
  it('Test D: returns true when sourceId matches self', () => {
    const msg = makeMessage({ sourceId: 'tab_abc' })
    expect(isFromSelf(msg, 'tab_abc')).toBe(true)
  })

  it('Test D: returns false when sourceId differs', () => {
    const msg = makeMessage({ sourceId: 'tab_xyz' })
    expect(isFromSelf(msg, 'tab_abc')).toBe(false)
  })
})

describe('P0.4.9 — isNewerThanLastEvent', () => {
  it('Test G: returns true when message timestamp is newer', () => {
    const msg = makeMessage({ timestamp: 200 })
    expect(isNewerThanLastEvent(msg, 100)).toBe(true)
  })

  it('Test E: returns false when message timestamp is older', () => {
    const msg = makeMessage({ timestamp: 100 })
    expect(isNewerThanLastEvent(msg, 200)).toBe(false)
  })

  it('Test F: returns false when message timestamp equals last timestamp', () => {
    const msg = makeMessage({ timestamp: 200 })
    expect(isNewerThanLastEvent(msg, 200)).toBe(false)
  })

  it('Test G: accepts timestamp 1 greater than last', () => {
    const msg = makeMessage({ timestamp: 101 })
    expect(isNewerThanLastEvent(msg, 100)).toBe(true)
  })
})

describe('P0.4.9 — isDifferentDraft', () => {
  it('Test H: returns true when draftId differs from current', () => {
    const msg = makeMessage({ draftId: 'draft_v5' })
    expect(isDifferentDraft(msg, 'draft_v3')).toBe(true)
  })

  it('Test H: returns false when draftId matches current', () => {
    const msg = makeMessage({ draftId: 'draft_v3' })
    expect(isDifferentDraft(msg, 'draft_v3')).toBe(false)
  })

  it('Test H: returns true when current is null', () => {
    const msg = makeMessage({ draftId: 'draft_v5' })
    expect(isDifferentDraft(msg, null)).toBe(true)
  })

  it('Test H: returns true when current is undefined', () => {
    const msg = makeMessage({ draftId: 'draft_v5' })
    expect(isDifferentDraft(msg, undefined)).toBe(true)
  })
})

describe('P0.4.9 — shouldAcceptActiveDraftMessage (combined filter)', () => {
  const baseContext = {
    topicId: 'topic_123',
    sourceId: 'tab_abc',
    lastEventTimestamp: 100,
    currentDraftId: 'draft_v3',
  }

  it('Test A: accepts valid message with all conditions met', () => {
    const msg = makeMessage({
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v5',
      sourceId: 'tab_xyz',
      timestamp: 200,
    })
    expect(shouldAcceptActiveDraftMessage(msg, baseContext)).toBe(true)
  })

  it('Test B: rejects wrong type', () => {
    const msg = makeMessage({ type: 'WRONG_TYPE' })
    expect(shouldAcceptActiveDraftMessage(msg, baseContext)).toBe(false)
  })

  it('Test C: rejects different topic', () => {
    const msg = makeMessage({ topicId: 'topic_999' })
    expect(shouldAcceptActiveDraftMessage(msg, baseContext)).toBe(false)
  })

  it('Test D: rejects self message', () => {
    const msg = makeMessage({ sourceId: 'tab_abc' })
    expect(shouldAcceptActiveDraftMessage(msg, baseContext)).toBe(false)
  })

  it('Test E: rejects old timestamp', () => {
    const msg = makeMessage({ timestamp: 50 })
    expect(shouldAcceptActiveDraftMessage(msg, baseContext)).toBe(false)
  })

  it('Test F: rejects same timestamp', () => {
    const msg = makeMessage({ timestamp: 100 })
    expect(shouldAcceptActiveDraftMessage(msg, baseContext)).toBe(false)
  })

  it('Test G: accepts newer timestamp (when all other conditions met)', () => {
    const msg = makeMessage({
      sourceId: 'tab_xyz',
      draftId: 'draft_v5',
      timestamp: 200,
    })
    expect(shouldAcceptActiveDraftMessage(msg, baseContext)).toBe(true)
  })

  it('Test H: rejects same draftId', () => {
    const msg = makeMessage({ draftId: 'draft_v3' })
    expect(shouldAcceptActiveDraftMessage(msg, baseContext)).toBe(false)
  })

  it('rejects null message in combined filter', () => {
    expect(shouldAcceptActiveDraftMessage(null, baseContext)).toBe(false)
  })

  it('rejects non-object message in combined filter', () => {
    expect(shouldAcceptActiveDraftMessage('random-string', baseContext)).toBe(false)
  })
})
