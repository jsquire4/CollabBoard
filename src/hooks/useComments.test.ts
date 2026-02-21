/**
 * Tests for useComments hook — CRUD + Realtime lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Comment } from './useComments'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockSubscribe = vi.fn(() => mockChannel)
const mockUnsubscribe = vi.fn()
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
}

const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
let mockSelectResult: { data: Comment[] | null; error: { message: string } | null } = { data: [], error: null }

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(() => Promise.resolve(mockSelectResult)),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: mockInsert,
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      delete: vi.fn(() => ({
        eq: mockDelete,
      })),
    })),
    channel: vi.fn(() => mockChannel),
  })),
}))

import { useComments } from './useComments'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BOARD_ID = 'board-123'
const OBJECT_ID = 'obj-456'

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    board_id: BOARD_ID,
    object_id: OBJECT_ID,
    user_id: 'user-1',
    user_display_name: 'Alice',
    content: 'Test comment',
    resolved_at: null,
    parent_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useComments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectResult = { data: [], error: null }
    mockDelete.mockReturnValue(Promise.resolve({ error: null }))
    mockInsert.mockResolvedValue({ data: makeComment(), error: null })
    mockSubscribe.mockReturnValue(mockChannel)
    mockChannel.on.mockReturnThis()
  })

  // 1. Loads comments on mount when objectId is set
  it('loads comments on mount when objectId is set', async () => {
    const comment = makeComment()
    mockSelectResult = { data: [comment], error: null }

    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID, enabled: true }),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.comments).toHaveLength(1)
      expect(result.current.comments[0].content).toBe('Test comment')
    })
  })

  // 2. Empty state when no comments returned
  it('shows empty state when no comments returned', async () => {
    mockSelectResult = { data: [], error: null }

    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID }),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.comments).toHaveLength(0)
    })
  })

  // 3. addComment inserts and optimistically prepends
  it('addComment optimistically adds comment before server responds', async () => {
    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Delay the insert
    mockInsert.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ data: makeComment({ id: 'real-id' }), error: null }), 50)),
    )

    act(() => {
      void result.current.addComment('New comment')
    })

    // Optimistic entry should appear immediately
    expect(result.current.comments.some(c => c.content === 'New comment')).toBe(true)

    // After resolving, temp ID should be replaced
    await waitFor(() => {
      expect(result.current.comments.some(c => c.id === 'real-id')).toBe(true)
      expect(result.current.comments.every(c => !c.id.startsWith('temp-'))).toBe(true)
    })
  })

  // 4. resolveComment sets resolved_at
  it('resolveComment sets resolved_at on comment', async () => {
    const comment = makeComment({ id: 'c1' })
    mockSelectResult = { data: [comment], error: null }

    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID }),
    )

    await waitFor(() => expect(result.current.comments).toHaveLength(1))

    await act(async () => {
      await result.current.resolveComment('c1')
    })

    expect(result.current.comments[0].resolved_at).not.toBeNull()
  })

  // 5. deleteComment removes from state
  it('deleteComment removes comment from state', async () => {
    const comment = makeComment({ id: 'c1' })
    mockSelectResult = { data: [comment], error: null }

    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID }),
    )

    await waitFor(() => expect(result.current.comments).toHaveLength(1))

    await act(async () => {
      await result.current.deleteComment('c1')
    })

    expect(result.current.comments).toHaveLength(0)
  })

  // 6. Does not load when objectId is null
  it('does not load when objectId is null', () => {
    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: null }),
    )

    // Effect should early-return: state stays at initial values
    expect(result.current.isLoading).toBe(false)
    expect(result.current.comments).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  // 7. Does not load when enabled is false
  it('does not load when enabled is false', () => {
    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID, enabled: false }),
    )

    // Effect should early-return: state stays at initial values
    expect(result.current.isLoading).toBe(false)
    expect(result.current.comments).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  // 8. Sets error when fetch fails
  it('sets error when Supabase fetch fails', async () => {
    mockSelectResult = { data: null, error: { message: 'Network error' } }

    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID }),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Network error')
    })
  })

  // 9. Subscribes to Realtime channel on mount
  it('subscribes to Realtime channel after loading', async () => {
    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID }),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockSubscribe).toHaveBeenCalled()
  })

  // 10. Unsubscribes from Realtime channel on unmount
  it('unsubscribes from Realtime channel on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  // 11. Removes optimistic entry on insert failure
  it('removes optimistic entry when insert fails', async () => {
    mockInsert.mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } })

    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: OBJECT_ID }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addComment('Failing comment')
    })

    await waitFor(() => {
      // Optimistic entry should be removed
      expect(result.current.comments.every(c => c.content !== 'Failing comment')).toBe(true)
    })
  })

  // 12. addComment does nothing when objectId is null
  it('addComment does nothing when objectId is null', async () => {
    const { result } = renderHook(() =>
      useComments({ boardId: BOARD_ID, objectId: null }),
    )

    await act(async () => {
      await result.current.addComment('Should not be added')
    })

    expect(result.current.comments).toHaveLength(0)
  })
})
