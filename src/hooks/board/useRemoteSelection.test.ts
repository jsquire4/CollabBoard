import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRemoteSelection, UseRemoteSelectionDeps } from './useRemoteSelection'

function makeDeps(overrides?: Partial<UseRemoteSelectionDeps>): UseRemoteSelectionDeps {
  return {
    channel: null,
    userId: 'user-1',
    selectedIds: new Set<string>(),
    onlineUsers: [],
    ...overrides,
  }
}

function makeChannel() {
  return {
    send: vi.fn(),
    on: vi.fn(),
    state: 'joined',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('useRemoteSelection', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns remoteSelections map', () => {
    const { result } = renderHook(() => useRemoteSelection(makeDeps()))
    expect(result.current.remoteSelections).toBeInstanceOf(Map)
    expect(result.current.remoteSelections.size).toBe(0)
  })

  it('broadcasts local selection after debounce', () => {
    const channel = makeChannel()
    renderHook(
      (props) => useRemoteSelection(props),
      { initialProps: makeDeps({ channel, selectedIds: new Set(['a']) }) }
    )

    // Not sent immediately
    expect(channel.send).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(50) })

    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'selection',
      payload: { user_id: 'user-1', selected_ids: ['a'] },
    })
  })

  it('debounces rapid selection changes', () => {
    const channel = makeChannel()
    const { rerender } = renderHook(
      (props) => useRemoteSelection(props),
      { initialProps: makeDeps({ channel, selectedIds: new Set(['a']) }) }
    )

    act(() => { vi.advanceTimersByTime(20) })

    // Change selection before debounce fires
    rerender(makeDeps({ channel, selectedIds: new Set(['a', 'b']) }))

    act(() => { vi.advanceTimersByTime(50) })

    // Should only have sent the latest selection
    expect(channel.send).toHaveBeenCalledTimes(1)
    const payload = channel.send.mock.calls[0][0].payload
    expect(payload.selected_ids).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('does not broadcast when channel is not joined', () => {
    const channel = { ...makeChannel(), state: 'closed' }
    renderHook(() => useRemoteSelection(makeDeps({ channel, selectedIds: new Set(['a']) })))

    act(() => { vi.advanceTimersByTime(50) })

    expect(channel.send).not.toHaveBeenCalled()
  })

  it('does not broadcast when channel is null', () => {
    renderHook(() => useRemoteSelection(makeDeps({ channel: null, selectedIds: new Set(['a']) })))
    act(() => { vi.advanceTimersByTime(50) })
    // No error thrown
  })

  it('registers selection listener on channel', () => {
    const channel = makeChannel()
    renderHook(() => useRemoteSelection(makeDeps({ channel })))

    expect(channel.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'selection' },
      expect.any(Function)
    )
  })

  it('ignores own selection broadcasts', () => {
    const channel = makeChannel()
    const { result } = renderHook(() => useRemoteSelection(makeDeps({ channel })))

    const handler = channel.on.mock.calls.find(
      (c: unknown[]) => (c[1] as { event: string })?.event === 'selection'
    )?.[2] as Function

    act(() => {
      handler({ payload: { user_id: 'user-1', selected_ids: ['a'] } })
      vi.advanceTimersByTime(10)
    })

    expect(result.current.remoteSelections.size).toBe(0)
  })

  it('applies remote selection after batch window', () => {
    const channel = makeChannel()
    const { result } = renderHook(
      (props) => useRemoteSelection(props),
      { initialProps: makeDeps({ channel }) }
    )

    const handler = channel.on.mock.calls.find(
      (c: unknown[]) => (c[1] as { event: string })?.event === 'selection'
    )?.[2] as Function

    act(() => {
      handler({ payload: { user_id: 'user-2', selected_ids: ['obj-1', 'obj-2'] } })
      vi.advanceTimersByTime(10)
    })

    expect(result.current.remoteSelections.size).toBe(1)
    expect(result.current.remoteSelections.get('user-2')).toEqual(new Set(['obj-1', 'obj-2']))
  })

  it('batches multiple remote selections within window', () => {
    const channel = makeChannel()
    const { result } = renderHook(
      (props) => useRemoteSelection(props),
      { initialProps: makeDeps({ channel }) }
    )

    const handler = channel.on.mock.calls.find(
      (c: unknown[]) => (c[1] as { event: string })?.event === 'selection'
    )?.[2] as Function

    act(() => {
      handler({ payload: { user_id: 'user-2', selected_ids: ['a'] } })
      handler({ payload: { user_id: 'user-3', selected_ids: ['b'] } })
      vi.advanceTimersByTime(10)
    })

    expect(result.current.remoteSelections.size).toBe(2)
    expect(result.current.remoteSelections.get('user-2')).toEqual(new Set(['a']))
    expect(result.current.remoteSelections.get('user-3')).toEqual(new Set(['b']))
  })

  it('removes remote selection when empty ids received', () => {
    const channel = makeChannel()
    const { result } = renderHook(
      (props) => useRemoteSelection(props),
      { initialProps: makeDeps({ channel }) }
    )

    const handler = channel.on.mock.calls.find(
      (c: unknown[]) => (c[1] as { event: string })?.event === 'selection'
    )?.[2] as Function

    // First, add a selection
    act(() => {
      handler({ payload: { user_id: 'user-2', selected_ids: ['a'] } })
      vi.advanceTimersByTime(10)
    })
    expect(result.current.remoteSelections.size).toBe(1)

    // Then clear it
    act(() => {
      handler({ payload: { user_id: 'user-2', selected_ids: [] } })
      vi.advanceTimersByTime(10)
    })
    expect(result.current.remoteSelections.size).toBe(0)
  })

  it('cleans up selections when user goes offline', () => {
    const channel = makeChannel()
    const { result, rerender } = renderHook(
      (props) => useRemoteSelection(props),
      {
        initialProps: makeDeps({
          channel,
          onlineUsers: [
            { user_id: 'user-2', display_name: 'User 2', color: '#f00', role: 'editor' as const },
            { user_id: 'user-3', display_name: 'User 3', color: '#0f0', role: 'editor' as const },
          ],
        }),
      }
    )

    const handler = channel.on.mock.calls.find(
      (c: unknown[]) => (c[1] as { event: string })?.event === 'selection'
    )?.[2] as Function

    // Add selections for both users
    act(() => {
      handler({ payload: { user_id: 'user-2', selected_ids: ['a'] } })
      handler({ payload: { user_id: 'user-3', selected_ids: ['b'] } })
      vi.advanceTimersByTime(10)
    })
    expect(result.current.remoteSelections.size).toBe(2)

    // user-3 goes offline
    rerender(makeDeps({
      channel,
      onlineUsers: [{ user_id: 'user-2', display_name: 'User 2', color: '#f00', role: 'editor' as const }],
    }))

    expect(result.current.remoteSelections.size).toBe(1)
    expect(result.current.remoteSelections.has('user-3')).toBe(false)
  })

  it('does not update remoteSelections when no users left', () => {
    const { result, rerender } = renderHook(
      (props) => useRemoteSelection(props),
      { initialProps: makeDeps({ onlineUsers: [{ user_id: 'user-2', display_name: 'User 2', color: '#f00', role: 'editor' as const }] }) }
    )

    const prev = result.current.remoteSelections

    // Rerender with same users — should not create new Map
    rerender(makeDeps({ onlineUsers: [{ user_id: 'user-2', display_name: 'User 2', color: '#f00', role: 'editor' as const }] }))

    expect(result.current.remoteSelections).toBe(prev)
  })

  it('cleans up timers on unmount', () => {
    const channel = makeChannel()
    const { result, unmount } = renderHook(() =>
      useRemoteSelection(makeDeps({ channel, selectedIds: new Set(['a']) }))
    )

    unmount()

    act(() => { vi.advanceTimersByTime(100) })

    // Should not have sent — timers cleaned up
    expect(channel.send).not.toHaveBeenCalled()
  })
})
