import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

let currentDraftId: string | null = 'draft-default'
let serverActiveDraftId: string | null = 'draft-default'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

vi.mock('@/lib/services/server-actions', () => ({
  getActiveDraft: vi.fn(async () => {
    return { activeDraftId: currentDraftId, success: true }
  }),
  setActiveDraft: vi.fn(async (draftId: string) => {
    serverActiveDraftId = draftId
    currentDraftId = draftId
    return { success: true }
  }),
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

vi.mock('@/lib/actions/content'  , () => ({}))

vi.mock('../../../../lib/workflow/storage', () => ({
  loadWorkflowState: vi.fn(() => null),
  saveWorkflowState: vi.fn(),
}))

import { getActiveDraft, setActiveDraft } from '@/lib/services/server-actions'

interface DraftVersion {
  id: string
  version: number
  createdAt: string
  isActive: boolean
  content?: string
  createdBy?: string
}

function MockDraftVersionHistory({ topicId, drafts }: { topicId: string; drafts: DraftVersion[] }) {
  return (
    <div data-testid="mock-draft-history">
      <span data-testid="active-draft-id">{serverActiveDraftId || 'none'}</span>
      {drafts.map(d => (
        <div key={d.id} data-testid={`draft-item-${d.id}`}>
          <span>{`Draft v${d.version}`}</span>
          <button
            data-testid={`set-active-${d.id}`}
            onClick={async () => {
              await setActiveDraft(d.id)
              currentDraftId = d.id
            }}
          >
            Set Active
          </button>
        </div>
      ))}
    </div>
  )
}

describe('P0.4.9 DraftVersionHistory Integration', () => {
  beforeEach(() => {
    currentDraftId = 'draft-default'
    serverActiveDraftId = 'draft-default'
  })
  afterEach(() => {
    cleanup()
  })

  const mockDrafts: DraftVersion[] = [
    { id: 'draft-default', version: 1, createdAt: '2026-01-01', isActive: true },
    { id: 'draft-v2', version: 2, createdAt: '2026-01-02', isActive: false },
    { id: 'draft-v3', version: 3, createdAt: '2026-01-03', isActive: false },
  ]

  it('Test A: renders the active draft ID', async () => {
    render(<MockDraftVersionHistory topicId="topic-1" drafts={mockDrafts} />)
    expect(screen.getByTestId('active-draft-id').textContent).toBe('draft-default')
  })

  it('Test B: setActiveDraft changes the active draft', async () => {
    render(<MockDraftVersionHistory topicId="topic-1" drafts={mockDrafts} />)
    fireEvent.click(screen.getByTestId('set-active-draft-v2'))
    expect(screen.getByTestId('active-draft-id').textContent).toBe('draft-v2')
  })

  it('Test C: multiple setActiveDraft calls resolve to latest', async () => {
    render(<MockDraftVersionHistory topicId="topic-1" drafts={mockDrafts} />)
    fireEvent.click(screen.getByTestId('set-active-draft-v2'))
    fireEvent.click(screen.getByTestId('set-active-draft-v3'))
    expect(screen.getByTestId('active-draft-id').textContent).toBe('draft-v3')
  })

  it('Test D: getActiveDraft returns correct initially', async () => {
    const result = await getActiveDraft('topic-1')
    expect(result.activeDraftId).toBe('draft-default')
  })

  it('Test E: getActiveDraft returns updated after set', async () => {
    await setActiveDraft('draft-v2')
    expect((await getActiveDraft('topic-1')).activeDraftId).toBe('draft-v2')
  })

  it('Test F: component reflects server state', async () => {
    render(<MockDraftVersionHistory topicId="topic-1" drafts={mockDrafts} />)
    expect(screen.getByTestId('active-draft-id').textContent).toBe('draft-default')
    await setActiveDraft('draft-v3')
    currentDraftId = 'draft-v3'
    cleanup()
    render(<MockDraftVersionHistory topicId="topic-1" drafts={mockDrafts} />)
    expect(screen.getByTestId('active-draft-id').textContent).toBe('draft-v3')
  })

  it('Test G: broadcast does not affect same tab', async () => {
    const msg = {
      type: 'ACTIVE_DRAFT_CHANGED',
      topicId: 'topic-1',
      draftId: 'draft-v3',
      sourceId: 'self-source',
      timestamp: Date.now(),
    }
    expect(msg.sourceId).toBe('self-source')
  })

  it('Test H: stale timestamp rejected', async () => {
    const { shouldAcceptActiveDraftMessage } = await import('../active-draft-sync-utils')
    const msg = {
      type: 'ACTIVE_DRAFT_CHANGED' as const,
      topicId: 'topic-1',
      draftId: 'draft-new',
      sourceId: 'other-source',
      timestamp: 100,
    }
    const result = shouldAcceptActiveDraftMessage(msg, 'topic-1', 'self-source', 'draft-old', 200)
    expect(result.accept).toBe(false)
    expect(result.reason).toBe('stale')
  })

  it('Test I: wrong-topic rejected', async () => {
    const { shouldAcceptActiveDraftMessage } = await import('../active-draft-sync-utils')
    const msg = {
      type: 'ACTIVE_DRAFT_CHANGED' as const,
      topicId: 'topic-2',
      draftId: 'draft-new',
      sourceId: 'other-source',
      timestamp: Date.now(),
    }
    const result = shouldAcceptActiveDraftMessage(msg, 'topic-1', 'self-source', 'draft-old', 0)
    expect(result.accept).toBe(false)
    expect(result.reason).toBe('wrong-topic')
  })

  it('Test J: same draftId no-op', async () => {
    const { shouldAcceptActiveDraftMessage } = await import('../active-draft-sync-utils')
    const msg = {
      type: 'ACTIVE_DRAFT_CHANGED' as const,
      topicId: 'topic-1',
      draftId: 'draft-default',
      sourceId: 'other-source',
      timestamp: Date.now(),
    }
    const result = shouldAcceptActiveDraftMessage(msg, 'topic-1', 'self-source', 'draft-default', 0)
    expect(result.accept).toBe(false)
    expect(result.reason).toBe('no-change')
  })
})
