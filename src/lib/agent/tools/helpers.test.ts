/**
 * Tests for lib/agent/tools/helpers — advanceClock, buildInsertRow, getConnectedObjectIds,
 * insertObject, updateFields, buildAndInsertObject, makeToolDef.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  advanceClock,
  buildInsertRow,
  insertObject,
  updateFields,
  buildAndInsertObject,
  makeToolDef,
  getConnectedObjectIds,
  MAX_FILE_CHARS,
  SIGNED_URL_TTL,
  BOARD_STATE_OBJECT_LIMIT,
  SCATTER_MARGIN,
} from './helpers'
import { createHLC } from '@/lib/crdt/hlc'
import type { FieldClocks } from '@/lib/crdt/merge'
import type { ToolContext } from './types'
import type { BoardState } from '@/lib/agent/boardState'

const { mockInsertResult } = vi.hoisted(() => ({
  mockInsertResult: { error: null as { message: string } | null },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'board_objects') {
        return {
          insert: vi.fn(() => Promise.resolve(mockInsertResult)),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ is: vi.fn(() => Promise.resolve({ error: null })) })),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('uuid', () => ({ v4: vi.fn(() => 'fixed-uuid-123') }))

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  const state: BoardState = {
    boardId: 'b1',
    objects: new Map(),
    fieldClocks: new Map(),
  }
  return {
    boardId: 'b1',
    userId: 'u1',
    hlc: createHLC('n1'),
    state,
    ...overrides,
  }
}

describe('helpers constants', () => {
  it('exports expected constants', () => {
    expect(MAX_FILE_CHARS).toBe(200_000)
    expect(SIGNED_URL_TTL).toBe(60)
    expect(BOARD_STATE_OBJECT_LIMIT).toBe(5_000)
    expect(SCATTER_MARGIN).toBe(100)
  })
})

describe('advanceClock', () => {
  it('ticks HLC and returns new clock', () => {
    const ctx = makeContext()
    const before = ctx.hlc
    const after = advanceClock(ctx)
    expect(after).not.toEqual(before)
    expect(ctx.hlc).toEqual(after)
  })
})

describe('buildInsertRow', () => {
  it('adds field_clocks to object', () => {
    const obj = { id: 'o1', x: 10, y: 20 }
    const clocks: FieldClocks = { x: { ts: 1, c: 0, n: 'a' } }
    const row = buildInsertRow(obj, clocks)
    expect(row.field_clocks).toEqual(clocks)
    expect(row.id).toBe('o1')
  })

  it('parses table_data JSON string', () => {
    const obj = { id: 'o1', table_data: '[[1,2],[3,4]]' }
    const clocks: FieldClocks = {}
    const row = buildInsertRow(obj, clocks)
    expect(row.table_data).toEqual([[1, 2], [3, 4]])
  })

  it('parses rich_text JSON string', () => {
    const obj = { id: 'o1', rich_text: '{"type":"doc","content":[]}' }
    const clocks: FieldClocks = {}
    const row = buildInsertRow(obj, clocks)
    expect(row.rich_text).toEqual({ type: 'doc', content: [] })
  })

  it('leaves invalid JSON as-is', () => {
    const obj = { id: 'o1', table_data: 'not-json' }
    const clocks: FieldClocks = {}
    const row = buildInsertRow(obj, clocks)
    expect(row.table_data).toBe('not-json')
  })
})

describe('getConnectedObjectIds', () => {
  it('returns agentObjectId when no connectors', () => {
    const state: BoardState = {
      boardId: 'b1',
      objects: new Map([['agent1', { id: 'agent1', type: 'agent', board_id: 'b1' } as never]]),
      fieldClocks: new Map(),
    }
    expect(getConnectedObjectIds(state, 'agent1')).toEqual(new Set(['agent1']))
  })

  it('includes connector and connected object when connected to agent', () => {
    const state: BoardState = {
      boardId: 'b1',
      objects: new Map([
        ['agent1', { id: 'agent1', type: 'agent', board_id: 'b1', deleted_at: null } as never],
        ['conn1', { id: 'conn1', type: 'data_connector', connect_start_id: 'agent1', connect_end_id: 'rect1', deleted_at: null } as never],
        ['rect1', { id: 'rect1', type: 'rectangle', board_id: 'b1', deleted_at: null } as never],
      ]),
      fieldClocks: new Map(),
    }
    const ids = getConnectedObjectIds(state, 'agent1')
    expect(ids).toContain('agent1')
    expect(ids).toContain('conn1')
    expect(ids).toContain('rect1')
  })

  it('excludes connector when agent is connect_end', () => {
    const state: BoardState = {
      boardId: 'b1',
      objects: new Map([
        ['agent1', { id: 'agent1', type: 'agent', board_id: 'b1', deleted_at: null } as never],
        ['conn1', { id: 'conn1', type: 'data_connector', connect_start_id: 'rect1', connect_end_id: 'agent1', deleted_at: null } as never],
        ['rect1', { id: 'rect1', type: 'rectangle', board_id: 'b1', deleted_at: null } as never],
      ]),
      fieldClocks: new Map(),
    }
    const ids = getConnectedObjectIds(state, 'agent1')
    expect(ids).toContain('rect1')
  })

  it('excludes deleted connectors', () => {
    const state: BoardState = {
      boardId: 'b1',
      objects: new Map([
        ['agent1', { id: 'agent1', type: 'agent', board_id: 'b1', deleted_at: null } as never],
        ['conn1', { id: 'conn1', type: 'data_connector', connect_start_id: 'agent1', connect_end_id: 'rect1', deleted_at: '2024-01-01' } as never],
      ]),
      fieldClocks: new Map(),
    }
    expect(getConnectedObjectIds(state, 'agent1')).toEqual(new Set(['agent1']))
  })
})

describe('insertObject', () => {
  beforeEach(() => {
    mockInsertResult.error = null
  })

  it('inserts and updates context state', async () => {
    const ctx = makeContext()
    const obj = { id: 'o1', x: 10, y: 20 }
    const clocks: FieldClocks = {}
    const result = await insertObject(obj, clocks, ctx)
    expect(result).toEqual({ success: true })
    expect(ctx.state.objects.get('o1')).toEqual(obj)
    expect(ctx.state.fieldClocks.get('o1')).toEqual(clocks)
  })

  it('returns error on DB failure', async () => {
    mockInsertResult.error = { message: 'DB error' }
    const ctx = makeContext()
    const result = await insertObject({ id: 'o1' }, {}, ctx)
    expect(result).toEqual({ success: false, error: 'DB error' })
  })
})

describe('updateFields', () => {

  it('returns error when object not found', async () => {
    const ctx = makeContext()
    const result = await updateFields('missing', 'b1', { x: 5 }, {}, ctx)
    expect(result).toEqual({ success: false, error: 'Object missing not found' })
  })

  it('returns error when object is deleted', async () => {
    const ctx = makeContext()
    ctx.state.objects.set('o1', { id: 'o1', board_id: 'b1', deleted_at: '2024-01-01' } as never)
    const result = await updateFields('o1', 'b1', { x: 5 }, {}, ctx)
    expect(result).toEqual({ success: false, error: 'Object o1 has been deleted' })
  })

  it('returns error on cross-board guard', async () => {
    const ctx = makeContext()
    ctx.state.objects.set('o1', { id: 'o1', board_id: 'other', deleted_at: null } as never)
    const result = await updateFields('o1', 'b1', { x: 5 }, {}, ctx)
    expect(result).toEqual({ success: false, error: 'Object not found' })
  })

  it('updates and merges state on success', async () => {
    const ctx = makeContext()
    const existing = { id: 'o1', board_id: 'b1', x: 10, y: 20, deleted_at: null } as never
    ctx.state.objects.set('o1', existing)
    const result = await updateFields('o1', 'b1', { x: 50 }, {}, ctx)
    expect(result).toEqual({ success: true })
    expect(ctx.state.objects.get('o1')?.x).toBe(50)
  })
})

describe('buildAndInsertObject', () => {
  beforeEach(() => {
    mockInsertResult.error = null
  })

  it('builds, stamps, and inserts object', async () => {
    const ctx = makeContext()
    const result = await buildAndInsertObject(ctx, 'rectangle', { x: 10, y: 20, width: 100, height: 80 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.id).toBe('fixed-uuid-123')
      expect(result.obj.type).toBe('rectangle')
      expect(result.obj.x).toBe(10)
      expect(ctx.state.objects.has(result.id)).toBe(true)
    }
  })
})

describe('makeToolDef', () => {
  it('validates args with schema and calls execute', async () => {
    const schema = { safeParse: vi.fn((x: unknown) => ({ success: true, data: x })) }
    const execute = vi.fn().mockResolvedValue({ ok: true })
    const def = makeToolDef('test_tool', 'desc', schema as never, execute)
    const ctx = makeContext()
    const result = await def.executor(ctx, { foo: 'bar' })
    expect(execute).toHaveBeenCalledWith(ctx, { foo: 'bar' })
    expect(result).toEqual({ ok: true })
  })

  it('returns error on invalid args', async () => {
    const schema = { safeParse: vi.fn(() => ({ success: false, error: { message: 'invalid' } })) }
    const execute = vi.fn()
    const def = makeToolDef('test_tool', 'desc', schema as never, execute)
    const result = await def.executor(makeContext(), {})
    expect(result).toEqual({ error: 'Invalid arguments: invalid' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('catches execute errors', async () => {
    const schema = { safeParse: vi.fn((x: unknown) => ({ success: true, data: x })) }
    const execute = vi.fn().mockRejectedValue(new Error('boom'))
    const def = makeToolDef('test_tool', 'desc', schema as never, execute)
    const result = await def.executor(makeContext(), {})
    expect(result).toEqual({ error: 'boom' })
  })
})
