import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConnectionManager } from './useConnectionManager'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

type SubscribeCallback = (status: string) => void

function createMockChannel(): RealtimeChannel & { _subscribeCb?: SubscribeCallback } {
  const channel = {
    subscribe: vi.fn((cb: SubscribeCallback) => {
      ;(channel as RealtimeChannel & { _subscribeCb?: SubscribeCallback })._subscribeCb = cb
    }),
    unsubscribe: vi.fn(),
  } as unknown as RealtimeChannel & { _subscribeCb?: SubscribeCallback }
  return channel
}

function createMockSupabase(): { client: SupabaseClient; emitAuthEvent: (event: string) => void } {
  let authCallback: ((event: string) => void) | null = null
  const client = {
    auth: {
      onAuthStateChange: vi.fn((cb: (event: string) => void) => {
        authCallback = cb
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        }
      }),
    },
    realtime: {
      disconnect: vi.fn(),
    },
  } as unknown as SupabaseClient

  return {
    client,
    emitAuthEvent: (event: string) => {
      authCallback?.(event)
    },
  }
}

describe('useConnectionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns connected when channel subscribes successfully', () => {
    const channel = createMockChannel()
    const trackPresence = vi.fn()
    const reconcileOnReconnect = vi.fn()
    const { client, emitAuthEvent } = createMockSupabase()
    const supabaseRef = { current: client }

    const { result } = renderHook(() =>
      useConnectionManager({
        channel,
        trackPresence,
        reconcileOnReconnect,
        supabaseRef,
      })
    )

    expect(result.current.connectionStatus).toBe('connected')

    // Simulate channel subscription callback
    const cb = (channel as RealtimeChannel & { _subscribeCb?: SubscribeCallback })._subscribeCb
    expect(cb).toBeDefined()
    act(() => {
      cb!('SUBSCRIBED')
    })

    expect(result.current.connectionStatus).toBe('connected')
    expect(trackPresence).toHaveBeenCalledTimes(1)
    expect(reconcileOnReconnect).not.toHaveBeenCalled() // First connect, not reconnect
  })

  it('calls reconcileOnReconnect on re-subscribe after error', () => {
    const channel = createMockChannel()
    const trackPresence = vi.fn()
    const reconcileOnReconnect = vi.fn()
    const { client } = createMockSupabase()
    const supabaseRef = { current: client }

    const { result } = renderHook(() =>
      useConnectionManager({
        channel,
        trackPresence,
        reconcileOnReconnect,
        supabaseRef,
      })
    )

    const cb = (channel as RealtimeChannel & { _subscribeCb?: SubscribeCallback })._subscribeCb!
    act(() => cb('SUBSCRIBED'))
    expect(reconcileOnReconnect).not.toHaveBeenCalled()

    act(() => cb('CHANNEL_ERROR'))
    expect(result.current.connectionStatus).toBe('reconnecting')

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    act(() => cb('SUBSCRIBED'))
    expect(reconcileOnReconnect).toHaveBeenCalledTimes(1)
  })

  it('transitions to disconnected after max reconnect attempts', () => {
    const channel = createMockChannel()
    const trackPresence = vi.fn()
    const reconcileOnReconnect = vi.fn()
    const { client } = createMockSupabase()
    const supabaseRef = { current: client }

    const { result } = renderHook(() =>
      useConnectionManager({
        channel,
        trackPresence,
        reconcileOnReconnect,
        supabaseRef,
      })
    )

    const cb = (channel as RealtimeChannel & { _subscribeCb?: SubscribeCallback })._subscribeCb!

    act(() => cb('SUBSCRIBED'))

    for (let i = 0; i < 6; i++) {
      act(() => cb('CHANNEL_ERROR'))
      act(() => {
        vi.advanceTimersByTime(20000)
      })
    }

    expect(result.current.connectionStatus).toBe('disconnected')
  })

  it('sets auth_expired on SIGNED_OUT', () => {
    const channel = createMockChannel()
    const trackPresence = vi.fn()
    const reconcileOnReconnect = vi.fn()
    const { client, emitAuthEvent } = createMockSupabase()
    const supabaseRef = { current: client }

    const { result } = renderHook(() =>
      useConnectionManager({
        channel,
        trackPresence,
        reconcileOnReconnect,
        supabaseRef,
      })
    )

    act(() => emitAuthEvent('SIGNED_OUT'))

    expect(result.current.connectionStatus).toBe('auth_expired')
  })

  it('handles null channel', () => {
    const trackPresence = vi.fn()
    const reconcileOnReconnect = vi.fn()
    const { client } = createMockSupabase()
    const supabaseRef = { current: client }

    const { result } = renderHook(() =>
      useConnectionManager({
        channel: null,
        trackPresence,
        reconcileOnReconnect,
        supabaseRef,
      })
    )

    expect(result.current.connectionStatus).toBe('connected')
  })

  it('triggers reconnecting on TIMED_OUT and CLOSED', () => {
    const channel = createMockChannel()
    const trackPresence = vi.fn()
    const reconcileOnReconnect = vi.fn()
    const { client } = createMockSupabase()
    const supabaseRef = { current: client }

    const { result } = renderHook(() =>
      useConnectionManager({
        channel,
        trackPresence,
        reconcileOnReconnect,
        supabaseRef,
      })
    )

    const cb = (channel as RealtimeChannel & { _subscribeCb?: SubscribeCallback })._subscribeCb!

    act(() => cb('SUBSCRIBED'))
    act(() => cb('TIMED_OUT'))
    expect(result.current.connectionStatus).toBe('reconnecting')

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    act(() => cb('SUBSCRIBED'))
    expect(result.current.connectionStatus).toBe('connected')

    act(() => cb('CLOSED'))
    expect(result.current.connectionStatus).toBe('reconnecting')
  })
})
