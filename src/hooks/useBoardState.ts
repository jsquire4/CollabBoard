'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
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
export { coalesceBroadcastQueue } from '@/hooks/board/useBroadcast'
export type { BoardChange } from '@/hooks/board/useBroadcast'

const COLOR_PALETTE = ['#FFEB3B', '#FF9800', '#E91E63', '#9C27B0', '#2196F3', '#4CAF50']

const SELECTION_BROADCAST_DEBOUNCE_MS = 50

export function useBoardState(userId: string, boardId: string, userRole: BoardRole = 'viewer', channel?: RealtimeChannel | null, onlineUsers?: OnlineUser[]) {
  const [objects, setObjects] = useState<Map<string, BoardObject>>(new Map())
  const objectsRef = useRef<Map<string, BoardObject>>(objects)
  useEffect(() => { objectsRef.current = objects }, [objects])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [remoteSelections, setRemoteSelections] = useState<Map<string, Set<string>>>(new Map())
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
  const { queueBroadcast, flushBroadcast, stampChange, stampCreate } = useBroadcast({
    channel, userId, setObjects, fieldClocksRef, hlcRef,
  })

  // Persistence: DB CRUD + optimistic updates + broadcast on success
  const {
    loadObjects, reconcileOnReconnect,
    addObject, addObjectWithId, updateObject, deleteObject, duplicateObject,
    persistZIndexBatch, updateObjectDrag, updateObjectDragEnd,
    moveGroupChildren, waitForPersist,
  } = usePersistence({
    boardId, userId, canEdit, supabase,
    setObjects, objectsRef, setSelectedIds,
    getDescendants, getMaxZIndex,
    queueBroadcast, stampChange, stampCreate,
    fieldClocksRef, hlcRef,
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
  }, [objects, activeGroupId, getTopLevelAncestor])

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

  const bringForward = useCallback((id: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const maxInSet = Math.max(...set.map(o => o.z_index))
    const setIds = new Set(set.map(o => o.id))
    const sorted = Array.from(objects.values())
      .filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id)
      .sort((a, b) => a.z_index - b.z_index)
    const nextHigher = sorted.find(o => o.z_index > maxInSet)
    if (!nextHigher) return

    const nextSet = getZOrderSet(nextHigher.id)
    const maxNext = Math.max(...nextSet.map(o => o.z_index))
    const fwdDelta = maxNext - maxInSet
    const bwdDelta = set.length > 1 ? maxInSet - Math.min(...set.map(s => s.z_index)) + 1 : 1

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index + fwdDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    for (const o of nextSet) {
      const newZ = o.z_index - bwdDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index + fwdDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      for (const o of nextSet) {
        const newZ = o.z_index - bwdDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [objects, canEdit, getZOrderSet, queueBroadcast, persistZIndexBatch, stampChange])

  const sendBackward = useCallback((id: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const minInSet = Math.min(...set.map(o => o.z_index))
    const setIds = new Set(set.map(o => o.id))
    const sorted = Array.from(objects.values())
      .filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id)
      .sort((a, b) => b.z_index - a.z_index)
    const nextLower = sorted.find(o => o.z_index < minInSet)
    if (!nextLower) return

    const nextSet = getZOrderSet(nextLower.id)
    const minNext = Math.min(...nextSet.map(o => o.z_index))
    const bwdDelta = minInSet - minNext
    const fwdDelta = set.length > 1 ? Math.max(...set.map(s => s.z_index)) - minInSet + 1 : 1

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index - bwdDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    for (const o of nextSet) {
      const newZ = o.z_index + fwdDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index - bwdDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      for (const o of nextSet) {
        const newZ = o.z_index + fwdDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [objects, canEdit, getZOrderSet, queueBroadcast, persistZIndexBatch, stampChange])

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

    // Persist: insert group first, then update children
    const { id: _id, created_at: _ca, updated_at: _ua, field_clocks: _fc, deleted_at: _da, ...insertData } = groupObj
    const insertRow = CRDT_ENABLED
      ? { ...insertData, id: groupId, field_clocks: fieldClocksRef.current.get(groupId) ?? {} }
      : { ...insertData, id: groupId }
    const { error: insertError } = await supabase
      .from('board_objects')
      .insert(insertRow)
    if (insertError) {
      console.error('Failed to save group:', insertError.message)
      return null
    }

    for (const obj of selectedObjs) {
      const childUpdate: Record<string, unknown> = { parent_id: groupId, updated_at: now }
      if (CRDT_ENABLED) {
        childUpdate.field_clocks = fieldClocksRef.current.get(obj.id) ?? {}
        childUpdate.deleted_at = null
      }
      supabase
        .from('board_objects')
        .update(childUpdate)
        .eq('id', obj.id)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) console.error('Failed to update child parent_id:', error.message)
        })
    }

    return groupObj
  }, [canEdit, selectedIds, objects, boardId, userId, queueBroadcast, stampCreate, stampChange])

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

      if (CRDT_ENABLED) {
        hlcRef.current = tickHLC(hlcRef.current)
        const deleteClock = hlcRef.current
        queueBroadcast([{ action: 'delete', object: { id } as BoardObject, clocks: { _deleted: deleteClock } }])
        supabase
          .from('board_objects')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .then(({ error }: { error: { message: string } | null }) => {
            if (error) console.error('Failed to soft-delete group:', error.message)
          })
      } else {
        fieldClocksRef.current.delete(id)
        queueBroadcast([{ action: 'delete', object: { id } as BoardObject }])
        supabase
          .from('board_objects')
          .delete()
          .eq('id', id)
          .then(({ error }: { error: { message: string } | null }) => {
            if (error) console.error('Failed to delete group:', error.message)
          })
      }
    }
    setSelectedIds(new Set())
  }, [canEdit, selectedIds, objects, getChildren, updateObject, queueBroadcast])

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

  // ── Remote selection broadcasting ───────────────────────────────

  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!channel) return

    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
    selectionTimerRef.current = setTimeout(() => {
      if ((channel as unknown as { state: string }).state !== 'joined') return
      channel.send({
        type: 'broadcast',
        event: 'selection',
        payload: { user_id: userId, selected_ids: Array.from(selectedIds) },
      })
    }, SELECTION_BROADCAST_DEBOUNCE_MS)

    return () => {
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
    }
  }, [selectedIds, channel, userId])

  // Batched remote selection updates (10ms window to coalesce rapid changes)
  const pendingSelectionsRef = useRef<Map<string, string[]>>(new Map())
  const selectionFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushSelections = useCallback(() => {
    const pending = pendingSelectionsRef.current
    if (pending.size === 0) return
    setRemoteSelections(prev => {
      const next = new Map(prev)
      for (const [uid, ids] of pending) {
        if (ids.length === 0) {
          next.delete(uid)
        } else {
          next.set(uid, new Set(ids))
        }
      }
      return next
    })
    pendingSelectionsRef.current = new Map()
    selectionFlushTimerRef.current = null
  }, [])

  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: { user_id: string; selected_ids: string[] } }) => {
      if (payload.user_id === userId) return
      pendingSelectionsRef.current.set(payload.user_id, payload.selected_ids)
      if (!selectionFlushTimerRef.current) {
        selectionFlushTimerRef.current = setTimeout(flushSelections, 10)
      }
    }

    channel.on('broadcast', { event: 'selection' }, handler)
    return () => {
      if (selectionFlushTimerRef.current) {
        clearTimeout(selectionFlushTimerRef.current)
        selectionFlushTimerRef.current = null
      }
    }
  }, [channel, userId, flushSelections])

  // Clean up remote selections when a user leaves
  useEffect(() => {
    if (!onlineUsers) return
    const onlineIds = new Set(onlineUsers.map(u => u.user_id))
    setRemoteSelections(prev => {
      let changed = false
      const next = new Map(prev)
      for (const uid of next.keys()) {
        if (!onlineIds.has(uid)) {
          next.delete(uid)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [onlineUsers])

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
    checkFrameContainment,
    getChildren,
    getDescendants,
    remoteSelections,
    reconcileOnReconnect,
    COLOR_PALETTE,
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
