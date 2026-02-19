import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { coalesceBroadcastQueue, useBoardState } from './useBoardState'
import { makeRectangle } from '@/test/boardObjectFactory'

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
