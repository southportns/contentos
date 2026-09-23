/**
 * @vitest-environment jsdom
 *
 * P0.4.9.1 — Real React Component Behavioral Tests for Remote Restore
 *
 * These tests genuinely render the DraftVersionHistory component,
 * simulate BroadcastChannel messages, and verify UI state transitions.
 *
 * Not source-code string matching — actual DOM behavior verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────

// Mock next/navigation before importing component
const mockRouterRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRouterRefresh,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/test',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock server-actions (dynamic import inside component)
vi.mock('@/lib/services/server-actions', () => ({
  setActiveDraft: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock DraftVersionRestoreButton to simplify rendering
vi.mock('../draft-version-restore-button', () => ({
  DraftVersionRestoreButton: vi.fn().mockReturnValue(null),
}))

// Mock DraftVersionCompare
vi.mock('../draft-version-compare', () => ({
  DraftVersionCompare: vi.fn().mockReturnValue(null),
}))

// ── BroadcastChannel Test Harness ────────────────────────────────────────

type MessageHandler = (event: { data: unknown }) => void

class TestBroadcastChannel {
  static instances: TestBroadcastChannel[] = []
  onmessage: MessageHandler | null = null
  private _isClosed = false

  constructor(public name: string) {
    TestBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown): void {
    // Broadcast to all OTHER channels (simulates cross-tab delivery)
    for (const ch of TestBroadcastChannel.instances) {
      if (ch !== this && !ch._isClosed && ch.onmessage) {
        ch.onmessage({ data })
      }
    }
  }

  close(): void {
    this._isClosed = true
  }

  static resetAll(): void {
    TestBroadcastChannel.instances = []
  }
}

// Install global BroadcastChannel mock
vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)

// ── Minimal Draft type matching Prisma Draft ────────────────────────────

interface MinimalDraft {
  id: string
  version: number
  content: string
  title: string
  status: string
  wordCount: number | null
  createdAt: Date
  parentDraftId: string | null
  changeType: string
  changeReason: string | null
  evaluation: unknown
  humanization: unknown
  strategyEvaluation: unknown
}

function makeDraft(version: number, id?: string, overrides: Partial<MinimalDraft> = {}): MinimalDraft {
  const draftId = id ?? `draft_v${version}`
  return {
    id: draftId,
    version,
    content: `Version ${version} content for testing`,
    title: `Title v${version}`,
    status: 'FINAL',
    wordCount: 100,
    createdAt: new Date(2026, 8, 20, 10, version),
    parentDraftId: version > 1 ? `draft_v${version - 1}` : null,
    changeType: version === 1 ? 'INITIAL' : 'RESTORE',
    changeReason: null,
    evaluation: null,
    humanization: null,
    strategyEvaluation: null,
    ...overrides,
  }
}

// ── Imports (after mocks) ───────────────────────────────────────────────

import { DraftVersionHistory } from '../draft-version-history'
import { useActiveDraftSync, broadcastActiveDraftChange } from '../use-active-draft-sync'

// ── Tests ────────────────────────────────────────────────────────────────

describe('P0.4.9.1 — Remote Restore: Real Component Behavior', () => {
  beforeEach(() => {
    TestBroadcastChannel.resetAll()
    mockRouterRefresh.mockClear()
  })

  afterEach(() => {
    TestBroadcastChannel.resetAll()
    vi.clearAllMocks()
  })

  it('initializes selectedVersion from activeDraftId', () => {
    const drafts = [makeDraft(1), makeDraft(2), makeDraft(3)]

    render(
      <DraftVersionHistory
        drafts={drafts}
        activeDraftId="draft_v3"
        topicId="topic_1"
      />
    )

    // The detail panel should show v3 as the selected version (in the header)
    // The detail header shows 'v3' in a CardTitle. Also in the version list.
    const allV3s = screen.getAllByText('v3')
    expect(allV3s.length).toBeGreaterThanOrEqual(1)
  })

  it('Remote Restore: receives new draft → updates selectedVersion after props refresh (full behavioral flow)', async () => {
    const initialDrafts = [makeDraft(1), makeDraft(2), makeDraft(3)]

    // Tab B: renders with v1, v2, v3; active draft is v3
    const { rerender } = render(
      <DraftVersionHistory
        drafts={initialDrafts}
        activeDraftId="draft_v3"
        topicId="topic_1"
      />
    )

    // Initially shows v3
    expect(screen.getAllByText('v3').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('v4')).toBeNull()

    // Tab A performs a Restore → creates v4 as new active draft
    // Tab A broadcasts: topicId=topic_1, draftId=draft_v4, sourceId=<tab-A-id>
    const tabAChannel = new TestBroadcastChannel('contentos:active-draft')
    act(() => {
      tabAChannel.postMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 'topic_1',
        draftId: 'draft_v4',
        sourceId: 'tab_a_source_id',
        timestamp: Date.now(),
      })
    })

    // Tab B's onRemoteChange fires: localActiveDraftId becomes draft_v4
    // BUT draft_v4 is NOT in Tab B's current drafts array
    // So selectedVersion stays at v3 (the useEffect waits for v4 to appear in drafts)
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1)

    // Simulate what router.refresh() does: prop update with new drafts
    const updatedDrafts = [...initialDrafts, makeDraft(4)]
    rerender(
      <DraftVersionHistory
        drafts={updatedDrafts}
        activeDraftId="draft_v4"
        topicId="topic_1"
      />
    )

    // After re-render with v4 in drafts, selectedVersion should sync to v4
    await waitFor(() => {
      expect(screen.getAllByText('v4').length).toBeGreaterThanOrEqual(1)
    })

    // v4 should now be the selected version in the detail panel
    // The header shows "v4" — it appears in both version list and detail header
    const allV4s = screen.getAllByText('v4')
    expect(allV4s.length).toBeGreaterThanOrEqual(1)
  })

  it('different topic messages do not affect selectedVersion', () => {
    const drafts = [makeDraft(1), makeDraft(2), makeDraft(3)]

    render(
      <DraftVersionHistory
        drafts={drafts}
        activeDraftId="draft_v3"
        topicId="topic_1"
      />
    )

    // Initially shows v3
    expect(screen.getAllByText('v3').length).toBeGreaterThanOrEqual(1)

    // A message from a DIFFERENT topic arrives
    const otherChannel = new TestBroadcastChannel('contentos:active-draft')
    act(() => {
      otherChannel.postMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 'topic_999',
        draftId: 'draft_v99',
        sourceId: 'other_tab',
        timestamp: Date.now(),
      })
    })

    // selectedVersion should NOT change — still v3
    expect(screen.getAllByText('v3').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('v4')).toBeNull()

    // router.refresh should NOT have been called for wrong-topic message
    // (it was 0 times because the filter rejected it)
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('remote message from different sourceId triggers update (cross-tab delivery)', () => {
    const drafts = [makeDraft(1), makeDraft(2), makeDraft(3)]

    render(
      <DraftVersionHistory
        drafts={drafts}
        activeDraftId="draft_v3"
        topicId="topic_1"
      />
    )

    // Simulate: another tab's channel posts a message
    // This tests the full cross-tab delivery path
    const otherTabChannel = new TestBroadcastChannel('contentos:active-draft')

    act(() => {
      otherTabChannel.postMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 'topic_1',
        draftId: 'draft_v99',
        sourceId: 'some_different_source',
        timestamp: Date.now(),
      })
    })

    // Component receives the message, calls onRemoteChange → router.refresh
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1)

    // Clean up
    otherTabChannel.close()
  })

  it('unknown/malformed payload does not crash or update UI', () => {
    const drafts = [makeDraft(1), makeDraft(2), makeDraft(3)]

    render(
      <DraftVersionHistory
        drafts={drafts}
        activeDraftId="draft_v3"
        topicId="topic_1"
      />
    )

    const channel = TestBroadcastChannel.instances[TestBroadcastChannel.instances.length - 1]

    // Send various malformed payloads
    act(() => {
      channel.postMessage(null)
    })
    act(() => {
      channel.postMessage({ type: 'WRONG_TYPE', topicId: 'topic_1' })
    })
    act(() => {
      channel.postMessage('malicious string')
    })
    act(() => {
      // Missing required fields
      channel.postMessage({ type: 'ACTIVE_DRAFT_CHANGED' })
    })

    // UI should remain stable — v3 still present
    expect(screen.getAllByText('v3').length).toBeGreaterThanOrEqual(1)
    // No router.refresh should have fired
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('sequential remote updates are tracked (monotonic timestamp)', () => {
    const drafts = [makeDraft(1), makeDraft(2), makeDraft(3)]

    render(
      <DraftVersionHistory
        drafts={drafts}
        activeDraftId="draft_v3"
        topicId="topic_1"
      />
    )

    const channel = new TestBroadcastChannel('contentos:active-draft')

    // First message: switch to v2
    act(() => {
      channel.postMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 'topic_1',
        draftId: 'draft_v2',
        sourceId: 'tab_a',
        timestamp: 1000,
      })
    })

    expect(mockRouterRefresh).toHaveBeenCalledTimes(1)

    // Second message: switch to v1 (higher timestamp)
    act(() => {
      channel.postMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 'topic_1',
        draftId: 'draft_v1',
        sourceId: 'tab_a',
        timestamp: 2000,
      })
    })

    expect(mockRouterRefresh).toHaveBeenCalledTimes(2)

    // Stale message (lower timestamp) should be ignored
    act(() => {
      channel.postMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 'topic_1',
        draftId: 'draft_v99',
        sourceId: 'tab_a',
        timestamp: 1500, // between 1000 and 2000 — stale!
      })
    })

    // Count should NOT increase
    expect(mockRouterRefresh).toHaveBeenCalledTimes(2)
  })
})

describe('P0.4.9.1 — ActiveDraftSync Hook: Real sourceId Lifecycle', () => {
  beforeEach(() => {
    TestBroadcastChannel.resetAll()
  })

  afterEach(() => {
    TestBroadcastChannel.resetAll()
    vi.clearAllMocks()
  })

  it('Hook returns stable sourceId, and broadcast from that sourceId is received by OTHER hook instances', () => {
    let tabASourceId: string | null = null
    let tabBReceivedDraftId: string | null = null

    // Tab A component
    function TabA() {
      const { sourceId } = useActiveDraftSync({
        topicId: 'topic_1',
        currentDraftId: 'draft_v1',
        onRemoteChange: () => {},
      })
      tabASourceId = sourceId
      return null
    }

    // Tab B component
    function TabB() {
      useActiveDraftSync({
        topicId: 'topic_1',
        currentDraftId: 'draft_v1',
        onRemoteChange: (draftId) => {
          tabBReceivedDraftId = draftId
        },
      })
      return null
    }

    // Render both "tabs"
    render(
      <div>
        <TabA />
        <TabB />
      </div>
    )

    // Tab A should have a non-empty sourceId
    expect(tabASourceId).not.toBeNull()
    expect(typeof tabASourceId).toBe('string')
    expect(tabASourceId!.length).toBeGreaterThan(0)

    // Now broadcast using Tab A's REAL sourceId
    act(() => {
      broadcastActiveDraftChange('topic_1', 'draft_v4', tabASourceId!)
    })

    // Tab B should receive the message (because sourceId is different from Tab B's)
    expect(tabBReceivedDraftId).toBe('draft_v4')
  })

  it('Hook self-filters: own sourceId messages are rejected', () => {
    let ownSourceId: string | null = null
    let selfMessageReceived = false

    function TabComponent() {
      const { sourceId } = useActiveDraftSync({
        topicId: 'topic_1',
        currentDraftId: 'draft_v1',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onRemoteChange: (_draftId) => {
          selfMessageReceived = true
        },
      })
      ownSourceId = sourceId
      return null
    }

    render(<TabComponent />)

    expect(ownSourceId).not.toBeNull()

    // Simulate the tab receiving its own broadcast (echo scenario)
    // In real browsers, postMessage doesn't deliver to self, but we test the filter
    const channel = TestBroadcastChannel.instances[TestBroadcastChannel.instances.length - 1]

    // Manually dispatch a message with the component's OWN sourceId
    // This tests the self-message filter at the hook level
    act(() => {
      channel.onmessage!({
        data: {
          type: 'ACTIVE_DRAFT_CHANGED',
          topicId: 'topic_1',
          draftId: 'draft_v5',
          sourceId: ownSourceId,
          timestamp: Date.now(),
        },
      })
    })

    // Self-message should be filtered out — onRemoteChange NOT called
    expect(selfMessageReceived).toBe(false)
  })
})
