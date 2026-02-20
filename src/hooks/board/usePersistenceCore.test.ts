import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistenceCore } from './usePersistenceCore'
import { FieldClocks } from '@/lib/crdt/merge'

function chainMock(result: { data?: unknown; error?: { message: string } | null }) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.is = vi.fn(() => chain)
  chain.limit = vi.fn(() => terminal)
  return chain as { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; is: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> }
}

describe('usePersistenceCore', () => {
  const setObjects = vi.fn()
  const objectsRef = { current: new Map() }
  const fieldClocksRef = { current: new Map<string, FieldClocks>() }
  const notify = vi.fn()
  const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }

  const mockFrom = vi.fn(() => chainMock({ data: [], error: null }))

  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => chainMock({ data: [], error: null }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('returns loadObjects, reconcileOnReconnect, waitForPersist, persistPromisesRef', () => {
    const supabase = { from: mockFrom, functions: { invoke: vi.fn(() => Promise.resolve({ error: null })) } }

    const { result } = renderHook(() =>
      usePersistenceCore({
        boardId: 'board-1',
        supabase: supabase as never,
        setObjects,
        objectsRef,
        fieldClocksRef,
        notify,
        log: log as never,
      })
    )

    expect(typeof result.current.loadObjects).toBe('function')
    expect(typeof result.current.reconcileOnReconnect).toBe('function')
    expect(typeof result.current.waitForPersist).toBe('function')
    expect(result.current.persistPromisesRef).toBeDefined()
    expect(result.current.persistPromisesRef.current).toBeInstanceOf(Map)
  })

  it('waitForPersist returns resolved promise for unknown id', async () => {
    const supabase = { from: mockFrom, functions: { invoke: vi.fn(() => Promise.resolve({ error: null })) } }

    const { result } = renderHook(() =>
      usePersistenceCore({
        boardId: 'board-1',
        supabase: supabase as never,
        setObjects,
        objectsRef,
        fieldClocksRef,
        notify,
        log: log as never,
      })
    )

    const p = result.current.waitForPersist('unknown-id')
    expect(p).toBeInstanceOf(Promise)
    await expect(p).resolves.toBe(true)
  })

  it('loadObjects calls log.error and notify when fetch errors', async () => {
    const chain = chainMock({ data: null, error: { message: 'DB error' } })
    mockFrom.mockReturnValue(chain)
    const supabase = { from: mockFrom, functions: { invoke: vi.fn(() => Promise.resolve({ error: null })) } }

    const { result } = renderHook(() =>
      usePersistenceCore({
        boardId: 'board-1',
        supabase: supabase as never,
        setObjects,
        objectsRef,
        fieldClocksRef,
        notify,
        log: log as never,
      })
    )

    await act(async () => {
      await result.current.loadObjects()
    })

    expect(log.error).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('Failed to load board')
    expect(setObjects).not.toHaveBeenCalled()
  })

  it('loadObjects populates objects map on success', async () => {
    const data = [
      { id: 'obj-1', board_id: 'board-1', type: 'rectangle', x: 10, y: 20, width: 100, height: 100 },
      { id: 'obj-2', board_id: 'board-1', type: 'circle', x: 50, y: 60, width: 80, height: 80 },
    ]
    const chain = chainMock({ data, error: null })
    mockFrom.mockReturnValue(chain)
    const supabase = { from: mockFrom, functions: { invoke: vi.fn(() => Promise.resolve({ error: null })) } }

    const { result } = renderHook(() =>
      usePersistenceCore({
        boardId: 'board-1',
        supabase: supabase as never,
        setObjects,
        objectsRef,
        fieldClocksRef,
        notify,
        log: log as never,
      })
    )

    await act(async () => {
      await result.current.loadObjects()
    })

    expect(setObjects).toHaveBeenCalledTimes(1)
    // setObjects may be called with a Map directly or a functional updater
    const arg = setObjects.mock.calls[0][0]
    const passedMap = typeof arg === 'function' ? arg(new Map()) : arg
    expect(passedMap.size).toBe(2)
    expect(passedMap.get('obj-1')).toMatchObject({ id: 'obj-1', x: 10 })
    expect(passedMap.get('obj-2')).toMatchObject({ id: 'obj-2', x: 50 })
    expect(log.error).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('loadObjects warns when limit of 5000 reached', async () => {
    const data = Array.from({ length: 5000 }, (_, i) => ({
      id: `obj-${i}`,
      board_id: 'board-1',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    }))
    const chain = chainMock({ data, error: null })
    mockFrom.mockReturnValue(chain)
    const supabase = { from: mockFrom, functions: { invoke: vi.fn(() => Promise.resolve({ error: null })) } }

    const { result } = renderHook(() =>
      usePersistenceCore({
        boardId: 'board-1',
        supabase: supabase as never,
        setObjects,
        objectsRef,
        fieldClocksRef,
        notify,
        log: log as never,
      })
    )

    await act(async () => {
      await result.current.loadObjects()
    })

    expect(console.warn).toHaveBeenCalledWith('Board object limit reached (5000). Some objects may not be loaded.')
    expect(setObjects).toHaveBeenCalled()
  })
})
