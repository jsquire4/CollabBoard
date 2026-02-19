import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { coalesceBroadcastQueue, useBoardState } from './useBoardState'
import { makeRectangle, makeCircle, makeGroup, makeFrame } from '@/test/boardObjectFactory'

let mockFrom = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => mockFrom(table),
  }),
}))

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-123',
}))

type BoardChange = Parameters<typeof coalesceBroadcastQueue>[0][number]

function create(id: string, action: BoardChange['action'], overrides?: Partial<BoardChange>): BoardChange {
  return {
    action,
    object: { id },
    ...overrides,
  }
}

function update(id: string, object: Partial<{ id: string } & Record<string, unknown>>, overrides?: Partial<BoardChange>): BoardChange {
  return {
    action: 'update',
    object: { id, ...object },
    ...overrides,
  }
}

function del(id: string, overrides?: Partial<BoardChange>): BoardChange {
  return {
    action: 'delete',
    object: { id },
    ...overrides,
  }
}

describe('coalesceBroadcastQueue', () => {
  it('returns empty for empty input', () => {
    expect(coalesceBroadcastQueue([])).toEqual([])
  })

  it('passes through single create', () => {
    const c = create('a', 'create', { object: { id: 'a', type: 'rectangle' } })
    expect(coalesceBroadcastQueue([c])).toEqual([c])
  })

  it('passes through single update', () => {
    const u = update('a', { x: 10 })
    expect(coalesceBroadcastQueue([u])).toEqual([u])
  })

  it('passes through single delete', () => {
    const d = del('a')
    expect(coalesceBroadcastQueue([d])).toEqual([d])
  })

  it('merges multiple updates to same object', () => {
    const result = coalesceBroadcastQueue([
      update('a', { x: 10 }),
      update('a', { y: 20 }),
      update('a', { width: 100 }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.action).toBe('update')
    expect(result[0]!.object).toEqual({ id: 'a', x: 10, y: 20, width: 100 })
  })

  it('create + update to same id merges into create', () => {
    const result = coalesceBroadcastQueue([
      create('a', 'create', { object: { id: 'a', type: 'rectangle', x: 0, y: 0 } }),
      update('a', { x: 50, y: 50 }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.action).toBe('create')
    expect(result[0]!.object.x).toBe(50)
    expect(result[0]!.object.y).toBe(50)
    expect(result[0]!.object.type).toBe('rectangle')
  })

  it('create + delete cancels both (nothing to broadcast)', () => {
    const result = coalesceBroadcastQueue([
      create('a', 'create', { object: { id: 'a' } }),
      del('a'),
    ])
    expect(result).toEqual([])
  })

  it('update + delete replaces with delete', () => {
    const result = coalesceBroadcastQueue([
      update('a', { x: 10 }),
      del('a'),
    ])
    expect(result).toEqual([del('a')])
  })

  it('delete alone stays', () => {
    const result = coalesceBroadcastQueue([del('a')])
    expect(result).toEqual([del('a')])
  })

  it('preserves order for different object ids and merges updates into creates', () => {
    const result = coalesceBroadcastQueue([
      create('a', 'create', { object: { id: 'a' } }),
      create('b', 'create', { object: { id: 'b' } }),
      update('a', { x: 1 }),
    ])
    expect(result).toHaveLength(2)
    expect(result[0]!.object.id).toBe('a')
    expect(result[0]!.object.x).toBe(1)
    expect(result[1]!.object.id).toBe('b')
  })

  it('merges clocks when both updates have clocks', () => {
    const clock1 = { x: { ts: 100, c: 0, n: 'u1' } }
    const clock2 = { y: { ts: 101, c: 0, n: 'u1' } }
    const result = coalesceBroadcastQueue([
      update('a', { x: 10 }, { clocks: clock1 }),
      update('a', { y: 20 }, { clocks: clock2 }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.clocks).toBeDefined()
    expect(result[0]!.clocks!.x).toEqual(clock1.x)
    expect(result[0]!.clocks!.y).toEqual(clock2.y)
  })

  it('uses later timestamp when merging', () => {
    const result = coalesceBroadcastQueue([
      update('a', { x: 10 }, { timestamp: 100 }),
      update('a', { y: 20 }, { timestamp: 200 }),
    ])
    expect(result[0]!.timestamp).toBe(200)
  })

  it('uses existing timestamp when change has none', () => {
    const result = coalesceBroadcastQueue([
      update('a', { x: 10 }, { timestamp: 100 }),
      update('a', { y: 20 }),
    ])
    expect(result[0]!.timestamp).toBe(100)
  })
})

describe('useBoardState', () => {
  beforeEach(() => {
    mockFrom = vi.fn()
  })

  it('loads objects on mount', async () => {
    const rect = makeRectangle({ id: 'r1', board_id: 'board-1' })
    mockFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [rect], error: null })),
          })),
        })),
      })),
    }))

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => {
      expect(result.current.objects.size).toBeGreaterThan(0)
    })

    expect(result.current.objects.get('r1')).toBeDefined()
    expect(result.current.objects.get('r1')!.type).toBe('rectangle')
  })

  it('returns expected API shape', async () => {
    mockFrom.mockImplementation(() => createBoardObjectsChain({ data: [], error: null }))

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => {
      expect(result.current.objects).toBeDefined()
    })

    expect(typeof result.current.addObject).toBe('function')
    expect(typeof result.current.updateObject).toBe('function')
    expect(typeof result.current.deleteSelected).toBe('function')
    expect(result.current.selectedIds).toBeInstanceOf(Set)
  })

  it('addObject adds to state and persists', async () => {
    const mockInsert = vi.fn(() => Promise.resolve({ error: null }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [], error: null }, { mockInsert })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects).toBeDefined())

    let added: unknown = null
    act(() => {
      added = result.current.addObject('rectangle', 100, 100)
    })

    expect(added).not.toBeNull()
    expect((added as { id: string }).id).toBe('mock-uuid-123')
    expect(result.current.objects.get('mock-uuid-123')).toBeDefined()
    expect(result.current.objects.get('mock-uuid-123')!.type).toBe('rectangle')
    expect(mockInsert).toHaveBeenCalled()
  })

  it('updateObject updates state and persists', async () => {
    const rect = makeRectangle({ id: 'r1', board_id: 'board-1', x: 0, y: 0 })
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [rect], error: null }, { mockUpdate })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => {
      result.current.updateObject('r1', { x: 50, y: 60 })
    })

    expect(result.current.objects.get('r1')!.x).toBe(50)
    expect(result.current.objects.get('r1')!.y).toBe(60)
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('selectObject updates selectedIds', async () => {
    const rect = makeRectangle({ id: 'r1', board_id: 'board-1' })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [rect], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => {
      result.current.selectObject('r1')
    })
    expect(result.current.selectedIds.has('r1')).toBe(true)

    act(() => {
      result.current.selectObject(null)
    })
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('deleteSelected removes selected objects', async () => {
    const rect = makeRectangle({ id: 'r1', board_id: 'board-1' })
    const mockDelete = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [rect], error: null }, { mockDelete })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => {
      result.current.selectObject('r1')
    })
    act(() => {
      result.current.deleteSelected()
    })

    await waitFor(() => {
      expect(result.current.objects.has('r1')).toBe(false)
    })
  })

  it('addObject returns null when viewer role', async () => {
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'viewer', null, [])
    )

    await waitFor(() => expect(result.current.objects).toBeDefined())

    let added: unknown = null
    act(() => {
      added = result.current.addObject('rectangle', 100, 100)
    })

    expect(added).toBeNull()
    expect(result.current.objects.size).toBe(0)
  })

  it('selectObject with shift adds to selection', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1' })
    const r2 = makeRectangle({ id: 'r2', board_id: 'board-1' })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1, r2], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.selectObject('r1'))
    expect(result.current.selectedIds.has('r1')).toBe(true)

    act(() => result.current.selectObject('r2', { shift: true }))
    expect(result.current.selectedIds.has('r1')).toBe(true)
    expect(result.current.selectedIds.has('r2')).toBe(true)
  })

  it('selectObject with ctrl toggles selection', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1' })
    const r2 = makeRectangle({ id: 'r2', board_id: 'board-1' })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1, r2], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.selectObject('r1'))
    act(() => result.current.selectObject('r2', { ctrl: true }))
    expect(result.current.selectedIds.size).toBe(2)

    act(() => result.current.selectObject('r2', { ctrl: true }))
    expect(result.current.selectedIds.has('r1')).toBe(true)
    expect(result.current.selectedIds.has('r2')).toBe(false)
  })

  it('selectObject on child of group selects top-level ancestor', async () => {
    const group = makeGroup({ id: 'g1', board_id: 'board-1', z_index: 1 })
    const child = makeRectangle({ id: 'c1', board_id: 'board-1', parent_id: 'g1', z_index: 0 })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [group, child], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('g1')).toBeDefined())

    act(() => result.current.selectObject('c1'))
    expect(result.current.selectedIds.has('g1')).toBe(true)
    expect(result.current.selectedIds.has('c1')).toBe(false)
  })

  it('selectObjects replaces selection', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1' })
    const r2 = makeRectangle({ id: 'r2', board_id: 'board-1' })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1, r2], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.selectObject('r1'))
    act(() => result.current.selectObjects(['r2']))
    expect(result.current.selectedIds.size).toBe(1)
    expect(result.current.selectedIds.has('r2')).toBe(true)
  })

  it('clearSelection clears selectedIds and activeGroupId', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1' })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.selectObject('r1'))
    expect(result.current.selectedIds.size).toBe(1)

    act(() => result.current.clearSelection())
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.activeGroupId).toBeNull()
  })

  it('enterGroup and exitGroup update activeGroupId', async () => {
    const group = makeGroup({ id: 'g1', board_id: 'board-1' })
    const child = makeRectangle({ id: 'c1', board_id: 'board-1', parent_id: 'g1' })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [group, child], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('g1')).toBeDefined())

    act(() => result.current.enterGroup('g1', 'c1'))
    expect(result.current.activeGroupId).toBe('g1')
    expect(result.current.selectedIds.has('c1')).toBe(true)

    act(() => result.current.exitGroup())
    expect(result.current.activeGroupId).toBeNull()
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('getChildren and getDescendants return correct objects', async () => {
    const group = makeGroup({ id: 'g1', board_id: 'board-1' })
    const c1 = makeRectangle({ id: 'c1', board_id: 'board-1', parent_id: 'g1' })
    const c2 = makeCircle({ id: 'c2', board_id: 'board-1', parent_id: 'g1' })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [group, c1, c2], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('g1')).toBeDefined())

    const children = result.current.getChildren('g1')
    expect(children.length).toBe(2)
    expect(children.map(c => c.id).sort()).toEqual(['c1', 'c2'])

    const descendants = result.current.getDescendants('g1')
    expect(descendants.length).toBe(2)
    expect(descendants.map(d => d.id).sort()).toEqual(['c1', 'c2'])
  })

  it('isObjectLocked returns true when object or ancestor is locked', async () => {
    const parent = makeRectangle({ id: 'p1', board_id: 'board-1' })
    const child = makeRectangle({ id: 'c1', board_id: 'board-1', parent_id: 'p1' })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [parent, child], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('p1')).toBeDefined())

    expect(result.current.isObjectLocked('p1')).toBe(false)
    expect(result.current.isObjectLocked('c1')).toBe(false)

    act(() => result.current.lockObject('p1'))
    await waitFor(() => expect(result.current.objects.get('p1')?.locked_by).toBe('u1'))

    expect(result.current.isObjectLocked('p1')).toBe(true)
    expect(result.current.isObjectLocked('c1')).toBe(true)
  })

  it('bringToFront increases z_index', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1', z_index: 0 })
    const r2 = makeRectangle({ id: 'r2', board_id: 'board-1', z_index: 1 })
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1, r2], error: null }, { mockUpdate })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.selectObject('r1'))
    act(() => result.current.bringToFront('r1'))

    await waitFor(() => {
      expect(result.current.objects.get('r1')!.z_index).toBeGreaterThan(r2.z_index)
    })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('sendToBack decreases z_index', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1', z_index: 1 })
    const r2 = makeRectangle({ id: 'r2', board_id: 'board-1', z_index: 0 })
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1, r2], error: null }, { mockUpdate })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.sendToBack('r1'))

    await waitFor(() => {
      expect(result.current.objects.get('r1')!.z_index).toBeLessThan(r2.z_index)
    })
  })

  it('groupSelected creates group and sets parent_id on children', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1', z_index: 0 })
    const r2 = makeRectangle({ id: 'r2', board_id: 'board-1', z_index: 1 })
    const mockInsert = vi.fn(() => Promise.resolve({ data: null, error: null }))
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1, r2], error: null }, { mockInsert, mockUpdate })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.selectObject('r1'))
    act(() => result.current.selectObject('r2', { shift: true }))

    await act(async () => {
      await result.current.groupSelected()
    })

    await waitFor(() => {
      const objs = result.current.objects
      const group = Array.from(objs.values()).find(o => o.type === 'group')
      expect(group).toBeDefined()
      expect(result.current.getChildren(group!.id).length).toBe(2)
    })
  })

  it('ungroupSelected removes group and clears parent_id', async () => {
    const group = makeGroup({ id: 'g1', board_id: 'board-1' })
    const c1 = makeRectangle({ id: 'c1', board_id: 'board-1', parent_id: 'g1' })
    const c2 = makeRectangle({ id: 'c2', board_id: 'board-1', parent_id: 'g1' })
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    const mockDelete = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [group, c1, c2], error: null }, { mockUpdate, mockDelete })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('g1')).toBeDefined())

    act(() => result.current.selectObject('g1'))
    act(() => result.current.ungroupSelected())

    await waitFor(() => {
      expect(result.current.objects.has('g1')).toBe(false)
      expect(result.current.objects.get('c1')?.parent_id).toBeNull()
      expect(result.current.objects.get('c2')?.parent_id).toBeNull()
    })
  })

  it('checkFrameContainment moves shape into frame when center inside', async () => {
    const frame = makeFrame({ id: 'f1', board_id: 'board-1', x: 0, y: 0, width: 200, height: 200 })
    const rect = makeRectangle({ id: 'r1', board_id: 'board-1', x: 50, y: 50, width: 40, height: 40, parent_id: null })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [frame, rect], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.checkFrameContainment('r1'))

    await waitFor(() => {
      expect(result.current.objects.get('r1')?.parent_id).toBe('f1')
    })
  })

  it('bringForward does nothing when no higher object exists', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1', z_index: 5 })
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1], error: null }, { mockUpdate })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.bringForward('r1'))

    // z_index should be unchanged since there's no higher object
    expect(result.current.objects.get('r1')!.z_index).toBe(5)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('bringForward swaps z_index with next-higher object', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1', z_index: 1 })
    const r2 = makeRectangle({ id: 'r2', board_id: 'board-1', z_index: 3 })
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1, r2], error: null }, { mockUpdate })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.bringForward('r1'))

    await waitFor(() => {
      // r1 should now have higher z_index than r2's original
      expect(result.current.objects.get('r1')!.z_index).toBeGreaterThan(1)
      expect(result.current.objects.get('r2')!.z_index).toBeLessThan(3)
    })
  })

  it('sendBackward does nothing when no lower object exists', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1', z_index: 0 })
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1], error: null }, { mockUpdate })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.sendBackward('r1'))

    expect(result.current.objects.get('r1')!.z_index).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('sendBackward swaps z_index with next-lower object', async () => {
    const r1 = makeRectangle({ id: 'r1', board_id: 'board-1', z_index: 0 })
    const r2 = makeRectangle({ id: 'r2', board_id: 'board-1', z_index: 3 })
    const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [r1, r2], error: null }, { mockUpdate })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r2')).toBeDefined())

    act(() => result.current.sendBackward('r2'))

    await waitFor(() => {
      expect(result.current.objects.get('r2')!.z_index).toBeLessThan(3)
      expect(result.current.objects.get('r1')!.z_index).toBeGreaterThan(0)
    })
  })

  it('checkFrameContainment uses endpoint center for vector shapes', async () => {
    // Frame at (0,0) 200x200. Line from (50,50) to (150,150) → center (100,100) → inside frame
    const frame = makeFrame({ id: 'f1', board_id: 'board-1', x: 0, y: 0, width: 200, height: 200, z_index: 0 })
    const line = {
      ...makeRectangle({ id: 'l1', board_id: 'board-1', parent_id: null, z_index: 1 }),
      type: 'line' as const,
      x: 50, y: 50, x2: 150, y2: 150, width: 0, height: 0,
    }
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [frame, line], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('l1')).toBeDefined())

    act(() => result.current.checkFrameContainment('l1'))

    await waitFor(() => {
      expect(result.current.objects.get('l1')?.parent_id).toBe('f1')
    })
  })

  it('checkFrameContainment sets parent_id to null when no frame matches', async () => {
    // Frame at (0,0) 50x50. Rect at (200,200) width 40 → center (220,220) → outside
    const frame = makeFrame({ id: 'f1', board_id: 'board-1', x: 0, y: 0, width: 50, height: 50, z_index: 0 })
    const rect = makeRectangle({ id: 'r1', board_id: 'board-1', x: 200, y: 200, width: 40, height: 40, parent_id: 'f1', z_index: 1 })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [frame, rect], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('r1')).toBeDefined())

    act(() => result.current.checkFrameContainment('r1'))

    await waitFor(() => {
      expect(result.current.objects.get('r1')?.parent_id).toBeNull()
    })
  })

  it('isObjectLocked returns true for deep ancestor chain (3+ levels)', async () => {
    const grandparent = makeGroup({ id: 'gp', board_id: 'board-1', z_index: 0, locked_by: 'u1' })
    const parent = makeGroup({ id: 'p1', board_id: 'board-1', parent_id: 'gp', z_index: 1 })
    const child = makeRectangle({ id: 'c1', board_id: 'board-1', parent_id: 'p1', z_index: 2 })
    mockFrom.mockImplementation(() =>
      createBoardObjectsChain({ data: [grandparent, parent, child], error: null })
    )

    const { result } = renderHook(() =>
      useBoardState('u1', 'board-1', 'editor', null, [])
    )

    await waitFor(() => expect(result.current.objects.get('c1')).toBeDefined())

    // Deep child should see grandparent's lock
    expect(result.current.isObjectLocked('c1')).toBe(true)
    // Parent should also see grandparent's lock
    expect(result.current.isObjectLocked('p1')).toBe(true)
    // Grandparent is directly locked
    expect(result.current.isObjectLocked('gp')).toBe(true)
  })
})

function createBoardObjectsChain(
  loadResult: { data: unknown[]; error: { message: string } | null },
  overrides?: { mockInsert?: ReturnType<typeof vi.fn>; mockUpdate?: ReturnType<typeof vi.fn>; mockDelete?: ReturnType<typeof vi.fn> }
) {
  const resolved = Promise.resolve(loadResult)
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn(() => ({
          limit: vi.fn(() => resolved),
        })),
      })),
    })),
    insert: overrides?.mockInsert ?? vi.fn(() => Promise.resolve({ error: null })),
    update: overrides?.mockUpdate ?? vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
      in: vi.fn(() => Promise.resolve({ error: null })),
    })),
    delete: overrides?.mockDelete ?? vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
      in: vi.fn(() => Promise.resolve({ error: null })),
    })),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
  }
}
