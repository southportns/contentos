/*
 * P0.4.9 + P0.4.9.1 — Active Draft Cross-Tab Integration Tests
 *
 * Simulates two "tabs" using mock BroadcastChannel to verify:
 *   Tab A sets active draft → Tab B receives message
 *   Different topic messages are filtered
 *   Self-messages are ignored (P0.4.9.1: via stable sourceId)
 *   Old timestamp messages are ignored
 *   Same draftId messages are ignored
 *   P0.4.9.1: Stable sourceId end-to-end self-message verification
 *   P0.4.9.1: Unknown payload type guard behavioral verification
 *
 * These are pure logic integration tests (no React rendering).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ACTIVE_DRAFT_CHANNEL,
  type ActiveDraftChangeMessage,
  shouldAcceptActiveDraftMessage,
  isFromSelf,
} from '../active-draft-sync-utils'

// ── Mock BroadcastChannel for Testing ────────────────────────────────────

class MockBroadcastChannel {
  private static channels: Map<string, MockBroadcastChannel[]> = new Map()
  onmessage: ((event: MessageEvent) => void) | null = null
  private _name: string

  constructor(name: string) {
    this._name = name
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, [])
    }
    MockBroadcastChannel.channels.get(name)!.push(this)
  }

  postMessage(data: unknown): void {
    const channels = MockBroadcastChannel.channels.get(this._name) || []
    const event = { data } as MessageEvent
    // Deliver to all other channels (not self)
    for (const ch of channels) {
      if (ch !== this && ch.onmessage) {
        ch.onmessage(event)
      }
    }
  }

  close(): void {
    const channels = MockBroadcastChannel.channels.get(this._name) || []
    const idx = channels.indexOf(this)
    if (idx !== -1) channels.splice(idx, 1)
  }

  static resetAll(): void {
    MockBroadcastChannel.channels = new Map()
  }
}

// ── Integration Tests ─────────────────────────────────────────────────────

describe('P0.4.9 — Cross-Tab Integration (Mock BroadcastChannel)', () => {
  beforeEach(() => {
    MockBroadcastChannel.resetAll()
  })

  it('Tab A posts message → Tab B receives the same message', () => {
    const channelA = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let receivedByB: unknown = null
    channelB.onmessage = (event) => {
      receivedByB = event.data
    }

    const message: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v5',
      sourceId: 'tab_a',
      timestamp: Date.now(),
    }

    channelA.postMessage(message)

    expect(receivedByB).toEqual(message)
  })

  it('Tab B filters message from same sourceId (self-message)', () => {
    const channelA = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let processedCount = 0
    const selfSourceId = 'tab_b'
    channelB.onmessage = (event) => {
      const msg = event.data
      if (isFromSelf(msg as ActiveDraftChangeMessage, selfSourceId)) {
        return // Ignore self
      }
      processedCount++
    }

    const message: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v5',
      sourceId: 'tab_b', // Same as receiver
      timestamp: Date.now(),
    }

    channelA.postMessage(message)
    channelB.onmessage!({ data: message } as MessageEvent)
    expect(processedCount).toBe(0)
  })

  it('Tab B accepts message from different tab with valid filter chain', () => {
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let lastReceivedDraftId: string | null = null
    let lastTimestamp = 0

    channelB.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_123',
        sourceId: 'tab_b',
        lastEventTimestamp: lastTimestamp,
        currentDraftId: 'draft_v3',
      })) {
        lastTimestamp = (msg as ActiveDraftChangeMessage).timestamp
        lastReceivedDraftId = (msg as ActiveDraftChangeMessage).draftId
      }
    }

    const message: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v5',
      sourceId: 'tab_a',
      timestamp: 200,
    }

    channelB.onmessage({ data: message } as MessageEvent)
    expect(lastReceivedDraftId).toBe('draft_v5')
    expect(lastTimestamp).toBe(200)
  })

  it('different topic messages are filtered (cross-topic protection)', () => {
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let receivedCount = 0
    channelB.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_123',
        sourceId: 'tab_b',
        lastEventTimestamp: 0,
        currentDraftId: null,
      })) {
        receivedCount++
      }
    }

    const wrongTopicMsg: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_999',
      draftId: 'draft_v5',
      sourceId: 'tab_a',
      timestamp: 100,
    }

    channelB.onmessage({ data: wrongTopicMsg } as MessageEvent)
    expect(receivedCount).toBe(0)
  })

  it('old timestamp messages are ignored (ordering protection)', () => {
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let receivedCount = 0
    let currentTimestamp = 500

    channelB.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_123',
        sourceId: 'tab_b',
        lastEventTimestamp: currentTimestamp,
        currentDraftId: 'draft_v3',
      })) {
        currentTimestamp = (msg as ActiveDraftChangeMessage).timestamp
        receivedCount++
      }
    }

    const oldMessage: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v5',
      sourceId: 'tab_a',
      timestamp: 100,
    }

    channelB.onmessage({ data: oldMessage } as MessageEvent)
    expect(receivedCount).toBe(0)
  })

  it('same draftId messages are ignored (deduplication)', () => {
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let receivedCount = 0
    channelB.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_123',
        sourceId: 'tab_b',
        lastEventTimestamp: 0,
        currentDraftId: 'draft_v5',
      })) {
        receivedCount++
      }
    }

    const sameDraftMsg: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v5',
      sourceId: 'tab_a',
      timestamp: 999,
    }

    channelB.onmessage({ data: sameDraftMsg } as MessageEvent)
    expect(receivedCount).toBe(0)
  })

  it('message with wrong type is rejected', () => {
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let receivedCount = 0
    channelB.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_123',
        sourceId: 'tab_b',
        lastEventTimestamp: 0,
        currentDraftId: null,
      })) {
        receivedCount++
      }
    }

    const wrongTypeMsg = {
      type: 'WRONG_TYPE',
      topicId: 'topic_123',
      draftId: 'draft_v5',
      sourceId: 'tab_a',
      timestamp: 100,
    }

    channelB.onmessage({ data: wrongTypeMsg } as MessageEvent)
    expect(receivedCount).toBe(0)
  })

  it('multiple tabs (3+) can all receive the same broadcast', () => {
    const channelA = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelC = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    const receivedMessages: Array<{ tab: string; draftId: string }> = []

    channelB.onmessage = (event) => {
      const msg = event.data as ActiveDraftChangeMessage
      if (!isFromSelf(msg, 'tab_b')) {
        receivedMessages.push({ tab: 'B', draftId: msg.draftId })
      }
    }

    channelC.onmessage = (event) => {
      const msg = event.data as ActiveDraftChangeMessage
      if (!isFromSelf(msg, 'tab_c')) {
        receivedMessages.push({ tab: 'C', draftId: msg.draftId })
      }
    }

    const message: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v7',
      sourceId: 'tab_a',
      timestamp: Date.now(),
    }

    channelA.postMessage(message)

    expect(receivedMessages).toHaveLength(2)
    expect(receivedMessages[0]).toEqual({ tab: 'B', draftId: 'draft_v7' })
    expect(receivedMessages[1]).toEqual({ tab: 'C', draftId: 'draft_v7' })
  })

  it('channel cleanup removes tab from broadcast list', () => {
    const channelA = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelC = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    channelB.close()

    const receivedMessages: string[] = []
    channelC.onmessage = (event) => {
      const msg = event.data as ActiveDraftChangeMessage
      receivedMessages.push(msg.draftId)
    }

    const message: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v8',
      sourceId: 'tab_a',
      timestamp: Date.now(),
    }

    channelA.postMessage(message)

    expect(receivedMessages).toEqual(['draft_v8'])
  })

  // ── P0.4.9.1 — Stable sourceId end-to-end self-message verification ─────

  it('P0.4.9.1 — broadcast with own stable sourceId is rejected by own listener', () => {
    const tabAStableSourceId = 'stable-tab-a-uuid'
    const tabBStableSourceId = 'stable-tab-b-uuid'

    const channelA = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let tabAReceivedDraftIds: string[] = []
    let tabBReceivedDraftIds: string[] = []

    channelA.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_123',
        sourceId: tabAStableSourceId,
        lastEventTimestamp: 0,
        currentDraftId: 'draft_v1',
      })) {
        tabAReceivedDraftIds.push((msg as ActiveDraftChangeMessage).draftId)
      }
    }

    channelB.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_123',
        sourceId: tabBStableSourceId,
        lastEventTimestamp: 0,
        currentDraftId: 'draft_v1',
      })) {
        tabBReceivedDraftIds.push((msg as ActiveDraftChangeMessage).draftId)
      }
    }

    const messageFromA: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_123',
      draftId: 'draft_v5',
      sourceId: tabAStableSourceId,
      timestamp: 1000,
    }

    channelA.postMessage(messageFromA)
    channelA.onmessage!({ data: messageFromA } as MessageEvent)

    expect(tabAReceivedDraftIds).toEqual([])
    expect(tabBReceivedDraftIds).toEqual(['draft_v5'])
  })

  it('P0.4.9.1 — each tab uses distinct stable sourceId so cross-tab delivery works', () => {
    const tabAId = 'tab-a-stable-id'
    const tabBId = 'tab-b-stable-id'
    const tabCId = 'tab-c-stable-id'

    const channelA = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)
    const channelC = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let bReceived: string[] = []
    let cReceived: string[] = []

    channelB.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_shared',
        sourceId: tabBId,
        lastEventTimestamp: 0,
        currentDraftId: 'draft_old',
      })) {
        bReceived.push((msg as ActiveDraftChangeMessage).draftId)
      }
    }

    channelC.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_shared',
        sourceId: tabCId,
        lastEventTimestamp: 0,
        currentDraftId: 'draft_old',
      })) {
        cReceived.push((msg as ActiveDraftChangeMessage).draftId)
      }
    }

    const msg: ActiveDraftChangeMessage = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic_shared',
      draftId: 'draft_new',
      sourceId: tabAId,
      timestamp: Date.now(),
    }

    channelA.postMessage(msg)

    expect(bReceived).toEqual(['draft_new'])
    expect(cReceived).toEqual(['draft_new'])
  })

  // ── P0.4.9.1 — Full behavioral: unknown payload does not pass filter ─────

  it('P0.4.9.1 — unknown payloads are rejected by the unified filter', () => {
    const channelB = new MockBroadcastChannel(ACTIVE_DRAFT_CHANNEL)

    let bProcessedValid = false
    channelB.onmessage = (event) => {
      const msg = event.data
      if (shouldAcceptActiveDraftMessage(msg, {
        topicId: 'topic_123',
        sourceId: 'tab_b',
        lastEventTimestamp: 0,
        currentDraftId: 'draft_v1',
      })) {
        bProcessedValid = true
      }
    }

    // @ts-expect-error: simulating unknown payload
    channelB.onmessage({ data: null } as MessageEvent)
    expect(bProcessedValid).toBe(false)

    // @ts-expect-error: simulating unknown payload
    channelB.onmessage({ data: 'malicious' } as MessageEvent)
    expect(bProcessedValid).toBe(false)

    // @ts-expect-error: simulating unknown payload
    channelB.onmessage({ data: { type: 'HACK', topicId: 'topic_123', draftId: 'x', sourceId: 'y', timestamp: 999 } } as MessageEvent)
    expect(bProcessedValid).toBe(false)

    // @ts-expect-error: simulating unknown payload — missing fields
    channelB.onmessage({ data: { type: 'ACTIVE_DRAFT_CHANGED' } } as MessageEvent)
    expect(bProcessedValid).toBe(false)
  })
})
