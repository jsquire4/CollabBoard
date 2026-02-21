/**
 * Tool executors for editing existing board objects.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { plainTextToTipTap } from '@/lib/richText'
import { broadcastChanges } from '@/lib/agent/boardState'
import type { BoardObject } from '@/types/board'
import { advanceClock, updateFields, makeToolDef, getConnectedObjectIds } from './helpers'
import { stampFields } from '@/lib/crdt/merge'
import {
  moveObjectSchema,
  resizeObjectSchema,
  updateTextSchema,
  changeColorSchema,
  deleteObjectSchema,
} from './schemas'
import type { ToolDef } from './types'

export const editObjectTools: ToolDef[] = [

  makeToolDef(
    'moveObject',
    'Move an object to a new position on the board.',
    moveObjectSchema,
    async (ctx, { id, x, y }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(id)) {
        return { error: 'Object not connected to this agent' }
      }
      const clock = advanceClock(ctx)
      const clocks = stampFields(['x', 'y'], clock)
      const result = await updateFields(id, ctx.boardId, { x, y }, clocks, ctx)
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, x, y } }])
      return { id, x, y }
    },
  ),

  makeToolDef(
    'resizeObject',
    'Resize an object on the board.',
    resizeObjectSchema,
    async (ctx, { id, width, height }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(id)) {
        return { error: 'Object not connected to this agent' }
      }
      const clock = advanceClock(ctx)
      const clocks = stampFields(['width', 'height'], clock)
      const result = await updateFields(id, ctx.boardId, { width, height }, clocks, ctx)
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, width, height } }])
      return { id, width, height }
    },
  ),

  makeToolDef(
    'updateText',
    'Update the text content of an object. For sticky notes and frames, can also update the title.',
    updateTextSchema,
    async (ctx, { id, text, title }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(id)) {
        return { error: 'Object not connected to this agent' }
      }
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
  ),

  makeToolDef(
    'changeColor',
    'Change the color of an object on the board. Color must be a valid hex value, e.g. #FF5733.',
    changeColorSchema,
    async (ctx, { id, color }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(id)) {
        return { error: 'Object not connected to this agent' }
      }
      const clock = advanceClock(ctx)
      const clocks = stampFields(['color'], clock)
      const result = await updateFields(id, ctx.boardId, { color }, clocks, ctx)
      if (!result.success) return { error: result.error }
      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id, color } }])
      return { id, color }
    },
  ),

  makeToolDef(
    'deleteObject',
    'Delete an object from the board by marking it as deleted.',
    deleteObjectSchema,
    async (ctx, { id }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(id)) {
        return { error: 'Object not connected to this agent' }
      }
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
  ),
]
