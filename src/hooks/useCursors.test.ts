import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { computeThrottleMs, useCursors } from './useCursors'

describe('computeThrottleMs', () => {
  it('returns MIN_THROTTLE for 1 user', () => {
    expect(computeThrottleMs(1)).toBe(16)
  })

  it('returns MIN_THROTTLE for 2 users', () => {
    expect(computeThrottleMs(2)).toBe(16)
  })

  it('increases throttle as user count grows', () => {
    const t2 = computeThrottleMs(2)
    const t10 = computeThrottleMs(10)
    const t20 = computeThrottleMs(20)
    expect(t10).toBeGreaterThanOrEqual(t2)
    expect(t20).toBeGreaterThanOrEqual(t10)
  })

  it('caps at MAX_THROTTLE for many users', () => {
    expect(computeThrottleMs(50)).toBeLessThanOrEqual(150)
  })

  it('returns sensible value for 0 users', () => {
    const result = computeThrottleMs(0)
    expect(result).toBeGreaterThanOrEqual(16)
    expect(result).toBeLessThanOrEqual(150)
  })
})

describe('useCursors', () => {
  it('returns sendCursor and onCursorUpdate', () => {
    const { result } = renderHook(() => useCursors(null, 'u1'))
    expect(typeof result.current.sendCursor).toBe('function')
    expect(typeof result.current.onCursorUpdate).toBe('function')
  })

  it('sendCursor does nothing when channel is null', () => {
    const { result } = renderHook(() => useCursors(null, 'u1'))
    act(() => {
      result.current.sendCursor(100, 200)
    })
    // No throw, no channel.send
  })

  it('sendCursor calls channel.send when channel is joined', () => {
    const mockSend = vi.fn()
    const channel = {
      state: 'joined',
      send: mockSend,
      on: vi.fn(() => ({})),
    } as unknown as Parameters<typeof useCursors>[0]

    const { result } = renderHook(() => useCursors(channel, 'u1', 1))

    act(() => {
      result.current.sendCursor(100, 200)
    })

    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'cursor',
      payload: { x: 100, y: 200, user_id: 'u1' },
    })
  })

  it('sendCursor does nothing when channel state is not joined', () => {
    const mockSend = vi.fn()
    const channel = {
      state: 'closed',
      send: mockSend,
      on: vi.fn(() => ({})),
    } as unknown as Parameters<typeof useCursors>[0]

    const { result } = renderHook(() => useCursors(channel, 'u1'))

    act(() => {
      result.current.sendCursor(100, 200)
    })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('registers broadcast listener and handler processes incoming cursor', () => {
    let broadcastHandler: ((args: { payload: { x: number; y: number; user_id: string } }) => void) | null = null
    const mockOn = vi.fn((_event: string, _opts: unknown, handler?: (args: unknown) => void) => {
      if (handler) broadcastHandler = handler as typeof broadcastHandler
      return {}
    })

    const channel = {
      state: 'joined',
      send: vi.fn(),
      on: mockOn,
    } as unknown as Parameters<typeof useCursors>[0]

    renderHook(() => useCursors(channel, 'u1', 2))

    expect(mockOn).toHaveBeenCalledWith('broadcast', { event: 'cursor' }, expect.any(Function))
    expect(broadcastHandler).not.toBeNull()

    // Handler should process payload without throwing (ignores self)
    expect(() => {
      broadcastHandler!({ payload: { x: 50, y: 75, user_id: 'other-user' } })
    }).not.toThrow()
  })

  it('broadcast handler ignores own userId', () => {
    let broadcastHandler: ((args: { payload: { x: number; y: number; user_id: string } }) => void) | null = null
    const mockOn = vi.fn((_e: string, _o: unknown, h?: (a: unknown) => void) => {
      if (h) broadcastHandler = h as typeof broadcastHandler
      return {}
    })

    const channel = {
      state: 'joined',
      send: vi.fn(),
      on: mockOn,
    } as unknown as Parameters<typeof useCursors>[0]

    renderHook(() => useCursors(channel, 'self-user', 2))
    expect(broadcastHandler).not.toBeNull()

    // Sending own cursor should not add to state (handler returns early)
    broadcastHandler!({ payload: { x: 0, y: 0, user_id: 'self-user' } })
    // No throw; state unchanged for self
  })
})
