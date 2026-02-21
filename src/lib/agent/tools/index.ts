/**
 * Board agent tool definitions in OpenAI Chat Completions format.
 *
 * Returns:
 *   definitions — OpenAI.Chat.ChatCompletionTool[] for the API call
 *   executors   — Map<toolName, (args) => Promise<unknown>> for tool dispatch
 */

import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHLC } from '@/lib/crdt/hlc'
import { stampFields } from '@/lib/crdt/merge'
import { getShapeDefaults } from '@/lib/agent/defaults'
import { createDefaultTableData, serializeTableData } from '@/lib/table/tableUtils'
import { plainTextToTipTap } from '@/lib/richText'
import { loadBoardState, getMaxZIndex, broadcastChanges, type BoardState } from '@/lib/agent/boardState'
import type { BoardObject } from '@/types/board'
import type OpenAI from 'openai'
import {
  advanceClock,
  insertObject,
  updateFields,
  MAX_FILE_CHARS,
  SIGNED_URL_TTL,
} from './helpers'
import {
  createStickyNoteSchema,
  createShapeSchema,
  createFrameSchema,
  createTableSchema,
  createConnectorSchema,
  moveObjectSchema,
  resizeObjectSchema,
  updateTextSchema,
  changeColorSchema,
  deleteObjectSchema,
  describeImageSchema,
  readFileContentSchema,
  getFrameObjectsSchema,
  emptySchema,
  TOOL_SCHEMAS,
} from './schemas'

export type { ToolContext } from './types'
import type { ToolContext } from './types'

// ── Tool definition helper ────────────────────────────────────────────────────

function makeTool(name: string, description: string, parameters: Record<string, unknown>): OpenAI.Chat.ChatCompletionTool {
  return {
    type: 'function' as const,
    function: { name, description, parameters },
  }
}

// ── Tool factory ──────────────────────────────────────────────────────────────

export function createTools(ctx: ToolContext): {
  definitions: OpenAI.Chat.ChatCompletionTool[]
  executors: Map<string, (args: unknown) => Promise<unknown>>
} {
  const definitions: OpenAI.Chat.ChatCompletionTool[] = []
  const executors = new Map<string, (args: unknown) => Promise<unknown>>()

  function register<T>(
    name: string,
    description: string,
    schema: z.ZodType<T>,
    execute: (args: T) => Promise<unknown>,
  ) {
    const jsonSchema = TOOL_SCHEMAS[name] ?? { type: 'object', properties: {} }
    definitions.push(makeTool(name, description, jsonSchema))
    executors.set(name, async (rawArgs: unknown) => {
      const parsed = schema.safeParse(rawArgs)
      if (!parsed.success) {
        return { error: `Invalid arguments: ${parsed.error.message}` }
      }
      try {
        return await execute(parsed.data)
      } catch (err) {
        return { error: (err as Error).message }
      }
    })
  }

  // ── createStickyNote ─────────────────────────────────────

  register(
    'createStickyNote',
    'Create a sticky note on the board with optional text and color.',
    createStickyNoteSchema,
    async ({ text, color, x, y, title }: z.infer<typeof createStickyNoteSchema>) => {
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
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        created_by: ctx.userId,
      }
      if (title) obj.title = title

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type: 'sticky_note', text, x: obj.x, y: obj.y }
    },
  )

  // ── createShape ──────────────────────────────────────────

  register(
    'createShape',
    'Create a shape on the board (rectangle, circle, triangle, chevron, parallelogram, ngon).',
    createShapeSchema,
    async ({ type, x, y, width, height, color, text, sides }: z.infer<typeof createShapeSchema>) => {
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
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        created_by: ctx.userId,
      }
      if (type === 'ngon' && sides) obj.sides = sides

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type, x: obj.x, y: obj.y, width: obj.width, height: obj.height }
    },
  )

  // ── createFrame ──────────────────────────────────────────

  register(
    'createFrame',
    'Create a frame (container) on the board to group objects.',
    createFrameSchema,
    async ({ title, x, y, width, height, color }: z.infer<typeof createFrameSchema>) => {
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
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        created_by: ctx.userId,
        title,
      }

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type: 'frame', title, x: obj.x, y: obj.y }
    },
  )

  // ── createTable ──────────────────────────────────────────

  register(
    'createTable',
    'Create a table on the board with specified columns and rows.',
    createTableSchema,
    async ({ columns, rows, x, y, title }: z.infer<typeof createTableSchema>) => {
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
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        created_by: ctx.userId,
        table_data: serializeTableData(tableData),
      }

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type: 'table', columns, rows, x: obj.x, y: obj.y }
    },
  )

  // ── createConnector ──────────────────────────────────────

  register(
    'createConnector',
    'Create a line or arrow connecting two objects on the board.',
    createConnectorSchema,
    async ({ type, startObjectId, endObjectId, startAnchor, endAnchor, color }: z.infer<typeof createConnectorSchema>) => {
      const startObj = ctx.state.objects.get(startObjectId)
      const endObj = ctx.state.objects.get(endObjectId)
      if (!startObj) return { error: `Start object ${startObjectId} not found` }
      if (!endObj) return { error: `End object ${endObjectId} not found` }

      const vectorTypes = ['line', 'arrow', 'data_connector']
      if (vectorTypes.includes(startObj.type)) return { error: `Cannot connect from a ${startObj.type}` }
      if (vectorTypes.includes(endObj.type)) return { error: `Cannot connect to a ${endObj.type}` }

      const clock = advanceClock(ctx)
      const id = uuidv4()
      const defaults = getShapeDefaults(type)

      const x = startObj.x + startObj.width
      const y = startObj.y + startObj.height / 2
      const x2 = endObj.x
      const y2 = endObj.y + endObj.height / 2

      const obj: Record<string, unknown> = {
        id,
        board_id: ctx.boardId,
        type,
        x, y, x2, y2,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text: '',
        color: color ?? defaults.color,
        font_size: 14,
        stroke_width: defaults.stroke_width ?? 2,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        created_by: ctx.userId,
        connect_start_id: startObjectId,
        connect_start_anchor: startAnchor,
        connect_end_id: endObjectId,
        connect_end_anchor: endAnchor,
      }
      if (type === 'arrow') obj.marker_end = 'arrow'

      const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
      const clocks = stampFields(allFields, clock)

      const result = await insertObject(obj, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: obj as Partial<BoardObject> & { id: string } }])
      return { id, type, startObjectId, endObjectId }
    },
  )

  // ── moveObject ───────────────────────────────────────────

  register(
    'moveObject',
    'Move an object to a new position on the board.',
    moveObjectSchema,
    async ({ id, x, y }: z.infer<typeof moveObjectSchema>) => {
      const clock = advanceClock(ctx)
      const clocks = stampFields(['x', 'y'], clock)
      const result = await updateFields(id, ctx.boardId, { x, y }, clocks, ctx)
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, x, y } }])
      return { id, x, y }
    },
  )

  // ── resizeObject ─────────────────────────────────────────

  register(
    'resizeObject',
    'Resize an object on the board.',
    resizeObjectSchema,
    async ({ id, width, height }: z.infer<typeof resizeObjectSchema>) => {
      const clock = advanceClock(ctx)
      const clocks = stampFields(['width', 'height'], clock)
      const result = await updateFields(id, ctx.boardId, { width, height }, clocks, ctx)
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, width, height } }])
      return { id, width, height }
    },
  )

  // ── updateText ───────────────────────────────────────────

  register(
    'updateText',
    'Update the text content of an object. For sticky notes and frames, can also update the title.',
    updateTextSchema,
    async ({ id, text, title }: z.infer<typeof updateTextSchema>) => {
      const clock = advanceClock(ctx)
      const updates: Record<string, unknown> = {}
      const fields: string[] = []

      if (text !== undefined) {
        updates.text = text
        fields.push('text')
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
      const result = await updateFields(id, ctx.boardId, updates, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, ...updates } as Partial<BoardObject> & { id: string } }])
      return { id, text, title }
    },
  )

  // ── changeColor ──────────────────────────────────────────

  register(
    'changeColor',
    'Change the color of an object on the board. Color must be a valid hex value, e.g. #FF5733.',
    changeColorSchema,
    async ({ id, color }: z.infer<typeof changeColorSchema>) => {
      const clock = advanceClock(ctx)
      const clocks = stampFields(['color'], clock)
      const result = await updateFields(id, ctx.boardId, { color }, clocks, ctx)
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, color } }])
      return { id, color }
    },
  )

  // ── getBoardState ────────────────────────────────────────

  register(
    'getBoardState',
    'Get the current state of all objects on the board. Use this to understand what is on the board before making changes.',
    emptySchema,
    async (_args: z.infer<typeof emptySchema>) => {
      // Refresh state
      const freshState = await loadBoardState(ctx.boardId)
      ctx.state = freshState

      const objects = Array.from(freshState.objects.values()).map(obj => ({
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

      return { objectCount: objects.length, objects }
    },
  )

  // ── describeImage ────────────────────────────────────────

  register(
    'describeImage',
    'Describe an image that has been uploaded to the board. Pass the object ID of a file-type board object with an image MIME type.',
    describeImageSchema,
    async ({ objectId }: z.infer<typeof describeImageSchema>) => {
      const obj = ctx.state.objects.get(objectId)
      if (!obj) return { error: `Object ${objectId} not found` }
      if (!obj.storage_path) return { error: 'Object has no file attached' }
      if (!obj.mime_type?.startsWith('image/')) {
        return { error: `Object is not an image (mime: ${obj.mime_type})` }
      }
      // Guard: storage path must be scoped to this board and must not contain traversal segments
      if (
        !obj.storage_path.startsWith(`files/${ctx.boardId}/`) ||
        obj.storage_path.includes('/../')
      ) {
        return { error: 'File access denied' }
      }

      const admin = createAdminClient()
      const { data: signedUrl, error: urlError } = await admin
        .storage
        .from('board-assets')
        .createSignedUrl(obj.storage_path, SIGNED_URL_TTL)

      if (urlError || !signedUrl) {
        return { error: `Failed to create signed URL: ${urlError?.message}` }
      }

      return {
        imageUrl: signedUrl.signedUrl,
        fileName: obj.file_name,
        mimeType: obj.mime_type,
        instruction: `Use this signed URL to view and describe the image. The URL is temporary (${SIGNED_URL_TTL}s).`,
      }
    },
  )

  // ── readFileContent ──────────────────────────────────────

  register(
    'readFileContent',
    'Read the text content of an uploaded file (text, markdown, CSV, or PDF). Returns the file content as text.',
    readFileContentSchema,
    async ({ objectId }: z.infer<typeof readFileContentSchema>) => {
      const obj = ctx.state.objects.get(objectId)
      if (!obj) return { error: `Object ${objectId} not found` }
      if (!obj.storage_path) return { error: 'Object has no file attached' }
      // Guard: storage path must be scoped to this board and must not contain traversal segments
      if (
        !obj.storage_path.startsWith(`files/${ctx.boardId}/`) ||
        obj.storage_path.includes('/../')
      ) {
        return { error: 'File access denied' }
      }

      const allowedMimes = ['text/plain', 'text/markdown', 'text/csv', 'application/pdf']
      if (!obj.mime_type || !allowedMimes.includes(obj.mime_type)) {
        return { error: `Unsupported file type for reading: ${obj.mime_type}` }
      }

      const admin = createAdminClient()
      const { data, error } = await admin
        .storage
        .from('board-assets')
        .download(obj.storage_path)

      if (error || !data) {
        return { error: `Failed to download file: ${error?.message}` }
      }

      const text = await data.text()
      const truncated = text.length > MAX_FILE_CHARS
        ? text.slice(0, MAX_FILE_CHARS) + '\n\n[Content truncated...]'
        : text

      return {
        fileName: obj.file_name,
        mimeType: obj.mime_type,
        content: truncated,
        truncated: text.length > MAX_FILE_CHARS,
      }
    },
  )

  // ── getFrameObjects ──────────────────────────────────────

  register(
    'getFrameObjects',
    'Get all objects contained within a frame. Use this to inspect frame contents before making changes.',
    getFrameObjectsSchema,
    async ({ frameId }: z.infer<typeof getFrameObjectsSchema>) => {
      const frame = ctx.state.objects.get(frameId)
      if (!frame) return { error: `Frame ${frameId} not found` }
      if (frame.type !== 'frame') return { error: `Object ${frameId} is not a frame` }

      const children = Array.from(ctx.state.objects.values())
        .filter(obj => obj.parent_id === frameId && !obj.deleted_at)
        .map(obj => ({
          id: obj.id,
          type: obj.type,
          x: Math.round(obj.x),
          y: Math.round(obj.y),
          width: obj.width,
          height: obj.height,
          text: obj.text || undefined,
          title: obj.title || undefined,
          color: obj.color,
        }))

      return { frameId, childCount: children.length, children }
    },
  )

  // ── deleteObject ─────────────────────────────────────────

  register(
    'deleteObject',
    'Delete an object from the board by marking it as deleted.',
    deleteObjectSchema,
    async ({ id }: z.infer<typeof deleteObjectSchema>) => {
      const existing = ctx.state.objects.get(id)
      if (!existing) return { error: `Object ${id} not found` }

      // Cross-board guard
      if (existing.board_id !== ctx.boardId) return { error: 'Object not found' }

      const now = new Date().toISOString()
      const admin = createAdminClient()
      const { error } = await admin
        .from('board_objects')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', id)
        .is('deleted_at', null)

      if (error) return { error: error.message }

      ctx.state.objects.delete(id)
      ctx.state.fieldClocks.delete(id)

      broadcastChanges(ctx.boardId, [{ action: 'delete', object: { id } }])
      return { id, deleted: true }
    },
  )

  return { definitions, executors }
}

// ── Helper: create a fresh ToolContext with a new HLC ─────────────────────────

export function createToolContext(boardId: string, userId: string, state: BoardState): ToolContext {
  return {
    boardId,
    userId,
    hlc: createHLC(userId),
    state,
  }
}
