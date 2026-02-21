/**
 * Tool executors for querying board state.
 */

import { loadBoardState } from '@/lib/agent/boardState'
import { makeToolDef, getConnectedObjectIds } from './helpers'
import { getFrameObjectsSchema, emptySchema } from './schemas'
import type { ToolDef } from './types'

export const queryObjectTools: ToolDef[] = [

  makeToolDef(
    'getBoardState',
    'Get the full board state — returns all non-deleted objects with their id, type, position, size, text, color, and parent. Use this to understand the current board contents before making changes.',
    emptySchema,
    async (ctx, _args) => {
      // Refresh state so subsequent tools see up-to-date data
      const freshState = await loadBoardState(ctx.boardId)
      ctx.state = freshState

      const objects = Array.from(freshState.objects.values())
        .filter(obj => !obj.deleted_at)
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
          parent_id: obj.parent_id || undefined,
        }))

      return { objectCount: objects.length, objects }
    },
  ),

  makeToolDef(
    'getConnectedObjects',
    'Get the objects connected to you via data connectors. Returns only objects in your visibility scope. Use this to understand what you can see and interact with.',
    emptySchema,
    async (ctx, _args) => {
      // Refresh state so subsequent tools see up-to-date data
      const freshState = await loadBoardState(ctx.boardId)
      ctx.state = freshState

      let objectsIter = freshState.objects.values()

      // When scoped to a per-agent context, filter to connected objects only
      if (ctx.agentObjectId) {
        const connectedIds = getConnectedObjectIds(freshState, ctx.agentObjectId)
        objectsIter = Array.from(freshState.objects.values())
          .filter(obj => connectedIds.has(obj.id))[Symbol.iterator]()
      }

      const objects = Array.from(objectsIter).map(obj => ({
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
      // Scope check: if agent is scoped, frame must be connected
      if (ctx.agentObjectId) {
        const connectedIds = getConnectedObjectIds(ctx.state, ctx.agentObjectId)
        if (!connectedIds.has(frameId)) {
          return { error: 'Object not connected to this agent' }
        }
      }

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
