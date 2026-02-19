import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { coalesceBroadcastQueue, useBroadcast, UseBroadcastDeps, BoardChange } from './useBroadcast'
import type { BoardObject } from '@/types/board'
import { createHLC } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'

// ── Pure function tests ─────────────────────────────────────────────

describe('coalesceBroadcastQueue', () => {
  it('merges duplicate updates to the same object', () => {
    const changes: BoardChange[] = [
      { action: 'update', object: { id: 'a', x: 10 } as Partial<BoardObject> & { id: string } },
      { action: 'update', object: { id: 'a', y: 20 } as Partial<BoardObject> & { id: string } },
    ]
    const result = coalesceBroadcastQueue(changes)
    expect(result).toHaveLength(1)
    expect(result[0].object).toEqual({ id: 'a', x: 10, y: 20 })
  })

  it('cancels create+delete for the same object', () => {
    const changes: BoardChange[] = [
      { action: 'create', object: { id: 'a', x: 10 } as Partial<BoardObject> & { id: string } },
      { action: 'delete', object: { id: 'a' } as Partial<BoardObject> & { id: string } },
    ]
    const result = coalesceBroadcastQueue(changes)
    expect(result).toHaveLength(0)
  })

  it('replaces update with delete for the same object', () => {
    const changes: BoardChange[] = [
      { action: 'update', object: { id: 'a', x: 10 } as Partial<BoardObject> & { id: string } },
      { action: 'delete', object: { id: 'a' } as Partial<BoardObject> & { id: string } },
    ]
    const result = coalesceBroadcastQueue(changes)
    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('delete')
  })

  it('preserves different object IDs', () => {
    const changes: BoardChange[] = [
      { action: 'update', object: { id: 'a', x: 10 } as Partial<BoardObject> & { id: string } },
      { action: 'update', object: { id: 'b', x: 20 } as Partial<BoardObject> & { id: string } },
    ]
    const result = coalesceBroadcastQueue(changes)
    expect(result).toHaveLength(2)
  })

  it('merges update into prior create', () => {
    const changes: BoardChange[] = [
      { action: 'create', object: { id: 'a', x: 10, type: 'rectangle' } as Partial<BoardObject> & { id: string } },
      { action: 'update', object: { id: 'a', y: 20 } as Partial<BoardObject> & { id: string } },
    ]
    const result = coalesceBroadcastQueue(changes)
    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('create')
    expect(result[0].object.y).toBe(20)
  })

  it('uses latest timestamp when merging', () => {
    const changes: BoardChange[] = [
      { action: 'update', object: { id: 'a', x: 10 } as any, timestamp: 100 },
      { action: 'update', object: { id: 'a', y: 20 } as any, timestamp: 200 },
    ]
    const result = coalesceBroadcastQueue(changes)
    expect(result[0].timestamp).toBe(200)
  })

  it('handles empty input', () => {
    expect(coalesceBroadcastQueue([])).toEqual([])
  })
})

// ── Hook tests ──────────────────────────────────────────────────────

function makeDeps(overrides?: Partial<UseBroadcastDeps>): UseBroadcastDeps {
  return {
    channel: null,
    userId: 'user-1',
    setObjects: vi.fn(),
    fieldClocksRef: { current: new Map<string, FieldClocks>() },
    hlcRef: { current: createHLC('user-1') },
    ...overrides,
  }
}

describe('useBroadcast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns queueBroadcast and flushBroadcast functions', () => {
    const { result } = renderHook(() => useBroadcast(makeDeps()))
    expect(typeof result.current.queueBroadcast).toBe('function')
    expect(typeof result.current.flushBroadcast).toBe('function')
  })

  it('queueBroadcast does not send immediately', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'joined' } as any
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    act(() => {
      result.current.queueBroadcast([
        { action: 'update', object: { id: 'a', x: 10 } as any },
      ])
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('flushes after idle timer (5ms)', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'joined' } as any
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    act(() => {
      result.current.queueBroadcast([
        { action: 'update', object: { id: 'a', x: 10 } as any },
      ])
    })

    act(() => {
      vi.advanceTimersByTime(5)
    })

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0][0].payload
    expect(payload.changes).toHaveLength(1)
    expect(payload.sender_id).toBe('user-1')
  })

  it('coalesces multiple queued changes before flush', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'joined' } as any
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    act(() => {
      result.current.queueBroadcast([{ action: 'update', object: { id: 'a', x: 10 } as any }])
      result.current.queueBroadcast([{ action: 'update', object: { id: 'a', y: 20 } as any }])
    })

    act(() => {
      vi.advanceTimersByTime(5)
    })

    expect(send).toHaveBeenCalledTimes(1)
    const changes = send.mock.calls[0][0].payload.changes
    expect(changes).toHaveLength(1)
    expect(changes[0].object.x).toBe(10)
    expect(changes[0].object.y).toBe(20)
  })

  it('flushes at max timer (50ms) during bursts', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'joined' } as any
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    // Simulate continuous burst — queue every 3ms for 60ms
    for (let i = 0; i < 20; i++) {
      act(() => {
        result.current.queueBroadcast([{ action: 'update', object: { id: 'a', x: i } as any }])
        vi.advanceTimersByTime(3)
      })
    }

    // Should have flushed at least once at the 50ms mark
    expect(send).toHaveBeenCalled()
  })

  it('flushBroadcast sends immediately', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'joined' } as any
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    act(() => {
      result.current.queueBroadcast([{ action: 'update', object: { id: 'a', x: 10 } as any }])
    })

    act(() => {
      result.current.flushBroadcast()
    })

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not send when channel is not joined', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'closed' } as any
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    act(() => {
      result.current.queueBroadcast([{ action: 'update', object: { id: 'a', x: 10 } as any }])
    })

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('does not send when channel is null', () => {
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel: null })))

    act(() => {
      result.current.queueBroadcast([{ action: 'update', object: { id: 'a', x: 10 } as any }])
      result.current.flushBroadcast()
    })

    // No error thrown, no send called
  })

  it('registers board:sync listener on channel', () => {
    const on = vi.fn()
    const channel = { send: vi.fn(), on, state: 'joined' } as any
    renderHook(() => useBroadcast(makeDeps({ channel })))

    expect(on).toHaveBeenCalledWith('broadcast', { event: 'board:sync' }, expect.any(Function))
  })

  it('ignores incoming broadcasts from self', () => {
    const on = vi.fn()
    const setObjects = vi.fn()
    const channel = { send: vi.fn(), on, state: 'joined' } as any
    renderHook(() => useBroadcast(makeDeps({ channel, setObjects })))

    // Get the handler
    const handler = on.mock.calls.find((c: any[]) => c[1]?.event === 'board:sync')?.[2]
    expect(handler).toBeDefined()

    // Simulate receiving from self
    act(() => {
      handler({ payload: { changes: [{ action: 'update', object: { id: 'a', x: 99 } }], sender_id: 'user-1' } })
      vi.advanceTimersByTime(10)
    })

    expect(setObjects).not.toHaveBeenCalled()
  })

  it('applies incoming batch from other users after receive delay', () => {
    const on = vi.fn()
    const setObjects = vi.fn()
    const channel = { send: vi.fn(), on, state: 'joined' } as any
    renderHook(() => useBroadcast(makeDeps({ channel, setObjects })))

    const handler = on.mock.calls.find((c: any[]) => c[1]?.event === 'board:sync')?.[2]

    act(() => {
      handler({ payload: { changes: [{ action: 'create', object: { id: 'new1', x: 50 } }], sender_id: 'user-2' } })
    })

    // Not applied yet
    expect(setObjects).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(10)
    })

    // Applied after 10ms batch window
    expect(setObjects).toHaveBeenCalledTimes(1)
  })

  it('incoming create adds object to map', () => {
    const on = vi.fn()
    const setObjects = vi.fn()
    const channel = { send: vi.fn(), on, state: 'joined' } as any
    renderHook(() => useBroadcast(makeDeps({ channel, setObjects })))

    const handler = on.mock.calls.find((c: any[]) => c[1]?.event === 'board:sync')?.[2]

    act(() => {
      handler({
        payload: {
          changes: [{
            action: 'create',
            object: { id: 'new1', type: 'rectangle', x: 50, y: 60, width: 100, height: 80 } as any,
          }],
          sender_id: 'user-2',
        },
      })
      vi.advanceTimersByTime(10)
    })

    const updater = setObjects.mock.calls[0][0]
    const prev = new Map<string, BoardObject>()
    const next = updater(prev)
    expect(next.get('new1')).toBeDefined()
    expect(next.get('new1')!.x).toBe(50)
    expect(next.get('new1')!.y).toBe(60)
  })

  it('incoming update merges into existing object', () => {
    const on = vi.fn()
    const setObjects = vi.fn()
    const channel = { send: vi.fn(), on, state: 'joined' } as any
    renderHook(() => useBroadcast(makeDeps({ channel, setObjects })))

    const handler = on.mock.calls.find((c: any[]) => c[1]?.event === 'board:sync')?.[2]
    const existing = { id: 'a', type: 'rectangle' as const, x: 0, y: 0, width: 100, height: 80 } as BoardObject

    act(() => {
      handler({
        payload: {
          changes: [{ action: 'update', object: { id: 'a', x: 99, y: 88 } }],
          sender_id: 'user-2',
        },
      })
      vi.advanceTimersByTime(10)
    })

    const updater = setObjects.mock.calls[0][0]
    const prev = new Map([['a', existing]])
    const next = updater(prev)
    expect(next.get('a')!.x).toBe(99)
    expect(next.get('a')!.y).toBe(88)
    expect(next.get('a')!.width).toBe(100)
  })

  it('incoming delete removes object from map', () => {
    const on = vi.fn()
    const setObjects = vi.fn()
    const channel = { send: vi.fn(), on, state: 'joined' } as any
    renderHook(() => useBroadcast(makeDeps({ channel, setObjects })))

    const handler = on.mock.calls.find((c: any[]) => c[1]?.event === 'board:sync')?.[2]
    const existing = { id: 'a', type: 'rectangle' as const, x: 0, y: 0 } as BoardObject

    act(() => {
      handler({
        payload: { changes: [{ action: 'delete', object: { id: 'a' } }], sender_id: 'user-2' },
      })
      vi.advanceTimersByTime(10)
    })

    const updater = setObjects.mock.calls[0][0]
    const prev = new Map([['a', existing]])
    const next = updater(prev)
    expect(next.has('a')).toBe(false)
  })

  it('incoming update on non-existent object is ignored', () => {
    const on = vi.fn()
    const setObjects = vi.fn()
    const channel = { send: vi.fn(), on, state: 'joined' } as any
    renderHook(() => useBroadcast(makeDeps({ channel, setObjects })))

    const handler = on.mock.calls.find((c: any[]) => c[1]?.event === 'board:sync')?.[2]

    act(() => {
      handler({
        payload: { changes: [{ action: 'update', object: { id: 'missing', x: 99 } }], sender_id: 'user-2' },
      })
      vi.advanceTimersByTime(10)
    })

    const updater = setObjects.mock.calls[0][0]
    const prev = new Map<string, BoardObject>()
    const next = updater(prev)
    expect(next.size).toBe(0)
  })

  it('stampChange returns undefined when CRDT is disabled', () => {
    const { result } = renderHook(() => useBroadcast(makeDeps()))
    const clocks = result.current.stampChange('obj1', ['x', 'y'])
    // CRDT_ENABLED defaults to false in test env
    expect(clocks).toBeUndefined()
  })

  it('stampCreate returns undefined when CRDT is disabled', () => {
    const { result } = renderHook(() => useBroadcast(makeDeps()))
    const clocks = result.current.stampCreate('obj1', { x: 10, y: 20 } as any)
    expect(clocks).toBeUndefined()
  })

  it('cleans up timers on unmount', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'joined' } as any
    const { result, unmount } = renderHook(() => useBroadcast(makeDeps({ channel })))

    act(() => {
      result.current.queueBroadcast([{ action: 'update', object: { id: 'a', x: 10 } as any }])
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Should not have sent — timers were cleaned up
    expect(send).not.toHaveBeenCalled()
  })

  it('broadcastChanges chunks payload exceeding BROADCAST_MAX_BYTES', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'joined' } as any
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    // Create a payload that exceeds 64KB — each change has a large text field
    const bigText = 'x'.repeat(10000)
    const changes: BoardChange[] = Array.from({ length: 10 }, (_, i) => ({
      action: 'update' as const,
      object: { id: `obj-${i}`, text: bigText } as any,
    }))

    act(() => {
      // Directly call flushBroadcast after queuing to trigger broadcastChanges
      result.current.queueBroadcast(changes)
      result.current.flushBroadcast()
    })

    // Should have been called multiple times (chunked)
    expect(send.mock.calls.length).toBeGreaterThan(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('exceeds limit')
    )
    consoleSpy.mockRestore()
  })

  it('broadcastChanges skips send when channel not joined', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'leaving' } as any
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    act(() => {
      result.current.queueBroadcast([{ action: 'update', object: { id: 'a', x: 10 } as any }])
      result.current.flushBroadcast()
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('queueBroadcast coalesce timer fires after idle timeout', () => {
    const send = vi.fn()
    const channel = { send, on: vi.fn(), state: 'joined' } as any
    const { result } = renderHook(() => useBroadcast(makeDeps({ channel })))

    act(() => {
      result.current.queueBroadcast([{ action: 'update', object: { id: 'a', x: 10 } as any }])
    })

    // At 4ms — idle timer (5ms) hasn't fired yet
    act(() => { vi.advanceTimersByTime(4) })
    expect(send).not.toHaveBeenCalled()

    // At 5ms — idle timer fires
    act(() => { vi.advanceTimersByTime(1) })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('coalesceBroadcastQueue: delete after create removes both entries', () => {
    const changes: BoardChange[] = [
      { action: 'create', object: { id: 'a', type: 'rectangle', x: 0 } as any },
      { action: 'update', object: { id: 'a', x: 50 } as any },
      { action: 'delete', object: { id: 'a' } as any },
    ]
    const result = coalesceBroadcastQueue(changes)
    // Create + updates + delete should all cancel out
    expect(result).toHaveLength(0)
  })

  it('coalesceBroadcastQueue: multiple updates merge clocks', () => {
    const clock1 = { x: { ts: 100, c: 0, n: 'u1' } }
    const clock2 = { y: { ts: 101, c: 0, n: 'u1' } }
    const clock3 = { width: { ts: 102, c: 0, n: 'u1' } }
    const changes: BoardChange[] = [
      { action: 'update', object: { id: 'a', x: 10 } as any, clocks: clock1 },
      { action: 'update', object: { id: 'a', y: 20 } as any, clocks: clock2 },
      { action: 'update', object: { id: 'a', width: 100 } as any, clocks: clock3 },
    ]
    const result = coalesceBroadcastQueue(changes)
    expect(result).toHaveLength(1)
    expect(result[0].clocks).toBeDefined()
    expect(result[0].clocks!.x).toEqual(clock1.x)
    expect(result[0].clocks!.y).toEqual(clock2.y)
    expect(result[0].clocks!.width).toEqual(clock3.width)
  })
})
