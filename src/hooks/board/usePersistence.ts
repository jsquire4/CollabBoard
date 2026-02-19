'use client'

import { useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject, BoardObjectType } from '@/types/board'
import { HLC, tickHLC, hlcGreaterThan } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'
import { shapeRegistry } from '@/components/board/shapeRegistry'
import { BoardChange, CRDT_ENABLED } from '@/hooks/board/useBroadcast'

// Explicit column list for board_objects queries (avoids pulling large JSONB when not needed)
export const BOARD_OBJECT_COLUMNS = [
  'id', 'board_id', 'type', 'x', 'y', 'x2', 'y2', 'width', 'height', 'rotation',
  'text', 'color', 'font_size', 'font_family', 'font_style',
  'stroke_width', 'stroke_dash', 'stroke_color',
  'opacity', 'shadow_color', 'shadow_blur', 'shadow_offset_x', 'shadow_offset_y',
  'text_align', 'text_vertical_align', 'text_padding', 'text_color',
  'corner_radius', 'title', 'locked_by',
  'sides', 'custom_points',
  'connect_start_id', 'connect_start_anchor', 'connect_end_id', 'connect_end_anchor', 'waypoints',
  'z_index', 'parent_id', 'created_by', 'created_at', 'updated_at', 'deleted_at',
].join(',')

export const BOARD_OBJECT_SELECT = CRDT_ENABLED
  ? BOARD_OBJECT_COLUMNS + ',field_clocks'
  : BOARD_OBJECT_COLUMNS

// ── Pure helper ─────────────────────────────────────────────────────

/** Walk parent chain to check if object is locked (directly or via ancestor). */
export function checkLocked(objectsRef: React.RefObject<Map<string, BoardObject>>, id: string): boolean {
  let current = objectsRef.current.get(id)
  while (current) {
    if (current.locked_by) return true
    if (!current.parent_id) break
    current = objectsRef.current.get(current.parent_id)
  }
  return false
}

// ── Hook interface ──────────────────────────────────────────────────

export interface UsePersistenceDeps {
  boardId: string
  userId: string
  canEdit: boolean
  supabase: SupabaseClient
  setObjects: React.Dispatch<React.SetStateAction<Map<string, BoardObject>>>
  objectsRef: React.RefObject<Map<string, BoardObject>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  getDescendants: (parentId: string) => BoardObject[]
  getMaxZIndex: () => number
  queueBroadcast: (changes: BoardChange[]) => void
  stampChange: (objectId: string, changedFields: string[]) => FieldClocks | undefined
  stampCreate: (objectId: string, obj: Partial<BoardObject>) => FieldClocks | undefined
  fieldClocksRef: React.RefObject<Map<string, FieldClocks>>
  hlcRef: React.MutableRefObject<HLC>
}

// ── Hook ────────────────────────────────────────────────────────────

export function usePersistence({
  boardId, userId, canEdit, supabase,
  setObjects, objectsRef, setSelectedIds,
  getDescendants, getMaxZIndex,
  queueBroadcast, stampChange, stampCreate,
  fieldClocksRef, hlcRef,
}: UsePersistenceDeps) {
  // Track in-flight insert promises so callers can await persistence before
  // setting FK references (e.g. connect_end_id on a connector pointing at a
  // shape that was just created).
  const persistPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map())
  const waitForPersist = useCallback((id: string): Promise<boolean> => {
    return persistPromisesRef.current.get(id) ?? Promise.resolve(true)
  }, [])

  // ── Load ────────────────────────────────────────────────────────

  const loadObjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('board_objects')
      .select(BOARD_OBJECT_SELECT)
      .eq('board_id', boardId)
      .is('deleted_at', null) as unknown as { data: (BoardObject & { field_clocks?: FieldClocks })[] | null; error: { message: string } | null }

    if (error) {
      console.error('Failed to load board objects:', error.message)
      return
    }

    const map = new Map<string, BoardObject>()
    const clocksMap = new Map<string, FieldClocks>()
    for (const obj of data ?? []) {
      map.set(obj.id, obj as BoardObject)
      if (CRDT_ENABLED && obj.field_clocks && typeof obj.field_clocks === 'object') {
        clocksMap.set(obj.id, obj.field_clocks as FieldClocks)
      }
    }
    setObjects(map)
    if (CRDT_ENABLED) {
      fieldClocksRef.current = clocksMap
    }
  }, [boardId])

  // ── Reconcile on reconnect (CRDT Phase 3) ─────────────────────

  const reconcileOnReconnect = useCallback(async () => {
    if (!CRDT_ENABLED) return

    const { data: dbObjects, error } = await supabase
      .from('board_objects')
      .select('id, field_clocks')
      .eq('board_id', boardId)
      .is('deleted_at', null)

    if (error) {
      console.error('Failed to fetch DB state for reconciliation:', error.message)
      return
    }

    const dbClocksMap = new Map<string, FieldClocks>()
    for (const row of dbObjects ?? []) {
      dbClocksMap.set(row.id, (row.field_clocks ?? {}) as FieldClocks)
    }

    const localWins: {
      action: 'update'
      objectId: string
      fields: Record<string, unknown>
      clocks: FieldClocks
    }[] = []

    const currentObjects = objectsRef.current
    for (const [id, localClocks] of fieldClocksRef.current) {
      const dbClocks = dbClocksMap.get(id) ?? {}
      const localObj = currentObjects.get(id)
      if (!localObj) continue

      const winningFields: Record<string, unknown> = {}
      const winningClocks: FieldClocks = {}

      for (const [field, localClock] of Object.entries(localClocks)) {
        const dbClock = dbClocks[field]
        if (!dbClock || hlcGreaterThan(localClock, dbClock)) {
          const value = (localObj as unknown as Record<string, unknown>)[field]
          if (value !== undefined) {
            winningFields[field] = value
            winningClocks[field] = localClock
          }
        }
      }

      if (Object.keys(winningFields).length > 0) {
        localWins.push({
          action: 'update',
          objectId: id,
          fields: winningFields,
          clocks: winningClocks,
        })
      }
    }

    if (localWins.length > 0) {
      const { error: fnError } = await supabase.functions.invoke('merge-board-state', {
        body: { boardId, changes: localWins },
      })
      if (fnError) {
        console.error('Failed to reconcile on reconnect:', fnError.message)
      }
    }

    await loadObjects()
  }, [boardId, loadObjects])

  // ── Add ─────────────────────────────────────────────────────────

  const addObject = useCallback((
    type: BoardObjectType,
    x: number,
    y: number,
    overrides?: Partial<BoardObject>
  ) => {
    if (!canEdit) return null as unknown as BoardObject

    const id = uuidv4()
    const now = new Date().toISOString()

    // Build defaults from shape registry + manual entries for non-registry types
    const manualDefaults: Record<string, Partial<BoardObject>> = {
      sticky_note: { width: 150, height: 150, color: '#FFEB3B', text: '', font_size: 14, font_family: 'sans-serif', font_style: 'normal' },
      frame: { width: 400, height: 300, color: 'rgba(200,200,200,0.3)', text: 'Frame' },
      group: { width: 0, height: 0, color: 'transparent', text: '' },
      line: { width: 120, height: 2, color: '#374151', stroke_width: 2, stroke_dash: undefined },
      arrow: { width: 120, height: 40, color: '#F59E0B', stroke_width: 2, text: '' },
    }
    const def = shapeRegistry.get(type)
    const defaults: Record<string, Partial<BoardObject>> = {
      ...manualDefaults,
      ...(def ? { [type]: { width: def.defaultWidth, height: def.defaultHeight, color: def.defaultColor, ...def.defaultOverrides } } : {}),
    }

    // For vector types, compute x2/y2 from x + default width/height
    if (type === 'line' || type === 'arrow') {
      const dw = defaults[type]?.width ?? 120
      const dh = defaults[type]?.height ?? 0
      defaults[type] = { ...defaults[type], x2: x + dw, y2: y + dh }
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

    // Stamp clocks before insert so we can persist them
    const clocks = stampCreate(id, obj)

    setObjects(prev => {
      const next = new Map(prev)
      next.set(id, obj)
      return next
    })

    // Persist to Supabase, then broadcast on success
    const { id: _id, created_at: _ca, updated_at: _ua, field_clocks: _fc, deleted_at: _da, ...insertData } = obj
    const insertRow = CRDT_ENABLED
      ? { ...insertData, id: obj.id, field_clocks: fieldClocksRef.current.get(id) ?? {} }
      : { ...insertData, id: obj.id }
    const insertPromise = Promise.resolve(supabase
      .from('board_objects')
      .insert(insertRow)
      .then(({ error }: { error: { message: string } | null }) => {
        persistPromisesRef.current.delete(id)
        if (error) {
          console.error('Failed to save object:', error.message)
          setObjects(prev => { const next = new Map(prev); next.delete(id); return next })
          fieldClocksRef.current.delete(id)
          return false
        } else {
          queueBroadcast([{ action: 'create', object: obj, clocks }])
          return true
        }
      }))
    persistPromisesRef.current.set(id, insertPromise)

    return obj
  }, [userId, boardId, canEdit, getMaxZIndex, queueBroadcast, stampCreate])

  // ── Add with explicit ID (for undo-delete) ─────────────────────

  const addObjectWithId = useCallback((obj: BoardObject) => {
    if (!canEdit) return

    const clocks = stampCreate(obj.id, obj)

    setObjects(prev => {
      const next = new Map(prev)
      next.set(obj.id, { ...obj, updated_at: new Date().toISOString() })
      return next
    })

    const { id: _id, created_at: _ca, updated_at: _ua, field_clocks: _fc, deleted_at: _da, ...insertData } = obj
    const insertRow = CRDT_ENABLED
      ? { ...insertData, id: obj.id, field_clocks: fieldClocksRef.current.get(obj.id) ?? {} }
      : { ...insertData, id: obj.id }
    supabase
      .from('board_objects')
      .upsert(insertRow, { onConflict: 'id' })
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.error('Failed to re-insert object:', error.message)
          setObjects(prev => { const next = new Map(prev); next.delete(obj.id); return next })
          fieldClocksRef.current.delete(obj.id)
        } else {
          queueBroadcast([{ action: 'create', object: obj, clocks }])
        }
      })
  }, [canEdit, queueBroadcast, stampCreate])

  // ── Update ──────────────────────────────────────────────────────

  const updateObject = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return

    // Lock guard: block mutations on locked objects (except lock/unlock itself)
    if (!('locked_by' in updates)) {
      if (checkLocked(objectsRef, id)) return
    }

    // Capture previous state for rollback
    const previousObj = objectsRef.current.get(id)

    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
      return next
    })

    // Stamp clocks for changed fields
    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at')
    const clocks = stampChange(id, changedFields)

    // Persist to Supabase, then broadcast on success
    const dbUpdate: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
    if (CRDT_ENABLED) {
      dbUpdate.field_clocks = fieldClocksRef.current.get(id) ?? {}
      dbUpdate.deleted_at = null // Clear tombstone — add-wins: any update resurrects
    }
    supabase
      .from('board_objects')
      .update(dbUpdate)
      .eq('id', id)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.error('Failed to update object:', error.message)
          if (previousObj) {
            setObjects(prev => { const next = new Map(prev); next.set(id, previousObj); return next })
          }
        } else {
          queueBroadcast([{ action: 'update', object: { id, ...updates }, clocks }])
        }
      })
  }, [canEdit, queueBroadcast, stampChange])

  // ── Delete ──────────────────────────────────────────────────────

  const deleteObject = useCallback(async (id: string) => {
    if (!canEdit) return

    // Lock guard
    if (checkLocked(objectsRef, id)) return

    // Also delete all descendants
    const descendants = getDescendants(id)
    const idsToDelete = [id, ...descendants.map(d => d.id)]

    // Stamp a delete clock (used for add-wins comparison on remote)
    const deleteClock = CRDT_ENABLED ? (() => {
      hlcRef.current = tickHLC(hlcRef.current)
      return hlcRef.current
    })() : undefined

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

    if (CRDT_ENABLED) {
      const now = new Date().toISOString()
      const results = await Promise.all(
        idsToDelete.map(did =>
          supabase.from('board_objects').update({ deleted_at: now }).eq('id', did)
        )
      )
      const failed = results.some(r => r.error)
      if (failed) {
        results.filter(r => r.error).forEach(r => console.error('Failed to soft-delete object:', r.error!.message))
      } else {
        queueBroadcast(idsToDelete.map(did => ({
          action: 'delete' as const,
          object: { id: did } as BoardObject,
          clocks: deleteClock ? { _deleted: deleteClock } : undefined,
        })))
      }
    } else {
      // Hard-delete: children first (parallel), then parent (FK constraint)
      const childIds = descendants.map(d => d.id)
      if (childIds.length > 0) {
        const childResults = await Promise.all(
          childIds.map(did => supabase.from('board_objects').delete().eq('id', did))
        )
        const childFailed = childResults.some(r => r.error)
        if (childFailed) {
          childResults.filter(r => r.error).forEach(r => console.error('Failed to delete object:', r.error!.message))
          return
        }
      }
      const { error } = await supabase.from('board_objects').delete().eq('id', id)
      if (error) {
        console.error('Failed to delete object:', error.message)
      } else {
        queueBroadcast(idsToDelete.map(did => ({ action: 'delete' as const, object: { id: did } as BoardObject })))
      }
    }
  }, [canEdit, getDescendants, queueBroadcast])

  // ── Duplicate ─────────────────────────────────────────────────

  const duplicateObject = useCallback((id: string) => {
    if (!canEdit) return null

    const original = objectsRef.current.get(id)
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
        const cloned: BoardObject = {
          ...d,
          id: idMap.get(d.id)!,
          x: d.x + 20,
          y: d.y + 20,
          z_index: d.z_index,
          parent_id: d.parent_id ? idMap.get(d.parent_id) ?? null : null,
          created_by: userId,
          created_at: now,
          updated_at: now,
        }
        if (d.x2 != null) cloned.x2 = d.x2 + 20
        if (d.y2 != null) cloned.y2 = d.y2 + 20
        newObjects.push(cloned)
      }

      setObjects(prev => {
        const next = new Map(prev)
        for (const obj of newObjects) {
          next.set(obj.id, obj)
        }
        return next
      })

      queueBroadcast(newObjects.map(obj => ({
        action: 'create' as const,
        object: obj,
        clocks: stampCreate(obj.id, obj),
      })))

      // Persist: insert parent first (await), then children
      const parentObj = newObjects[0]
      const childObjs = newObjects.slice(1)
      const { id: _pid, created_at: _pca, updated_at: _pua, field_clocks: _pfc, deleted_at: _pda, ...parentInsert } = parentObj
      const parentRow = CRDT_ENABLED
        ? { ...parentInsert, id: parentObj.id, field_clocks: fieldClocksRef.current.get(parentObj.id) ?? {} }
        : { ...parentInsert, id: parentObj.id }
      supabase
        .from('board_objects')
        .insert(parentRow)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) {
            console.error('Failed to save duplicated parent:', error.message)
            return
          }
          for (const obj of childObjs) {
            const { id: _cid, created_at: _cca, updated_at: _cua, field_clocks: _cfc, deleted_at: _cda, ...childInsert } = obj
            const childRow = CRDT_ENABLED
              ? { ...childInsert, id: obj.id, field_clocks: fieldClocksRef.current.get(obj.id) ?? {} }
              : { ...childInsert, id: obj.id }
            supabase
              .from('board_objects')
              .insert(childRow)
              .then(({ error: childErr }: { error: { message: string } | null }) => {
                if (childErr) console.error('Failed to save duplicated child:', childErr.message)
              })
          }
        })

      setSelectedIds(new Set([groupId]))
      return newObjects[0]
    }

    // Simple object duplication — clone all visual properties
    const { id: _oid, board_id: _obid, created_by: _ocb, created_at: _oca, updated_at: _oua, field_clocks: _ofc, deleted_at: _oda, type: _otype, x: _ox, y: _oy, z_index: _oz, ...visualProps } = original
    const dupOverrides: Partial<BoardObject> = { ...visualProps }
    if (original.x2 != null) dupOverrides.x2 = original.x2 + 20
    if (original.y2 != null) dupOverrides.y2 = original.y2 + 20
    const newObj = addObject(original.type, original.x + 20, original.y + 20, dupOverrides)
    if (newObj) setSelectedIds(new Set([newObj.id]))
    return newObj
  }, [addObject, canEdit, getDescendants, getMaxZIndex, userId, queueBroadcast, stampCreate])

  // ── Persist Z-index batch ─────────────────────────────────────

  const persistZIndexBatch = useCallback((updates: { id: string; z_index: number }[], now: string) => {
    Promise.all(updates.map(u => {
      const patch: Record<string, unknown> = { z_index: u.z_index, updated_at: now }
      if (CRDT_ENABLED) {
        patch.field_clocks = fieldClocksRef.current.get(u.id) ?? {}
        patch.deleted_at = null
      }
      return supabase.from('board_objects').update(patch).eq('id', u.id)
    })).then(results => {
      for (const { error } of results) {
        if (error) console.error('Failed to update z_index:', error.message)
      }
    })
  }, [])

  // ── Drag (no DB) ──────────────────────────────────────────────

  const updateObjectDrag = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    if (checkLocked(objectsRef, id)) return

    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
      return next
    })

    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at')
    const clocks = stampChange(id, changedFields)
    queueBroadcast([{ action: 'update', object: { id, ...updates }, clocks }])
  }, [canEdit, queueBroadcast, stampChange])

  // ── Drag end (with DB) ────────────────────────────────────────

  const updateObjectDragEnd = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    if (checkLocked(objectsRef, id)) return

    const now = new Date().toISOString()
    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: now })
      return next
    })

    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at')
    const clocks = stampChange(id, changedFields)
    queueBroadcast([{ action: 'update', object: { id, ...updates }, clocks }])

    const dbUpdate: Record<string, unknown> = { ...updates, updated_at: now }
    if (CRDT_ENABLED) {
      dbUpdate.field_clocks = fieldClocksRef.current.get(id) ?? {}
      dbUpdate.deleted_at = null
    }
    supabase
      .from('board_objects')
      .update(dbUpdate)
      .eq('id', id)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error('Failed to update object:', error.message)
      })
  }, [canEdit, queueBroadcast, stampChange])

  // ── Move group children ───────────────────────────────────────

  const moveGroupChildren = useCallback((parentId: string, dx: number, dy: number, skipDb = false) => {
    if (!canEdit) return
    const descendants = getDescendants(parentId)
    if (descendants.length === 0) return

    const now = new Date().toISOString()
    const changes: BoardChange[] = []

    const translateWaypoints = (wp: string | null | undefined): string | null => {
      if (!wp) return null
      try {
        const pts: number[] = JSON.parse(wp)
        if (!Array.isArray(pts) || pts.length < 2 || pts.length % 2 !== 0) return null
        const translated: number[] = []
        for (let i = 0; i < pts.length; i += 2) {
          translated.push(pts[i] + dx, pts[i + 1] + dy)
        }
        return JSON.stringify(translated)
      } catch { return null }
    }

    for (const d of descendants) {
      const hasEndpoints = d.x2 != null && d.y2 != null
      const fields = hasEndpoints ? ['x', 'y', 'x2', 'y2'] : ['x', 'y']
      if (d.waypoints) fields.push('waypoints')
      const clocks = stampChange(d.id, fields)
      const update: Partial<BoardObject> & { id: string } = { id: d.id, x: d.x + dx, y: d.y + dy }
      if (hasEndpoints) { update.x2 = d.x2! + dx; update.y2 = d.y2! + dy }
      if (d.waypoints) { update.waypoints = translateWaypoints(d.waypoints) }
      changes.push({ action: 'update', object: update, clocks })
    }

    setObjects(prev => {
      const next = new Map(prev)
      for (const d of descendants) {
        const existing = next.get(d.id)
        if (existing) {
          const updated = { ...existing, x: existing.x + dx, y: existing.y + dy, updated_at: now }
          if (existing.x2 != null) updated.x2 = existing.x2 + dx
          if (existing.y2 != null) updated.y2 = existing.y2 + dy
          if (existing.waypoints) updated.waypoints = translateWaypoints(existing.waypoints)
          next.set(d.id, updated)
        }
      }
      return next
    })

    queueBroadcast(changes)

    if (!skipDb) {
      Promise.all(descendants.map(d => {
        const patch: Record<string, unknown> = { x: d.x + dx, y: d.y + dy, updated_at: now }
        if (d.x2 != null) patch.x2 = d.x2 + dx
        if (d.y2 != null) patch.y2 = d.y2 + dy
        if (d.waypoints) patch.waypoints = translateWaypoints(d.waypoints)
        if (CRDT_ENABLED) {
          patch.field_clocks = fieldClocksRef.current.get(d.id) ?? {}
          patch.deleted_at = null
        }
        return supabase.from('board_objects').update(patch).eq('id', d.id)
      })).then(results => {
        for (const { error } of results) {
          if (error) console.error('Failed to update child position:', error.message)
        }
      })
    }
  }, [canEdit, getDescendants, queueBroadcast, stampChange])

  return {
    loadObjects,
    reconcileOnReconnect,
    addObject,
    addObjectWithId,
    updateObject,
    deleteObject,
    duplicateObject,
    persistZIndexBatch,
    updateObjectDrag,
    updateObjectDragEnd,
    moveGroupChildren,
    waitForPersist,
  }
}
