import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { checkLocked, usePersistence, UsePersistenceDeps } from './usePersistence'
import { BoardObject } from '@/types/board'
import { createHLC } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'
import { makeRectangle, makeGroup, makeLine, objectsMap } from '@/test/boardObjectFactory'

// ── Supabase mock ───────────────────────────────────────────────────

let mockFrom = vi.fn()

function mockSupabase() {
  return {
    from: (...args: unknown[]) => (mockFrom as Function)(...args),
    functions: { invoke: vi.fn(() => Promise.resolve({ error: null })) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

vi.mock('uuid', () => ({
  v4: (() => {
    let c = 0
    return () => `mock-uuid-${++c}`
  })(),
}))

function chainMock(result: { data?: unknown; error?: { message: string } | null }) {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve(result)
  chain.select = vi.fn(() => chain)
  chain.insert = vi.fn(() => terminal)
  chain.update = vi.fn(() => chain)
  chain.delete = vi.fn(() => chain)
  chain.upsert = vi.fn(() => terminal)
  chain.eq = vi.fn(() => chain)
  chain.in = vi.fn(() => terminal)
  chain.is = vi.fn(() => chain)
  chain.limit = vi.fn(() => terminal)
  // Make chain thenable for .update().eq().then()
  chain.then = vi.fn((cb: (r: unknown) => void) => { cb(result); return Promise.resolve() })
  return chain as {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    is: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    then: ReturnType<typeof vi.fn>
  }
}

// ── Pure function tests ─────────────────────────────────────────────

describe('checkLocked', () => {
  it('returns false for unlocked object', () => {
    const obj = makeRectangle({ id: 'a' })
    const ref = { current: objectsMap(obj) }
    expect(checkLocked(ref, 'a')).toBe(false)
  })

  it('returns true for directly locked object', () => {
    const obj = makeRectangle({ id: 'a', locked_by: 'user-1' })
    const ref = { current: objectsMap(obj) }
    expect(checkLocked(ref, 'a')).toBe(true)
  })

  it('returns true for object with locked ancestor', () => {
    const parent = makeGroup({ id: 'g1', locked_by: 'user-1' })
    const child = makeRectangle({ id: 'c1', parent_id: 'g1' })
    const ref = { current: objectsMap(parent, child) }
    expect(checkLocked(ref, 'c1')).toBe(true)
  })

  it('returns false for unknown object', () => {
    const ref = { current: new Map<string, BoardObject>() }
    expect(checkLocked(ref, 'missing')).toBe(false)
  })
})

// ── Hook tests ──────────────────────────────────────────────────────

function makeDeps(overrides?: Partial<UsePersistenceDeps>): UsePersistenceDeps {
  return {
    boardId: 'board-1',
    userId: 'user-1',
    canEdit: true,
    supabase: mockSupabase(),
    setObjects: vi.fn(),
    objectsRef: { current: new Map() },
    setSelectedIds: vi.fn(),
    getDescendants: vi.fn(() => []),
    getMaxZIndex: vi.fn(() => 0),
    queueBroadcast: vi.fn(),
    stampChange: vi.fn(),
    stampCreate: vi.fn(),
    fieldClocksRef: { current: new Map<string, FieldClocks>() },
    hlcRef: { current: createHLC('user-1') },
    notify: vi.fn(),
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    ...overrides,
  }
}

describe('usePersistence', () => {
  beforeEach(() => {
    mockFrom = vi.fn(() => chainMock({ data: [], error: null }))
  })

  it('returns expected API shape', () => {
    const { result } = renderHook(() => usePersistence(makeDeps()))
    expect(typeof result.current.loadObjects).toBe('function')
    expect(typeof result.current.addObject).toBe('function')
    expect(typeof result.current.addObjectWithId).toBe('function')
    expect(typeof result.current.updateObject).toBe('function')
    expect(typeof result.current.deleteObject).toBe('function')
    expect(typeof result.current.duplicateObject).toBe('function')
    expect(typeof result.current.persistZIndexBatch).toBe('function')
    expect(typeof result.current.updateObjectDrag).toBe('function')
    expect(typeof result.current.updateObjectDragEnd).toBe('function')
    expect(typeof result.current.moveGroupChildren).toBe('function')
    expect(typeof result.current.waitForPersist).toBe('function')
    expect(typeof result.current.reconcileOnReconnect).toBe('function')
  })

  it('loadObjects fetches from DB and calls setObjects', async () => {
    const rect = makeRectangle({ id: 'r1', board_id: 'board-1' })
    const chain = chainMock({ data: [rect], error: null })
    mockFrom.mockReturnValue(chain)
    const setObjects = vi.fn()

    const { result } = renderHook(() => usePersistence(makeDeps({ setObjects })))

    await act(async () => {
      await result.current.loadObjects()
    })

    expect(mockFrom).toHaveBeenCalledWith('board_objects')
    expect(chain.select).toHaveBeenCalled()
    expect(setObjects).toHaveBeenCalledWith(expect.any(Map))
    const map = setObjects.mock.calls[0][0] as Map<string, BoardObject>
    expect(map.get('r1')).toBeDefined()
  })

  it('loadObjects does not call setObjects when fetch errors', async () => {
    const chain = chainMock({ data: null, error: { message: 'Failed to load' } })
    mockFrom.mockReturnValue(chain)
    const setObjects = vi.fn()
    const notify = vi.fn()
    const logMock = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }

    const { result } = renderHook(() => usePersistence(makeDeps({ setObjects, notify, log: logMock })))

    await act(async () => {
      await result.current.loadObjects()
    })

    expect(setObjects).not.toHaveBeenCalled()
    expect(logMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to load board objects', operation: 'loadObjects' })
    )
    expect(notify).toHaveBeenCalledWith('Failed to load board')
  })

  it('loadObjects calls setObjects with empty map when data is empty', async () => {
    const chain = chainMock({ data: [], error: null })
    mockFrom.mockReturnValue(chain)
    const setObjects = vi.fn()

    const { result } = renderHook(() => usePersistence(makeDeps({ setObjects })))

    await act(async () => {
      await result.current.loadObjects()
    })

    expect(setObjects).toHaveBeenCalledWith(expect.any(Map))
    const map = setObjects.mock.calls[0][0] as Map<string, BoardObject>
    expect(map.size).toBe(0)
  })

  it('reconcileOnReconnect returns without error when CRDT disabled', async () => {
    const chain = chainMock({ data: [], error: null })
    mockFrom.mockReturnValue(chain)
    const { result } = renderHook(() => usePersistence(makeDeps()))

    await act(async () => {
      await result.current.reconcileOnReconnect()
    })
    // No throw
  })

  it('addObject creates object with correct defaults and calls insert', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const setObjects = vi.fn()
    const { result } = renderHook(() => usePersistence(makeDeps({ setObjects })))

    let obj: BoardObject | null = null
    act(() => {
      obj = result.current.addObject('rectangle', 100, 200)
    })

    expect(obj).not.toBeNull()
    expect(obj!.x).toBe(100)
    expect(obj!.y).toBe(200)
    expect(obj!.type).toBe('rectangle')
    expect(obj!.board_id).toBe('board-1')
    expect(obj!.created_by).toBe('user-1')
    expect(setObjects).toHaveBeenCalled()
    expect(chain.insert).toHaveBeenCalled()
  })

  it('addObject returns null when canEdit is false', () => {
    const { result } = renderHook(() => usePersistence(makeDeps({ canEdit: false })))
    let obj: unknown
    act(() => { obj = result.current.addObject('rectangle', 0, 0) })
    expect(obj).toBeNull()
  })

  it('addObject broadcasts on insert success', async () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const queueBroadcast = vi.fn()
    const { result } = renderHook(() => usePersistence(makeDeps({ queueBroadcast })))

    act(() => { result.current.addObject('rectangle', 0, 0) })
    // Wait for the async insert promise to resolve
    await waitFor(() => {
      expect(queueBroadcast).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ action: 'create' })])
      )
    })
  })

  it('addObject rolls back on insert failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const chain = chainMock({ error: { message: 'insert failed' } })
    mockFrom.mockReturnValue(chain)
    const setObjects = vi.fn()
    const { result } = renderHook(() => usePersistence(makeDeps({ setObjects })))

    act(() => { result.current.addObject('rectangle', 0, 0) })
    await waitFor(() => {
      // Should have been called twice: once for optimistic add, once for rollback
      expect(setObjects).toHaveBeenCalledTimes(2)
    })
    consoleSpy.mockRestore()
  })

  it('addObjectWithId uses upsert', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const obj = makeRectangle({ id: 'existing-1' })
    const { result } = renderHook(() => usePersistence(makeDeps()))

    act(() => { result.current.addObjectWithId(obj) })

    expect(chain.upsert).toHaveBeenCalled()
  })

  it('updateObject persists and broadcasts on success', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const obj = makeRectangle({ id: 'r1' })
    const queueBroadcast = vi.fn()
    const setObjects = vi.fn()
    const deps = makeDeps({
      queueBroadcast,
      setObjects,
      objectsRef: { current: objectsMap(obj) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.updateObject('r1', { x: 50 }) })

    expect(setObjects).toHaveBeenCalled()
    expect(chain.update).toHaveBeenCalled()
  })

  it('updateObject blocks on locked objects', () => {
    const obj = makeRectangle({ id: 'r1', locked_by: 'user-2' })
    const setObjects = vi.fn()
    const deps = makeDeps({
      setObjects,
      objectsRef: { current: objectsMap(obj) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.updateObject('r1', { x: 50 }) })

    expect(setObjects).not.toHaveBeenCalled()
  })

  it('updateObject allows lock/unlock even on locked objects', () => {
    const obj = makeRectangle({ id: 'r1', locked_by: 'user-2' })
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const setObjects = vi.fn()
    const deps = makeDeps({
      setObjects,
      objectsRef: { current: objectsMap(obj) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.updateObject('r1', { locked_by: null }) })

    expect(setObjects).toHaveBeenCalled()
  })

  it('deleteObject removes object and descendants from state', async () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const child = makeRectangle({ id: 'c1', parent_id: 'g1' })
    const setObjects = vi.fn()
    const setSelectedIds = vi.fn()
    const deps = makeDeps({
      setObjects,
      setSelectedIds,
      objectsRef: { current: objectsMap(makeGroup({ id: 'g1' }), child) },
      getDescendants: vi.fn(() => [child]),
    })
    const { result } = renderHook(() => usePersistence(deps))

    await act(async () => { await result.current.deleteObject('g1') })

    expect(setObjects).toHaveBeenCalled()
    expect(setSelectedIds).toHaveBeenCalled()
  })

  it('deleteObject blocks on locked objects', async () => {
    const obj = makeRectangle({ id: 'r1', locked_by: 'user-2' })
    const setObjects = vi.fn()
    const deps = makeDeps({
      setObjects,
      objectsRef: { current: objectsMap(obj) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    await act(async () => { await result.current.deleteObject('r1') })

    expect(setObjects).not.toHaveBeenCalled()
  })

  it('duplicateObject duplicates simple object via addObject', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const original = makeRectangle({ id: 'r1', x: 100, y: 100 })
    const setSelectedIds = vi.fn()
    const deps = makeDeps({
      setSelectedIds,
      objectsRef: { current: objectsMap(original) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    let dup: BoardObject | null = null
    act(() => { dup = result.current.duplicateObject('r1') })

    expect(dup).not.toBeNull()
    expect(dup!.x).toBe(120) // +20 offset
    expect(dup!.y).toBe(120)
    expect(setSelectedIds).toHaveBeenCalled()
  })

  it('duplicateObject handles group with descendants', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const group = makeGroup({ id: 'g1', x: 0, y: 0 })
    const child = makeRectangle({ id: 'c1', parent_id: 'g1', x: 10, y: 10 })
    const setObjects = vi.fn()
    const setSelectedIds = vi.fn()
    const queueBroadcast = vi.fn()
    const deps = makeDeps({
      setObjects,
      setSelectedIds,
      queueBroadcast,
      objectsRef: { current: objectsMap(group, child) },
      getDescendants: vi.fn(() => [child]),
      getMaxZIndex: vi.fn(() => 5),
    })
    const { result } = renderHook(() => usePersistence(deps))

    let dup: BoardObject | null = null
    act(() => { dup = result.current.duplicateObject('g1') })

    expect(dup).not.toBeNull()
    expect(dup!.type).toBe('group')
    expect(setObjects).toHaveBeenCalled()
    expect(queueBroadcast).toHaveBeenCalled()
    // Parent inserted first
    expect(chain.insert).toHaveBeenCalled()
  })

  it('duplicateObject returns null for unknown id', () => {
    const { result } = renderHook(() => usePersistence(makeDeps()))
    let dup: BoardObject | null = null
    act(() => { dup = result.current.duplicateObject('nonexistent') })
    expect(dup).toBeNull()
  })

  it('persistZIndexBatch sends parallel DB updates', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const { result } = renderHook(() => usePersistence(makeDeps()))

    act(() => {
      result.current.persistZIndexBatch(
        [{ id: 'a', z_index: 10 }, { id: 'b', z_index: 20 }],
        new Date().toISOString()
      )
    })

    // Called twice (once per update)
    expect(chain.update).toHaveBeenCalledTimes(2)
  })

  it('updateObjectDrag updates state and broadcasts but skips DB', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const obj = makeRectangle({ id: 'r1' })
    const setObjects = vi.fn()
    const queueBroadcast = vi.fn()
    const deps = makeDeps({
      setObjects,
      queueBroadcast,
      objectsRef: { current: objectsMap(obj) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.updateObjectDrag('r1', { x: 50 }) })

    expect(setObjects).toHaveBeenCalled()
    expect(queueBroadcast).toHaveBeenCalled()
    // Should NOT call supabase update
    expect(chain.update).not.toHaveBeenCalled()
  })

  it('updateObjectDragEnd writes to DB', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const obj = makeRectangle({ id: 'r1' })
    const setObjects = vi.fn()
    const queueBroadcast = vi.fn()
    const deps = makeDeps({
      setObjects,
      queueBroadcast,
      objectsRef: { current: objectsMap(obj) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.updateObjectDragEnd('r1', { x: 50 }) })

    expect(setObjects).toHaveBeenCalled()
    expect(queueBroadcast).toHaveBeenCalled()
    expect(chain.update).toHaveBeenCalled()
  })

  it('updateObjectDrag blocks on locked objects', () => {
    const obj = makeRectangle({ id: 'r1', locked_by: 'user-2' })
    const setObjects = vi.fn()
    const deps = makeDeps({
      setObjects,
      objectsRef: { current: objectsMap(obj) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.updateObjectDrag('r1', { x: 50 }) })
    expect(setObjects).not.toHaveBeenCalled()
  })

  it('moveGroupChildren translates descendants', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const child1 = makeRectangle({ id: 'c1', parent_id: 'g1', x: 10, y: 10 })
    const child2 = makeRectangle({ id: 'c2', parent_id: 'g1', x: 50, y: 50 })
    const setObjects = vi.fn()
    const queueBroadcast = vi.fn()
    const deps = makeDeps({
      setObjects,
      queueBroadcast,
      getDescendants: vi.fn(() => [child1, child2]),
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.moveGroupChildren('g1', 100, 200) })

    expect(setObjects).toHaveBeenCalled()
    expect(queueBroadcast).toHaveBeenCalled()
    // DB writes happen (not skipDb)
    expect(chain.update).toHaveBeenCalledTimes(2)
  })

  it('moveGroupChildren skips DB when skipDb=true', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const child = makeRectangle({ id: 'c1', parent_id: 'g1' })
    const deps = makeDeps({
      getDescendants: vi.fn(() => [child]),
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.moveGroupChildren('g1', 10, 10, true) })

    expect(chain.update).not.toHaveBeenCalled()
  })

  it('moveGroupChildren translates vector endpoints', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const line = makeLine({ id: 'l1', parent_id: 'g1', x: 10, y: 10, x2: 100, y2: 100 })
    const setObjects = vi.fn()
    const stampChange = vi.fn()
    const deps = makeDeps({
      setObjects,
      stampChange,
      getDescendants: vi.fn(() => [line]),
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.moveGroupChildren('g1', 5, 10) })

    // stampChange should be called with endpoint fields
    expect(stampChange).toHaveBeenCalledWith('l1', ['x', 'y', 'x2', 'y2'])
  })

  it('moveGroupChildren does nothing with no descendants', () => {
    const setObjects = vi.fn()
    const deps = makeDeps({ setObjects, getDescendants: vi.fn(() => []) })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.moveGroupChildren('g1', 10, 10) })
    expect(setObjects).not.toHaveBeenCalled()
  })

  it('waitForPersist resolves true for unknown ID', async () => {
    const { result } = renderHook(() => usePersistence(makeDeps()))
    const val = await result.current.waitForPersist('unknown')
    expect(val).toBe(true)
  })

  it('addObject for line type sets x2/y2', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const { result } = renderHook(() => usePersistence(makeDeps()))

    let obj: BoardObject | null = null
    act(() => { obj = result.current.addObject('line', 100, 200) })

    expect(obj).not.toBeNull()
    expect(obj!.type).toBe('line')
    expect(obj!.x2).toBeDefined()
    expect(obj!.y2).toBeDefined()
  })

  it('deleteObject does nothing when canEdit is false', async () => {
    const setObjects = vi.fn()
    const deps = makeDeps({ canEdit: false, setObjects })
    const { result } = renderHook(() => usePersistence(deps))

    await act(async () => { await result.current.deleteObject('r1') })
    expect(setObjects).not.toHaveBeenCalled()
  })

  it('duplicateObject returns null when canEdit is false', () => {
    const { result } = renderHook(() => usePersistence(makeDeps({ canEdit: false })))
    let dup: unknown
    act(() => { dup = result.current.duplicateObject('r1') })
    expect(dup).toBeNull()
  })

  it('CRDT soft-delete uses single .in() call instead of N individual calls', async () => {
    // Temporarily enable CRDT for this test
    const crdtModule = await import('@/hooks/board/useBroadcast')
    const originalCRDT = crdtModule.CRDT_ENABLED
    Object.defineProperty(crdtModule, 'CRDT_ENABLED', { value: true, writable: true, configurable: true })

    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const child = makeRectangle({ id: 'c1', parent_id: 'g1' })
    const setObjects = vi.fn()
    const setSelectedIds = vi.fn()
    const queueBroadcast = vi.fn()
    const deps = makeDeps({
      setObjects,
      setSelectedIds,
      queueBroadcast,
      objectsRef: { current: objectsMap(makeGroup({ id: 'g1' }), child) },
      getDescendants: vi.fn(() => [child]),
    })
    const { result } = renderHook(() => usePersistence(deps))

    await act(async () => { await result.current.deleteObject('g1') })

    // Should use .in() with both IDs, not multiple .eq() calls
    expect(chain.in).toHaveBeenCalledWith('id', ['g1', 'c1'])
    // .update() called once (not twice)
    expect(chain.update).toHaveBeenCalledTimes(1)

    Object.defineProperty(crdtModule, 'CRDT_ENABLED', { value: originalCRDT, writable: true, configurable: true })
  })

  it('hard-delete path batches children via .in()', async () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const child1 = makeRectangle({ id: 'c1', parent_id: 'g1' })
    const child2 = makeRectangle({ id: 'c2', parent_id: 'g1' })
    const setObjects = vi.fn()
    const setSelectedIds = vi.fn()
    const deps = makeDeps({
      setObjects,
      setSelectedIds,
      objectsRef: { current: objectsMap(makeGroup({ id: 'g1' }), child1, child2) },
      getDescendants: vi.fn(() => [child1, child2]),
    })
    const { result } = renderHook(() => usePersistence(deps))

    await act(async () => { await result.current.deleteObject('g1') })

    // Children should be deleted with .in() (single call)
    expect(chain.in).toHaveBeenCalledWith('id', ['c1', 'c2'])
    // .delete() called twice: once for children batch (.in), once for parent (.eq)
    expect(chain.delete).toHaveBeenCalledTimes(2)
  })

  it('loadObjects query includes .limit(5000)', async () => {
    const chain = chainMock({ data: [], error: null })
    mockFrom.mockReturnValue(chain)
    const setObjects = vi.fn()

    const { result } = renderHook(() => usePersistence(makeDeps({ setObjects })))

    await act(async () => {
      await result.current.loadObjects()
    })

    expect(chain.limit).toHaveBeenCalledWith(5000)
  })

  it('loadObjects warns when cap is hit', async () => {
    const data = Array.from({ length: 5000 }, (_, i) =>
      makeRectangle({ id: `r${i}`, board_id: 'board-1' })
    )
    const chain = chainMock({ data, error: null })
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => usePersistence(makeDeps()))

    await act(async () => { await result.current.loadObjects() })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Board object limit reached')
    )
    consoleSpy.mockRestore()
  })

  it('addObject error path clears fieldClocksRef entry', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const chain = chainMock({ error: { message: 'insert failed' } })
    mockFrom.mockReturnValue(chain)
    const fieldClocksRef = { current: new Map<string, FieldClocks>() }
    const setObjects = vi.fn()
    const { result } = renderHook(() => usePersistence(makeDeps({ setObjects, fieldClocksRef })))

    let obj: BoardObject | null = null
    act(() => { obj = result.current.addObject('rectangle', 0, 0) })

    await waitFor(() => {
      // Rollback should delete the fieldClocks entry for the new object
      expect(fieldClocksRef.current.has(obj!.id)).toBe(false)
    })
    consoleSpy.mockRestore()
  })

  it('updateObject error path restores previous object', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const chain = chainMock({ error: { message: 'update failed' } })
    mockFrom.mockReturnValue(chain)
    const original = makeRectangle({ id: 'r1', x: 100, y: 200 })
    const setObjects = vi.fn()
    const deps = makeDeps({
      setObjects,
      objectsRef: { current: objectsMap(original) },
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.updateObject('r1', { x: 50 }) })

    // First call is optimistic update, second call should be rollback
    await waitFor(() => {
      expect(setObjects).toHaveBeenCalledTimes(2)
    })
    // Invoke the rollback updater and verify it restores original
    const rollbackUpdater = setObjects.mock.calls[1][0]
    const rollbackResult = rollbackUpdater(new Map([['r1', { ...original, x: 50 }]]))
    expect(rollbackResult.get('r1')!.x).toBe(100)
    consoleSpy.mockRestore()
  })

  it('moveGroupChildren translates valid waypoints JSON', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const child = makeLine({ id: 'l1', parent_id: 'g1', x: 10, y: 10, x2: 100, y2: 100 })
    child.waypoints = JSON.stringify([20, 30, 40, 50])
    const setObjects = vi.fn()
    const queueBroadcast = vi.fn()
    const deps = makeDeps({
      setObjects,
      queueBroadcast,
      getDescendants: vi.fn(() => [child]),
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.moveGroupChildren('g1', 5, 10) })

    // Check the broadcast contains translated waypoints
    const changes = queueBroadcast.mock.calls[0][0]
    expect(changes[0].object.waypoints).toBe(JSON.stringify([25, 40, 45, 60]))
  })

  it('moveGroupChildren returns null for invalid waypoints JSON', () => {
    const chain = chainMock({ error: null })
    mockFrom.mockReturnValue(chain)
    const child = makeLine({ id: 'l1', parent_id: 'g1', x: 10, y: 10, x2: 100, y2: 100 })
    child.waypoints = 'not-json'
    const setObjects = vi.fn()
    const queueBroadcast = vi.fn()
    const deps = makeDeps({
      setObjects,
      queueBroadcast,
      getDescendants: vi.fn(() => [child]),
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.moveGroupChildren('g1', 5, 10) })

    const changes = queueBroadcast.mock.calls[0][0]
    expect(changes[0].object.waypoints).toBeNull()
  })

  it('moveGroupChildren DB failure logs error', async () => {
    const chain = chainMock({ error: { message: 'db fail' } })
    mockFrom.mockReturnValue(chain)
    const child = makeRectangle({ id: 'c1', parent_id: 'g1', x: 10, y: 10 })
    const setObjects = vi.fn()
    const notify = vi.fn()
    const logMock = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    const deps = makeDeps({
      setObjects,
      getDescendants: vi.fn(() => [child]),
      notify,
      log: logMock,
    })
    const { result } = renderHook(() => usePersistence(deps))

    act(() => { result.current.moveGroupChildren('g1', 5, 10) })

    // Wait for the Promise.all to resolve
    await waitFor(() => {
      expect(logMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to update child position', operation: 'moveGroupChildren' })
      )
    })
    expect(notify).toHaveBeenCalledWith('Failed to save group move')
  })

  it('reconcileOnReconnect DB fetch error returns early', async () => {
    // Enable CRDT for this test
    const crdtModule = await import('@/hooks/board/useBroadcast')
    const originalCRDT = crdtModule.CRDT_ENABLED
    Object.defineProperty(crdtModule, 'CRDT_ENABLED', { value: true, writable: true, configurable: true })

    const chain = chainMock({ data: null, error: { message: 'fetch failed' } })
    mockFrom.mockReturnValue(chain)
    const setObjects = vi.fn()
    const logMock = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    const deps = makeDeps({ setObjects, log: logMock })
    const { result } = renderHook(() => usePersistence(deps))

    await act(async () => { await result.current.reconcileOnReconnect() })

    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to fetch DB state for reconciliation', operation: 'reconcileOnReconnect' })
    )
    // loadObjects should NOT have been called after error
    // (setObjects is only called by loadObjects, not by reconcile error path)
    expect(setObjects).not.toHaveBeenCalled()
    Object.defineProperty(crdtModule, 'CRDT_ENABLED', { value: originalCRDT, writable: true, configurable: true })
  })

  it('reconcileOnReconnect with no local wins skips merge function call', async () => {
    const crdtModule = await import('@/hooks/board/useBroadcast')
    const originalCRDT = crdtModule.CRDT_ENABLED
    Object.defineProperty(crdtModule, 'CRDT_ENABLED', { value: true, writable: true, configurable: true })

    // DB returns same clocks as local — no wins
    const chain = chainMock({ data: [{ id: 'r1', field_clocks: {} }], error: null })
    mockFrom.mockReturnValue(chain)
    const supabase = mockSupabase()
    const deps = makeDeps({ supabase })
    const { result } = renderHook(() => usePersistence(deps))

    await act(async () => { await result.current.reconcileOnReconnect() })

    // functions.invoke should NOT have been called since there are no local wins
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    Object.defineProperty(crdtModule, 'CRDT_ENABLED', { value: originalCRDT, writable: true, configurable: true })
  })
})
