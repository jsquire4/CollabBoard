import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getColorForUser, usePresence } from './usePresence'

describe('getColorForUser', () => {
  it('returns a valid hex color', () => {
    const color = getColorForUser('user-1')
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('returns same color for same user', () => {
    expect(getColorForUser('alice')).toBe(getColorForUser('alice'))
  })

  it('returns different colors for different users (likely)', () => {
    const colors = new Set([
      getColorForUser('user-1'),
      getColorForUser('user-2'),
      getColorForUser('user-3'),
      getColorForUser('user-4'),
      getColorForUser('user-5'),
    ])
    expect(colors.size).toBeGreaterThan(1)
  })

  it('handles empty string', () => {
    const color = getColorForUser('')
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe('usePresence', () => {
  it('returns onlineUsers, trackPresence, updatePresence', () => {
    const { result } = renderHook(() =>
      usePresence(null, 'u1', 'editor', 'Test User')
    )
    expect(result.current.onlineUsers).toEqual([])
    expect(typeof result.current.trackPresence).toBe('function')
    expect(typeof result.current.updatePresence).toBe('function')
  })

  it('trackPresence does nothing when channel is null', () => {
    const { result } = renderHook(() =>
      usePresence(null, 'u1', 'editor', 'Test User')
    )
    act(() => {
      result.current.trackPresence()
    })
    // No throw
  })

  it('trackPresence calls channel.track when channel is joined', () => {
    const mockTrack = vi.fn()
    const channel = {
      state: 'joined',
      track: mockTrack,
      untrack: vi.fn(),
      on: vi.fn(() => ({})),
      presenceState: vi.fn(() => ({})),
    } as unknown as Parameters<typeof usePresence>[0]

    const { result } = renderHook(() =>
      usePresence(channel, 'u1', 'editor', 'Alice')
    )

    act(() => {
      result.current.trackPresence()
    })

    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        display_name: 'Alice',
        role: 'editor',
        status: 'active',
      })
    )
    expect(mockTrack.mock.calls[0]![0].color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('trackPresence does nothing when channel state is not joined', () => {
    const mockTrack = vi.fn()
    const channel = {
      state: 'closed',
      track: mockTrack,
      on: vi.fn(() => ({})),
    } as unknown as Parameters<typeof usePresence>[0]

    const { result } = renderHook(() =>
      usePresence(channel, 'u1', 'editor', 'Alice')
    )

    act(() => {
      result.current.trackPresence()
    })

    expect(mockTrack).not.toHaveBeenCalled()
  })

  it('sync handler updates onlineUsers from presenceState', () => {
    let syncHandler: (() => void) | null = null
    const otherUser = {
      user_id: 'other',
      display_name: 'Other',
      color: '#C2185B',
      role: 'viewer' as const,
    }
    const mockOn = vi.fn((_event: string, opts: { event?: string }, handler?: () => void) => {
      if (opts?.event === 'sync' && handler) syncHandler = handler
      return {}
    })
    const mockPresenceState = vi.fn(() => ({ 'other': [otherUser] }))

    const channel = {
      state: 'joined',
      track: vi.fn(),
      untrack: vi.fn(),
      on: mockOn,
      presenceState: mockPresenceState,
    } as unknown as Parameters<typeof usePresence>[0]

    const { result } = renderHook(() =>
      usePresence(channel, 'u1', 'editor', 'Self')
    )

    expect(syncHandler).not.toBeNull()
    act(() => {
      syncHandler!()
    })

    expect(result.current.onlineUsers).toHaveLength(1)
    expect(result.current.onlineUsers[0]!.user_id).toBe('other')
  })
})
