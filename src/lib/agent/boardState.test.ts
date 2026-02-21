/**
 * Tests for boardState utility functions.
 * Strategy: Mock createAdminClient chainable + global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => {
  const selectChain = {
    eq: vi.fn(() => selectChain),
    is: vi.fn(() => selectChain),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }

  return {
    mockFrom: vi.fn(() => ({
      select: vi.fn(() => selectChain),
    })),
    selectChain,
  }
})

const { selectChain } = vi.hoisted(() => {
  // Re-use the object created above via the global variable trick
  const chain = {
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }
  return { selectChain: chain }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock('./tools/helpers', async () => {
  const actual = await vi.importActual<typeof import('./tools/helpers')>('./tools/helpers')
  return { ...actual }
})

import { AGENT_SENDER_ID, loadBoardState, getMaxZIndex, broadcastChanges, type BoardState } from './boardState'
import type { BoardObject } from '@/types/board'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBoardObject(overrides: Partial<BoardObject> = {}): BoardObject {
  return {
    id: 'obj-1',
    board_id: 'board-1',
    type: 'rectangle',
    x: 0, y: 0,
    width: 100, height: 100,
    rotation: 0,
    text: '',
    color: '#000',
    font_size: 14,
    z_index: 1,
    parent_id: null,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    field_clocks: null,
    ...overrides,
  } as unknown as BoardObject
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('boardState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset chain to return empty by default
    const chain = {
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }
    mockFrom.mockReturnValue({ select: vi.fn(() => chain) })
  })

  describe('AGENT_SENDER_ID', () => {
    it('equals "__agent__"', () => {
      expect(AGENT_SENDER_ID).toBe('__agent__')
    })
  })

  describe('loadBoardState', () => {
    it('builds objects Map from query results', async () => {
      const obj1 = makeBoardObject({ id: 'a' })
      const obj2 = makeBoardObject({ id: 'b', z_index: 5 })

      const chain = {
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve({ data: [obj1, obj2], error: null })),
      }
      mockFrom.mockReturnValue({ select: vi.fn(() => chain) })

      const state = await loadBoardState('board-1')
      expect(state.boardId).toBe('board-1')
      expect(state.objects.size).toBe(2)
      expect(state.objects.get('a')).toEqual(obj1)
      expect(state.objects.get('b')).toEqual(obj2)
    })

    it('throws on Supabase error', async () => {
      const chain = {
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve({ data: null, error: { message: 'db down' } })),
      }
      mockFrom.mockReturnValue({ select: vi.fn(() => chain) })

      await expect(loadBoardState('board-1')).rejects.toThrow('Failed to load board objects: db down')
    })

    it('uses .is("deleted_at", null) in the chain', async () => {
      const chain = {
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      }
      mockFrom.mockReturnValue({ select: vi.fn(() => chain) })

      await loadBoardState('board-1')
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('populates fieldClocks when objects have field_clocks', async () => {
      const obj = makeBoardObject({
        id: 'c',
        field_clocks: { text: { ts: 1, c: 0, n: 'u1' } } as unknown as BoardObject['field_clocks'],
      })
      const chain = {
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve({ data: [obj], error: null })),
      }
      mockFrom.mockReturnValue({ select: vi.fn(() => chain) })

      const state = await loadBoardState('board-1')
      expect(state.fieldClocks.size).toBe(1)
      expect(state.fieldClocks.get('c')).toBeDefined()
    })
  })

  describe('getMaxZIndex', () => {
    it('returns 0 for empty objects', () => {
      const state: BoardState = {
        boardId: 'b',
        objects: new Map(),
        fieldClocks: new Map(),
      }
      expect(getMaxZIndex(state)).toBe(0)
    })

    it('returns max z_index for populated objects', () => {
      const objs = new Map<string, BoardObject>([
        ['a', makeBoardObject({ id: 'a', z_index: 3 })],
        ['b', makeBoardObject({ id: 'b', z_index: 10 })],
        ['c', makeBoardObject({ id: 'c', z_index: 7 })],
      ])
      const state: BoardState = { boardId: 'b', objects: objs, fieldClocks: new Map() }
      expect(getMaxZIndex(state)).toBe(10)
    })

    it('treats undefined z_index as 0 (below any positive)', () => {
      const obj = makeBoardObject({ id: 'a', z_index: undefined as unknown as number })
      const state: BoardState = {
        boardId: 'b',
        objects: new Map([['a', obj]]),
        fieldClocks: new Map(),
      }
      // undefined > 0 is false so max stays 0
      expect(getMaxZIndex(state)).toBe(0)
    })
  })

  describe('broadcastChanges', () => {
    const originalEnv = { ...process.env }

    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    })

    afterEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY
      vi.unstubAllGlobals()
    })

    it('POSTs correct payload', () => {
      const changes = [{ action: 'create' as const, object: { id: 'x' } }]
      broadcastChanges('board-1', changes)

      expect(fetch).toHaveBeenCalledOnce()
      const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(url).toBe('https://example.supabase.co/realtime/v1/api/broadcast')
      const body = JSON.parse(opts.body)
      expect(body.messages[0].topic).toBe('board:board-1')
      expect(body.messages[0].event).toBe('board:sync')
      expect(body.messages[0].payload.sender_id).toBe(AGENT_SENDER_ID)
    })

    it('no-ops when env vars are missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ''
      process.env.SUPABASE_SERVICE_ROLE_KEY = ''

      broadcastChanges('board-1', [])
      expect(fetch).not.toHaveBeenCalled()
    })

    it('swallows fetch errors', () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network error'))))

      // Should not throw
      expect(() => broadcastChanges('board-1', [{ action: 'create', object: { id: 'x' } }])).not.toThrow()
    })
  })
})
