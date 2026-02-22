'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type React from 'react'
import { v4 as uuidv4 } from 'uuid'
import { RealtimeChannel } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'
import { BoardRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'
import { OnlineUser } from '@/hooks/usePresence'
import { HLC, createHLC, tickHLC } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'
import { useBroadcast, BoardChange, CRDT_ENABLED } from '@/hooks/board/useBroadcast'
import { usePersistence } from '@/hooks/board/usePersistence'
import { fireAndRetry } from '@/lib/retryWithRollback'
import { useRemoteSelection } from '@/hooks/board/useRemoteSelection'
import { toast } from 'sonner'
import { createBoardLogger } from '@/lib/logger'
export { coalesceBroadcastQueue } from '@/hooks/board/useBroadcast'
export type { BoardChange } from '@/hooks/board/useBroadcast'

interface UseBoardStateOpts {
  isDraggingRef?: React.MutableRefObject<boolean>
  getDragCursorPos?: () => { x: number; y: number } | null
  onRemoteCursor?: (userId: string, pos: { x: number; y: number }) => void
  dragPositionsRef?: React.MutableRefObject<Map<string, Partial<BoardObject>>>
}

export function useBoardState(userId: string, boardId: string, userRole: BoardRole = 'viewer', channel?: RealtimeChannel | null, onlineUsers?: OnlineUser[], opts?: UseBoardStateOpts) {
  const [objects, setObjects] = useState<Map<string, BoardObject>>(new Map())
  const objectsRef = useRef<Map<string, BoardObject>>(objects)
  objectsRef.current = objects

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  // CRDT clock state (in-memory only for Phase 1; persisted in Phase 2)
  const hlcRef = useRef<HLC>(createHLC(userId))
  const fieldClocksRef = useRef<Map<string, FieldClocks>>(new Map())

  const canEdit = userRole !== 'viewer'

  // ── Computed values ─────────────────────────────────────────────

  // Helper: get max z_index
  const getMaxZIndex = useCallback(() => {
    let max = 0
    for (const obj of objects.values()) {
      if (obj.z_index > max) max = obj.z_index
    }
    return max
  }, [objects])

  // Helper: get min z_index
  const getMinZIndex = useCallback(() => {
    let min = Infinity
    for (const obj of objects.values()) {
      if (obj.z_index < min) min = obj.z_index
    }
    return min === Infinity ? 0 : min
  }, [objects])

  // Children index: parent_id -> direct children (O(N) build once, O(1) lookup)
  const childrenIndex = useMemo(() => {
    const index = new Map<string, BoardObject[]>()
    for (const obj of objects.values()) {
      if (obj.parent_id) {
        const siblings = index.get(obj.parent_id)
        if (siblings) {
          siblings.push(obj)
        } else {
          index.set(obj.parent_id, [obj])
        }
      }
    }
    return index
  }, [objects])

  // Cached frame list: only frames, sorted by z_index descending (highest first for hit-testing)
  const framesDesc = useMemo(() => {
    const frames: BoardObject[] = []
    for (const obj of objects.values()) {
      if (obj.type === 'frame') frames.push(obj)
    }
    frames.sort((a, b) => b.z_index - a.z_index)
    return frames
  }, [objects])

  // Helper: get children of a group/frame (O(1) lookup)
  const getChildren = useCallback((parentId: string): BoardObject[] => {
    return childrenIndex.get(parentId) ?? []
  }, [childrenIndex])

  // Helper: get all descendants recursively (O(descendants) instead of O(N * depth))
  const getDescendants = useCallback((parentId: string): BoardObject[] => {
    const result: BoardObject[] = []
    const stack = [parentId]
    while (stack.length > 0) {
      const pid = stack.pop()!
      const children = childrenIndex.get(pid)
      if (children) {
        for (const child of children) {
          result.push(child)
          stack.push(child.id)
        }
      }
    }
    return result
  }, [childrenIndex])

  // Helper: find the top-level ancestor (group/frame) that contains this object
  const getTopLevelAncestor = useCallback((id: string): string => {
    let current = objects.get(id)
    if (!current) return id
    while (current.parent_id) {
      const parent = objects.get(current.parent_id)
      if (!parent) break
      current = parent
    }
    return current.id
  }, [objects])

  // Computed: sorted objects by z_index
  const sortedObjects = useMemo(() => {
    return Array.from(objects.values()).sort((a, b) => a.z_index - b.z_index)
  }, [objects])

  // ── Extracted hooks ─────────────────────────────────────────────

  // Broadcast batching + CRDT stamping (extracted to useBroadcast)
  const { queueBroadcast, stampChange, stampCreate } = useBroadcast({
    channel, userId, setObjects, fieldClocksRef, hlcRef,
    isDraggingRef: opts?.isDraggingRef,
    getDragCursorPos: opts?.getDragCursorPos,
    onRemoteCursor: opts?.onRemoteCursor,
  })

  const notify = useCallback((msg: string) => toast.error(msg), [])
  const log = useMemo(() => createBoardLogger(boardId, userId), [boardId, userId])

  // Persistence: DB CRUD + optimistic updates + broadcast on success
  const {
    loadObjects, reconcileOnReconnect,
    addObject, addObjectWithId, updateObject, deleteObject, duplicateObject,
    persistZIndexBatch, updateObjectDrag, updateObjectDragEnd, updateConnectorDrag,
    moveGroupChildren, waitForPersist,
  } = usePersistence({
    boardId, userId, canEdit, supabase,
    setObjects, objectsRef, setSelectedIds,
    getDescendants, getMaxZIndex,
    queueBroadcast, stampChange, stampCreate,
    fieldClocksRef, hlcRef,
    notify, log,
    dragPositionsRef: opts?.dragPositionsRef,
  })

  // Load on mount
  useEffect(() => {
    loadObjects()
  }, [loadObjects])

  // ── Selection ───────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    if (!canEdit) return
    for (const id of selectedIds) {
      deleteObject(id)
    }
  }, [selectedIds, deleteObject, canEdit])

  const duplicateSelected = useCallback((): string[] => {
    if (!canEdit) return []
    const ids = Array.from(selectedIds)
    if (ids.length === 1) {
      const newObj = duplicateObject(ids[0])
      return newObj ? [newObj.id] : []
    } else if (ids.length > 1) {
      const newIds: string[] = []
      for (const id of ids) {
        const newObj = duplicateObject(id)
        if (newObj) newIds.push(newObj.id)
      }
      setSelectedIds(new Set(newIds))
      return newIds
    }
    return []
  }, [selectedIds, duplicateObject, canEdit])

  const selectObject = useCallback((id: string | null, opts?: { shift?: boolean; ctrl?: boolean }) => {
    if (id === null) {
      setSelectedIds(new Set())
      setActiveGroupId(null)
      return
    }

    const obj = objects.get(id)

    // If the shape belongs to a group/frame, single-click always selects the
    // top-level container (even if we're currently inside the group).
    if (obj?.parent_id) {
      const parent = objects.get(obj.parent_id)
      if (parent && (parent.type === 'group' || parent.type === 'frame')) {
        setActiveGroupId(null)
        const topId = getTopLevelAncestor(id)
        if (opts?.shift) {
          setSelectedIds(prev => new Set([...prev, topId]))
        } else if (opts?.ctrl) {
          setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(topId)) next.delete(topId)
            else next.add(topId)
            return next
          })
        } else {
          setSelectedIds(new Set([topId]))
        }
        return
      }
    }

    if (opts?.shift) {
      setSelectedIds(prev => new Set([...prev, id]))
    } else if (opts?.ctrl) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      setSelectedIds(new Set([id]))
      setActiveGroupId(null)
    }
  }, [objects, getTopLevelAncestor])

  const selectObjects = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setActiveGroupId(null)
  }, [])

  const enterGroup = useCallback((groupId: string, selectChildId?: string) => {
    const obj = objects.get(groupId)
    if (!obj || (obj.type !== 'group' && obj.type !== 'frame')) return
    setActiveGroupId(groupId)
    setSelectedIds(selectChildId ? new Set([selectChildId]) : new Set())
  }, [objects])

  const exitGroup = useCallback(() => {
    setActiveGroupId(null)
    setSelectedIds(new Set())
  }, [])

  // ── Z-ordering ──────────────────────────────────────────────────

  const getZOrderSet = useCallback((id: string): BoardObject[] => {
    const obj = objects.get(id)
    if (!obj) return []
    if (obj.type === 'group' || obj.type === 'frame') {
      return [obj, ...getDescendants(id)]
    }
    return [obj]
  }, [objects, getDescendants])

  const bringToFront = useCallback((id: string) => {
    if (!canEdit) return
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const maxZ = getMaxZIndex()
    const minInSet = Math.min(...set.map(o => o.z_index))
    const delta = maxZ - minInSet + 1

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index + delta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index + delta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [canEdit, getZOrderSet, getMaxZIndex, queueBroadcast, persistZIndexBatch, stampChange])

  const sendToBack = useCallback((id: string) => {
    if (!canEdit) return
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const minZ = getMinZIndex()
    const maxInSet = Math.max(...set.map(o => o.z_index))
    const delta = maxInSet - minZ + 1

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index - delta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index - delta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [canEdit, getZOrderSet, getMinZIndex, queueBroadcast, persistZIndexBatch, stampChange])

  // Shared helper: swap `set` with the adjacent neighbor in the given direction.
  // direction === 1  → bring forward (swap with next-higher neighbor)
  // direction === -1 → send backward (swap with next-lower neighbor)
  const applyZOrderSwap = useCallback((id: string, direction: 1 | -1) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const setIds = new Set(set.map(o => o.id))

    // When moving forward we anchor on the set's max z; backward on the set's min z.
    const setEdge = direction === 1
      ? Math.max(...set.map(o => o.z_index))
      : Math.min(...set.map(o => o.z_index))

    // Sort neighbors so we can find the immediately adjacent one.
    const sorted = Array.from(objects.values())
      .filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id)
      .sort((a, b) => direction * (a.z_index - b.z_index))
    const neighbor = sorted.find(o => direction * o.z_index > direction * setEdge)
    if (!neighbor) return

    const nextSet = getZOrderSet(neighbor.id)
    // How far the moving set travels (positive = forward).
    const setSpan = set.length > 1 ? Math.max(...set.map(o => o.z_index)) - Math.min(...set.map(o => o.z_index)) + 1 : 1
    const neighborEdge = direction === 1
      ? Math.max(...nextSet.map(o => o.z_index))
      : Math.min(...nextSet.map(o => o.z_index))

    // The moving set shifts by the gap between its edge and the neighbor's far edge.
    const setDelta = direction * (direction * neighborEdge - direction * setEdge)
    // The neighbor set shifts back by the moving set's span.
    const neighborDelta = -direction * setSpan

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index + setDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    for (const o of nextSet) {
      const newZ = o.z_index + neighborDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index + setDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      for (const o of nextSet) {
        const newZ = o.z_index + neighborDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [objects, canEdit, getZOrderSet, queueBroadcast, persistZIndexBatch, stampChange])

  const bringForward = useCallback((id: string) => {
    applyZOrderSwap(id, 1)
  }, [applyZOrderSwap])

  const sendBackward = useCallback((id: string) => {
    applyZOrderSwap(id, -1)
  }, [applyZOrderSwap])

  // ── Group / Ungroup ─────────────────────────────────────────────

  const groupSelected = useCallback(async () => {
    if (!canEdit || selectedIds.size < 2) return null
    const ids = Array.from(selectedIds)
    const selectedObjs = ids.map(id => objects.get(id)).filter(Boolean) as BoardObject[]
    if (selectedObjs.length < 2) return null

    const groupId = uuidv4()
    const now = new Date().toISOString()
    const groupObj: BoardObject = {
      id: groupId,
      board_id: boardId,
      type: 'group',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      text: '',
      color: 'transparent',
      font_size: 14,
      z_index: Math.max(...selectedObjs.map(o => o.z_index)),
      parent_id: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    }

    setObjects(prev => {
      const next = new Map(prev)
      next.set(groupId, groupObj)
      for (const obj of selectedObjs) {
        const existing = next.get(obj.id)
        if (existing) {
          next.set(obj.id, { ...existing, parent_id: groupId, updated_at: now })
        }
      }
      return next
    })
    setSelectedIds(new Set([groupId]))

    queueBroadcast([
      { action: 'create', object: groupObj, clocks: stampCreate(groupId, groupObj) },
      ...selectedObjs.map(obj => ({
        action: 'update' as const,
        object: { id: obj.id, parent_id: groupId } as Partial<BoardObject> & { id: string },
        clocks: stampChange(obj.id, ['parent_id']),
      })),
    ])

    // Rollback helper: undo the optimistic setObjects for this group operation
    const rollbackGroup = () => {
      setObjects(prev => {
        const next = new Map(prev)
        next.delete(groupId)
        for (const obj of selectedObjs) {
          const existing = next.get(obj.id)
          if (existing) next.set(obj.id, { ...existing, parent_id: obj.parent_id, updated_at: obj.updated_at })
        }
        return next
      })
    }

    // Persist: insert group first, then update children
    const { id: _id, created_at: _ca, updated_at: _ua, field_clocks: _fc, deleted_at: _da, ...insertData } = groupObj
    const insertRow = CRDT_ENABLED
      ? { ...insertData, id: groupId, field_clocks: fieldClocksRef.current.get(groupId) ?? {} }
      : { ...insertData, id: groupId }
    const groupInsertOk = await fireAndRetry({
      operation: () => supabase.from('board_objects').insert(insertRow),
      rollback: rollbackGroup,
      onError: () => notify('Failed to create group'),
      logError: (err) => log.error({ message: 'Failed to save group', operation: 'groupSelected', objectId: groupId, error: err }),
    })
    if (!groupInsertOk) return null

    await Promise.all(selectedObjs.map(obj => {
      const childUpdate: Record<string, unknown> = { parent_id: groupId, updated_at: now }
      if (CRDT_ENABLED) {
        childUpdate.field_clocks = fieldClocksRef.current.get(obj.id) ?? {}
        childUpdate.deleted_at = null
      }
      return fireAndRetry({
        operation: () => supabase.from('board_objects').update(childUpdate).eq('id', obj.id),
        rollback: () => {
          setObjects(prev => {
            const next = new Map(prev)
            const existing = next.get(obj.id)
            if (existing) next.set(obj.id, { ...existing, parent_id: obj.parent_id, updated_at: obj.updated_at })
            return next
          })
        },
        onError: () => notify('Failed to update group member'),
        logError: (err) => log.error({ message: 'Failed to update child parent_id', operation: 'groupSelected', error: err }),
      })
    }))

    return groupObj
  }, [canEdit, selectedIds, objects, boardId, userId, queueBroadcast, stampCreate, stampChange, notify, log])

  const ungroupSelected = useCallback(() => {
    if (!canEdit) return
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj || obj.type !== 'group') continue
      const children = getChildren(id)
      for (const child of children) {
        updateObject(child.id, { parent_id: obj.parent_id })
      }
      setObjects(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })

      // Rollback: restore the group object if the DB operation fails
      const rollbackUngroup = () => {
        setObjects(prev => {
          const next = new Map(prev)
          next.set(id, obj)
          return next
        })
      }

      if (CRDT_ENABLED) {
        hlcRef.current = tickHLC(hlcRef.current)
        const deleteClock = hlcRef.current
        queueBroadcast([{ action: 'delete', object: { id } as BoardObject, clocks: { _deleted: deleteClock } }])
        fireAndRetry({
          operation: () => supabase.from('board_objects').update({ deleted_at: new Date().toISOString() }).eq('id', id),
          rollback: rollbackUngroup,
          onError: () => notify('Failed to ungroup'),
          logError: (err) => log.error({ message: 'Failed to soft-delete group', operation: 'ungroupSelected', objectId: id, error: err }),
        })
      } else {
        fieldClocksRef.current.delete(id)
        queueBroadcast([{ action: 'delete', object: { id } as BoardObject }])
        fireAndRetry({
          operation: () => supabase.from('board_objects').delete().eq('id', id),
          rollback: rollbackUngroup,
          onError: () => notify('Failed to ungroup'),
          logError: (err) => log.error({ message: 'Failed to delete group', operation: 'ungroupSelected', objectId: id, error: err }),
        })
      }
    }
    setSelectedIds(new Set())
  }, [canEdit, selectedIds, objects, getChildren, updateObject, queueBroadcast, notify, log])

  // ── Frame containment ───────────────────────────────────────────

  const checkFrameContainment = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj || obj.type === 'frame') return

    let centerX: number, centerY: number
    if (obj.x2 != null && obj.y2 != null) {
      centerX = (obj.x + obj.x2) / 2
      centerY = (obj.y + obj.y2) / 2
    } else {
      centerX = obj.x + obj.width / 2
      centerY = obj.y + obj.height / 2
    }

    let bestFrame: BoardObject | null = null
    for (const frame of framesDesc) {
      if (frame.id === id) continue
      if (
        centerX >= frame.x &&
        centerX <= frame.x + frame.width &&
        centerY >= frame.y &&
        centerY <= frame.y + frame.height
      ) {
        bestFrame = frame
        break
      }
    }

    const newParentId = bestFrame?.id ?? null
    if (obj.parent_id !== newParentId) {
      const currentParent = obj.parent_id ? objects.get(obj.parent_id) : null
      if (!currentParent || currentParent.type === 'frame') {
        updateObject(id, { parent_id: newParentId })
      }
    }
  }, [objects, framesDesc, updateObject])

  // ── Lock helpers ────────────────────────────────────────────────

  const isObjectLocked = useCallback((id: string): boolean => {
    let current = objectsRef.current.get(id)
    while (current) {
      if (current.locked_by) return true
      if (!current.parent_id) break
      current = objectsRef.current.get(current.parent_id)
    }
    return false
  }, [])

  const lockObject = useCallback((id: string) => {
    if (!canEdit) return
    updateObject(id, { locked_by: userId })
  }, [canEdit, userId, updateObject])

  const unlockObject = useCallback((id: string) => {
    if (!canEdit) return
    updateObject(id, { locked_by: null })
  }, [canEdit, updateObject])

  // ── Remote selection (extracted to useRemoteSelection) ──────────

  const { remoteSelections } = useRemoteSelection({
    channel, userId, selectedIds, onlineUsers,
  })

  return {
    objects,
    selectedIds,
    activeGroupId,
    sortedObjects,
    addObject,
    updateObject,
    deleteSelected,
    duplicateSelected,
    selectObject,
    selectObjects,
    clearSelection,
    enterGroup,
    exitGroup,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    groupSelected,
    ungroupSelected,
    moveGroupChildren,
    updateObjectDrag,
    updateObjectDragEnd,
    updateConnectorDrag,
    checkFrameContainment,
    getChildren,
    getDescendants,
    remoteSelections,
    reconcileOnReconnect,
    deleteObject,
    getZOrderSet,
    addObjectWithId,
    duplicateObject,
    isObjectLocked,
    lockObject,
    unlockObject,
    waitForPersist,
  }
}
