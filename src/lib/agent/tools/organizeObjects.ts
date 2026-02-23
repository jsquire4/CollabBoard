/**
 * Tool executors for organization: duplicate, z-order, group, ungroup.
 */

import { v4 as uuidv4 } from 'uuid'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBoardState, getMaxZIndex, broadcastChanges } from '@/lib/agent/boardState'
import type { BoardObject } from '@/types/board'
import { advanceClock, insertObject, updateFields, makeToolDef, getConnectedObjectIds, buildAndInsertObject } from './helpers'
import { stampFields } from '@/lib/crdt/merge'
import {
  duplicateObjectSchema,
  updateZIndexSchema,
  groupObjectsSchema,
  ungroupObjectsSchema,
} from './schemas'
import type { ToolDef } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDescendants(objects: Map<string, BoardObject>, parentId: string): BoardObject[] {
  const result: BoardObject[] = []
  const stack = [parentId]
  while (stack.length > 0) {
    const pid = stack.pop()!
    for (const obj of objects.values()) {
      if (obj.parent_id === pid && !obj.deleted_at) {
        result.push(obj)
        stack.push(obj.id)
      }
    }
  }
  return result
}

function getZOrderSet(objects: Map<string, BoardObject>, id: string): BoardObject[] {
  const obj = objects.get(id)
  if (!obj) return []
  if (obj.type === 'group' || obj.type === 'frame') {
    return [obj, ...getDescendants(objects, id)]
  }
  if (obj.parent_id) {
    const parent = objects.get(obj.parent_id)
    if (parent && (parent.type === 'group' || parent.type === 'frame')) {
      return [parent, ...getDescendants(objects, obj.parent_id)]
    }
  }
  return [obj]
}

function getMinZIndex(objects: Map<string, BoardObject>): number {
  let min = Infinity
  for (const obj of objects.values()) {
    if (obj.z_index != null && obj.z_index < min) min = obj.z_index
  }
  return min === Infinity ? 0 : min
}

// ── Tool definitions ───────────────────────────────────────────────────────────

export const organizeObjectTools: ToolDef[] = [

  makeToolDef(
    'duplicateObject',
    'Duplicate an object (and its descendants if it is a group or frame).',
    duplicateObjectSchema,
    async (ctx, { id }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(id)) {
        return { error: 'Object not connected to this agent' }
      }

      const original = ctx.state.objects.get(id)
      if (!original) return { error: `Object ${id} not found` }
      if (original.board_id !== ctx.boardId) return { error: 'Object not found' }

      const now = new Date().toISOString()
      const offset = 20

      if (original.type === 'group' || original.type === 'frame') {
        const descendants = getDescendants(ctx.state.objects, id)
        const idMap = new Map<string, string>()
        idMap.set(id, uuidv4())
        for (const d of descendants) idMap.set(d.id, uuidv4())

        const newGroupId = idMap.get(id)!
        const groupObj: Record<string, unknown> = {
          ...original,
          id: newGroupId,
          x: original.x + offset,
          y: original.y + offset,
          z_index: getMaxZIndex(ctx.state) + 1,
          parent_id: original.parent_id,
          created_by: ctx.userId,
          created_at: now,
          updated_at: now,
        }
        delete (groupObj as Record<string, unknown>).field_clocks
        delete (groupObj as Record<string, unknown>).deleted_at

        const clock = advanceClock(ctx)
        const clocks = stampFields(Object.keys(groupObj).filter(k => !['id', 'board_id', 'created_by', 'created_at', 'updated_at'].includes(k)), clock)
        const groupResult = await insertObject(groupObj, clocks, ctx)
        if (!groupResult.success) return { error: groupResult.error }

        for (const d of descendants) {
          const newId = idMap.get(d.id)!
          const cloned: Record<string, unknown> = {
            ...d,
            id: newId,
            x: d.x + offset,
            y: d.y + offset,
            parent_id: d.parent_id ? idMap.get(d.parent_id) ?? null : newGroupId,
            created_by: ctx.userId,
            created_at: now,
            updated_at: now,
          }
          if (d.x2 != null) cloned.x2 = d.x2 + offset
          if (d.y2 != null) cloned.y2 = d.y2 + offset
          delete (cloned as Record<string, unknown>).field_clocks
          delete (cloned as Record<string, unknown>).deleted_at

          const cClock = advanceClock(ctx)
          const cClocks = stampFields(Object.keys(cloned).filter(k => !['id', 'board_id', 'created_by', 'created_at', 'updated_at'].includes(k)), cClock)
          const childResult = await insertObject(cloned, cClocks, ctx)
          if (!childResult.success) return { error: childResult.error }
        }

        const allNew = [
          ctx.state.objects.get(newGroupId)!,
          ...descendants.map(d => ctx.state.objects.get(idMap.get(d.id)!)!),
        ].filter(Boolean)
        broadcastChanges(ctx.boardId, allNew.map(o => ({ action: 'create' as const, object: o })))

        return { id: newGroupId, type: original.type, duplicated: true }
      }

      // Simple object
      const { id: _oid, board_id: _obid, created_by: _ocb, created_at: _oca, updated_at: _oua, field_clocks: _ofc, deleted_at: _oda, ...visualProps } = original
      const cloned: Record<string, unknown> = {
        ...visualProps,
        x: original.x + offset,
        y: original.y + offset,
        z_index: getMaxZIndex(ctx.state) + 1,
      }
      if (original.x2 != null) cloned.x2 = original.x2 + offset
      if (original.y2 != null) cloned.y2 = original.y2 + offset

      const buildResult = await buildAndInsertObject(ctx, original.type, cloned as Record<string, unknown>)
      if (!buildResult.success) return { error: buildResult.error }

      broadcastChanges(ctx.boardId, [{ action: 'create', object: { ...buildResult.obj, id: buildResult.id } }])
      return { id: buildResult.id, type: original.type, duplicated: true }
    },
  ),

  makeToolDef(
    'updateZIndex',
    'Change layer order: front=top, back=bottom, forward=+1, backward=-1.',
    updateZIndexSchema,
    async (ctx, { id, action }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(id)) {
        return { error: 'Object not connected to this agent' }
      }

      const set = getZOrderSet(ctx.state.objects, id)
      if (set.length === 0) return { error: `Object ${id} not found` }

      const objects = ctx.state.objects
      let dbUpdates: { id: string; z_index: number }[] = []

      if (action === 'front') {
        const maxZ = getMaxZIndex(ctx.state)
        const minInSet = Math.min(...set.map(o => o.z_index ?? 0))
        const delta = maxZ - minInSet + 1
        dbUpdates = set.map(o => ({ id: o.id, z_index: (o.z_index ?? 0) + delta }))
      } else if (action === 'back') {
        const minZ = getMinZIndex(objects)
        const maxInSet = Math.max(...set.map(o => o.z_index ?? 0))
        const delta = maxInSet - minZ + 1
        dbUpdates = set.map(o => ({ id: o.id, z_index: (o.z_index ?? 0) - delta }))
      } else if (action === 'forward' || action === 'backward') {
        const direction = action === 'forward' ? 1 : -1
        const obj = objects.get(id)
        if (!obj) return { error: `Object ${id} not found` }
        const setIds = new Set(set.map(o => o.id))
        const setEdge = direction === 1
          ? Math.max(...set.map(o => o.z_index ?? 0))
          : Math.min(...set.map(o => o.z_index ?? 0))

        const siblings = Array.from(objects.values())
          .filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id)
          .sort((a, b) => direction * ((a.z_index ?? 0) - (b.z_index ?? 0)))
        const neighbor = siblings.find(o => direction * (o.z_index ?? 0) > direction * setEdge)
        if (!neighbor) return { id, action, unchanged: true }

        const nextSet = getZOrderSet(objects, neighbor.id)
        const setSpan = set.length > 1 ? Math.max(...set.map(o => o.z_index ?? 0)) - Math.min(...set.map(o => o.z_index ?? 0)) + 1 : 1
        const neighborEdge = direction === 1
          ? Math.max(...nextSet.map(o => o.z_index ?? 0))
          : Math.min(...nextSet.map(o => o.z_index ?? 0))
        const setDelta = direction * (direction * neighborEdge - direction * setEdge)
        const neighborDelta = -direction * setSpan

        dbUpdates = [
          ...set.map(o => ({ id: o.id, z_index: (o.z_index ?? 0) + setDelta })),
          ...nextSet.map(o => ({ id: o.id, z_index: (o.z_index ?? 0) + neighborDelta })),
        ]
      }

      const changes: { action: 'update'; object: { id: string; z_index: number } }[] = dbUpdates.map(u => ({ action: 'update' as const, object: u }))

      for (const u of dbUpdates) {
        const clock = advanceClock(ctx)
        const clocks = stampFields(['z_index'], clock)
        const result = await updateFields(u.id, ctx.boardId, { z_index: u.z_index }, clocks, ctx)
        if (!result.success) return { error: result.error }
      }

      broadcastChanges(ctx.boardId, changes)
      return { id, action, updated: dbUpdates.length }
    },
  ),

  makeToolDef(
    'groupObjects',
    'Group multiple objects into a single group.',
    groupObjectsSchema,
    async (ctx, { objectIds }) => {
      if (ctx.agentObjectId) {
        const connected = getConnectedObjectIds(ctx.state, ctx.agentObjectId)
        for (const id of objectIds) {
          if (!connected.has(id)) return { error: `Object ${id} not connected to this agent` }
        }
      }

      const selectedObjs = objectIds.map(id => ctx.state.objects.get(id)).filter(Boolean) as BoardObject[]
      if (selectedObjs.length < 2) return { error: 'Need at least 2 objects to group' }

      const groupId = uuidv4()
      const now = new Date().toISOString()
      const groupObj: Record<string, unknown> = {
        id: groupId,
        board_id: ctx.boardId,
        type: 'group',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        text: '',
        color: 'transparent',
        font_size: 14,
        z_index: Math.max(...selectedObjs.map(o => o.z_index ?? 0)),
        parent_id: null,
        created_by: ctx.userId,
        created_at: now,
        updated_at: now,
      }

      const clock = advanceClock(ctx)
      const clocks = stampFields(['type', 'x', 'y', 'width', 'height', 'z_index', 'parent_id'], clock)
      const groupResult = await insertObject(groupObj, clocks, ctx)
      if (!groupResult.success) return { error: groupResult.error }

      for (const obj of selectedObjs) {
        const cClock = advanceClock(ctx)
        const cClocks = stampFields(['parent_id'], cClock)
        const result = await updateFields(obj.id, ctx.boardId, { parent_id: groupId }, cClocks, ctx)
        if (!result.success) return { error: result.error }
      }

      broadcastChanges(ctx.boardId, [
        { action: 'create', object: { id: groupId, type: 'group', x: 0, y: 0, width: 0, height: 0, z_index: groupObj.z_index as number } },
        ...selectedObjs.map(obj => ({ action: 'update' as const, object: { id: obj.id, parent_id: groupId } })),
      ])
      return { groupId, childCount: selectedObjs.length }
    },
  ),

  makeToolDef(
    'ungroupObjects',
    'Ungroup a group, moving its children to the parent level.',
    ungroupObjectsSchema,
    async (ctx, { groupId }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(groupId)) {
        return { error: 'Group not connected to this agent' }
      }

      const group = ctx.state.objects.get(groupId)
      if (!group) return { error: `Group ${groupId} not found` }
      if (group.type !== 'group') return { error: `Object ${groupId} is not a group` }

      const children = getDescendants(ctx.state.objects, groupId)
      const parentId = group.parent_id

      for (const child of children) {
        const clock = advanceClock(ctx)
        const clocks = stampFields(['parent_id'], clock)
        const result = await updateFields(child.id, ctx.boardId, { parent_id: parentId }, clocks, ctx)
        if (!result.success) return { error: result.error }
      }

      const now = new Date().toISOString()
      const admin = createAdminClient()
      await admin.from('board_objects').update({ deleted_at: now, updated_at: now }).eq('id', groupId)
      ctx.state.objects.delete(groupId)
      ctx.state.fieldClocks.delete(groupId)

      broadcastChanges(ctx.boardId, [
        ...children.map(c => ({ action: 'update' as const, object: { id: c.id, parent_id: parentId } })),
        { action: 'delete', object: { id: groupId } },
      ])
      return { groupId, ungroupedCount: children.length }
    },
  ),
]
