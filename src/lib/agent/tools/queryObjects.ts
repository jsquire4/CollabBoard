/**
 * Tool executors for querying board state.
 */

import { loadBoardState } from '@/lib/agent/boardState'
import { makeToolDef } from './helpers'
import { getFrameObjectsSchema, emptySchema } from './schemas'
import type { ToolDef } from './types'

export const queryObjectTools: ToolDef[] = [

  makeToolDef(
    'getBoardState',
    'Get the current state of all objects on the board. Use this to understand what is on the board before making changes.',
    emptySchema,
    async (ctx, _args) => {
      // Refresh state so subsequent tools see up-to-date data
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
  ),

  makeToolDef(
    'getFrameObjects',
    'Get all objects contained within a frame. Use this to inspect frame contents before making changes.',
    getFrameObjectsSchema,
    async (ctx, { frameId }) => {
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
  ),
]
