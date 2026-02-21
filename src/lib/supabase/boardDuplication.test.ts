import { describe, it, expect, vi, beforeEach } from 'vitest'
import { duplicateBoard } from './boardDuplication'

// ---------------------------------------------------------------------------
// UUID sequencing
// ---------------------------------------------------------------------------

let uuidCounter = 0

beforeEach(() => {
  uuidCounter = 0
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockImplementation(() => `new-uuid-${++uuidCounter}`),
  })
})

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

/**
 * The source calls `from()` separately for each distinct operation:
 *
 *   from('boards').insert(...).select().single()   — board shell creation
 *   from('board_objects').select('*').eq().is()    — source objects fetch
 *   from('board_objects').insert(chunk)            — one call per chunk (returns Promise)
 *   from('board_objects').delete().eq(...)         — rollback board_objects
 *   from('boards').delete().eq(...)               — rollback boards
 *
 * So `from('board_objects')` is called N+2 times (1 select + N chunk inserts + 1 delete).
 * We route by tracking call order and expose named spies for assertions.
 */
interface MockSupabaseOpts {
  boardInsert?: { data: unknown; error: unknown }
  objectsSelect?: { data: unknown[] | null }
  /** One entry per chunk insert; defaults to [{ error: null }]. */
  objectInserts?: Array<{ error: unknown }>
  /** When true rollback deletes throw (exercises the catch path). */
  rollbackThrows?: boolean
}

function createMockSupabase(opts: MockSupabaseOpts = {}) {
  const {
    boardInsert = {
      data: { id: 'new-board-id', name: 'My Board - Copy', created_by: 'user-1' },
      error: null,
    },
    objectsSelect = { data: null },
    objectInserts = [{ error: null }],
    rollbackThrows = false,
  } = opts

  // Spies exposed to tests
  const boardsInsertSpy = vi.fn()
  const objectsInsertSpy = vi.fn()
  const boardsDeleteEqSpy = vi.fn(() => Promise.resolve({}))
  const objectsDeleteEqSpy = vi.fn(() => Promise.resolve({}))

  // Track how many times board_objects has been called so we can route
  let boardObjectsCallCount = 0
  let chunkCallIndex = 0

  const fromMock = vi.fn((table: string) => {
    // -----------------------------------------------------------------------
    // boards table
    // -----------------------------------------------------------------------
    if (table === 'boards') {
      // We need to handle both insert (shell creation) and delete (rollback).
      // The first boards call is always the insert chain; subsequent ones are
      // the rollback delete. We distinguish by returning a proxy that exposes
      // both insert and delete on the same object (the source always uses
      // separate from() calls so this is safe).
      const boardsChain: Record<string, unknown> = {}

      boardsChain.insert = vi.fn((payload: unknown) => {
        boardsInsertSpy(payload)
        const inner: Record<string, unknown> = {}
        inner.select = vi.fn(() => inner)
        inner.single = vi.fn(() => Promise.resolve(boardInsert))
        return inner
      })

      boardsChain.delete = vi.fn(() => {
        if (rollbackThrows) throw new Error('rollback error')
        return { eq: boardsDeleteEqSpy }
      })

      return boardsChain
    }

    // -----------------------------------------------------------------------
    // board_objects table — call N determines which branch to use:
    //   call 0 → select (source objects fetch)
    //   calls 1..N → chunk inserts
    //   last call (after error) → rollback delete
    // We can't know in advance how many chunk calls there will be, so we
    // distinguish by inspecting which method is invoked first on the returned
    // object.
    // -----------------------------------------------------------------------
    if (table === 'board_objects') {
      boardObjectsCallCount++

      const obj: Record<string, unknown> = {}

      // select chain — only used by the first board_objects call
      const selectChain: Record<string, unknown> = {}
      selectChain.eq = vi.fn(() => selectChain)
      selectChain.is = vi.fn(() => Promise.resolve(objectsSelect))
      obj.select = vi.fn(() => selectChain)

      // insert — returns a Promise directly (no further chaining in source)
      obj.insert = vi.fn((chunk: unknown) => {
        objectsInsertSpy(chunk)
        const result = objectInserts[chunkCallIndex] ?? { error: null }
        chunkCallIndex++
        return Promise.resolve(result)
      })

      // delete chain — used for rollback
      obj.delete = vi.fn(() => {
        if (rollbackThrows) throw new Error('rollback error')
        return { eq: objectsDeleteEqSpy }
      })

      return obj
    }

    // Fallback
    const fb: Record<string, unknown> = {}
    fb.select = vi.fn(() => fb)
    fb.eq = vi.fn(() => fb)
    fb.is = vi.fn(() => Promise.resolve({ data: null }))
    return fb
  })

  return {
    supabase: { from: fromMock } as unknown as Parameters<typeof duplicateBoard>[0],
    fromMock,
    boardsInsertSpy,
    objectsInsertSpy,
    boardsDeleteEqSpy,
    objectsDeleteEqSpy,
  }
}

// ---------------------------------------------------------------------------
// Source object fixture
// ---------------------------------------------------------------------------

function makeSourceObject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'obj-1',
    board_id: 'source-board',
    type: 'sticky',
    x: 10,
    y: 20,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    created_by: 'original-user',
    parent_id: null,
    connect_start_id: null,
    connect_end_id: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('duplicateBoard', () => {
  // -------------------------------------------------------------------------
  // 1. Name deduplication
  // -------------------------------------------------------------------------
  describe('name deduplication', () => {
    it('uses "<name> - Copy" when there is no collision', async () => {
      const { supabase, boardsInsertSpy } = createMockSupabase()

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(boardsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Board - Copy' }),
      )
    })

    it('uses "<name> - Copy (2)" when "- Copy" already exists', async () => {
      const { supabase, boardsInsertSpy } = createMockSupabase()

      await duplicateBoard(supabase, 'board-1', 'My Board', ['My Board - Copy'], 'user-1')

      expect(boardsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Board - Copy (2)' }),
      )
    })

    it('uses "<name> - Copy (3)" when both "- Copy" and "- Copy (2)" exist', async () => {
      const { supabase, boardsInsertSpy } = createMockSupabase()

      await duplicateBoard(
        supabase,
        'board-1',
        'My Board',
        ['My Board - Copy', 'My Board - Copy (2)'],
        'user-1',
      )

      expect(boardsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Board - Copy (3)' }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // 2. Board shell insert failure
  // -------------------------------------------------------------------------
  describe('board shell insert failure', () => {
    it('returns null when board insert returns an error', async () => {
      const { supabase } = createMockSupabase({
        boardInsert: { data: null, error: { message: 'insert failed' } },
      })

      const result = await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(result).toBeNull()
    })

    it('returns null when board insert returns no data', async () => {
      const { supabase } = createMockSupabase({
        boardInsert: { data: null, error: null },
      })

      const result = await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(result).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // 3. Empty board
  // -------------------------------------------------------------------------
  describe('empty board', () => {
    it('returns the new board when the source board has no objects', async () => {
      const newBoard = { id: 'new-board-id', name: 'My Board - Copy', created_by: 'user-1' }
      const { supabase } = createMockSupabase({
        boardInsert: { data: newBoard, error: null },
        objectsSelect: { data: [] },
      })

      const result = await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(result).toEqual(newBoard)
    })

    it('returns the new board when the source board objects query returns null', async () => {
      const newBoard = { id: 'new-board-id', name: 'My Board - Copy', created_by: 'user-1' }
      const { supabase } = createMockSupabase({
        boardInsert: { data: newBoard, error: null },
        objectsSelect: { data: null },
      })

      const result = await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(result).toEqual(newBoard)
    })

    it('does not call board_objects insert when source has no objects', async () => {
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: [] },
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(objectsInsertSpy).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // 4. FK remapping
  // -------------------------------------------------------------------------
  describe('FK remapping', () => {
    it('remaps parent_id to the new UUID for the referenced object', async () => {
      // obj-1 → new-uuid-1, obj-2 → new-uuid-2 (randomUUID called in order)
      const sourceObjects = [
        makeSourceObject({ id: 'obj-1', parent_id: null }),
        makeSourceObject({ id: 'obj-2', parent_id: 'obj-1' }),
      ]
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      const insertedChunk = objectsInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>
      const copy1 = insertedChunk.find((c) => c.id === 'new-uuid-1')
      const copy2 = insertedChunk.find((c) => c.id === 'new-uuid-2')

      expect(copy1?.parent_id).toBeNull()
      expect(copy2?.parent_id).toBe('new-uuid-1')
    })

    it('remaps connect_start_id and connect_end_id', async () => {
      // obj-a → new-uuid-1, obj-b → new-uuid-2, connector-1 → new-uuid-3
      const sourceObjects = [
        makeSourceObject({ id: 'obj-a' }),
        makeSourceObject({ id: 'obj-b' }),
        makeSourceObject({
          id: 'connector-1',
          connect_start_id: 'obj-a',
          connect_end_id: 'obj-b',
        }),
      ]
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      const insertedChunk = objectsInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>
      const connectorCopy = insertedChunk.find((c) => c.id === 'new-uuid-3')

      expect(connectorCopy?.connect_start_id).toBe('new-uuid-1')
      expect(connectorCopy?.connect_end_id).toBe('new-uuid-2')
    })

    it('keeps null FKs as null', async () => {
      const sourceObjects = [
        makeSourceObject({
          id: 'obj-1',
          parent_id: null,
          connect_start_id: null,
          connect_end_id: null,
        }),
      ]
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      const insertedChunk = objectsInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>
      const copy = insertedChunk[0]

      expect(copy?.parent_id).toBeNull()
      expect(copy?.connect_start_id).toBeNull()
      expect(copy?.connect_end_id).toBeNull()
    })

    it('maps unrecognized FK IDs (not present in source) to null', async () => {
      const sourceObjects = [
        makeSourceObject({
          id: 'obj-1',
          parent_id: 'ghost-id-not-in-source',
        }),
      ]
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      const insertedChunk = objectsInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>
      const copy = insertedChunk[0]

      expect(copy?.parent_id).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // 5. Chunking
  // -------------------------------------------------------------------------
  describe('chunking', () => {
    it('performs a single insert for exactly 300 objects', async () => {
      const sourceObjects = Array.from({ length: 300 }, (_, i) =>
        makeSourceObject({ id: `obj-${i}` }),
      )
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(objectsInsertSpy).toHaveBeenCalledTimes(1)
      expect((objectsInsertSpy.mock.calls[0]?.[0] as unknown[]).length).toBe(300)
    })

    it('splits 301 objects into two chunks (300 + 1)', async () => {
      const sourceObjects = Array.from({ length: 301 }, (_, i) =>
        makeSourceObject({ id: `obj-${i}` }),
      )
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }, { error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(objectsInsertSpy).toHaveBeenCalledTimes(2)
      expect((objectsInsertSpy.mock.calls[0]?.[0] as unknown[]).length).toBe(300)
      expect((objectsInsertSpy.mock.calls[1]?.[0] as unknown[]).length).toBe(1)
    })

    it('splits 650 objects into three chunks (300 + 300 + 50)', async () => {
      const sourceObjects = Array.from({ length: 650 }, (_, i) =>
        makeSourceObject({ id: `obj-${i}` }),
      )
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }, { error: null }, { error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(objectsInsertSpy).toHaveBeenCalledTimes(3)
      expect((objectsInsertSpy.mock.calls[2]?.[0] as unknown[]).length).toBe(50)
    })
  })

  // -------------------------------------------------------------------------
  // 6. Rollback on chunk error
  // -------------------------------------------------------------------------
  describe('rollback on chunk error', () => {
    it('deletes board_objects by new board_id on chunk failure', async () => {
      const newBoard = { id: 'new-board-id', name: 'My Board - Copy', created_by: 'user-1' }
      const { supabase, objectsDeleteEqSpy } = createMockSupabase({
        boardInsert: { data: newBoard, error: null },
        objectsSelect: { data: [makeSourceObject()] },
        objectInserts: [{ error: { message: 'insert failed' } }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(objectsDeleteEqSpy).toHaveBeenCalledWith('board_id', 'new-board-id')
    })

    it('deletes the board shell by id on chunk failure', async () => {
      const newBoard = { id: 'new-board-id', name: 'My Board - Copy', created_by: 'user-1' }
      const { supabase, boardsDeleteEqSpy } = createMockSupabase({
        boardInsert: { data: newBoard, error: null },
        objectsSelect: { data: [makeSourceObject()] },
        objectInserts: [{ error: { message: 'insert failed' } }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(boardsDeleteEqSpy).toHaveBeenCalledWith('id', 'new-board-id')
    })

    it('returns null after chunk failure and rollback', async () => {
      const { supabase } = createMockSupabase({
        objectsSelect: { data: [makeSourceObject()] },
        objectInserts: [{ error: { message: 'insert failed' } }],
      })

      const result = await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(result).toBeNull()
    })

    it('stops inserting subsequent chunks after the first chunk fails', async () => {
      const sourceObjects = Array.from({ length: 301 }, (_, i) =>
        makeSourceObject({ id: `obj-${i}` }),
      )
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        // First chunk fails; second is never attempted
        objectInserts: [{ error: { message: 'chunk 1 failed' } }, { error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(objectsInsertSpy).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // 7. Rollback error handling
  // -------------------------------------------------------------------------
  describe('rollback error handling', () => {
    it('still returns null when rollback delete itself throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { supabase } = createMockSupabase({
        objectsSelect: { data: [makeSourceObject()] },
        objectInserts: [{ error: { message: 'insert failed' } }],
        rollbackThrows: true,
      })

      const result = await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(result).toBeNull()
      consoleSpy.mockRestore()
    })

    it('logs an error message containing "[boardDuplication]" when rollback throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { supabase } = createMockSupabase({
        objectsSelect: { data: [makeSourceObject()] },
        objectInserts: [{ error: { message: 'insert failed' } }],
        rollbackThrows: true,
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[boardDuplication]'),
        expect.any(Error),
      )
      consoleSpy.mockRestore()
    })
  })

  // -------------------------------------------------------------------------
  // 8. Strips old metadata from copies
  // -------------------------------------------------------------------------
  describe('strips old metadata', () => {
    it('removes created_at and updated_at from copies', async () => {
      const sourceObjects = [
        makeSourceObject({
          id: 'obj-1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        }),
      ]
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      const insertedChunk = objectsInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>
      const copy = insertedChunk[0]

      expect(copy).not.toHaveProperty('created_at')
      expect(copy).not.toHaveProperty('updated_at')
    })

    it('replaces board_id with the new board id rather than the source board id', async () => {
      const newBoard = { id: 'new-board-id', name: 'My Board - Copy', created_by: 'user-1' }
      const sourceObjects = [makeSourceObject({ id: 'obj-1', board_id: 'source-board-id' })]
      const { supabase, objectsInsertSpy } = createMockSupabase({
        boardInsert: { data: newBoard, error: null },
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      const insertedChunk = objectsInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>
      const copy = insertedChunk[0]

      expect(copy?.board_id).toBe('new-board-id')
      expect(copy?.board_id).not.toBe('source-board-id')
    })

    it('sets created_by on copies to the calling userId, not the original creator', async () => {
      const sourceObjects = [makeSourceObject({ id: 'obj-1', created_by: 'original-user' })]
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'new-owner')

      const insertedChunk = objectsInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>
      const copy = insertedChunk[0]

      expect(copy?.created_by).toBe('new-owner')
    })

    it('assigns new UUIDs to copy ids (original id is not reused)', async () => {
      const sourceObjects = [makeSourceObject({ id: 'obj-1' })]
      const { supabase, objectsInsertSpy } = createMockSupabase({
        objectsSelect: { data: sourceObjects },
        objectInserts: [{ error: null }],
      })

      await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      const insertedChunk = objectsInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>
      const copy = insertedChunk[0]

      expect(copy?.id).not.toBe('obj-1')
      expect(copy?.id).toBe('new-uuid-1')
    })
  })

  // -------------------------------------------------------------------------
  // 9. Happy path
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('returns the new board record when objects are successfully duplicated', async () => {
      const newBoard = { id: 'new-board-id', name: 'My Board - Copy', created_by: 'user-1' }
      const { supabase } = createMockSupabase({
        boardInsert: { data: newBoard, error: null },
        objectsSelect: { data: [makeSourceObject()] },
        objectInserts: [{ error: null }],
      })

      const result = await duplicateBoard(supabase, 'board-1', 'My Board', [], 'user-1')

      expect(result).toEqual(newBoard)
    })

    it('passes the correct userId and boardId when creating the board shell', async () => {
      const { supabase, boardsInsertSpy } = createMockSupabase()

      await duplicateBoard(supabase, 'source-board-42', 'My Board', [], 'auth-user-99')

      expect(boardsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ created_by: 'auth-user-99' }),
      )
    })
  })
})
