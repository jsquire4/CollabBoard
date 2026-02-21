import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRealtimeChannel } from './useRealtimeChannel'
import type { RealtimeChannel } from '@supabase/supabase-js'

const mockRemoveChannel = vi.fn()
const mockSocketRemove = vi.fn()
const mockChannel = vi.fn()
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } })

function createMockChannel(state: string = 'closed'): RealtimeChannel & { state: string } {
  return {
    state,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
    track: vi.fn(),
    untrack: vi.fn(),
    send: vi.fn(),
    socket: { _remove: mockSocketRemove },
  } as unknown as RealtimeChannel & { state: string }
}

const mockDisconnect = vi.fn()
const mockSetAuth = vi.fn()

const mockSupabase = {
  channel: vi.fn(),
  removeChannel: mockRemoveChannel,
  auth: { getSession: mockGetSession },
  realtime: { disconnect: mockDisconnect, setAuth: mockSetAuth },
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

describe('useRealtimeChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } })
    mockChannel.mockImplementation((name: string) => {
      const ch = createMockChannel('closed')
      ;(ch as unknown as { _name: string })._name = name
      return ch
    })
    mockSupabase.channel = mockChannel
  })

  it('creates channel with board: prefix after auth session is primed', async () => {
    const { result } = renderHook(() => useRealtimeChannel('board-123'))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    expect(mockGetSession).toHaveBeenCalled()
    expect(mockChannel).toHaveBeenCalledWith('board:board-123')
    expect(result.current).toBe(mockChannel.mock.results[0]?.value)
  })

  it('explicitly sets auth token on Realtime transport before creating channel', async () => {
    renderHook(() => useRealtimeChannel('board-fresh'))

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalled()
    })

    // setAuth() must be called with the token before channel creation
    expect(mockSetAuth).toHaveBeenCalledWith('test-token')
    const setAuthOrder = mockSetAuth.mock.invocationCallOrder[0]
    const channelOrder = mockChannel.mock.invocationCallOrder[0]
    expect(setAuthOrder).toBeLessThan(channelOrder)

    // disconnect() should NOT be called during setup
    expect(mockDisconnect).not.toHaveBeenCalled()
  })

  it('returns null initially then channel after getSession resolves', async () => {
    // Initially null before getSession resolves
    const { result } = renderHook(() => useRealtimeChannel('board-456'))
    // May be null immediately since getSession is async
    // After resolution, channel should be set
    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })
  })

  it('disconnects socket and removes channel from socket on unmount', async () => {
    const ch = createMockChannel('closed')
    mockChannel.mockReturnValue(ch)

    const { unmount } = renderHook(() => useRealtimeChannel('board-789'))

    // Wait for channel to be created
    await act(async () => {
      await mockGetSession()
    })

    unmount()

    // disconnect() is called to kill the WebSocket cleanly (no CLOSED callbacks)
    expect(mockDisconnect).toHaveBeenCalled()
    expect(mockSocketRemove).toHaveBeenCalledWith(ch)
    // ch.unsubscribe() should NOT be called — disconnect() handles cleanup
    // without triggering synchronous CLOSED callbacks that confuse useConnectionManager
    expect(ch.unsubscribe).not.toHaveBeenCalled()
  })

  it('does not call untrack on cleanup (disconnect handles it)', async () => {
    const ch = createMockChannel('joined')
    const untrackSpy = vi.spyOn(ch, 'untrack')
    mockChannel.mockReturnValue(ch)

    const { unmount } = renderHook(() => useRealtimeChannel('board-joined'))

    await act(async () => {
      await mockGetSession()
    })

    unmount()

    // untrack is no longer called — disconnect() closes the socket and the
    // server handles presence cleanup via timeout
    expect(untrackSpy).not.toHaveBeenCalled()
    expect(mockDisconnect).toHaveBeenCalled()
    expect(mockSocketRemove).toHaveBeenCalledWith(ch)
  })

  it('recreates channel when boardId changes', async () => {
    const { rerender } = renderHook(
      ({ boardId }: { boardId: string }) => useRealtimeChannel(boardId),
      { initialProps: { boardId: 'board-1' } }
    )

    await act(async () => {
      await mockGetSession()
    })

    expect(mockChannel).toHaveBeenCalledWith('board:board-1')
    expect(mockSocketRemove).not.toHaveBeenCalled()

    rerender({ boardId: 'board-2' })

    await act(async () => {
      await mockGetSession()
    })

    expect(mockChannel).toHaveBeenCalledWith('board:board-2')
    expect(mockSocketRemove).toHaveBeenCalledTimes(1)
  })

  it('does not create channel if effect is cancelled before getSession resolves', async () => {
    // Slow getSession
    let resolveSession: () => void
    mockGetSession.mockReturnValue(new Promise<{ data: { session: null } }>(r => {
      resolveSession = () => r({ data: { session: null } })
    }))

    const { unmount } = renderHook(() => useRealtimeChannel('board-cancel'))

    // Unmount before getSession resolves
    unmount()

    // Now resolve
    await act(async () => {
      resolveSession!()
    })

    // Channel should NOT have been created since the effect was cancelled
    expect(mockChannel).not.toHaveBeenCalled()
  })
})
