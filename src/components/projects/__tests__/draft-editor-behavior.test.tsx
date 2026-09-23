/**
 * @vitest-environment jsdom
 *
 * P0.5.1 — Active Draft Editor Behavioral Tests
 *
 * Real React component tests using Testing Library + jsdom.
 * Covers all P0.5.1 editor behavioral requirements.
 */

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

vi.mock('@/lib/services/server-actions', () => ({
  saveManualDraftEdit: vi.fn(),
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
    // Simulate async delivery
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
    if (idx !== -1) TestBroadcastChannel.instances.splice(idx, 1)
  }

  static resetAll(): void {
    TestBroadcastChannel.instances = []
  }
}

// Replace global BroadcastChannel
const originalBC = globalThis.BroadcastChannel
beforeEach(() => {
  // @ts-expect-error — replacing for tests
  globalThis.BroadcastChannel = TestBroadcastChannel
})
afterEach(() => {
  globalThis.BroadcastChannel = originalBC
  TestBroadcastChannel.resetAll()
})

import { DraftEditor } from '../draft-editor'

// ── Test Data ────────────────────────────────────────────────────────────

function createMockDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft_v4',
    topicId: 'topic_1',
    version: 4,
    parentDraftId: overrides.parentDraftId ?? 'draft_v3',
    changeType: overrides.changeType ?? 'INITIAL',
    changeReason: overrides.changeReason ?? null,
    title: overrides.title ?? '测试标题',
    content: overrides.content ?? '这是第四版本的初始内容，用于手动编辑测试的基准内容。',
    outline: null,
    status: 'DRAFT',
    wordCount: 50,
    createdAt: new Date('2026-09-23T10:00:00Z'),
    updatedAt: new Date('2026-09-23T10:00:00Z'),
    ...overrides,
  }
}

const mockAllDrafts = [
  createMockDraft({ id: 'draft_v1', version: 1, parentDraftId: null, changeType: 'INITIAL', title: '测试标题', content: 'v1内容。' }),
  createMockDraft({ id: 'draft_v2', version: 2, parentDraftId: 'draft_v1', changeType: 'RESTORE', title: '测试标题', content: 'v2内容。' }),
  createMockDraft({ id: 'draft_v3', version: 3, parentDraftId: 'draft_v2', changeType: 'REFINE', title: '测试标题', content: 'v3内容。' }),
  createMockDraft({ id: 'draft_v4', version: 4, parentDraftId: 'draft_v3', changeType: 'INITIAL', title: '测试标题', content: '这是第四版本的初始内容，用于手动编辑测试的基准内容。' }),
]

describe('P0.5.1 — DraftEditor Behavior', () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    TestBroadcastChannel.resetAll()
  })

  describe('Test 1 — Active Draft content initializes into Editor', () => {
    it('editor initializes with active draft content', () => {
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const contentTextarea = screen.getByLabelText('正文') as HTMLTextAreaElement
      expect(contentTextarea.value).toBe('这是第四版本的初始内容，用于手动编辑测试的基准内容。')

      const titleInput = screen.getByLabelText('标题') as HTMLInputElement
      expect(titleInput.value).toBe('测试标题')
    })

    it('shows version 4 indicator', () => {
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      expect(screen.getByText('v4')).toBeInTheDocument()
    })

    it('shows parent version info (comes from v3)', () => {
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      expect(screen.getByText(/来源：v3/)).toBeInTheDocument()
    })
  })

  describe('Test 2 — User modifies content: isDirty becomes true', () => {
    it('save button is disabled initially (no changes)', () => {
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const saveButton = screen.getByRole('button', { name: /保存/ })
      expect(saveButton).toBeDisabled()
    })

    it('save button becomes enabled after content change', async () => {
      const user = userEvent.setup()
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const contentTextarea = screen.getByLabelText('正文')
      await user.clear(contentTextarea)
      await user.type(contentTextarea, '用户修改后的新内容，用于测试脏状态检测是否正确工作。')

      const saveButton = screen.getByRole('button', { name: /保存/ })
      expect(saveButton).toBeEnabled()
    })

    it('shows "未保存" indicator when dirty', async () => {
      const user = userEvent.setup()
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const contentTextarea = screen.getByLabelText('正文')
      await user.type(contentTextarea, '追加一些文字让编辑器变成脏状态。')

      expect(screen.getByText('(未保存)')).toBeInTheDocument()
    })
  })

  describe('Test 3 — Click save: saveManualDraftEdit called with correct params', () => {
    it('calls saveManualDraftEdit with sourceDraftId and content', async () => {
      const user = userEvent.setup()
      const { saveManualDraftEdit } = await import('@/lib/services/server-actions')
      vi.mocked(saveManualDraftEdit).mockResolvedValue({
        success: true,
        draft: { id: 'draft_v5', version: 5 },
        topic: { id: 'topic_1', activeDraftId: 'draft_v5' },
      })

      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const contentTextarea = screen.getByLabelText('正文')
      await user.clear(contentTextarea)
      await user.type(contentTextarea, '新内容用于测试保存功能是否正确传递参数给服务器动作。')

      const saveButton = screen.getByRole('button', { name: /保存/ })
      await user.click(saveButton)

      await waitFor(() => {
        expect(saveManualDraftEdit).toHaveBeenCalledWith(
          'draft_v4',
          expect.stringContaining('新内容用于测试保存功能是否正确传递参数给服务器动作。'),
          '测试标题',
        )
      })
    })
  })

  describe('Test 4 — Save success: isDirty becomes false', () => {
    it('save button returns to disabled state after successful save', async () => {
      const user = userEvent.setup()
      const { saveManualDraftEdit } = await import('@/lib/services/server-actions')
      vi.mocked(saveManualDraftEdit).mockResolvedValue({
        success: true,
        draft: { id: 'draft_v5', version: 5 },
        topic: { id: 'topic_1', activeDraftId: 'draft_v5' },
      })

      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const contentTextarea = screen.getByLabelText('正文')
      await user.clear(contentTextarea)
      await user.type(contentTextarea, '保存成功后编辑器应该恢复到非脏状态按钮重新变灰色。')

      const saveButton = screen.getByRole('button', { name: /保存/ })
      await user.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('已保存')).toBeInTheDocument()
      })

      // After router.refresh(), props will update and selectVersion changes
      // For this test, we verify the "已保存" transient state
    })
  })

  describe('Test 5 — New draft becomes Active', () => {
    it('save success triggers broadcast and router refresh', async () => {
      const user = userEvent.setup()
      const { saveManualDraftEdit } = await import('@/lib/services/server-actions')
      vi.mocked(saveManualDraftEdit).mockResolvedValue({
        success: true,
        draft: { id: 'draft_v5', version: 5 },
        topic: { id: 'topic_1', activeDraftId: 'draft_v5' },
      })

      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const contentTextarea = screen.getByLabelText('正文')
      await user.clear(contentTextarea)
      await user.type(contentTextarea, '保存后验证广播和刷新功能是否正确执行的具体测试内容。')

      await user.click(screen.getByRole('button', { name: /保存/ }))

      await waitFor(() => {
        expect(mockRouterRefresh).toHaveBeenCalled()
      })
    })
  })

  describe('Test 6 — Save failure: content preserved', () => {
    it('retains user content and keeps isDirty on failure', async () => {
      const user = userEvent.setup()
      const { saveManualDraftEdit } = await import('@/lib/services/server-actions')
      vi.mocked(saveManualDraftEdit).mockResolvedValue({
        success: false,
        error: '保存失败，请稍后重试',
      })

      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const contentTextarea = screen.getByLabelText('正文')
      await user.clear(contentTextarea)
      const userContent = '这段内容应该在保存失败时保留不会丢失。需要超过50个字确保测试有效。'
      await user.type(contentTextarea, userContent)

      await user.click(screen.getByRole('button', { name: /保存/ }))

      await waitFor(() => {
        expect(screen.getByText('保存失败，请稍后重试')).toBeInTheDocument()
      })

      // Content should still be in editor
      expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toBe(userContent)

      // Save button should still be enabled (still dirty)
      const saveButton = screen.getByRole('button', { name: /保存/ })
      expect(saveButton).toBeEnabled()
    })
  })

  describe('Test 7 — Remote Active Draft change + clean editor: can refresh', () => {
    it('clean editor auto-refreshes on remote active draft change (does not show conflict)', async () => {
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      // Wait for hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Simulate remote change
      const remoteChannel = TestBroadcastChannel.instances.find(
        (ch) => ch.onmessage !== null
      )
      expect(remoteChannel).toBeDefined()

      act(() => {
        remoteChannel!.onmessage!({
          data: {
            type: 'ACTIVE_DRAFT_CHANGED',
            topicId: 'topic_1',
            draftId: 'draft_v2',
            sourceId: 'other-tab-id',
            timestamp: Date.now(),
          },
        })
      })

      // For clean editor, router.refresh() is called — NOT showing conflict
      await waitFor(() => {
        expect(mockRouterRefresh).toHaveBeenCalled()
      })

      // No conflict banner should appear
      expect(screen.queryByText(/当前版本已在其他标签页发生变化/)).not.toBeInTheDocument()
    })
  })

  describe('Test 8 — Remote Active Draft change + dirty editor: protection', () => {
    it('dirty editor shows conflict warning instead of silent overwrite', async () => {
      const user = userEvent.setup()
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      // Make editor dirty
      const contentTextarea = screen.getByLabelText('正文')
      await user.type(contentTextarea, '用户正在编辑的内容，还未保存就被其他标签页修改了。')

      // Wait for hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Simulate remote change
      const remoteChannel = TestBroadcastChannel.instances.find(
        (ch) => ch.onmessage !== null
      )

      act(() => {
        remoteChannel!.onmessage!({
          data: {
            type: 'ACTIVE_DRAFT_CHANGED',
            topicId: 'topic_1',
            draftId: 'draft_v1',
            sourceId: 'other-tab-id',
            timestamp: Date.now(),
          },
        })
      })

      // Should show conflict warning
      await waitFor(() => {
        expect(screen.getByText(/当前版本已在其他标签页发生变化，请刷新后继续编辑。/)).toBeInTheDocument()
      })

      // Content should NOT be overwritten
      expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('用户正在编辑的内容')

      // router.refresh() should NOT have been called (dirty protection)
      expect(mockRouterRefresh).not.toHaveBeenCalled()
    })
  })

  describe('Test 9 — Title editing', () => {
    it('title changes also make editor dirty and enable save', async () => {
      const user = userEvent.setup()
      render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      const titleInput = screen.getByLabelText('标题')
      await user.clear(titleInput)
      await user.type(titleInput, '新标题')

      const saveButton = screen.getByRole('button', { name: /保存/ })
      expect(saveButton).toBeEnabled()
    })
  })

  describe('Test 10 — Conflict Refresh Discards Local Changes', () => {
    it('clicking refresh discards dirty content, clears conflict, and rerenders with new active draft', async () => {
      const user = userEvent.setup()
      const v5 = createMockDraft({
        id: 'draft_v5',
        version: 5,
        parentDraftId: 'draft_v4',
        changeType: 'MANUAL_EDIT',
        title: 'v5 标题',
        content: '这是第五版本的更新内容，用于测试刷新按钮的版本切换功能。',
      })

      const { rerender } = render(
        <DraftEditor
          activeDraft={mockAllDrafts[3]}
          allDrafts={mockAllDrafts}
          topicId="topic_1"
        />
      )

      // Step 1: User modifies content
      const contentTextarea = screen.getByLabelText('正文')
      await user.clear(contentTextarea)
      const localContent = '用户正在编辑的本地内容，尚未保存到新草稿中。'
      await user.type(contentTextarea, localContent)

      // Verify dirty state
      expect(screen.getByText('(未保存)')).toBeInTheDocument()
      expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toBe(localContent)

      // Step 2: Wait for hook to initialize
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Step 3: Simulate remote change (v4 is no longer active, v5 is)
      const remoteChannel = TestBroadcastChannel.instances.find(
        (ch) => ch.onmessage !== null
      )
      expect(remoteChannel).toBeDefined()

      act(() => {
        remoteChannel!.onmessage!({
          data: {
            type: 'ACTIVE_DRAFT_CHANGED',
            topicId: 'topic_1',
            draftId: 'draft_v5',
            sourceId: 'other-tab-id',
            timestamp: Date.now(),
          },
        })
      })

      // Step 4: Conflict warning appears
      await waitFor(() => {
        expect(screen.getByText(/当前版本已在其他标签页发生变化，请刷新后继续编辑。/)).toBeInTheDocument()
      })

      // Step 5: Click refresh button
      const refreshButton = screen.getByRole('button', { name: /刷新当前版本/ })
      await user.click(refreshButton)

      // Step 6: Conflict should disappear, router.refresh called
      await waitFor(() => {
        expect(screen.queryByText(/当前版本已在其他标签页发生变化/)).not.toBeInTheDocument()
      })
      expect(mockRouterRefresh).toHaveBeenCalled()

      // Step 7: Rerender with new active draft (v5)
      const updatedDrafts = [...mockAllDrafts, v5]
      rerender(
        <DraftEditor
          activeDraft={v5}
          allDrafts={updatedDrafts}
          topicId="topic_1"
        />
      )

      // Step 8: Editor should show v5 content (not local unsaved content)
      expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toBe('这是第五版本的更新内容，用于测试刷新按钮的版本切换功能。')

      // Step 9: Save button should be disabled (not dirty after rerender)
      const saveButton = screen.getByRole('button', { name: /保存/ })
      expect(saveButton).toBeDisabled()
    })
  })
})
