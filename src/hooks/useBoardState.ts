'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { RealtimeChannel } from '@supabase/supabase-js'
import { BoardObject, BoardObjectType } from '@/types/board'
import { BoardRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'
import { OnlineUser } from '@/hooks/usePresence'

interface BoardChange {
  action: 'create' | 'update' | 'delete'
  object: Partial<BoardObject> & { id: string }
}

const COLOR_PALETTE = ['#FFEB3B', '#FF9800', '#E91E63', '#9C27B0', '#2196F3', '#4CAF50']

const SELECTION_BROADCAST_DEBOUNCE_MS = 100

export function useBoardState(userId: string, boardId: string, userRole: BoardRole = 'viewer', channel?: RealtimeChannel | null, onlineUsers?: OnlineUser[]) {
  const [objects, setObjects] = useState<Map<string, BoardObject>>(new Map())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [remoteSelections, setRemoteSelections] = useState<Map<string, Set<string>>>(new Map())
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const canEdit = userRole !== 'viewer'

  // Extracted so it can be called on mount and on reconnect
  const loadObjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('board_objects')
      .select('*')
      .eq('board_id', boardId)

    if (error) {
      console.error('Failed to load board objects:', error.message)
      return
    }

    const map = new Map<string, BoardObject>()
    for (const obj of data ?? []) {
      map.set(obj.id, obj as BoardObject)
    }
    setObjects(map)
  }, [boardId])

  // Load on mount
  useEffect(() => {
    loadObjects()
  }, [loadObjects])

  // Broadcast helper — sends changes to other clients
  const broadcastChanges = useCallback((changes: BoardChange[]) => {
    if (!channel) return
    channel.send({
      type: 'broadcast',
      event: 'board:sync',
      payload: { changes, sender_id: userId },
    })
  }, [channel, userId])

  // Listen for incoming object sync broadcasts
  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: { changes: BoardChange[]; sender_id: string } }) => {
      if (payload.sender_id === userId) return

      setObjects(prev => {
        const next = new Map(prev)
        for (const change of payload.changes) {
          switch (change.action) {
            case 'create':
              next.set(change.object.id, change.object as BoardObject)
              break
            case 'update': {
              const existing = next.get(change.object.id)
              if (existing) {
                next.set(change.object.id, { ...existing, ...change.object })
              }
              break
            }
            case 'delete':
              next.delete(change.object.id)
              break
          }
        }
        return next
      })
    }

    channel.on('broadcast', { event: 'board:sync' }, handler)

    // No cleanup needed — Supabase channel listeners are removed when the
    // channel itself is removed (in useRealtimeChannel's cleanup).
  }, [channel, userId])

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

  // Helper: get children of a group/frame
  const getChildren = useCallback((parentId: string): BoardObject[] => {
    const children: BoardObject[] = []
    for (const obj of objects.values()) {
      if (obj.parent_id === parentId) children.push(obj)
    }
    return children
  }, [objects])

  // Helper: get all descendants recursively
  const getDescendants = useCallback((parentId: string): BoardObject[] => {
    const result: BoardObject[] = []
    const stack = [parentId]
    while (stack.length > 0) {
      const pid = stack.pop()!
      for (const obj of objects.values()) {
        if (obj.parent_id === pid) {
          result.push(obj)
          stack.push(obj.id)
        }
      }
    }
    return result
  }, [objects])

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

  const addObject = useCallback((
    type: BoardObjectType,
    x: number,
    y: number,
    overrides?: Partial<BoardObject>
  ) => {
    if (!canEdit) return null as unknown as BoardObject

    const id = uuidv4()
    const now = new Date().toISOString()

    const defaults: Record<string, Partial<BoardObject>> = {
      sticky_note: { width: 150, height: 150, color: '#FFEB3B', text: '' },
      rectangle: { width: 200, height: 140, color: '#2196F3', text: '' },
      circle: { width: 120, height: 120, color: '#4CAF50', text: '' },
      frame: { width: 400, height: 300, color: 'rgba(200,200,200,0.3)', text: 'Frame' },
      group: { width: 0, height: 0, color: 'transparent', text: '' },
    }

    const obj: BoardObject = {
      id,
      board_id: boardId,
      type,
      x,
      y,
      width: 150,
      height: 150,
      rotation: 0,
      text: '',
      color: '#FFEB3B',
      font_size: 14,
      z_index: getMaxZIndex() + 1,
      parent_id: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
      ...defaults[type],
      ...overrides,
    }

    setObjects(prev => {
      const next = new Map(prev)
      next.set(id, obj)
      return next
    })

    // Persist to Supabase, then broadcast on success
    const { id: _id, created_at, updated_at, ...insertData } = obj
    supabase
      .from('board_objects')
      .insert({ ...insertData, id: obj.id })
      .then(({ error }) => {
        if (error) {
          console.error('Failed to save object:', error.message)
          // Rollback optimistic update
          setObjects(prev => { const next = new Map(prev); next.delete(id); return next })
        } else {
          broadcastChanges([{ action: 'create', object: obj }])
        }
      })

    return obj
  }, [userId, boardId, canEdit, getMaxZIndex, broadcastChanges])

  const updateObject = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return

    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
      return next
    })

    // Persist to Supabase, then broadcast on success
    supabase
      .from('board_objects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          console.error('Failed to update object:', error.message)
        } else {
          broadcastChanges([{ action: 'update', object: { id, ...updates } }])
        }
      })
  }, [canEdit, broadcastChanges])

  const deleteObject = useCallback(async (id: string) => {
    if (!canEdit) return

    // Also delete all descendants
    const descendants = getDescendants(id)
    const idsToDelete = [id, ...descendants.map(d => d.id)]

    // Optimistic local update
    setObjects(prev => {
      const next = new Map(prev)
      for (const did of idsToDelete) {
        next.delete(did)
      }
      return next
    })
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const did of idsToDelete) {
        next.delete(did)
      }
      return next
    })

    // Persist — delete descendants first (leaves before parents for FK ordering)
    const orderedIds = [...descendants.map(d => d.id).reverse(), id]
    let failed = false
    for (const did of orderedIds) {
      const { error } = await supabase
        .from('board_objects')
        .delete()
        .eq('id', did)
      if (error) {
        console.error('Failed to delete object:', error.message)
        failed = true
        break
      }
    }

    if (!failed) {
      broadcastChanges(idsToDelete.map(did => ({ action: 'delete' as const, object: { id: did } as BoardObject })))
    }
  }, [canEdit, getDescendants, broadcastChanges])

  const deleteSelected = useCallback(() => {
    if (!canEdit) return
    for (const id of selectedIds) {
      deleteObject(id)
    }
  }, [selectedIds, deleteObject, canEdit])

  const duplicateObject = useCallback((id: string) => {
    if (!canEdit) return null

    const original = objects.get(id)
    if (!original) return null

    // If it's a group, duplicate group + all descendants
    if (original.type === 'group' || original.type === 'frame') {
      const descendants = getDescendants(id)
      const idMap = new Map<string, string>() // old id -> new id
      const groupId = uuidv4()
      idMap.set(id, groupId)
      for (const d of descendants) {
        idMap.set(d.id, uuidv4())
      }

      const now = new Date().toISOString()
      const newObjects: BoardObject[] = []

      // Clone the group/frame itself
      newObjects.push({
        ...original,
        id: groupId,
        x: original.x + 20,
        y: original.y + 20,
        z_index: getMaxZIndex() + 1,
        parent_id: original.parent_id,
        created_by: userId,
        created_at: now,
        updated_at: now,
      })

      // Clone descendants
      for (const d of descendants) {
        newObjects.push({
          ...d,
          id: idMap.get(d.id)!,
          x: d.x + 20,
          y: d.y + 20,
          z_index: d.z_index,
          parent_id: d.parent_id ? idMap.get(d.parent_id) ?? null : null,
          created_by: userId,
          created_at: now,
          updated_at: now,
        })
      }

      setObjects(prev => {
        const next = new Map(prev)
        for (const obj of newObjects) {
          next.set(obj.id, obj)
        }
        return next
      })

      broadcastChanges(newObjects.map(obj => ({ action: 'create' as const, object: obj })))

      // Persist: insert parent first (await), then children
      const parentObj = newObjects[0]
      const childObjs = newObjects.slice(1)
      const { id: _pid, created_at: _pca, updated_at: _pua, ...parentInsert } = parentObj
      supabase
        .from('board_objects')
        .insert({ ...parentInsert, id: parentObj.id })
        .then(({ error }) => {
          if (error) {
            console.error('Failed to save duplicated parent:', error.message)
            return
          }
          // Now safe to insert children
          for (const obj of childObjs) {
            const { id: _cid, created_at: _cca, updated_at: _cua, ...childInsert } = obj
            supabase
              .from('board_objects')
              .insert({ ...childInsert, id: obj.id })
              .then(({ error: childErr }) => {
                if (childErr) console.error('Failed to save duplicated child:', childErr.message)
              })
          }
        })

      setSelectedIds(new Set([groupId]))
      return newObjects[0]
    }

    // Simple object duplication
    const newObj = addObject(original.type, original.x + 20, original.y + 20, {
      color: original.color,
      width: original.width,
      height: original.height,
      rotation: original.rotation,
      text: original.text,
      font_size: original.font_size,
      parent_id: original.parent_id,
    })
    if (newObj) setSelectedIds(new Set([newObj.id]))
    return newObj
  }, [objects, addObject, canEdit, getDescendants, getMaxZIndex, userId, broadcastChanges])

  const duplicateSelected = useCallback(() => {
    if (!canEdit) return
    const ids = Array.from(selectedIds)
    if (ids.length === 1) {
      duplicateObject(ids[0])
    } else if (ids.length > 1) {
      // Duplicate each selected object
      const newIds: string[] = []
      for (const id of ids) {
        const newObj = duplicateObject(id)
        if (newObj) newIds.push(newObj.id)
      }
      setSelectedIds(new Set(newIds))
    }
  }, [selectedIds, duplicateObject, canEdit])

  // Selection
  const selectObject = useCallback((id: string | null, opts?: { shift?: boolean; ctrl?: boolean }) => {
    if (id === null) {
      setSelectedIds(new Set())
      setActiveGroupId(null)
      return
    }

    const obj = objects.get(id)

    // If the shape belongs to a group/frame, single-click always selects the
    // top-level container (even if we're currently inside the group).
    // Individual shape selection only happens via double-click (enterGroup).
    if (obj?.parent_id) {
      const parent = objects.get(obj.parent_id)
      if (parent && (parent.type === 'group' || parent.type === 'frame')) {
        // Exit group mode if we were inside
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

  // Enter group mode (double-click on a group/frame).
  // Optionally select a specific child shape immediately.
  const enterGroup = useCallback((groupId: string, selectChildId?: string) => {
    const obj = objects.get(groupId)
    if (!obj || (obj.type !== 'group' && obj.type !== 'frame')) return
    setActiveGroupId(groupId)
    setSelectedIds(selectChildId ? new Set([selectChildId]) : new Set())
  }, [objects])

  // Exit group mode
  const exitGroup = useCallback(() => {
    setActiveGroupId(null)
    setSelectedIds(new Set())
  }, [])

  // Helper: get all IDs that should move together (object + descendants if group/frame)
  const getZOrderSet = useCallback((id: string): BoardObject[] => {
    const obj = objects.get(id)
    if (!obj) return []
    if (obj.type === 'group' || obj.type === 'frame') {
      return [obj, ...getDescendants(id)]
    }
    return [obj]
  }, [objects, getDescendants])

  // Z-ordering — shifts the whole group/frame set by the same delta to preserve internal order
  const bringToFront = useCallback((id: string) => {
    if (!canEdit) return
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const maxZ = getMaxZIndex()
    const minInSet = Math.min(...set.map(o => o.z_index))
    const delta = maxZ - minInSet + 1
    for (const o of set) {
      updateObject(o.id, { z_index: o.z_index + delta })
    }
  }, [canEdit, getZOrderSet, getMaxZIndex, updateObject])

  const sendToBack = useCallback((id: string) => {
    if (!canEdit) return
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const minZ = getMinZIndex()
    const maxInSet = Math.max(...set.map(o => o.z_index))
    const delta = maxInSet - minZ + 1
    for (const o of set) {
      updateObject(o.id, { z_index: o.z_index - delta })
    }
  }, [canEdit, getZOrderSet, getMinZIndex, updateObject])

  const bringForward = useCallback((id: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const maxInSet = Math.max(...set.map(o => o.z_index))
    // Find the next higher object outside this set
    const setIds = new Set(set.map(o => o.id))
    const sorted = Array.from(objects.values())
      .filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id)
      .sort((a, b) => a.z_index - b.z_index)
    const nextHigher = sorted.find(o => o.z_index > maxInSet)
    if (nextHigher) {
      const nextSet = getZOrderSet(nextHigher.id)
      const maxNext = Math.max(...nextSet.map(o => o.z_index))
      const delta = maxNext - maxInSet
      for (const o of set) {
        updateObject(o.id, { z_index: o.z_index + delta })
      }
      for (const o of nextSet) {
        updateObject(o.id, { z_index: o.z_index - (set.length > 1 ? maxInSet - Math.min(...set.map(s => s.z_index)) + 1 : 1) })
      }
    }
  }, [objects, canEdit, getZOrderSet, updateObject])

  const sendBackward = useCallback((id: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const minInSet = Math.min(...set.map(o => o.z_index))
    // Find the next lower object outside this set
    const setIds = new Set(set.map(o => o.id))
    const sorted = Array.from(objects.values())
      .filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id)
      .sort((a, b) => b.z_index - a.z_index)
    const nextLower = sorted.find(o => o.z_index < minInSet)
    if (nextLower) {
      const nextSet = getZOrderSet(nextLower.id)
      const minNext = Math.min(...nextSet.map(o => o.z_index))
      const delta = minInSet - minNext
      for (const o of set) {
        updateObject(o.id, { z_index: o.z_index - delta })
      }
      for (const o of nextSet) {
        updateObject(o.id, { z_index: o.z_index + (set.length > 1 ? Math.max(...set.map(s => s.z_index)) - minInSet + 1 : 1) })
      }
    }
  }, [objects, canEdit, getZOrderSet, updateObject])

  // Group selected objects
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

    // Optimistic local update: add group + set parent_id on children
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

    broadcastChanges([
      { action: 'create', object: groupObj },
      ...selectedObjs.map(obj => ({
        action: 'update' as const,
        object: { id: obj.id, parent_id: groupId } as Partial<BoardObject> & { id: string },
      })),
    ])

    // Persist: insert group first, then update children
    const { id: _id, created_at, updated_at, ...insertData } = groupObj
    const { error: insertError } = await supabase
      .from('board_objects')
      .insert({ ...insertData, id: groupId })
    if (insertError) {
      console.error('Failed to save group:', insertError.message)
      return null
    }

    for (const obj of selectedObjs) {
      supabase
        .from('board_objects')
        .update({ parent_id: groupId, updated_at: now })
        .eq('id', obj.id)
        .then(({ error }) => {
          if (error) console.error('Failed to update child parent_id:', error.message)
        })
    }

    return groupObj
  }, [canEdit, selectedIds, objects, boardId, userId, broadcastChanges])

  // Ungroup: dissolve a group, freeing its children
  const ungroupSelected = useCallback(() => {
    if (!canEdit) return
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj || obj.type !== 'group') continue
      const children = getChildren(id)
      for (const child of children) {
        updateObject(child.id, { parent_id: obj.parent_id })
      }
      // Delete the group object itself
      setObjects(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      broadcastChanges([{ action: 'delete', object: { id } as BoardObject }])
      supabase
        .from('board_objects')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('Failed to delete group:', error.message)
        })
    }
    setSelectedIds(new Set())
  }, [canEdit, selectedIds, objects, getChildren, updateObject, broadcastChanges])

  // Move group/frame: move all children by delta (batched — single state update + single broadcast)
  const moveGroupChildren = useCallback((parentId: string, dx: number, dy: number) => {
    if (!canEdit) return
    const descendants = getDescendants(parentId)
    if (descendants.length === 0) return

    const now = new Date().toISOString()
    const changes: BoardChange[] = []

    setObjects(prev => {
      const next = new Map(prev)
      for (const d of descendants) {
        const existing = next.get(d.id)
        if (existing) {
          const updated = { ...existing, x: existing.x + dx, y: existing.y + dy, updated_at: now }
          next.set(d.id, updated)
          changes.push({ action: 'update', object: { id: d.id, x: updated.x, y: updated.y } })
        }
      }
      return next
    })

    broadcastChanges(changes)

    // Persist each update to Supabase
    for (const d of descendants) {
      supabase
        .from('board_objects')
        .update({ x: d.x + dx, y: d.y + dy, updated_at: now })
        .eq('id', d.id)
        .then(({ error }) => {
          if (error) console.error('Failed to update child position:', error.message)
        })
    }
  }, [canEdit, getDescendants, broadcastChanges])

  // Frame containment: check if an object should be inside a frame after drag
  const checkFrameContainment = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj || obj.type === 'frame') return

    const centerX = obj.x + obj.width / 2
    const centerY = obj.y + obj.height / 2

    // Find frames that contain this object's center
    let bestFrame: BoardObject | null = null
    let bestZIndex = -Infinity
    for (const frame of objects.values()) {
      if (frame.type !== 'frame' || frame.id === id) continue
      if (
        centerX >= frame.x &&
        centerX <= frame.x + frame.width &&
        centerY >= frame.y &&
        centerY <= frame.y + frame.height &&
        frame.z_index > bestZIndex
      ) {
        bestFrame = frame
        bestZIndex = frame.z_index
      }
    }

    const newParentId = bestFrame?.id ?? null
    if (obj.parent_id !== newParentId) {
      // Only update parent if the parent is a frame (don't break group membership)
      const currentParent = obj.parent_id ? objects.get(obj.parent_id) : null
      if (!currentParent || currentParent.type === 'frame') {
        updateObject(id, { parent_id: newParentId })
      }
    }
  }, [objects, updateObject])

  // Broadcast local selection changes to remote users (debounced)
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!channel) return

    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
    selectionTimerRef.current = setTimeout(() => {
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

  // Listen for incoming remote selection broadcasts
  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: { user_id: string; selected_ids: string[] } }) => {
      if (payload.user_id === userId) return
      setRemoteSelections(prev => {
        const next = new Map(prev)
        if (payload.selected_ids.length === 0) {
          next.delete(payload.user_id)
        } else {
          next.set(payload.user_id, new Set(payload.selected_ids))
        }
        return next
      })
    }

    channel.on('broadcast', { event: 'selection' }, handler)
  }, [channel, userId])

  // Clean up remote selections when a user leaves (no longer in onlineUsers)
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

  // Computed: sorted objects by z_index
  const sortedObjects = useMemo(() => {
    return Array.from(objects.values()).sort((a, b) => a.z_index - b.z_index)
  }, [objects])

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
    checkFrameContainment,
    getChildren,
    getDescendants,
    remoteSelections,
    COLOR_PALETTE,
  }
}
