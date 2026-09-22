import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createActiveDraftChangeMessage,
  shouldAcceptActiveDraftMessage,
} from '../active-draft-sync-utils'

class MockBroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null = null
  name: string
  static channels: MockBroadcastChannel[] = []

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.channels.push(this)
  }

  postMessage(msg: unknown) {
    const event = { data: msg } as MessageEvent
    MockBroadcastChannel.channels.forEach(ch => {
      if (ch !== this && ch.onmessage) {
        ch.onmessage(event)
      }
    })
  }

  close() {
    const idx = MockBroadcastChannel.channels.indexOf(this)
    if (idx !== -1) MockBroadcastChannel.channels.splice(idx, 1)
  }
}

describe('Active Draft Cross-Tab Integration', () => {
  let tab1: MockBroadcastChannel
  let tab2: MockBroadcastChannel
  let tab3: MockBroadcastChannel
  let tab1LastTimestamp = 0
  let tab2LastTimestamp = 0
  let tab3LastTimestamp = 0
  let tab1DraftId = 'draft-old'
  let tab2DraftId = 'draft-old'
  let tab3DraftId = 'draft-old'
  const topicId = 'topic-sync-1'
  const tab1Source = 'source-tab-1'
  const tab2Source = 'source-tab-2'
  const tab3Source = 'source-tab-3'

  function handleMessage(tab: 'tab1' | 'tab2' | 'tab3', msg: any) {
    const localSource = tab === 'tab1' ? tab1Source : tab === 'tab2' ? tab2Source : tab3Source
    const localDraft = tab === 'tab1' ? tab1DraftId : tab === 'tab2' ? tab2DraftId : tab3DraftId
    const localTimestamp = tab === 'tab1' ? tab1LastTimestamp : tab === 'tab2' ? tab2LastTimestamp : tab3LastTimestamp

    const decision = shouldAcceptActiveDraftMessage(msg, topicId, localSource, localDraft, localTimestamp)
    if (decision.accept) {
      if (tab === 'tab1') { tab1LastTimestamp = msg.timestamp; tab1DraftId = msg.draftId }
      else if (tab === 'tab2') { tab2LastTimestamp = msg.timestamp; tab2DraftId = msg.draftId }
      else { tab3LastTimestamp = msg.timestamp; tab3DraftId = msg.draftId }
      return true
    }
    return false
  }

  beforeEach(() => {
    MockBroadcastChannel.channels = []
    tab1 = new BroadcastChannel('contentos:active-draft') as unknown as MockBroadcastChannel
    tab2 = new BroadcastChannel('contentos:active-draft') as unknown as MockBroadcastChannel
    tab3 = new BroadcastChannel('contentos:active-draft') as unknown as MockBroadcastChannel

    tab1.onmessage = (event) => handleMessage('tab1', event.data)
    tab2.onmessage = (event) => handleMessage('tab2', event.data)
    tab3.onmessage = (event) => handleMessage('tab3', event.data)

    tab1LastTimestamp = 0; tab2LastTimestamp = 0; tab3LastTimestamp = 0
    tab1DraftId = 'draft-old'; tab2DraftId = 'draft-old'; tab3DraftId = 'draft-old'
  })

  afterEach(() => {
    MockBroadcastChannel.channels = []
  })

  it('Test A: tab2 and tab3 should receive message from tab1', () => {
    const msg = createActiveDraftChangeMessage({ topicId, draftId: 'draft-new', sourceId: tab1Source })
    tab1.postMessage(msg)
    expect(tab2DraftId).toBe('draft-new')
    expect(tab3DraftId).toBe('draft-new')
  })

  it('Test B: tab1 should NOT update to its own message', () => {
    const msg = createActiveDraftChangeMessage({ topicId, draftId: 'draft-new', sourceId: tab1Source })
    tab1.postMessage(msg)
    expect(tab1DraftId).toBe('draft-old')
  })

  it('Test C: all tabs converge to same draftId', () => {
    const msg1 = createActiveDraftChangeMessage({ topicId, draftId: 'draft-v2', sourceId: tab1Source })
    tab1.postMessage(msg1)
    expect(tab1DraftId).toBe('draft-old')
    expect(tab2DraftId).toBe('draft-v2')
    expect(tab3DraftId).toBe('draft-v2')

    const msg2 = createActiveDraftChangeMessage({ topicId, draftId: 'draft-v3', sourceId: tab2Source })
    tab2.postMessage(msg2)
    expect(tab1DraftId).toBe('draft-v3')
    expect(tab2DraftId).toBe('draft-v2')
    expect(tab3DraftId).toBe('draft-v3')
  })

  it('Test D: different topics do not interfere', () => {
    const tab1SourceAlt = 'alt-source'
    const originalSource = shouldAcceptActiveDraftMessage

    const altMsg = createActiveDraftChangeMessage({ topicId: 'other-topic', draftId: 'other-draft', sourceId: 'other-src' })
    const shouldAccept = originalSource(altMsg, topicId, tab1Source, 'draft-old', 0)
    expect(shouldAccept.accept).toBe(false)
    expect(shouldAccept.reason).toBe('wrong-topic')
  })

  it('Test E: stale messages are ignored', () => {
    const msg1 = createActiveDraftChangeMessage({ topicId, draftId: 'draft-first', sourceId: tab1Source })
    tab1.postMessage(msg1)
    expect(tab2DraftId).toBe('draft-first')

    tab2LastTimestamp = msg1.timestamp
    const msg2 = { ...createActiveDraftChangeMessage({ topicId, draftId: 'draft-second', sourceId: tab2Source }), timestamp: msg1.timestamp - 1000 }
    tab2.postMessage(msg2)
    expect(tab2DraftId).toBe('draft-first')
    expect(tab1DraftId).toBe('draft-first')
  })

  it('Test F: closed/unsubscribed tab does not receive', () => {
    tab3.close()
    const msg = createActiveDraftChangeMessage({ topicId, draftId: 'draft-post-close', sourceId: tab1Source })
    tab1.postMessage(msg)
    expect(tab3DraftId).toBe('draft-old')
    expect(tab1DraftId).toBe('draft-old')
    expect(tab2DraftId).toBe('draft-post-close')
  })

  it('Test G: same draftId no-op', () => {
    tab2DraftId = 'draft-same'
    tab3DraftId = 'draft-same'
    const msg = createActiveDraftChangeMessage({ topicId, draftId: 'draft-same', sourceId: tab1Source })
    tab1.postMessage(msg)
    expect(tab2DraftId).toBe('draft-same')
    expect(tab3DraftId).toBe('draft-same')
  })

  it('Test H: rapid sequential messages resolved to latest', () => {
    const msg1 = createActiveDraftChangeMessage({ topicId, draftId: 'draft-rapid-1', sourceId: tab1Source })
    tab1.postMessage(msg1)
    expect(tab2DraftId).toBe('draft-rapid-1')

    const msg2 = createActiveDraftChangeMessage({ topicId, draftId: 'draft-rapid-2', sourceId: tab2Source })
    tab2.postMessage(msg2)
    expect(tab1DraftId).toBe('draft-rapid-2')
    expect(tab2DraftId).toBe('draft-rapid-1')
    expect(tab3DraftId).toBe('draft-rapid-2')
  })

  it('Test I: new tab picks up state via query', () => {
    const msg = createActiveDraftChangeMessage({ topicId, draftId: 'draft-latest', sourceId: tab1Source })
    tab1.postMessage(msg)
    expect(tab2DraftId).toBe('draft-latest')
  })
})
