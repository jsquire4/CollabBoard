/**
 * Tool executors for creating new board objects.
 */

import { getShapeDefaults } from '@/lib/agent/defaults'
import { createDefaultTableData, serializeTableData } from '@/lib/table/tableUtils'
import { getMaxZIndex, broadcastChanges, loadBoardState } from '@/lib/agent/boardState'
import { findOpenArea } from './placement'
import type { BoardObject } from '@/types/board'
import { buildAndInsertObject, makeToolDef, getConnectedObjectIds } from './helpers'
import { plainTextToTipTap } from '@/lib/richText'
import {
  createStickyNoteSchema,
  createShapeSchema,
  createFrameSchema,
  createTableSchema,
  createConnectorSchema,
  saveMemorySchema,
  createDataConnectorSchema,
} from './schemas'
import type { ToolDef } from './types'

export const createObjectTools: ToolDef[] = [

  makeToolDef(
    'createStickyNote',
    'Create a sticky note. Optional: text, color, x, y, title.',
    createStickyNoteSchema,
    async (ctx, { text, color, x, y, title }) => {
      const defaults = getShapeDefaults('sticky_note')
      let px = x
      let py = y
      if (px == null || py == null) {
        const fresh = await loadBoardState(ctx.boardId)
        const pos = findOpenArea(fresh.objects, defaults.width, defaults.height, ctx.viewportCenter)
        px = pos.x
        py = pos.y
      }
      const result = await buildAndInsertObject(ctx, 'sticky_note', {
        x: px,
        y: py,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text,
        rich_text: JSON.stringify(plainTextToTipTap(text || '')),
        color: color ?? defaults.color,
        font_size: defaults.font_size ?? 14,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        ...(title ? { title, title_rich_text: JSON.stringify(plainTextToTipTap(title)) } : {}),
      })
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'create', object: result.obj as Partial<BoardObject> & { id: string } }])
      return { id: result.id, type: 'sticky_note', text, x: result.obj.x, y: result.obj.y }
    },
  ),

  makeToolDef(
    'createShape',
    'Create shape: rectangle, circle, triangle, chevron, parallelogram, ngon.',
    createShapeSchema,
    async (ctx, { type, x, y, width, height, color, text, sides }) => {
      const defaults = getShapeDefaults(type)
      const w = width ?? defaults.width
      const h = height ?? defaults.height
      let px = x
      let py = y
      if (px == null || py == null) {
        const fresh = await loadBoardState(ctx.boardId)
        const pos = findOpenArea(fresh.objects, w, h, ctx.viewportCenter)
        px = pos.x
        py = pos.y
      }
      const shapeText = text ?? defaults.text ?? ''
      const fields: Record<string, unknown> = {
        x: px,
        y: py,
        width: width ?? defaults.width,
        height: height ?? defaults.height,
        rotation: 0,
        text: shapeText,
        rich_text: shapeText ? JSON.stringify(plainTextToTipTap(shapeText)) : null,
        color: color ?? defaults.color,
        font_size: defaults.font_size ?? 14,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
      }
      if (type === 'ngon' && sides) fields.sides = sides
      const result = await buildAndInsertObject(ctx, type, fields)
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'create', object: result.obj as Partial<BoardObject> & { id: string } }])
      return { id: result.id, type, x: result.obj.x, y: result.obj.y, width: result.obj.width, height: result.obj.height }
    },
  ),

  makeToolDef(
    'createFrame',
    'Create a frame (container) for grouping objects.',
    createFrameSchema,
    async (ctx, { title, x, y, width, height, color }) => {
      const defaults = getShapeDefaults('frame')
      const w = width ?? defaults.width
      const h = height ?? defaults.height
      let px = x
      let py = y
      if (px == null || py == null) {
        const fresh = await loadBoardState(ctx.boardId)
        const pos = findOpenArea(fresh.objects, w, h, ctx.viewportCenter)
        px = pos.x
        py = pos.y
      }
      const result = await buildAndInsertObject(ctx, 'frame', {
        x: px,
        y: py,
        width: w,
        height: h,
        rotation: 0,
        text: title,
        rich_text: title ? JSON.stringify(plainTextToTipTap(title)) : null,
        color: color ?? defaults.color,
        font_size: 14,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        title,
      })
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'create', object: result.obj as Partial<BoardObject> & { id: string } }])
      return { id: result.id, type: 'frame', title, x: result.obj.x, y: result.obj.y }
    },
  ),

  makeToolDef(
    'createTable',
    'Create a table with columns×rows.',
    createTableSchema,
    async (ctx, { columns, rows, x, y, title }) => {
      const defaults = getShapeDefaults('table')
      let px = x
      let py = y
      if (px == null || py == null) {
        const fresh = await loadBoardState(ctx.boardId)
        const pos = findOpenArea(fresh.objects, defaults.width, defaults.height, ctx.viewportCenter)
        px = pos.x
        py = pos.y
      }
      const tableData = createDefaultTableData(columns, rows, title || undefined)
      const result = await buildAndInsertObject(ctx, 'table', {
        x: px,
        y: py,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text: title ?? '',
        color: defaults.color,
        font_size: 14,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        table_data: serializeTableData(tableData),
        rich_text: title ? JSON.stringify(plainTextToTipTap(title)) : null,
      })
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'create', object: result.obj as Partial<BoardObject> & { id: string } }])
      return { id: result.id, type: 'table', columns, rows, x: result.obj.x, y: result.obj.y }
    },
  ),

  makeToolDef(
    'createConnector',
    'Create a line or arrow between two objects.',
    createConnectorSchema,
    async (ctx, { type, startObjectId, endObjectId, startAnchor, endAnchor, color }) => {
      // Scope guard: both endpoints must be connected to the agent
      if (ctx.agentObjectId) {
        const connected = getConnectedObjectIds(ctx.state, ctx.agentObjectId)
        if (!connected.has(startObjectId)) return { error: 'Start object not connected to this agent' }
        if (!connected.has(endObjectId)) return { error: 'End object not connected to this agent' }
      }

      const startObj = ctx.state.objects.get(startObjectId)
      const endObj = ctx.state.objects.get(endObjectId)
      if (!startObj) return { error: `Start object ${startObjectId} not found` }
      if (!endObj) return { error: `End object ${endObjectId} not found` }

      const vectorTypes = ['line', 'arrow', 'data_connector']
      if (vectorTypes.includes(startObj.type)) return { error: `Cannot connect from a ${startObj.type}` }
      if (vectorTypes.includes(endObj.type)) return { error: `Cannot connect to a ${endObj.type}` }

      const defaults = getShapeDefaults(type)
      const x = startObj.x + (startObj.width ?? 0)
      const y = startObj.y + (startObj.height ?? 0) / 2
      const x2 = endObj.x
      const y2 = endObj.y + (endObj.height ?? 0) / 2

      const fields: Record<string, unknown> = {
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
        connect_start_id: startObjectId,
        connect_start_anchor: startAnchor,
        connect_end_id: endObjectId,
        connect_end_anchor: endAnchor,
      }
      if (type === 'arrow') fields.marker_end = 'arrow'

      const result = await buildAndInsertObject(ctx, type, fields)
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'create', object: result.obj as Partial<BoardObject> & { id: string } }])
      return { id: result.id, type, startObjectId, endObjectId }
    },
  ),

  makeToolDef(
    'saveMemory',
    'Save a memory as a context_object on the board, connected to you via a data_connector. Use this to persist important information across conversations.',
    saveMemorySchema,
    async (ctx, { summary }) => {
      if (!ctx.agentObjectId) return { error: 'saveMemory is only available for per-agent chat' }

      const agentObj = ctx.state.objects.get(ctx.agentObjectId)
      if (!agentObj) return { error: 'Agent object not found' }

      // Count existing context objects connected to this agent for vertical stacking
      let contextCount = 0
      for (const obj of ctx.state.objects.values()) {
        if (obj.type !== 'data_connector' || obj.deleted_at) continue
        if (obj.connect_start_id !== ctx.agentObjectId && obj.connect_end_id !== ctx.agentObjectId) continue
        const otherId = obj.connect_start_id === ctx.agentObjectId ? obj.connect_end_id : obj.connect_start_id
        const other = otherId ? ctx.state.objects.get(otherId) : null
        if (other?.type === 'context_object' && !other.deleted_at) contextCount++
      }

      const defaults = getShapeDefaults('context_object')
      const ctxX = agentObj.x + (agentObj.width ?? 200) + 80
      const ctxY = agentObj.y + contextCount * ((defaults.height) + 20)

      // Create the context object
      const ctxResult = await buildAndInsertObject(ctx, 'context_object', {
        x: ctxX,
        y: ctxY,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text: summary,
        rich_text: JSON.stringify(plainTextToTipTap(summary)),
        color: defaults.color,
        font_size: 12,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
      })
      if (!ctxResult.success) return { error: ctxResult.error }

      // Create data_connector from agent to context object
      const connDefaults = getShapeDefaults('data_connector')
      const connResult = await buildAndInsertObject(ctx, 'data_connector', {
        x: agentObj.x + (agentObj.width ?? 200),
        y: agentObj.y + (agentObj.height ?? 140) / 2,
        x2: ctxX,
        y2: ctxY + defaults.height / 2,
        width: connDefaults.width,
        height: connDefaults.height,
        rotation: 0,
        text: '',
        color: connDefaults.color,
        font_size: 14,
        stroke_width: connDefaults.stroke_width ?? 2,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        connect_start_id: ctx.agentObjectId,
        connect_start_anchor: 'right',
        connect_end_id: ctxResult.id,
        connect_end_anchor: 'left',
      })
      if (!connResult.success) return { error: connResult.error }

      broadcastChanges(ctx.boardId, [
        { action: 'create', object: ctxResult.obj as Partial<BoardObject> & { id: string } },
        { action: 'create', object: connResult.obj as Partial<BoardObject> & { id: string } },
      ])

      return { contextObjectId: ctxResult.id, connectorId: connResult.id, summary }
    },
  ),

  makeToolDef(
    'createDataConnector',
    'Create a data connector from you to another object, adding it to your visibility scope.',
    createDataConnectorSchema,
    async (ctx, { targetObjectId }) => {
      if (!ctx.agentObjectId) return { error: 'createDataConnector is only available for per-agent chat' }

      const agentObj = ctx.state.objects.get(ctx.agentObjectId)
      if (!agentObj) return { error: 'Agent object not found' }

      const target = ctx.state.objects.get(targetObjectId)
      if (!target || target.deleted_at) return { error: `Target object ${targetObjectId} not found` }

      const vectorTypes = ['line', 'arrow', 'data_connector']
      if (vectorTypes.includes(target.type)) return { error: `Cannot connect to a ${target.type}` }

      const connDefaults = getShapeDefaults('data_connector')
      const x = agentObj.x + (agentObj.width ?? 200)
      const y = agentObj.y + (agentObj.height ?? 140) / 2
      const x2 = target.x
      const y2 = target.y + (target.height ?? 0) / 2

      const result = await buildAndInsertObject(ctx, 'data_connector', {
        x, y, x2, y2,
        width: connDefaults.width,
        height: connDefaults.height,
        rotation: 0,
        text: '',
        color: connDefaults.color,
        font_size: 14,
        stroke_width: connDefaults.stroke_width ?? 2,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        connect_start_id: ctx.agentObjectId,
        connect_start_anchor: 'right',
        connect_end_id: targetObjectId,
        connect_end_anchor: 'left',
      })
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [
        { action: 'create', object: result.obj as Partial<BoardObject> & { id: string } },
      ])

      return { id: result.id, targetObjectId }
    },
  ),
]
