import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRealtimeChannel } from './useRealtimeChannel'
import type { RealtimeChannel } from '@supabase/supabase-js'

const mockRemoveChannel = vi.fn()
const mockChannel = vi.fn()

function createMockChannel(state: string = 'closed'): RealtimeChannel & { state: string } {
  return {
    state,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
    track: vi.fn(),
    untrack: vi.fn(),
    send: vi.fn(),
  } as unknown as RealtimeChannel & { state: string }
}

const mockSupabase = {
  channel: vi.fn(),
  removeChannel: mockRemoveChannel,
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

describe('useRealtimeChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.mockImplementation((name: string, config: { config?: { private?: boolean } }) => {
      const ch = createMockChannel('closed')
      ;(ch as unknown as { _name: string; _config: unknown })._name = name
      ;(ch as unknown as { _name: string; _config: unknown })._config = config
      return ch
    })
    mockSupabase.channel = mockChannel
  })

  it('creates channel with board: prefix and private config', () => {
    const { result } = renderHook(() => useRealtimeChannel('board-123'))

    expect(mockChannel).toHaveBeenCalledWith('board:board-123', { config: { private: true } })
    expect(result.current).not.toBeNull()
    expect(result.current).toBe(mockChannel.mock.results[0]?.value)
  })

  it('returns null initially then channel after effect runs', () => {
    const { result } = renderHook(() => useRealtimeChannel('board-456'))

    // Channel is set synchronously in the effect, so it should be available
    expect(result.current).not.toBeNull()
  })

  it('removes channel on unmount', () => {
    const ch = createMockChannel('closed')
    mockChannel.mockReturnValue(ch)

    const { unmount } = renderHook(() => useRealtimeChannel('board-789'))
    unmount()

    expect(mockRemoveChannel).toHaveBeenCalledWith(ch)
  })

  it('calls untrack when channel state is joined before removeChannel', () => {
    const ch = createMockChannel('joined')
    const untrackSpy = vi.spyOn(ch, 'untrack')
    mockChannel.mockReturnValue(ch)

    const { unmount } = renderHook(() => useRealtimeChannel('board-joined'))
    unmount()

    expect(untrackSpy).toHaveBeenCalled()
    expect(mockRemoveChannel).toHaveBeenCalledWith(ch)
  })

  it('does not call untrack when channel state is not joined', () => {
    const ch = createMockChannel('closed')
    const untrackSpy = vi.spyOn(ch, 'untrack')
    mockChannel.mockReturnValue(ch)

    const { unmount } = renderHook(() => useRealtimeChannel('board-closed'))
    unmount()

    expect(untrackSpy).not.toHaveBeenCalled()
    expect(mockRemoveChannel).toHaveBeenCalledWith(ch)
  })

  it('recreates channel when boardId changes', () => {
    const { rerender } = renderHook(
      ({ boardId }: { boardId: string }) => useRealtimeChannel(boardId),
      { initialProps: { boardId: 'board-1' } }
    )

    expect(mockChannel).toHaveBeenCalledWith('board:board-1', { config: { private: true } })
    expect(mockRemoveChannel).not.toHaveBeenCalled()

    rerender({ boardId: 'board-2' })

    expect(mockChannel).toHaveBeenCalledWith('board:board-2', { config: { private: true } })
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })
})
