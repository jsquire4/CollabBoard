/**
 * AI SDK tool definitions for the board agent.
 * Each tool: zod schema + execute function.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase.js'
import { tickHLC, type HLC } from '../lib/hlc.js'
import { stampFields, mergeClocks, type FieldClocks } from '../lib/crdt.js'
import { getShapeDefaults } from '../lib/defaults.js'
import { createDefaultTableData, serializeTableData } from '../lib/table.js'
import { plainTextToTipTap } from '../lib/richtext.js'
import { loadBoardState, getMaxZIndex, getBoardStateSync, broadcastChanges } from '../state.js'
import type { BoardObject, BoardObjectType } from '../types.js'
import type { BoardChange } from '../state.js'

// ── Shared helpers ──────────────────────────────────────────

interface ToolContext {
  boardId: string
  userId: string
  hlc: HLC
}

function advanceClock(ctx: ToolContext): HLC {
  ctx.hlc = tickHLC(ctx.hlc)
  return ctx.hlc
}

function buildInsertRow(
  obj: Record<string, unknown>,
  clocks: FieldClocks,
): Record<string, unknown> {
  const row: Record<string, unknown> = { ...obj, field_clocks: clocks }
  // Parse JSONB string fields so Postgres stores them as objects
  if (typeof row.table_data === 'string') {
    try { row.table_data = JSON.parse(row.table_data) } catch { /* leave as-is */ }
  }
  if (typeof row.rich_text === 'string') {
    try { row.rich_text = JSON.parse(row.rich_text) } catch { /* leave as-is */ }
  }
  return row
}

async function insertObject(obj: Record<string, unknown>, clocks: FieldClocks): Promise<{ success: boolean; error?: string }> {
  const row = buildInsertRow(obj, clocks)
  const { error } = await supabase.from('board_objects').insert(row)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

async function updateFields(
  id: string,
  boardId: string,
  updates: Record<string, unknown>,
  clocks: FieldClocks,
): Promise<{ success: boolean; error?: string }> {
  const state = getBoardStateSync(boardId)
  if (!state) return { success: false, error: 'Board state not loaded' }

  // Validate object exists and isn't deleted
  const existing = state.objects.get(id)
  if (!existing) return { success: false, error: `Object ${id} not found` }
  if (existing.deleted_at) return { success: false, error: `Object ${id} has been deleted` }

  const existingClocks = state.fieldClocks.get(id) ?? {}
  const mergedClocks = mergeClocks(existingClocks, clocks)

  const row: Record<string, unknown> = {
    ...updates,
    field_clocks: mergedClocks,
    updated_at: new Date().toISOString(),
  }
  // Parse JSONB string fields
  if (typeof row.table_data === 'string') {
    try { row.table_data = JSON.parse(row.table_data as string) } catch { /* leave as-is */ }
  }
  if (typeof row.rich_text === 'string') {
    try { row.rich_text = JSON.parse(row.rich_text as string) } catch { /* leave as-is */ }
  }

  const { error } = await supabase
    .from('board_objects')
    .update(row)
    .eq('id', id)
    .is('deleted_at', null)
  if (error) return { success: false, error: error.message }

  // Update local cache
  state.objects.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() } as BoardObject)
  state.fieldClocks.set(id, mergedClocks)

  return { success: true }
}

// ── Tool factory ────────────────────────────────────────────

export function createTools(ctx: ToolContext) {
  // ── createStickyNote ────────────────────────────────────

  const createStickyNote = tool({
    description: 'Create a sticky note on the board with optional text and color.',
    inputSchema: z.object({
      text: z.string().default(''),
      color: z.string().optional().describe('Hex color, e.g. #FFEB3B'),
      x: z.number().optional().describe('X position (default: random 100-800)'),
      y: z.number().optional().describe('Y position (default: random 100-600)'),
      title: z.string().optional().describe('Title shown at top of sticky note'),
    }),
    execute: async ({ text, color, x, y, title }) => {
      const clock = advanceClock(ctx)
      const id = uuidv4()
      const defaults = getShapeDefaults('sticky_note')

      const obj: Record<string, unknown> = {
        id,
        board_id: ctx.boardId,
        type: 'sticky_note',
        x: x ?? (100 + Math.random() * 700),
        y: y ?? (100 + Math.random() * 500),
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text,
        color: color ?? defaults.color,
        font_size: defaults.font_size ?? 14,
        z_index: getMaxZIndex(ctx.boardId) + 1,
        parent_id: null,
        created_by: ctx.userId,
      }
      if (title) obj.title = title

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks)
      if (!result.success) return { error: result.error }

      // Update local state
      const state = getBoardStateSync(ctx.boardId)
      if (state) {
        state.objects.set(id, obj as unknown as BoardObject)
        state.fieldClocks.set(id, clocks)
      }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type: 'sticky_note', text, x: obj.x, y: obj.y }
    },
  })

  // ── createShape ─────────────────────────────────────────

  const createShape = tool({
    description: 'Create a shape on the board (rectangle, circle, triangle, chevron, parallelogram, ngon).',
    inputSchema: z.object({
      type: z.enum(['rectangle', 'circle', 'triangle', 'chevron', 'parallelogram', 'ngon']),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      color: z.string().optional(),
      text: z.string().optional(),
      sides: z.number().optional().describe('Number of sides for ngon type'),
    }),
    execute: async ({ type, x, y, width, height, color, text, sides }) => {
      const clock = advanceClock(ctx)
      const id = uuidv4()
      const defaults = getShapeDefaults(type)

      const obj: Record<string, unknown> = {
        id,
        board_id: ctx.boardId,
        type,
        x: x ?? (100 + Math.random() * 700),
        y: y ?? (100 + Math.random() * 500),
        width: width ?? defaults.width,
        height: height ?? defaults.height,
        rotation: 0,
        text: text ?? defaults.text ?? '',
        color: color ?? defaults.color,
        font_size: defaults.font_size ?? 14,
        z_index: getMaxZIndex(ctx.boardId) + 1,
        parent_id: null,
        created_by: ctx.userId,
      }
      if (type === 'ngon' && sides) obj.sides = sides

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks)
      if (!result.success) return { error: result.error }

      const state = getBoardStateSync(ctx.boardId)
      if (state) {
        state.objects.set(id, obj as unknown as BoardObject)
        state.fieldClocks.set(id, clocks)
      }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type, x: obj.x, y: obj.y, width: obj.width, height: obj.height }
    },
  })

  // ── createFrame ─────────────────────────────────────────

  const createFrame = tool({
    description: 'Create a frame (container) on the board to group objects.',
    inputSchema: z.object({
      title: z.string().optional().default('Frame'),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      color: z.string().optional(),
    }),
    execute: async ({ title, x, y, width, height, color }) => {
      const clock = advanceClock(ctx)
      const id = uuidv4()
      const defaults = getShapeDefaults('frame')

      const obj: Record<string, unknown> = {
        id,
        board_id: ctx.boardId,
        type: 'frame',
        x: x ?? (100 + Math.random() * 500),
        y: y ?? (100 + Math.random() * 400),
        width: width ?? defaults.width,
        height: height ?? defaults.height,
        rotation: 0,
        text: title,
        color: color ?? defaults.color,
        font_size: 14,
        z_index: getMaxZIndex(ctx.boardId) + 1,
        parent_id: null,
        created_by: ctx.userId,
        title,
      }

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks)
      if (!result.success) return { error: result.error }

      const state = getBoardStateSync(ctx.boardId)
      if (state) {
        state.objects.set(id, obj as unknown as BoardObject)
        state.fieldClocks.set(id, clocks)
      }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type: 'frame', title, x: obj.x, y: obj.y }
    },
  })

  // ── createTable ─────────────────────────────────────────

  const createTable = tool({
    description: 'Create a table on the board with specified columns and rows.',
    inputSchema: z.object({
      columns: z.number().min(1).max(10).default(3),
      rows: z.number().min(1).max(20).default(3),
      x: z.number().optional(),
      y: z.number().optional(),
      title: z.string().optional(),
    }),
    execute: async ({ columns, rows, x, y, title }) => {
      const clock = advanceClock(ctx)
      const id = uuidv4()
      const defaults = getShapeDefaults('table')
      const tableData = createDefaultTableData(columns, rows)

      const obj: Record<string, unknown> = {
        id,
        board_id: ctx.boardId,
        type: 'table',
        x: x ?? (100 + Math.random() * 500),
        y: y ?? (100 + Math.random() * 400),
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text: title ?? '',
        color: defaults.color,
        font_size: 14,
        z_index: getMaxZIndex(ctx.boardId) + 1,
        parent_id: null,
        created_by: ctx.userId,
        table_data: serializeTableData(tableData),
      }

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks)
      if (!result.success) return { error: result.error }

      const state = getBoardStateSync(ctx.boardId)
      if (state) {
        state.objects.set(id, obj as unknown as BoardObject)
        state.fieldClocks.set(id, clocks)
      }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type: 'table', columns, rows, x: obj.x, y: obj.y }
    },
  })

  // ── createConnector ─────────────────────────────────────

  const createConnector = tool({
    description: 'Create a line or arrow connecting two objects on the board.',
    inputSchema: z.object({
      type: z.enum(['line', 'arrow']).default('arrow'),
      startObjectId: z.string().describe('ID of the object where the connector starts'),
      endObjectId: z.string().describe('ID of the object where the connector ends'),
      startAnchor: z.string().optional().default('right'),
      endAnchor: z.string().optional().default('left'),
      color: z.string().optional(),
    }),
    execute: async ({ type, startObjectId, endObjectId, startAnchor, endAnchor, color }) => {
      const state = getBoardStateSync(ctx.boardId)
      if (!state) return { error: 'Board state not loaded' }

      const startObj = state.objects.get(startObjectId)
      const endObj = state.objects.get(endObjectId)
      if (!startObj) return { error: `Start object ${startObjectId} not found` }
      if (!endObj) return { error: `End object ${endObjectId} not found` }

      const vectorTypes = ['line', 'arrow']
      if (vectorTypes.includes(startObj.type)) return { error: `Cannot connect from a ${startObj.type} (connectors must start from shapes)` }
      if (vectorTypes.includes(endObj.type)) return { error: `Cannot connect to a ${endObj.type} (connectors must end at shapes)` }

      const clock = advanceClock(ctx)
      const id = uuidv4()
      const defaults = getShapeDefaults(type)

      // Calculate start/end points from object positions
      const x = startObj.x + startObj.width
      const y = startObj.y + startObj.height / 2
      const x2 = endObj.x
      const y2 = endObj.y + endObj.height / 2

      const obj: Record<string, unknown> = {
        id,
        board_id: ctx.boardId,
        type,
        x,
        y,
        x2,
        y2,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text: '',
        color: color ?? defaults.color,
        font_size: 14,
        stroke_width: defaults.stroke_width ?? 2,
        z_index: getMaxZIndex(ctx.boardId) + 1,
        parent_id: null,
        created_by: ctx.userId,
        connect_start_id: startObjectId,
        connect_start_anchor: startAnchor,
        connect_end_id: endObjectId,
        connect_end_anchor: endAnchor,
      }

      if (type === 'arrow') {
        obj.marker_end = 'arrow'
      }

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks)
      if (!result.success) return { error: result.error }

      state.objects.set(id, obj as unknown as BoardObject)
      state.fieldClocks.set(id, clocks)

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type, startObjectId, endObjectId }
    },
  })

  // ── moveObject ──────────────────────────────────────────

  const moveObject = tool({
    description: 'Move an object to a new position on the board.',
    inputSchema: z.object({
      id: z.string().describe('ID of the object to move'),
      x: z.number().describe('New X position'),
      y: z.number().describe('New Y position'),
    }),
    execute: async ({ id, x, y }) => {
      const clock = advanceClock(ctx)
      const updates: Record<string, unknown> = { x, y }
      const clocks = stampFields(['x', 'y'], clock)

      const result = await updateFields(id, ctx.boardId, updates, clocks)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, ...updates } as Partial<BoardObject> & { id: string } }])
      return { id, x, y }
    },
  })

  // ── resizeObject ────────────────────────────────────────

  const resizeObject = tool({
    description: 'Resize an object on the board.',
    inputSchema: z.object({
      id: z.string().describe('ID of the object to resize'),
      width: z.number().describe('New width'),
      height: z.number().describe('New height'),
    }),
    execute: async ({ id, width, height }) => {
      const clock = advanceClock(ctx)
      const updates: Record<string, unknown> = { width, height }
      const clocks = stampFields(['width', 'height'], clock)

      const result = await updateFields(id, ctx.boardId, updates, clocks)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, ...updates } as Partial<BoardObject> & { id: string } }])
      return { id, width, height }
    },
  })

  // ── updateText ──────────────────────────────────────────

  const updateText = tool({
    description: 'Update the text content of an object. For sticky notes and frames, can also update the title.',
    inputSchema: z.object({
      id: z.string().describe('ID of the object to update'),
      text: z.string().optional().describe('New text content'),
      title: z.string().optional().describe('New title (for sticky notes and frames)'),
    }),
    execute: async ({ id, text, title }) => {
      const clock = advanceClock(ctx)
      const updates: Record<string, unknown> = {}
      const fields: string[] = []

      if (text !== undefined) {
        updates.text = text
        fields.push('text')
        // Sync rich_text field
        const richTextDoc = plainTextToTipTap(text)
        updates.rich_text = JSON.stringify(richTextDoc)
        fields.push('rich_text')
      }

      if (title !== undefined) {
        updates.title = title
        fields.push('title')
      }

      if (fields.length === 0) return { error: 'No updates provided' }

      const clocks = stampFields(fields, clock)
      const result = await updateFields(id, ctx.boardId, updates, clocks)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, ...updates } as Partial<BoardObject> & { id: string } }])
      return { id, text, title }
    },
  })

  // ── changeColor ─────────────────────────────────────────

  const changeColor = tool({
    description: 'Change the color of an object on the board.',
    inputSchema: z.object({
      id: z.string().describe('ID of the object to recolor'),
      color: z.string().describe('New hex color, e.g. #FF5733'),
    }),
    execute: async ({ id, color }) => {
      const clock = advanceClock(ctx)
      const clocks = stampFields(['color'], clock)
      const result = await updateFields(id, ctx.boardId, { color }, clocks)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, color } as Partial<BoardObject> & { id: string } }])
      return { id, color }
    },
  })

  // ── getBoardState ───────────────────────────────────────

  const getBoardStateTool = tool({
    description: 'Get the current state of all objects on the board. Use this to understand what is on the board before making changes.',
    inputSchema: z.object({}),
    execute: async () => {
      const state = await loadBoardState(ctx.boardId)
      const objects = Array.from(state.objects.values()).map(obj => ({
        id: obj.id,
        type: obj.type,
        x: Math.round(obj.x),
        y: Math.round(obj.y),
        width: obj.width,
        height: obj.height,
        text: obj.text || undefined,
        title: obj.title || undefined,
        color: obj.color,
        parent_id: obj.parent_id || undefined,
        connect_start_id: obj.connect_start_id || undefined,
        connect_end_id: obj.connect_end_id || undefined,
        storage_path: obj.storage_path || undefined,
        file_name: obj.file_name || undefined,
        mime_type: obj.mime_type || undefined,
      }))

      return {
        objectCount: objects.length,
        objects,
      }
    },
  })

  // ── describeImage ───────────────────────────────────────

  const describeImage = tool({
    description: 'Describe an image that has been uploaded to the board. Pass the object ID of a file-type board object with an image MIME type.',
    inputSchema: z.object({
      objectId: z.string().describe('ID of the file object to describe'),
    }),
    execute: async ({ objectId }) => {
      const state = getBoardStateSync(ctx.boardId)
      if (!state) return { error: 'Board state not loaded' }

      const obj = state.objects.get(objectId)
      if (!obj) return { error: `Object ${objectId} not found` }
      if (!obj.storage_path) return { error: 'Object has no file attached' }
      if (!obj.mime_type?.startsWith('image/')) {
        return { error: `Object is not an image (mime: ${obj.mime_type})` }
      }

      const { data: signedUrl, error: urlError } = await supabase
        .storage
        .from('board-assets')
        .createSignedUrl(obj.storage_path, 60)

      if (urlError || !signedUrl) {
        return { error: `Failed to create signed URL: ${urlError?.message}` }
      }

      // Return the signed URL — the AI model will receive this as an image content part
      // in the next iteration when the agent uses this description
      return {
        imageUrl: signedUrl.signedUrl,
        fileName: obj.file_name,
        mimeType: obj.mime_type,
        instruction: 'Use this signed URL to view and describe the image. The URL is temporary (60s).',
      }
    },
  })

  // ── readFileContent ─────────────────────────────────────

  const readFileContent = tool({
    description: 'Read the text content of an uploaded file (text, markdown, CSV, or PDF). Returns the file content as text.',
    inputSchema: z.object({
      objectId: z.string().describe('ID of the file object to read'),
    }),
    execute: async ({ objectId }) => {
      const state = getBoardStateSync(ctx.boardId)
      if (!state) return { error: 'Board state not loaded' }

      const obj = state.objects.get(objectId)
      if (!obj) return { error: `Object ${objectId} not found` }
      if (!obj.storage_path) return { error: 'Object has no file attached' }

      const allowedMimes = ['text/plain', 'text/markdown', 'text/csv', 'application/pdf']
      if (!obj.mime_type || !allowedMimes.includes(obj.mime_type)) {
        return { error: `Unsupported file type for reading: ${obj.mime_type}` }
      }

      const { data, error } = await supabase
        .storage
        .from('board-assets')
        .download(obj.storage_path)

      if (error || !data) {
        return { error: `Failed to download file: ${error?.message}` }
      }

      const text = await data.text()
      // Truncate to ~50K tokens (~200K chars)
      const truncated = text.length > 200000 ? text.slice(0, 200000) + '\n\n[Content truncated...]' : text

      return {
        fileName: obj.file_name,
        mimeType: obj.mime_type,
        content: truncated,
        truncated: text.length > 200000,
      }
    },
  })

  // ── deleteObject ──────────────────────────────────────────

  const deleteObject = tool({
    description: 'Delete an object from the board by marking it as deleted.',
    inputSchema: z.object({
      id: z.string().describe('ID of the object to delete'),
    }),
    execute: async ({ id }) => {
      const state = getBoardStateSync(ctx.boardId)
      if (!state) return { error: 'Board state not loaded' }

      const existing = state.objects.get(id)
      if (!existing) return { error: `Object ${id} not found` }

      const now = new Date().toISOString()
      const { error } = await supabase
        .from('board_objects')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', id)
        .is('deleted_at', null)

      if (error) return { error: error.message }

      // Update local cache
      state.objects.delete(id)
      state.fieldClocks.delete(id)

      broadcastChanges(ctx.boardId, [{ action: 'delete', object: { id } }])
      return { id, deleted: true }
    },
  })

  return {
    createStickyNote,
    createShape,
    createFrame,
    createTable,
    createConnector,
    moveObject,
    resizeObject,
    updateText,
    changeColor,
    deleteObject,
    getBoardState: getBoardStateTool,
    describeImage,
    readFileContent,
  }
}
