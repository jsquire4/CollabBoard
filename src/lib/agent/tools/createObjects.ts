/**
 * Tool executors for creating new board objects.
 */

import { getShapeDefaults } from '@/lib/agent/defaults'
import { createDefaultTableData, serializeTableData } from '@/lib/table/tableUtils'
import { getMaxZIndex, broadcastChanges } from '@/lib/agent/boardState'
import type { BoardObject } from '@/types/board'
import {
  buildAndInsertObject,
  makeToolDef,
  SCATTER_MARGIN,
  SCATTER_X_WIDE,
  SCATTER_X_NARROW,
  SCATTER_Y_WIDE,
  SCATTER_Y_NARROW,
} from './helpers'
import {
  createStickyNoteSchema,
  createShapeSchema,
  createFrameSchema,
  createTableSchema,
  createConnectorSchema,
} from './schemas'
import type { ToolDef } from './types'

export const createObjectTools: ToolDef[] = [

  makeToolDef(
    'createStickyNote',
    'Create a sticky note on the board with optional text and color.',
    createStickyNoteSchema,
    async (ctx, { text, color, x, y, title }) => {
      const defaults = getShapeDefaults('sticky_note')
      const result = await buildAndInsertObject(ctx, 'sticky_note', {
        x: x ?? (SCATTER_MARGIN + Math.random() * SCATTER_X_WIDE),
        y: y ?? (SCATTER_MARGIN + Math.random() * SCATTER_Y_WIDE),
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text,
        color: color ?? defaults.color,
        font_size: defaults.font_size ?? 14,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        ...(title ? { title } : {}),
      })
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'create', object: result.obj as Partial<BoardObject> & { id: string } }])
      return { id: result.id, type: 'sticky_note', text, x: result.obj.x, y: result.obj.y }
    },
  ),

  makeToolDef(
    'createShape',
    'Create a shape on the board (rectangle, circle, triangle, chevron, parallelogram, ngon).',
    createShapeSchema,
    async (ctx, { type, x, y, width, height, color, text, sides }) => {
      const defaults = getShapeDefaults(type)
      const fields: Record<string, unknown> = {
        x: x ?? (SCATTER_MARGIN + Math.random() * SCATTER_X_WIDE),
        y: y ?? (SCATTER_MARGIN + Math.random() * SCATTER_Y_WIDE),
        width: width ?? defaults.width,
        height: height ?? defaults.height,
        rotation: 0,
        text: text ?? defaults.text ?? '',
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
    'Create a frame (container) on the board to group objects.',
    createFrameSchema,
    async (ctx, { title, x, y, width, height, color }) => {
      const defaults = getShapeDefaults('frame')
      const result = await buildAndInsertObject(ctx, 'frame', {
        x: x ?? (SCATTER_MARGIN + Math.random() * SCATTER_X_NARROW),
        y: y ?? (SCATTER_MARGIN + Math.random() * SCATTER_Y_NARROW),
        width: width ?? defaults.width,
        height: height ?? defaults.height,
        rotation: 0,
        text: title,
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
    'Create a table on the board with specified columns and rows.',
    createTableSchema,
    async (ctx, { columns, rows, x, y, title }) => {
      const defaults = getShapeDefaults('table')
      const tableData = createDefaultTableData(columns, rows)
      const result = await buildAndInsertObject(ctx, 'table', {
        x: x ?? (SCATTER_MARGIN + Math.random() * SCATTER_X_NARROW),
        y: y ?? (SCATTER_MARGIN + Math.random() * SCATTER_Y_NARROW),
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        text: title ?? '',
        color: defaults.color,
        font_size: 14,
        z_index: getMaxZIndex(ctx.state) + 1,
        parent_id: null,
        table_data: serializeTableData(tableData),
      })
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'create', object: result.obj as Partial<BoardObject> & { id: string } }])
      return { id: result.id, type: 'table', columns, rows, x: result.obj.x, y: result.obj.y }
    },
  ),

  makeToolDef(
    'createConnector',
    'Create a line or arrow connecting two objects on the board.',
    createConnectorSchema,
    async (ctx, { type, startObjectId, endObjectId, startAnchor, endAnchor, color }) => {
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
]
