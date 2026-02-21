/**
 * Presence lifecycle integration tests.
 *
 * Exercises the full join → leave → reconnect → rejoin cycle by wiring
 * usePresence + useConnectionManager together with a mock channel, the
 * same way BoardClient does. These tests guard against regressions where
 * users become invisible after transient disconnections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePresence, type OnlineUser } from './usePresence'
import { useConnectionManager } from './board/useConnectionManager'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubscribeCallback = (status: string) => void
type PresenceHandler = (payload: unknown) => void

interface MockChannel {
  _subscribeCb?: SubscribeCallback
  _presenceHandlers: Record<string, PresenceHandler>
  _presenceState: Record<string, OnlineUser[]>
  state: string
  subscribe: ReturnType<typeof vi.fn>
  unsubscribe: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  track: ReturnType<typeof vi.fn>
  untrack: ReturnType<typeof vi.fn>
  presenceState: ReturnType<typeof vi.fn>
  /** Simulate the Supabase channel reaching SUBSCRIBED */
  _emitSubscribed: () => void
  /** Simulate a channel error */
  _emitError: (kind?: string) => void
  /** Simulate a remote user joining presence */
  _simulateJoin: (user: OnlineUser) => void
  /** Simulate a remote user leaving presence */
  _simulateLeave: (userId: string) => void
  /** Simulate a full presence sync */
  _simulateSync: () => void
}

function createTestChannel(): MockChannel {
  const presenceHandlers: Record<string, PresenceHandler> = {}
  const presenceState: Record<string, OnlineUser[]> = {}

  const channel: MockChannel = {
    _presenceHandlers: presenceHandlers,
    _presenceState: presenceState,
    state: 'closed',

    subscribe: vi.fn((cb?: SubscribeCallback) => {
      if (cb) channel._subscribeCb = cb
    }),
    unsubscribe: vi.fn(() => {
      channel.state = 'closed'
    }),
    on: vi.fn((_type: string, opts: { event?: string }, handler: PresenceHandler) => {
      if (opts?.event) presenceHandlers[opts.event] = handler
      return channel
    }),
    track: vi.fn(),
    untrack: vi.fn(),
    presenceState: vi.fn(() => presenceState),

    _emitSubscribed() {
      channel.state = 'joined'
      channel._subscribeCb?.('SUBSCRIBED')
    },
    _emitError(kind = 'CHANNEL_ERROR') {
      channel._subscribeCb?.(kind)
    },
    _simulateJoin(user: OnlineUser) {
      // Update internal state
      if (!presenceState[user.user_id]) presenceState[user.user_id] = []
      presenceState[user.user_id].push(user)
      // Fire join handler
      presenceHandlers.join?.({ key: user.user_id, newPresences: [user], currentPresences: [] })
    },
    _simulateLeave(userId: string) {
      const left = presenceState[userId] ?? []
      delete presenceState[userId]
      presenceHandlers.leave?.({ key: userId, leftPresences: left.length ? left : [{ user_id: userId }], currentPresences: [] })
    },
    _simulateSync() {
      presenceHandlers.sync?.({})
    },
  } as unknown as MockChannel

  return channel
}

function createMockSupabaseRef() {
  const ref = {
    current: {
      auth: {
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      realtime: {
        disconnect: vi.fn(),
      },
    } as unknown as SupabaseClient,
  }
  return ref
}

const bob: OnlineUser = { user_id: 'bob', display_name: 'Bob', color: '#C2185B', role: 'editor' }
const carol: OnlineUser = { user_id: 'carol', display_name: 'Carol', color: '#7B1FA2', role: 'viewer' }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Presence lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Helper: render both hooks wired together like BoardClient does. */
  function setup(userId = 'alice') {
    const channel = createTestChannel()
    const supabaseRef = createMockSupabaseRef()
    const reconcileOnReconnect = vi.fn()

    const { result } = renderHook(() => {
      const presence = usePresence(channel as unknown as RealtimeChannel, userId, 'editor', userId.charAt(0).toUpperCase() + userId.slice(1))
      const connection = useConnectionManager({
        channel: channel as unknown as RealtimeChannel,
        trackPresence: presence.trackPresence,
        reconcileOnReconnect,
        supabaseRef,
      })
      return { ...presence, ...connection }
    })

    return { channel, result, reconcileOnReconnect }
  }

  // ---- Initial join ----

  it('tracks presence on initial SUBSCRIBED', () => {
    const { channel, result } = setup()

    act(() => channel._emitSubscribed())

    expect(channel.track).toHaveBeenCalledTimes(1)
    expect(channel.track).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'alice', status: 'active' })
    )
    expect(result.current.connectionStatus).toBe('connected')
  })

  it('sees a remote user who joins after initial subscribe', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    act(() => channel._simulateJoin(bob))

    expect(result.current.onlineUsers).toHaveLength(1)
    expect(result.current.onlineUsers[0]!.user_id).toBe('bob')
  })

  it('sees multiple remote users join', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    act(() => channel._simulateJoin(bob))
    act(() => channel._simulateJoin(carol))

    expect(result.current.onlineUsers).toHaveLength(2)
    const ids = result.current.onlineUsers.map(u => u.user_id).sort()
    expect(ids).toEqual(['bob', 'carol'])
  })

  it('removes a remote user who leaves', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    act(() => channel._simulateJoin(bob))
    expect(result.current.onlineUsers).toHaveLength(1)

    act(() => channel._simulateLeave('bob'))
    expect(result.current.onlineUsers).toHaveLength(0)
  })

  it('does not include self in onlineUsers on sync', () => {
    const { channel, result } = setup('alice')
    act(() => channel._emitSubscribed())

    // Simulate sync with self + another user in presenceState
    channel._presenceState['alice'] = [
      { user_id: 'alice', display_name: 'Alice', color: '#000', role: 'editor' },
    ]
    channel._presenceState['bob'] = [bob]

    act(() => channel._simulateSync())

    expect(result.current.onlineUsers).toHaveLength(1)
    expect(result.current.onlineUsers[0]!.user_id).toBe('bob')
  })

  it('does not include self in onlineUsers on join', () => {
    const { channel, result } = setup('alice')
    act(() => channel._emitSubscribed())

    act(() => {
      channel._presenceHandlers.join?.({
        key: 'alice',
        newPresences: [{ user_id: 'alice', display_name: 'Alice', color: '#000', role: 'editor' }],
        currentPresences: [],
      })
    })

    expect(result.current.onlineUsers).toHaveLength(0)
  })

  // ---- Reconnection ----

  it('re-tracks presence after reconnection (the critical bug regression)', () => {
    const { channel, result } = setup()

    // Initial connect
    act(() => channel._emitSubscribed())
    expect(channel.track).toHaveBeenCalledTimes(1)

    // Simulate transient error
    act(() => channel._emitError('CHANNEL_ERROR'))
    expect(result.current.connectionStatus).toBe('reconnecting')

    // Advance past reconnect delay
    act(() => vi.advanceTimersByTime(2000))

    // Channel re-subscribes → SUBSCRIBED fires again
    act(() => channel._emitSubscribed())

    // trackPresence must be called again — this was the bug
    expect(channel.track).toHaveBeenCalledTimes(2)
    expect(result.current.connectionStatus).toBe('connected')
  })

  it('re-tracks presence after TIMED_OUT reconnection', () => {
    const { channel } = setup()

    act(() => channel._emitSubscribed())
    expect(channel.track).toHaveBeenCalledTimes(1)

    act(() => channel._emitError('TIMED_OUT'))
    act(() => vi.advanceTimersByTime(2000))
    act(() => channel._emitSubscribed())

    expect(channel.track).toHaveBeenCalledTimes(2)
  })

  it('re-tracks presence after CLOSED reconnection', () => {
    const { channel } = setup()

    act(() => channel._emitSubscribed())
    expect(channel.track).toHaveBeenCalledTimes(1)

    act(() => channel._emitError('CLOSED'))
    act(() => vi.advanceTimersByTime(2000))
    act(() => channel._emitSubscribed())

    expect(channel.track).toHaveBeenCalledTimes(2)
  })

  it('re-tracks presence after multiple consecutive reconnections', () => {
    const { channel } = setup()

    act(() => channel._emitSubscribed())
    expect(channel.track).toHaveBeenCalledTimes(1)

    // First reconnect
    act(() => channel._emitError())
    act(() => vi.advanceTimersByTime(2000))
    act(() => channel._emitSubscribed())
    expect(channel.track).toHaveBeenCalledTimes(2)

    // Second reconnect
    act(() => channel._emitError())
    act(() => vi.advanceTimersByTime(2000))
    act(() => channel._emitSubscribed())
    expect(channel.track).toHaveBeenCalledTimes(3)

    // Third reconnect
    act(() => channel._emitError())
    act(() => vi.advanceTimersByTime(4000))
    act(() => channel._emitSubscribed())
    expect(channel.track).toHaveBeenCalledTimes(4)
  })

  it('preserves idle status across reconnection', () => {
    const { channel, result } = setup()

    act(() => channel._emitSubscribed())
    act(() => result.current.updatePresence('idle'))
    expect(channel.track).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'idle' })
    )

    // Reconnect
    act(() => channel._emitError())
    act(() => vi.advanceTimersByTime(2000))
    act(() => channel._emitSubscribed())

    // After reconnect, status should still be idle
    expect(channel.track).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'idle' })
    )
  })

  it('sees existing users via sync after reconnect', () => {
    const { channel, result } = setup()

    act(() => channel._emitSubscribed())

    // Bob joins
    act(() => channel._simulateJoin(bob))
    expect(result.current.onlineUsers).toHaveLength(1)

    // Reconnect cycle — Bob is lost during unsubscribe
    act(() => channel._emitError())
    act(() => vi.advanceTimersByTime(2000))
    act(() => channel._emitSubscribed())

    // After reconnect, a sync event fires with Bob still present
    channel._presenceState['bob'] = [bob]
    act(() => channel._simulateSync())

    expect(result.current.onlineUsers).toHaveLength(1)
    expect(result.current.onlineUsers[0]!.user_id).toBe('bob')
  })

  // ---- Leave / tab close ----

  it('calls untrack on beforeunload when channel is joined', () => {
    const { channel } = setup()
    act(() => channel._emitSubscribed())

    const event = new Event('beforeunload')
    act(() => window.dispatchEvent(event))

    expect(channel.untrack).toHaveBeenCalled()
  })

  it('does not call untrack on beforeunload when channel is closed', () => {
    const { channel } = setup()
    act(() => channel._emitSubscribed())

    // Simulate the channel being closed (e.g., during reconnection)
    channel.state = 'closed'

    const event = new Event('beforeunload')
    act(() => window.dispatchEvent(event))

    expect(channel.untrack).not.toHaveBeenCalled()
  })

  // ---- Deduplication ----

  it('deduplicates users on sync with duplicate presence keys', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    // Simulate duplicate entries for the same user (can happen with
    // multiple browser tabs or rapid reconnections)
    channel._presenceState['bob-tab1'] = [bob]
    channel._presenceState['bob-tab2'] = [bob]

    act(() => channel._simulateSync())

    expect(result.current.onlineUsers).toHaveLength(1)
    expect(result.current.onlineUsers[0]!.user_id).toBe('bob')
  })

  it('deduplicates join events for the same user', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    act(() => channel._simulateJoin(bob))
    act(() => channel._simulateJoin(bob))

    expect(result.current.onlineUsers).toHaveLength(1)
  })

  // ---- Edge cases ----

  it('handles join then leave in rapid succession', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    act(() => {
      channel._simulateJoin(bob)
      channel._simulateLeave('bob')
    })

    expect(result.current.onlineUsers).toHaveLength(0)
  })

  it('handles leave for user who was never joined (no crash)', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    act(() => channel._simulateLeave('nobody'))

    expect(result.current.onlineUsers).toHaveLength(0)
  })

  it('reconnect does not call reconcileOnReconnect on first connect', () => {
    const { channel, reconcileOnReconnect } = setup()

    act(() => channel._emitSubscribed())

    expect(reconcileOnReconnect).not.toHaveBeenCalled()
  })

  it('reconnect calls reconcileOnReconnect on subsequent connects', () => {
    const { channel, reconcileOnReconnect } = setup()

    act(() => channel._emitSubscribed())
    expect(reconcileOnReconnect).not.toHaveBeenCalled()

    act(() => channel._emitError())
    act(() => vi.advanceTimersByTime(2000))
    act(() => channel._emitSubscribed())

    expect(reconcileOnReconnect).toHaveBeenCalledTimes(1)
  })

  // ---- Reconnecting banner delay (agent chat / transient disconnection) ----

  it('reconnecting banner is not visible during brief transient errors', () => {
    const { channel, result } = setup()

    act(() => channel._emitSubscribed())
    expect(result.current.connectionStatus).toBe('connected')

    // Simulate transient error
    act(() => channel._emitError())
    expect(result.current.connectionStatus).toBe('reconnecting')

    // Reconnect before the banner delay (2s) would fire
    act(() => vi.advanceTimersByTime(500))
    act(() => channel._emitSubscribed())

    // Status back to connected — banner never needed to show
    expect(result.current.connectionStatus).toBe('connected')
  })

  it('connection recovers cleanly after rapid error-subscribe cycles', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    // Simulate 3 rapid error→recover cycles (e.g., during agent chat load)
    for (let i = 0; i < 3; i++) {
      act(() => channel._emitError())
      act(() => vi.advanceTimersByTime(100))
      act(() => channel._emitSubscribed())
    }

    expect(result.current.connectionStatus).toBe('connected')
    // Each SUBSCRIBED calls trackPresence — should have 4 total (1 initial + 3 reconnects)
    expect(channel.track).toHaveBeenCalledTimes(4)
  })

  it('presence is fully restored after error during active session', () => {
    const { channel, result } = setup()
    act(() => channel._emitSubscribed())

    // Two remote users join
    act(() => channel._simulateJoin(bob))
    act(() => channel._simulateJoin(carol))
    expect(result.current.onlineUsers).toHaveLength(2)

    // Error occurs (e.g., during agent chat streaming)
    act(() => channel._emitError())
    expect(result.current.connectionStatus).toBe('reconnecting')

    // Reconnect
    act(() => vi.advanceTimersByTime(2000))
    act(() => channel._emitSubscribed())

    // Re-track self
    expect(channel.track).toHaveBeenCalledTimes(2)

    // Remote users restored via sync
    channel._presenceState['bob'] = [bob]
    channel._presenceState['carol'] = [carol]
    act(() => channel._simulateSync())
    expect(result.current.onlineUsers).toHaveLength(2)
  })
})
