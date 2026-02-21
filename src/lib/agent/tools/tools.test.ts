/**
 * Tests for agent tool executors:
 *   createObjects, editObjects, queryObjects, fileTools
 *
 * Strategy:
 *  - Mock ./helpers partially (importActual) so makeToolDef is real (Zod validation, error catching),
 *    but buildAndInsertObject / updateFields are controlled fakes.
 *  - Mock external modules: supabase/admin, boardState, defaults, richText, tableUtils, uuid.
 *  - Access tools by name from each exported array; call executor(ctx, rawArgs).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mock references ────────────────────────────────────────────────────

const {
  mockBuildAndInsertObject,
  mockUpdateFields,
  mockInsertObject,
  mockGetMaxZIndex,
  mockBroadcastChanges,
  mockLoadBoardState,
  mockGetShapeDefaults,
  mockCreateDefaultTableData,
  mockSerializeTableData,
  mockPlainTextToTipTap,
  mockCreateAdminClient,
  mockUuidV4,
} = vi.hoisted(() => ({
  mockBuildAndInsertObject: vi.fn(),
  mockUpdateFields: vi.fn(),
  mockInsertObject: vi.fn(),
  mockGetMaxZIndex: vi.fn(() => 0),
  mockBroadcastChanges: vi.fn(),
  mockLoadBoardState: vi.fn(),
  mockGetShapeDefaults: vi.fn(),
  mockCreateDefaultTableData: vi.fn(),
  mockSerializeTableData: vi.fn(),
  mockPlainTextToTipTap: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockUuidV4: vi.fn(() => 'new-uuid'),
}))

// ── Module mocks ────────────────────────────────────────────────────────────────

vi.mock('./helpers', async () => {
  const actual = await vi.importActual<typeof import('./helpers')>('./helpers')
  return {
    ...actual,
    buildAndInsertObject: mockBuildAndInsertObject,
    updateFields: mockUpdateFields,
    insertObject: mockInsertObject,
  }
})

vi.mock('@/lib/agent/boardState', () => ({
  getMaxZIndex: mockGetMaxZIndex,
  broadcastChanges: mockBroadcastChanges,
  loadBoardState: mockLoadBoardState,
}))

vi.mock('@/lib/agent/defaults', () => ({
  getShapeDefaults: mockGetShapeDefaults,
}))

vi.mock('@/lib/table/tableUtils', () => ({
  createDefaultTableData: mockCreateDefaultTableData,
  serializeTableData: mockSerializeTableData,
}))

vi.mock('@/lib/richText', () => ({
  plainTextToTipTap: mockPlainTextToTipTap,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}))

vi.mock('uuid', () => ({
  v4: mockUuidV4,
}))

// Import tool arrays AFTER mocks are registered
import { createObjectTools } from './createObjects'
import { editObjectTools } from './editObjects'
import { queryObjectTools } from './queryObjects'
import { layoutObjectTools } from './layoutObjects'
import { fileTools } from './fileTools'
import type { ToolContext } from './types'
import type { BoardObject } from '@/types/board'

// ── Test helpers ────────────────────────────────────────────────────────────────

function makeCtx(objects?: Map<string, BoardObject>): ToolContext {
  return {
    boardId: 'board-1',
    userId: 'user-1',
    hlc: { ts: Date.now(), c: 0, n: 'user-1' },
    state: {
      boardId: 'board-1',
      objects: objects ?? new Map(),
      fieldClocks: new Map(),
    },
  }
}

function makeBoardObject(overrides: Partial<BoardObject> = {}): BoardObject {
  return {
    id: 'obj-1',
    board_id: 'board-1',
    type: 'sticky_note',
    x: 100,
    y: 200,
    width: 150,
    height: 150,
    rotation: 0,
    text: 'hello',
    color: '#FFEB3B',
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

function getTool(tools: typeof createObjectTools, name: string) {
  const tool = tools.find(t => t.name === name)
  if (!tool) throw new Error(`Tool ${name} not found`)
  return tool
}

/** Default shape defaults returned for any type */
const DEFAULT_SHAPE_DEFAULTS = {
  width: 150,
  height: 150,
  color: '#FFEB3B',
  font_size: 14,
  text: '',
  stroke_width: 2,
}

/** Default successful insert result */
function makeInsertSuccess(overrides: Record<string, unknown> = {}) {
  return {
    success: true as const,
    id: 'new-obj-id',
    obj: { id: 'new-obj-id', x: 200, y: 300, width: 150, height: 150, ...overrides },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetShapeDefaults.mockReturnValue(DEFAULT_SHAPE_DEFAULTS)
  mockGetMaxZIndex.mockReturnValue(0)
  mockBuildAndInsertObject.mockResolvedValue(makeInsertSuccess())
  mockUpdateFields.mockResolvedValue({ success: true })
  mockPlainTextToTipTap.mockImplementation((text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }))
  mockCreateDefaultTableData.mockReturnValue({ columns: [], rows: [] })
  mockSerializeTableData.mockReturnValue('{"columns":[],"rows":[]}')
})

// ══════════════════════════════════════════════════════════════════════════════
// createObjects
// ══════════════════════════════════════════════════════════════════════════════

describe('createObjects', () => {
  describe('createStickyNote', () => {
    it('happy path with defaults — calls buildAndInsertObject and broadcastChanges', async () => {
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createStickyNote').executor(ctx, { text: 'hello' })

      expect(mockBuildAndInsertObject).toHaveBeenCalledOnce()
      const [, type, fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(type).toBe('sticky_note')
      expect(fields).toMatchObject({ text: 'hello', z_index: 1, rotation: 0, parent_id: null })
      expect(mockBroadcastChanges).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ id: 'new-obj-id', type: 'sticky_note' })
    })

    it('passes explicit x, y, color, and title', async () => {
      const ctx = makeCtx()
      await getTool(createObjectTools, 'createStickyNote').executor(ctx, {
        text: 'note',
        color: '#FF0000',
        x: 50,
        y: 75,
        title: 'My Note',
      })

      const [, , fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(fields.x).toBe(50)
      expect(fields.y).toBe(75)
      expect(fields.color).toBe('#FF0000')
      expect(fields.title).toBe('My Note')
    })

    it('returns { error } when buildAndInsertObject fails', async () => {
      mockBuildAndInsertObject.mockResolvedValue({ success: false, error: 'DB error' })
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createStickyNote').executor(ctx, { text: '' })
      expect(result).toEqual({ error: 'DB error' })
      expect(mockBroadcastChanges).not.toHaveBeenCalled()
    })

    it('returns { error } on invalid args (missing required field via schema)', async () => {
      // createStickyNoteSchema has text with default so empty object is valid — use wrong type
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createStickyNote').executor(ctx, { text: 123 })
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })

  describe('createShape', () => {
    it('rectangle happy path', async () => {
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createShape').executor(ctx, { type: 'rectangle' })

      expect(mockBuildAndInsertObject).toHaveBeenCalledOnce()
      const [, type, fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(type).toBe('rectangle')
      expect(fields).toMatchObject({ rotation: 0, parent_id: null })
      expect(result).toMatchObject({ type: 'rectangle', id: 'new-obj-id' })
    })

    it('ngon with sides field included', async () => {
      const ctx = makeCtx()
      await getTool(createObjectTools, 'createShape').executor(ctx, { type: 'ngon', sides: 6 })

      const [, , fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(fields.sides).toBe(6)
    })

    it('ngon without sides does not set sides field', async () => {
      const ctx = makeCtx()
      await getTool(createObjectTools, 'createShape').executor(ctx, { type: 'ngon' })

      const [, , fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(fields).not.toHaveProperty('sides')
    })

    it('returns { error } when buildAndInsertObject fails', async () => {
      mockBuildAndInsertObject.mockResolvedValue({ success: false, error: 'insert failed' })
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createShape').executor(ctx, { type: 'circle' })
      expect(result).toEqual({ error: 'insert failed' })
    })

    it('returns { error } on invalid type', async () => {
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createShape').executor(ctx, { type: 'invalid_type' })
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })

  describe('createFrame', () => {
    it('happy path — sets text and title to provided title', async () => {
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createFrame').executor(ctx, { title: 'Sprint 1' })

      expect(mockBuildAndInsertObject).toHaveBeenCalledOnce()
      const [, type, fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(type).toBe('frame')
      expect(fields.text).toBe('Sprint 1')
      expect(fields.title).toBe('Sprint 1')
      expect(result).toMatchObject({ type: 'frame', id: 'new-obj-id', title: 'Sprint 1' })
    })

    it('uses default title when none provided', async () => {
      const ctx = makeCtx()
      await getTool(createObjectTools, 'createFrame').executor(ctx, {})

      const [, , fields] = mockBuildAndInsertObject.mock.calls[0]
      // Schema default is 'Frame'
      expect(typeof fields.title).toBe('string')
    })

    it('returns { error } when buildAndInsertObject fails', async () => {
      mockBuildAndInsertObject.mockResolvedValue({ success: false, error: 'frame insert failed' })
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createFrame').executor(ctx, { title: 'A' })
      expect(result).toEqual({ error: 'frame insert failed' })
    })
  })

  describe('createTable', () => {
    it('happy path — calls createDefaultTableData and serializeTableData', async () => {
      const ctx = makeCtx()
      mockSerializeTableData.mockReturnValue('{"columns":[],"rows":[]}')

      const result = await getTool(createObjectTools, 'createTable').executor(ctx, { columns: 3, rows: 4 })

      expect(mockCreateDefaultTableData).toHaveBeenCalledWith(3, 4)
      expect(mockSerializeTableData).toHaveBeenCalledOnce()
      expect(mockBuildAndInsertObject).toHaveBeenCalledOnce()
      const [, type, fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(type).toBe('table')
      expect(fields.table_data).toBe('{"columns":[],"rows":[]}')
      expect(result).toMatchObject({ type: 'table', id: 'new-obj-id', columns: 3, rows: 4 })
    })

    it('returns { error } when buildAndInsertObject fails', async () => {
      mockBuildAndInsertObject.mockResolvedValue({ success: false, error: 'table error' })
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createTable').executor(ctx, { columns: 2, rows: 2 })
      expect(result).toEqual({ error: 'table error' })
    })

    it('returns { error } on invalid args (columns out of range)', async () => {
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createTable').executor(ctx, { columns: 0, rows: 3 })
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })

  describe('createConnector', () => {
    it('happy path — creates arrow between two objects', async () => {
      const startObj = makeBoardObject({ id: 'start', type: 'rectangle', x: 0, y: 0, width: 100, height: 80 })
      const endObj = makeBoardObject({ id: 'end', type: 'rectangle', x: 300, y: 0, width: 100, height: 80 })
      const ctx = makeCtx(new Map([['start', startObj], ['end', endObj]]))

      mockGetShapeDefaults.mockReturnValue({ ...DEFAULT_SHAPE_DEFAULTS, stroke_width: 2 })
      mockBuildAndInsertObject.mockResolvedValue(makeInsertSuccess())

      const result = await getTool(createObjectTools, 'createConnector').executor(ctx, {
        type: 'arrow',
        startObjectId: 'start',
        endObjectId: 'end',
      })

      expect(mockBuildAndInsertObject).toHaveBeenCalledOnce()
      const [, type, fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(type).toBe('arrow')
      expect(fields.connect_start_id).toBe('start')
      expect(fields.connect_end_id).toBe('end')
      expect(fields.marker_end).toBe('arrow')
      expect(result).toMatchObject({ type: 'arrow', startObjectId: 'start', endObjectId: 'end' })
    })

    it('creates line connector without marker_end', async () => {
      const startObj = makeBoardObject({ id: 'start', type: 'rectangle', x: 0, y: 0, width: 100, height: 80 })
      const endObj = makeBoardObject({ id: 'end', type: 'rectangle', x: 300, y: 0, width: 100, height: 80 })
      const ctx = makeCtx(new Map([['start', startObj], ['end', endObj]]))

      await getTool(createObjectTools, 'createConnector').executor(ctx, {
        type: 'line',
        startObjectId: 'start',
        endObjectId: 'end',
      })

      const [, , fields] = mockBuildAndInsertObject.mock.calls[0]
      expect(fields).not.toHaveProperty('marker_end')
    })

    it('returns error when start object not found', async () => {
      const endObj = makeBoardObject({ id: 'end', type: 'rectangle' })
      const ctx = makeCtx(new Map([['end', endObj]]))
      const result = await getTool(createObjectTools, 'createConnector').executor(ctx, {
        type: 'arrow',
        startObjectId: 'missing',
        endObjectId: 'end',
      })
      expect(result).toMatchObject({ error: expect.stringContaining('missing') })
    })

    it('returns error when end object not found', async () => {
      const startObj = makeBoardObject({ id: 'start', type: 'rectangle' })
      const ctx = makeCtx(new Map([['start', startObj]]))
      const result = await getTool(createObjectTools, 'createConnector').executor(ctx, {
        type: 'arrow',
        startObjectId: 'start',
        endObjectId: 'missing',
      })
      expect(result).toMatchObject({ error: expect.stringContaining('missing') })
    })

    it('returns error when start object is a line/arrow (vector type)', async () => {
      const lineObj = makeBoardObject({ id: 'line-1', type: 'line' })
      const endObj = makeBoardObject({ id: 'end', type: 'rectangle' })
      const ctx = makeCtx(new Map([['line-1', lineObj], ['end', endObj]]))

      const result = await getTool(createObjectTools, 'createConnector').executor(ctx, {
        type: 'arrow',
        startObjectId: 'line-1',
        endObjectId: 'end',
      })
      expect(result).toMatchObject({ error: expect.stringContaining('line') })
    })

    it('returns error when end object is a vector type', async () => {
      const startObj = makeBoardObject({ id: 'start', type: 'rectangle' })
      const arrowObj = makeBoardObject({ id: 'arrow-1', type: 'arrow' })
      const ctx = makeCtx(new Map([['start', startObj], ['arrow-1', arrowObj]]))

      const result = await getTool(createObjectTools, 'createConnector').executor(ctx, {
        type: 'arrow',
        startObjectId: 'start',
        endObjectId: 'arrow-1',
      })
      expect(result).toMatchObject({ error: expect.stringContaining('arrow') })
    })

    it('returns { error } when buildAndInsertObject fails', async () => {
      mockBuildAndInsertObject.mockResolvedValue({ success: false, error: 'connector insert failed' })
      const startObj = makeBoardObject({ id: 's', type: 'rectangle' })
      const endObj = makeBoardObject({ id: 'e', type: 'rectangle' })
      const ctx = makeCtx(new Map([['s', startObj], ['e', endObj]]))

      const result = await getTool(createObjectTools, 'createConnector').executor(ctx, {
        type: 'arrow',
        startObjectId: 's',
        endObjectId: 'e',
      })
      expect(result).toEqual({ error: 'connector insert failed' })
    })

    it('returns { error } on invalid args (missing startObjectId)', async () => {
      const ctx = makeCtx()
      const result = await getTool(createObjectTools, 'createConnector').executor(ctx, {
        type: 'arrow',
        endObjectId: 'end',
      })
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// editObjects
// ══════════════════════════════════════════════════════════════════════════════

describe('editObjects', () => {
  describe('moveObject', () => {
    it('happy path — calls updateFields and broadcastChanges', async () => {
      const obj = makeBoardObject({ id: 'obj-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))

      const result = await getTool(editObjectTools, 'moveObject').executor(ctx, { id: 'obj-1', x: 50, y: 75 })

      expect(mockUpdateFields).toHaveBeenCalledOnce()
      const [id, boardId, updates] = mockUpdateFields.mock.calls[0]
      expect(id).toBe('obj-1')
      expect(boardId).toBe('board-1')
      expect(updates).toMatchObject({ x: 50, y: 75 })
      expect(mockBroadcastChanges).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ id: 'obj-1', x: 50, y: 75 })
    })

    it('returns { error } when updateFields fails (object not found)', async () => {
      mockUpdateFields.mockResolvedValue({ success: false, error: 'Object obj-missing not found' })
      const ctx = makeCtx()
      const result = await getTool(editObjectTools, 'moveObject').executor(ctx, { id: 'obj-missing', x: 0, y: 0 })
      expect(result).toMatchObject({ error: 'Object obj-missing not found' })
      expect(mockBroadcastChanges).not.toHaveBeenCalled()
    })

    it('returns { error } on invalid args (x out of range)', async () => {
      const ctx = makeCtx()
      const result = await getTool(editObjectTools, 'moveObject').executor(ctx, { id: 'x', x: 999999, y: 0 })
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })

  describe('resizeObject', () => {
    it('happy path — calls updateFields with width and height', async () => {
      const obj = makeBoardObject({ id: 'obj-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))

      const result = await getTool(editObjectTools, 'resizeObject').executor(ctx, {
        id: 'obj-1',
        width: 300,
        height: 200,
      })

      expect(mockUpdateFields).toHaveBeenCalledOnce()
      const [, , updates] = mockUpdateFields.mock.calls[0]
      expect(updates).toMatchObject({ width: 300, height: 200 })
      expect(mockBroadcastChanges).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ id: 'obj-1', width: 300, height: 200 })
    })

    it('returns { error } on invalid args (non-positive dimension)', async () => {
      const ctx = makeCtx()
      const result = await getTool(editObjectTools, 'resizeObject').executor(ctx, { id: 'x', width: -1, height: 100 })
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })

  describe('updateText', () => {
    it('updates text only — calls plainTextToTipTap and sets rich_text', async () => {
      const obj = makeBoardObject({ id: 'obj-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))

      mockPlainTextToTipTap.mockReturnValue({ type: 'doc', content: [] })

      const result = await getTool(editObjectTools, 'updateText').executor(ctx, {
        id: 'obj-1',
        text: 'new text',
      })

      expect(mockPlainTextToTipTap).toHaveBeenCalledWith('new text')
      const [, , updates] = mockUpdateFields.mock.calls[0]
      expect(updates.text).toBe('new text')
      expect(typeof updates.rich_text).toBe('string')
      expect(result).toMatchObject({ id: 'obj-1', text: 'new text' })
    })

    it('updates title only — does not call plainTextToTipTap', async () => {
      const obj = makeBoardObject({ id: 'obj-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))

      const result = await getTool(editObjectTools, 'updateText').executor(ctx, {
        id: 'obj-1',
        title: 'New Title',
      })

      expect(mockPlainTextToTipTap).not.toHaveBeenCalled()
      const [, , updates] = mockUpdateFields.mock.calls[0]
      expect(updates.title).toBe('New Title')
      expect(result).toMatchObject({ id: 'obj-1', title: 'New Title' })
    })

    it('updates both text and title', async () => {
      const obj = makeBoardObject({ id: 'obj-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))

      await getTool(editObjectTools, 'updateText').executor(ctx, {
        id: 'obj-1',
        text: 'body',
        title: 'header',
      })

      const [, , updates] = mockUpdateFields.mock.calls[0]
      expect(updates.text).toBe('body')
      expect(updates.title).toBe('header')
      expect(typeof updates.rich_text).toBe('string')
    })

    it('returns error when neither text nor title provided', async () => {
      const ctx = makeCtx()
      const result = await getTool(editObjectTools, 'updateText').executor(ctx, { id: 'obj-1' })
      expect(result).toMatchObject({ error: 'No updates provided' })
      expect(mockUpdateFields).not.toHaveBeenCalled()
    })

    it('returns { error } when updateFields fails', async () => {
      mockUpdateFields.mockResolvedValue({ success: false, error: 'update failed' })
      const obj = makeBoardObject({ id: 'obj-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))

      const result = await getTool(editObjectTools, 'updateText').executor(ctx, {
        id: 'obj-1',
        text: 'hello',
      })
      expect(result).toMatchObject({ error: 'update failed' })
    })
  })

  describe('changeColor', () => {
    it('happy path — updates color and broadcasts', async () => {
      const obj = makeBoardObject({ id: 'obj-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))

      const result = await getTool(editObjectTools, 'changeColor').executor(ctx, {
        id: 'obj-1',
        color: '#FF5733',
      })

      expect(mockUpdateFields).toHaveBeenCalledOnce()
      const [, , updates] = mockUpdateFields.mock.calls[0]
      expect(updates.color).toBe('#FF5733')
      expect(mockBroadcastChanges).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ id: 'obj-1', color: '#FF5733' })
    })

    it('returns { error } on invalid color format', async () => {
      const ctx = makeCtx()
      const result = await getTool(editObjectTools, 'changeColor').executor(ctx, {
        id: 'obj-1',
        color: 'red',
      })
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })

  describe('deleteObject', () => {
    it('happy path — marks deleted_at, removes from ctx.state, broadcasts', async () => {
      const obj = makeBoardObject({ id: 'obj-1', board_id: 'board-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))
      ctx.state.fieldClocks.set('obj-1', {})

      // Build admin mock with chainable update
      const isMock = vi.fn().mockResolvedValue({ error: null })
      const eqMock = vi.fn().mockReturnValue({ is: isMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
      mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) })

      const result = await getTool(editObjectTools, 'deleteObject').executor(ctx, { id: 'obj-1' })

      expect(updateMock).toHaveBeenCalledOnce()
      const [updateArg] = updateMock.mock.calls[0]
      expect(typeof updateArg.deleted_at).toBe('string')
      expect(ctx.state.objects.has('obj-1')).toBe(false)
      expect(ctx.state.fieldClocks.has('obj-1')).toBe(false)
      expect(mockBroadcastChanges).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ id: 'obj-1', deleted: true })
    })

    it('returns error when object not found in ctx.state', async () => {
      const ctx = makeCtx()
      const result = await getTool(editObjectTools, 'deleteObject').executor(ctx, { id: 'no-such-id' })
      expect(result).toMatchObject({ error: expect.stringContaining('no-such-id') })
    })

    it('returns error for cross-board guard (board_id mismatch)', async () => {
      const obj = makeBoardObject({ id: 'obj-foreign', board_id: 'other-board' })
      const ctx = makeCtx(new Map([['obj-foreign', obj]]))
      const result = await getTool(editObjectTools, 'deleteObject').executor(ctx, { id: 'obj-foreign' })
      expect(result).toMatchObject({ error: 'Object not found' })
    })

    it('returns error when supabase update fails', async () => {
      const obj = makeBoardObject({ id: 'obj-1', board_id: 'board-1' })
      const ctx = makeCtx(new Map([['obj-1', obj]]))

      const isMock = vi.fn().mockResolvedValue({ error: { message: 'DB error' } })
      const eqMock = vi.fn().mockReturnValue({ is: isMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
      mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) })

      const result = await getTool(editObjectTools, 'deleteObject').executor(ctx, { id: 'obj-1' })
      expect(result).toMatchObject({ error: 'DB error' })
      // Object should not be removed from state on failure
      expect(ctx.state.objects.has('obj-1')).toBe(true)
    })

    it('returns { error } on invalid args (missing id)', async () => {
      const ctx = makeCtx()
      const result = await getTool(editObjectTools, 'deleteObject').executor(ctx, {})
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// queryObjects
// ══════════════════════════════════════════════════════════════════════════════

describe('queryObjects', () => {
  describe('getBoardState', () => {
    it('returns all non-deleted objects from freshly loaded state', async () => {
      const obj1 = makeBoardObject({ id: 'obj-1', type: 'sticky_note', x: 10.5, y: 20.3 })
      const obj2 = makeBoardObject({ id: 'obj-2', type: 'rectangle', x: 100, y: 200 })
      const freshState = {
        boardId: 'board-1',
        objects: new Map([['obj-1', obj1], ['obj-2', obj2]]),
        fieldClocks: new Map(),
      }
      mockLoadBoardState.mockResolvedValue(freshState)

      const ctx = makeCtx()
      const result = await getTool(queryObjectTools, 'getBoardState').executor(ctx, {}) as {
        objectCount: number
        objects: Array<{ id: string; x: number; y: number }>
      }

      expect(mockLoadBoardState).toHaveBeenCalledWith('board-1')
      expect(ctx.state).toBe(freshState)
      expect(result.objectCount).toBe(2)
      expect(result.objects).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'obj-1', x: 11, y: 20 }), // rounded
        expect.objectContaining({ id: 'obj-2', x: 100, y: 200 }),
      ]))
    })

    it('filters out deleted objects', async () => {
      const alive = makeBoardObject({ id: 'alive-1', type: 'sticky_note', deleted_at: null })
      const deleted = makeBoardObject({ id: 'del-1', type: 'sticky_note', deleted_at: '2026-01-01T00:00:00Z' })
      const freshState = {
        boardId: 'board-1',
        objects: new Map([['alive-1', alive], ['del-1', deleted]]),
        fieldClocks: new Map(),
      }
      mockLoadBoardState.mockResolvedValue(freshState)

      const ctx = makeCtx()
      const result = await getTool(queryObjectTools, 'getBoardState').executor(ctx, {}) as {
        objectCount: number
        objects: Array<{ id: string }>
      }

      expect(result.objectCount).toBe(1)
      expect(result.objects[0].id).toBe('alive-1')
    })

    it('returns empty when board has no objects', async () => {
      mockLoadBoardState.mockResolvedValue({
        boardId: 'board-1',
        objects: new Map(),
        fieldClocks: new Map(),
      })

      const ctx = makeCtx()
      const result = await getTool(queryObjectTools, 'getBoardState').executor(ctx, {}) as {
        objectCount: number
        objects: unknown[]
      }

      expect(result.objectCount).toBe(0)
      expect(result.objects).toHaveLength(0)
    })

    it('works regardless of agentObjectId (no scope guard)', async () => {
      const obj = makeBoardObject({ id: 'obj-1', type: 'rectangle' })
      mockLoadBoardState.mockResolvedValue({
        boardId: 'board-1',
        objects: new Map([['obj-1', obj]]),
        fieldClocks: new Map(),
      })

      const ctx = makeCtx()
      ctx.agentObjectId = 'some-agent' // scoped, but getBoardState should still work
      const result = await getTool(queryObjectTools, 'getBoardState').executor(ctx, {}) as {
        objectCount: number
      }

      expect(result.objectCount).toBe(1)
    })
  })

  describe('getConnectedObjects', () => {
    it('returns all objects from freshly loaded state and updates ctx.state', async () => {
      const freshObj = makeBoardObject({ id: 'fresh-1', type: 'rectangle', x: 10.7, y: 20.3 })
      const freshState = {
        boardId: 'board-1',
        objects: new Map([['fresh-1', freshObj]]),
        fieldClocks: new Map(),
      }
      mockLoadBoardState.mockResolvedValue(freshState)

      const ctx = makeCtx()
      const result = await getTool(queryObjectTools, 'getConnectedObjects').executor(ctx, {})

      expect(mockLoadBoardState).toHaveBeenCalledWith('board-1')
      // ctx.state should be updated to fresh state
      expect(ctx.state).toBe(freshState)
      expect(result).toMatchObject({
        objectCount: 1,
        objects: expect.arrayContaining([
          expect.objectContaining({
            id: 'fresh-1',
            type: 'rectangle',
            x: 11,  // Math.round(10.7)
            y: 20,  // Math.round(20.3)
          }),
        ]),
      })
    })

    it('returns empty objects when board has no objects', async () => {
      mockLoadBoardState.mockResolvedValue({
        boardId: 'board-1',
        objects: new Map(),
        fieldClocks: new Map(),
      })

      const ctx = makeCtx()
      const result = await getTool(queryObjectTools, 'getConnectedObjects').executor(ctx, {}) as { objectCount: number; objects: unknown[] }

      expect(result.objectCount).toBe(0)
      expect(result.objects).toHaveLength(0)
    })

    it('omits undefined optional fields from returned objects', async () => {
      const obj = makeBoardObject({ id: 'o1', text: '', title: null, parent_id: null } as unknown as Partial<BoardObject>)
      mockLoadBoardState.mockResolvedValue({
        boardId: 'board-1',
        objects: new Map([['o1', obj]]),
        fieldClocks: new Map(),
      })

      const ctx = makeCtx()
      const result = await getTool(queryObjectTools, 'getConnectedObjects').executor(ctx, {}) as { objects: Record<string, unknown>[] }

      const returned = result.objects[0]
      expect(returned.text).toBeUndefined()
      expect(returned.title).toBeUndefined()
      expect(returned.parent_id).toBeUndefined()
    })

    it('filters to connected objects only when agentObjectId is set', async () => {
      const agentObj = makeBoardObject({ id: 'agent-1', type: 'agent_output' })
      const connector = makeBoardObject({ id: 'dc-1', type: 'data_connector', connect_start_id: 'agent-1', connect_end_id: 'rect-1', deleted_at: null } as unknown as Partial<BoardObject>)
      const connectedRect = makeBoardObject({ id: 'rect-1', type: 'rectangle' })
      const unconnectedObj = makeBoardObject({ id: 'other-1', type: 'rectangle' })
      const freshState = {
        boardId: 'board-1',
        objects: new Map([['agent-1', agentObj], ['dc-1', connector], ['rect-1', connectedRect], ['other-1', unconnectedObj]]),
        fieldClocks: new Map(),
      }
      mockLoadBoardState.mockResolvedValue(freshState)

      const ctx = makeCtx()
      ctx.agentObjectId = 'agent-1'
      const result = await getTool(queryObjectTools, 'getConnectedObjects').executor(ctx, {}) as { objectCount: number; objects: Array<{ id: string }> }

      expect(result.objectCount).toBe(3) // agent-1 + dc-1 + rect-1 (connected via data_connector)
      expect(result.objects.map(o => o.id)).toEqual(expect.arrayContaining(['agent-1', 'dc-1', 'rect-1']))
      expect(result.objects.find(o => o.id === 'other-1')).toBeUndefined()
    })
  })

  describe('getFrameObjects', () => {
    it('returns children of a frame', async () => {
      const frame = makeBoardObject({ id: 'frame-1', type: 'frame' })
      const child1 = makeBoardObject({ id: 'child-1', type: 'sticky_note', parent_id: 'frame-1', deleted_at: null })
      const child2 = makeBoardObject({ id: 'child-2', type: 'rectangle', parent_id: 'frame-1', deleted_at: null })
      const unrelated = makeBoardObject({ id: 'other', type: 'rectangle', parent_id: null })

      const ctx = makeCtx(new Map([
        ['frame-1', frame],
        ['child-1', child1],
        ['child-2', child2],
        ['other', unrelated],
      ]))

      const result = await getTool(queryObjectTools, 'getFrameObjects').executor(ctx, { frameId: 'frame-1' }) as {
        frameId: string
        childCount: number
        children: Array<{ id: string }>
      }

      expect(result.frameId).toBe('frame-1')
      expect(result.childCount).toBe(2)
      expect(result.children.map((c) => c.id)).toEqual(expect.arrayContaining(['child-1', 'child-2']))
    })

    it('excludes soft-deleted children', async () => {
      const frame = makeBoardObject({ id: 'frame-1', type: 'frame' })
      const activeChild = makeBoardObject({ id: 'c1', type: 'sticky_note', parent_id: 'frame-1', deleted_at: null })
      const deletedChild = makeBoardObject({ id: 'c2', type: 'sticky_note', parent_id: 'frame-1', deleted_at: '2026-01-01T00:00:00Z' })

      const ctx = makeCtx(new Map([['frame-1', frame], ['c1', activeChild], ['c2', deletedChild]]))
      const result = await getTool(queryObjectTools, 'getFrameObjects').executor(ctx, { frameId: 'frame-1' }) as {
        childCount: number
        children: Array<{ id: string }>
      }

      expect(result.childCount).toBe(1)
      expect(result.children[0].id).toBe('c1')
    })

    it('returns error when frame not found', async () => {
      const ctx = makeCtx()
      const result = await getTool(queryObjectTools, 'getFrameObjects').executor(ctx, { frameId: 'no-frame' })
      expect(result).toMatchObject({ error: expect.stringContaining('no-frame') })
    })

    it('returns error when object is not a frame type', async () => {
      const notAFrame = makeBoardObject({ id: 'sticky-1', type: 'sticky_note' })
      const ctx = makeCtx(new Map([['sticky-1', notAFrame]]))
      const result = await getTool(queryObjectTools, 'getFrameObjects').executor(ctx, { frameId: 'sticky-1' })
      expect(result).toMatchObject({ error: expect.stringContaining('not a frame') })
    })

    it('returns { error } on invalid args (missing frameId)', async () => {
      const ctx = makeCtx()
      const result = await getTool(queryObjectTools, 'getFrameObjects').executor(ctx, {})
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })

    it('returns error when agentObjectId is set and frame not connected', async () => {
      const frame = makeBoardObject({ id: 'frame-1', type: 'frame' })
      const agentObj = makeBoardObject({ id: 'agent-1', type: 'agent_output' })
      const ctx = makeCtx(new Map([['frame-1', frame], ['agent-1', agentObj]]))
      ctx.agentObjectId = 'agent-1'
      const result = await getTool(queryObjectTools, 'getFrameObjects').executor(ctx, { frameId: 'frame-1' })
      expect(result).toMatchObject({ error: 'Object not connected to this agent' })
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// layoutObjects
// ══════════════════════════════════════════════════════════════════════════════

describe('layoutObjects', () => {
  describe('layoutObjects', () => {
    it('arranges objects in grid layout with correct math', async () => {
      const obj1 = makeBoardObject({ id: 'o1', type: 'sticky_note', width: 150, height: 150, deleted_at: null })
      const obj2 = makeBoardObject({ id: 'o2', type: 'rectangle', width: 150, height: 150, deleted_at: null })
      const obj3 = makeBoardObject({ id: 'o3', type: 'circle', width: 150, height: 150, deleted_at: null })
      const obj4 = makeBoardObject({ id: 'o4', type: 'sticky_note', width: 150, height: 150, deleted_at: null })
      const freshState = {
        boardId: 'board-1',
        objects: new Map([['o1', obj1], ['o2', obj2], ['o3', obj3], ['o4', obj4]]),
        fieldClocks: new Map(),
      }
      mockLoadBoardState.mockResolvedValue(freshState)

      const ctx = makeCtx()
      const result = await getTool(layoutObjectTools, 'layoutObjects').executor(ctx, {
        layout: 'grid',
        columns: 2,
        startX: 100,
        startY: 100,
        padding: 20,
      }) as { success: boolean; movedCount: number; movedIds: string[] }

      expect(result.success).toBe(true)
      expect(result.movedCount).toBe(4)
      expect(result.movedIds).toHaveLength(4)
      // Should call updateFields for each object
      expect(mockUpdateFields).toHaveBeenCalledTimes(4)
      // Should broadcast once
      expect(mockBroadcastChanges).toHaveBeenCalledOnce()
    })

    it('arranges specific objects by ID', async () => {
      const obj1 = makeBoardObject({ id: 'o1', type: 'sticky_note', width: 150, height: 150, deleted_at: null })
      const obj2 = makeBoardObject({ id: 'o2', type: 'rectangle', width: 200, height: 200, deleted_at: null })
      const obj3 = makeBoardObject({ id: 'o3', type: 'circle', width: 100, height: 100, deleted_at: null })
      const freshState = {
        boardId: 'board-1',
        objects: new Map([['o1', obj1], ['o2', obj2], ['o3', obj3]]),
        fieldClocks: new Map(),
      }
      mockLoadBoardState.mockResolvedValue(freshState)

      const ctx = makeCtx()
      const result = await getTool(layoutObjectTools, 'layoutObjects').executor(ctx, {
        objectIds: ['o1', 'o3'],
        layout: 'horizontal',
      }) as { success: boolean; movedCount: number; movedIds: string[] }

      expect(result.success).toBe(true)
      expect(result.movedCount).toBe(2)
      expect(mockUpdateFields).toHaveBeenCalledTimes(2)
    })

    it('returns error when no objects found', async () => {
      mockLoadBoardState.mockResolvedValue({
        boardId: 'board-1',
        objects: new Map(),
        fieldClocks: new Map(),
      })

      const ctx = makeCtx()
      const result = await getTool(layoutObjectTools, 'layoutObjects').executor(ctx, {
        layout: 'grid',
      })
      expect(result).toMatchObject({ error: 'No objects found to arrange' })
    })

    it('skips non-moveable types (e.g. data_connector)', async () => {
      const connector = makeBoardObject({ id: 'dc-1', type: 'data_connector', deleted_at: null })
      const freshState = {
        boardId: 'board-1',
        objects: new Map([['dc-1', connector]]),
        fieldClocks: new Map(),
      }
      mockLoadBoardState.mockResolvedValue(freshState)

      const ctx = makeCtx()
      const result = await getTool(layoutObjectTools, 'layoutObjects').executor(ctx, {
        layout: 'grid',
      })
      expect(result).toMatchObject({ error: 'No objects found to arrange' })
    })

    it('vertical layout stacks objects vertically', async () => {
      const obj1 = makeBoardObject({ id: 'o1', type: 'sticky_note', width: 150, height: 100, deleted_at: null })
      const obj2 = makeBoardObject({ id: 'o2', type: 'sticky_note', width: 150, height: 100, deleted_at: null })
      const freshState = {
        boardId: 'board-1',
        objects: new Map([['o1', obj1], ['o2', obj2]]),
        fieldClocks: new Map(),
      }
      mockLoadBoardState.mockResolvedValue(freshState)

      const ctx = makeCtx()
      const result = await getTool(layoutObjectTools, 'layoutObjects').executor(ctx, {
        layout: 'vertical',
        startX: 50,
        startY: 50,
        padding: 10,
      }) as { success: boolean; movedCount: number }

      expect(result.success).toBe(true)
      expect(result.movedCount).toBe(2)
      // First object at y=50, second at y=50+100+10=160
      const firstCall = mockUpdateFields.mock.calls[0]
      const secondCall = mockUpdateFields.mock.calls[1]
      expect(firstCall[2]).toMatchObject({ x: 50, y: 50 })
      expect(secondCall[2]).toMatchObject({ x: 50, y: 160 })
    })

    it('returns { error } on invalid args (missing layout)', async () => {
      const ctx = makeCtx()
      const result = await getTool(layoutObjectTools, 'layoutObjects').executor(ctx, {})
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// fileTools
// ══════════════════════════════════════════════════════════════════════════════

describe('fileTools', () => {
  /** Build a Supabase admin mock for storage operations */
  function makeStorageAdminMock(opts: {
    signedUrl?: { data: { signedUrl: string } | null; error: { message: string } | null }
    download?: { data: Blob | null; error: { message: string } | null }
  } = {}) {
    const signedUrlResult = opts.signedUrl ?? { data: { signedUrl: 'https://cdn.example.com/file.jpg' }, error: null }
    const downloadResult = opts.download ?? { data: new Blob(['hello content']), error: null }

    const storageBucket = {
      createSignedUrl: vi.fn().mockResolvedValue(signedUrlResult),
      download: vi.fn().mockResolvedValue(downloadResult),
    }
    mockCreateAdminClient.mockReturnValue({
      storage: { from: vi.fn().mockReturnValue(storageBucket) },
    })
    return storageBucket
  }

  describe('describeImage', () => {
    it('happy path — returns signed URL for image object', async () => {
      const imageObj = makeBoardObject({
        id: 'img-1',
        type: 'file',
        storage_path: 'files/board-1/image.jpg',
        mime_type: 'image/jpeg',
        file_name: 'image.jpg',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['img-1', imageObj]]))
      makeStorageAdminMock()

      const result = await getTool(fileTools, 'describeImage').executor(ctx, { objectId: 'img-1' }) as {
        imageUrl: string
        fileName: string
        mimeType: string
      }

      expect(result.imageUrl).toBe('https://cdn.example.com/file.jpg')
      expect(result.fileName).toBe('image.jpg')
      expect(result.mimeType).toBe('image/jpeg')
    })

    it('returns error when object not found', async () => {
      const ctx = makeCtx()
      const result = await getTool(fileTools, 'describeImage').executor(ctx, { objectId: 'no-obj' })
      expect(result).toMatchObject({ error: expect.stringContaining('no-obj') })
    })

    it('returns error when object has no storage_path', async () => {
      const obj = makeBoardObject({ id: 'obj-1', storage_path: null } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['obj-1', obj]]))
      const result = await getTool(fileTools, 'describeImage').executor(ctx, { objectId: 'obj-1' })
      expect(result).toMatchObject({ error: 'Object has no file attached' })
    })

    it('returns error when object is not an image', async () => {
      const obj = makeBoardObject({
        id: 'obj-1',
        storage_path: 'files/board-1/doc.pdf',
        mime_type: 'application/pdf',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['obj-1', obj]]))
      const result = await getTool(fileTools, 'describeImage').executor(ctx, { objectId: 'obj-1' })
      expect(result).toMatchObject({ error: expect.stringContaining('not an image') })
    })

    it('denies path traversal attacks', async () => {
      const obj = makeBoardObject({
        id: 'obj-1',
        storage_path: 'files/board-1/../../../etc/passwd',
        mime_type: 'image/png',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['obj-1', obj]]))
      const result = await getTool(fileTools, 'describeImage').executor(ctx, { objectId: 'obj-1' })
      expect(result).toMatchObject({ error: 'File access denied' })
    })

    it('returns error when signed URL creation fails', async () => {
      const imageObj = makeBoardObject({
        id: 'img-1',
        storage_path: 'files/board-1/image.jpg',
        mime_type: 'image/jpeg',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['img-1', imageObj]]))
      makeStorageAdminMock({
        signedUrl: { data: null, error: { message: 'storage error' } },
      })

      const result = await getTool(fileTools, 'describeImage').executor(ctx, { objectId: 'img-1' })
      expect(result).toMatchObject({ error: expect.stringContaining('storage error') })
    })

    it('returns { error } on invalid args (missing objectId)', async () => {
      const ctx = makeCtx()
      const result = await getTool(fileTools, 'describeImage').executor(ctx, {})
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })

  describe('readFileContent', () => {
    it('happy path — returns text content', async () => {
      const fileObj = makeBoardObject({
        id: 'file-1',
        storage_path: 'files/board-1/readme.txt',
        mime_type: 'text/plain',
        file_name: 'readme.txt',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['file-1', fileObj]]))
      makeStorageAdminMock({
        download: { data: new Blob(['hello world']), error: null },
      })

      const result = await getTool(fileTools, 'readFileContent').executor(ctx, { objectId: 'file-1' }) as {
        fileName: string
        mimeType: string
        content: string
        truncated: boolean
      }

      expect(result.content).toBe('hello world')
      expect(result.truncated).toBe(false)
      expect(result.fileName).toBe('readme.txt')
      expect(result.mimeType).toBe('text/plain')
    })

    it('truncates content at MAX_FILE_CHARS and sets truncated: true', async () => {
      const fileObj = makeBoardObject({
        id: 'file-1',
        storage_path: 'files/board-1/big.txt',
        mime_type: 'text/plain',
        file_name: 'big.txt',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['file-1', fileObj]]))

      // 200_001 chars to exceed MAX_FILE_CHARS = 200_000
      const bigText = 'A'.repeat(200_001)
      makeStorageAdminMock({
        download: { data: new Blob([bigText]), error: null },
      })

      const result = await getTool(fileTools, 'readFileContent').executor(ctx, { objectId: 'file-1' }) as {
        content: string
        truncated: boolean
      }

      expect(result.truncated).toBe(true)
      expect(result.content).toContain('[Content truncated...]')
      // Truncated at MAX_FILE_CHARS=200_000, plus the suffix; original was 200_001 chars
      // The content should NOT contain all 200_001 'A' chars
      expect(result.content.indexOf('A'.repeat(200_001))).toBe(-1)
    })

    it('returns error for unsupported MIME type', async () => {
      const fileObj = makeBoardObject({
        id: 'file-1',
        storage_path: 'files/board-1/image.jpg',
        mime_type: 'image/jpeg',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['file-1', fileObj]]))

      const result = await getTool(fileTools, 'readFileContent').executor(ctx, { objectId: 'file-1' })
      expect(result).toMatchObject({ error: expect.stringContaining('Unsupported file type') })
    })

    it('denies path traversal attacks', async () => {
      const fileObj = makeBoardObject({
        id: 'file-1',
        storage_path: 'files/board-1/../../secret.txt',
        mime_type: 'text/plain',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['file-1', fileObj]]))

      const result = await getTool(fileTools, 'readFileContent').executor(ctx, { objectId: 'file-1' })
      expect(result).toMatchObject({ error: 'File access denied' })
    })

    it('returns error when object not found', async () => {
      const ctx = makeCtx()
      const result = await getTool(fileTools, 'readFileContent').executor(ctx, { objectId: 'no-file' })
      expect(result).toMatchObject({ error: expect.stringContaining('no-file') })
    })

    it('returns error when object has no storage_path', async () => {
      const fileObj = makeBoardObject({ id: 'file-1', storage_path: null, mime_type: 'text/plain' } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['file-1', fileObj]]))
      const result = await getTool(fileTools, 'readFileContent').executor(ctx, { objectId: 'file-1' })
      expect(result).toMatchObject({ error: 'Object has no file attached' })
    })

    it('returns error when download fails', async () => {
      const fileObj = makeBoardObject({
        id: 'file-1',
        storage_path: 'files/board-1/doc.txt',
        mime_type: 'text/plain',
      } as unknown as Partial<BoardObject>)
      const ctx = makeCtx(new Map([['file-1', fileObj]]))
      makeStorageAdminMock({
        download: { data: null, error: { message: 'download error' } },
      })

      const result = await getTool(fileTools, 'readFileContent').executor(ctx, { objectId: 'file-1' })
      expect(result).toMatchObject({ error: expect.stringContaining('download error') })
    })

    it('supports all allowed MIME types', async () => {
      const allowedMimes = ['text/plain', 'text/markdown', 'text/csv', 'application/pdf']
      for (const mime of allowedMimes) {
        vi.clearAllMocks()
        mockGetShapeDefaults.mockReturnValue(DEFAULT_SHAPE_DEFAULTS)
        const fileObj = makeBoardObject({
          id: 'file-1',
          storage_path: 'files/board-1/file.txt',
          mime_type: mime,
          file_name: 'file.txt',
        } as unknown as Partial<BoardObject>)
        const ctx = makeCtx(new Map([['file-1', fileObj]]))
        makeStorageAdminMock({
          download: { data: new Blob(['content']), error: null },
        })

        const result = await getTool(fileTools, 'readFileContent').executor(ctx, { objectId: 'file-1' }) as {
          content: string
        }
        expect(result.content).toBe('content')
      }
    })

    it('returns { error } on invalid args (missing objectId)', async () => {
      const ctx = makeCtx()
      const result = await getTool(fileTools, 'readFileContent').executor(ctx, {})
      expect((result as { error: string }).error).toMatch(/Invalid arguments/)
    })
  })
})
