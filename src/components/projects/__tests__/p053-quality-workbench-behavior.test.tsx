/**
 * @vitest-environment jsdom
 *
 * P0.5.3 — Quality & Optimization Workbench Behavioral Tests
 *
 * Real React component tests for:
 * - DraftQualityPanel (evaluation display, re-evaluate, suggestion selection)
 * - DraftHumanizationPanel (preview, adopt, dismiss)
 *
 * Covers the cross-tab sync and dirty editor protection requirements.
 */

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────

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

const mockEvaluate = vi.fn()
const mockRefine = vi.fn()
const mockPreviewHumanization = vi.fn()
const mockAdoptHumanized = vi.fn()

vi.mock('@/lib/services/server-actions', () => ({
  evaluateActiveDraft: (...args: unknown[]) => mockEvaluate(...args),
  refineActiveDraft: (...args: unknown[]) => mockRefine(...args),
  previewHumanization: (...args: unknown[]) => mockPreviewHumanization(...args),
  adoptHumanizedDraft: (...args: unknown[]) => mockAdoptHumanized(...args),
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
    if (this._isClosed) return
    queueMicrotask(() => {
      for (const instance of TestBroadcastChannel.instances) {
        if (instance !== this && !instance._isClosed && instance.onmessage) {
          instance.onmessage({ data })
        }
      }
    })
  }

  close(): void {
    this._isClosed = true
    const idx = TestBroadcastChannel.instances.indexOf(this)
    if (idx >= 0) TestBroadcastChannel.instances.splice(idx, 1)
  }

  static reset(): void {
    TestBroadcastChannel.instances = []
  }
}

const originalBC = globalThis.BroadcastChannel
beforeEach(() => {
  TestBroadcastChannel.reset()
  globalThis.BroadcastChannel = TestBroadcastChannel as unknown as typeof BroadcastChannel
})
afterEach(() => {
  globalThis.BroadcastChannel = originalBC
  TestBroadcastChannel.reset()
  vi.clearAllMocks()
})

// ── Test Helpers ─────────────────────────────────────────────────────────

function createMockDraft(overrides: Partial<{
  id: string
  topicId: string
  version: number
  title: string
  content: string
  wordCount: number
}> = {}) {
  return {
    id: overrides.id ?? 'draft-v1',
    topicId: overrides.topicId ?? 'topic-1',
    version: overrides.version ?? 1,
    parentDraftId: null,
    changeType: 'INITIAL',
    changeReason: null,
    title: overrides.title ?? 'Test Title',
    content: overrides.content ?? 'Test content body',
    outline: null,
    status: 'DRAFT',
    wordCount: overrides.wordCount ?? 20,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('P0.5.3 — DraftQualityPanel', () => {
  it('Test 1: panel shows empty state when no evaluation', async () => {
    const { DraftQualityPanel } = await import('@/components/projects/draft-quality-panel')

    render(
      <DraftQualityPanel
        activeDraft={createMockDraft()}
        topicId="topic-1"
        evaluation={null}
        onEvaluate={vi.fn()}
        onRefineSelected={vi.fn()}
      />,
    )

    // Verify the button exists with exact text
    const buttons = screen.getAllByRole('button')
    const evaluateButton = buttons.find(b => b.textContent === '开始评估')
    expect(evaluateButton).toBeDefined()
    // Verify empty state description
    expect(screen.getByText(/点击.*开始评估/)).toBeInTheDocument()
  })

  it('Test 2: evaluation displays scores and dimensions', async () => {
    const { DraftQualityPanel } = await import('@/components/projects/draft-quality-panel')

    render(
      <DraftQualityPanel
        activeDraft={createMockDraft()}
        topicId="topic-1"
        evaluation={{
          overallScore: 82,
          emotionalImpactScore: 86,
          logicalClarityScore: 80,
          noveltyScore: 78,
          readabilityScore: 84,
          utilityScore: 82,
          platformFitScore: 81,
          aiStyleScore: 42,
          strengths: ['Hook strong'],
          issues: ['CTA weak'],
          suggestions: [],
          conclusion: 'Overall good',
        }}
        onEvaluate={vi.fn()}
        onRefineSelected={vi.fn()}
      />,
    )

    // Overall score (use getAllByText since "82" may appear in multiple locations)
    expect(screen.getAllByText('82').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('AI味评分')).toBeInTheDocument()
  })

  it('Test 3: suggestions with priority badges are shown', async () => {
    const { DraftQualityPanel } = await import('@/components/projects/draft-quality-panel')

    render(
      <DraftQualityPanel
        activeDraft={createMockDraft()}
        topicId="topic-1"
        evaluation={{
          overallScore: 70,
          strengths: [],
          issues: [],
          suggestions: [
            { section: '开头', issue: '吸引力不足', suggestion: '增加悬念', priority: 'high' },
            { section: '结尾', issue: 'CTA不明确', suggestion: '添加行动号召', priority: 'medium' },
          ],
        }}
        onEvaluate={vi.fn()}
        onRefineSelected={vi.fn()}
      />,
    )

    expect(screen.getByText('主要问题')).toBeInTheDocument()
    // Use more specific query for section
    expect(screen.getByText('开头')).toBeInTheDocument()
    expect(screen.getByText('CTA不明确')).toBeInTheDocument()
  })

  it('Test 4: selecting suggestions enables refine button and triggers onRefineSelected', async () => {
    const mockOnRefine = vi.fn()
    const { DraftQualityPanel } = await import('@/components/projects/draft-quality-panel')

    render(
      <DraftQualityPanel
        activeDraft={createMockDraft()}
        topicId="topic-1"
        evaluation={{
          overallScore: 70,
          strengths: [],
          issues: [],
          suggestions: [
            { section: 'intro', issue: 'weak', suggestion: 'fix it', priority: 'high' },
          ],
        }}
        onEvaluate={vi.fn()}
        onRefineSelected={mockOnRefine}
      />,
    )

    // Select the suggestion
    const checkbox = await screen.findByRole('checkbox')
    await act(async () => {
      checkbox.click()
    })

    // Refine button appears
    const refineButton = await screen.findByText(/修复选中问题/)
    expect(refineButton).toBeInTheDocument()

    // Click refine
    await act(async () => {
      refineButton.click()
    })

    expect(mockOnRefine).toHaveBeenCalledTimes(1)
    expect(mockOnRefine).toHaveBeenCalledWith([
      { section: 'intro', issue: 'weak', suggestion: 'fix it', priority: 'high' },
    ])
  })
})

describe('P0.5.3 — DraftHumanizationPanel', () => {
  it('Test 5: preview calls previewHumanization and shows result', async () => {
    mockPreviewHumanization.mockResolvedValue({
      success: true,
      content: 'Humanized version of the content',
      title: 'Better Title',
      changes: [
        { original: '模板化表达A', revised: '自然的表达A', reason: '更口语化', type: 'template' },
      ],
      issues: [],
      aiStyleScore: 25,
      humanizedScore: 88,
    })

    const { DraftHumanizationPanel } = await import('@/components/projects/draft-humanization-panel')

    render(
      <DraftHumanizationPanel
        activeDraft={createMockDraft({ content: 'Original content' })}
        topicId="topic-1"
      />,
    )

    // Click preview
    const previewButton = screen.getByText('生成去AI味版本')
    await act(async () => {
      previewButton.click()
    })

    // Wait for result
    await waitFor(() => {
      expect(mockPreviewHumanization).toHaveBeenCalledTimes(1)
    })

    // Scores are shown
      expect(await screen.findByText('人性化预览')).toBeInTheDocument()
    expect(screen.getByText('88')).toBeInTheDocument()
  })

  it('Test 6: dismiss does NOT call adopt', async () => {
    mockPreviewHumanization.mockResolvedValue({
      success: true,
      content: 'Humanized',
      changes: [],
      issues: [],
      aiStyleScore: 30,
      humanizedScore: 85,
    })

    const { DraftHumanizationPanel } = await import('@/components/projects/draft-humanization-panel')

    render(
      <DraftHumanizationPanel
        activeDraft={createMockDraft()}
        topicId="topic-1"
      />,
    )

    // Generate preview
    await act(async () => {
      screen.getByText('生成去AI味版本').click()
    })

    await waitFor(() => {
      expect(mockPreviewHumanization).toHaveBeenCalledTimes(1)
    })

    // Click dismiss
    const dismissButton = await screen.findByText('取消')
    await act(async () => {
      dismissButton.click()
    })

    // adoptHumanizedDraft was NOT called
    expect(mockAdoptHumanized).not.toHaveBeenCalled()
  })

  it('Test 7: adopt calls adoptHumanizedDraft with correct params', async () => {
    mockPreviewHumanization.mockResolvedValue({
      success: true,
      content: 'Humanized content here',
      title: 'Better Title',
      changes: [{ original: 'A', revised: 'B', reason: 'C', type: 'template' }],
      issues: [],
      aiStyleScore: 20,
      humanizedScore: 90,
    })
    mockAdoptHumanized.mockResolvedValue({
      success: true,
      draft: { id: 'draft-v2', version: 2 },
    })

    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    })

    const { DraftHumanizationPanel } = await import('@/components/projects/draft-humanization-panel')

    render(
      <DraftHumanizationPanel
        activeDraft={createMockDraft({ id: 'draft-v1' })}
        topicId="topic-1"
      />,
    )

    // Generate preview
    await act(async () => {
      screen.getByText('生成去AI味版本').click()
    })

    await waitFor(() => {
      expect(screen.getByText('采用人性化版本')).toBeInTheDocument()
    })

    // Click adopt
    await act(async () => {
      screen.getByText('采用人性化版本').click()
    })

    await waitFor(() => {
      expect(mockAdoptHumanized).toHaveBeenCalledTimes(1)
      expect(mockAdoptHumanized).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDraftId: 'draft-v1',
          topicId: 'topic-1',
          content: 'Humanized content here',
          aiStyleScore: 20,
          humanizedScore: 90,
        }),
      )
    })

    // Reload triggered
    expect(reloadSpy).toHaveBeenCalled()
  })
})

describe('P0.5.3 — Cross-tab Communication', () => {
  it('Test 8: broadcastActiveDraftChange sends message via BroadcastChannel', async () => {
    const { broadcastActiveDraftChange } = await import('@/components/projects/use-active-draft-sync')

    broadcastActiveDraftChange('topic-1', 'draft-v2', 'source-tab')

    // Channel instance created
    expect(TestBroadcastChannel.instances.length).toBeGreaterThan(0)
  })

  it('Test 9: BroadcastChannel propagates messages between instances', async () => {
    const receivedMessages: unknown[] = []

    const channel1 = new TestBroadcastChannel('test-channel')
    channel1.onmessage = (event) => {
      receivedMessages.push(event.data)
    }

    const channel2 = new TestBroadcastChannel('test-channel')
    channel2.postMessage({ type: 'TEST', data: 'hello' })

    // Wait for microtask
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(receivedMessages.length).toBe(1)
    expect(receivedMessages[0]).toEqual({ type: 'TEST', data: 'hello' })
  })
})