'use client'

import { useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject, BoardObjectType } from '@/types/board'
import { HLC, tickHLC, hlcGreaterThan } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'
import { shapeRegistry } from '@/components/board/shapeRegistry'
import { BoardChange, CRDT_ENABLED } from '@/hooks/board/useBroadcast'
import { fireAndRetry, retryWithRollback } from '@/lib/retryWithRollback'
import { BoardLogger } from '@/lib/logger'
import { createDefaultTableData, serializeTableData } from '@/lib/table/tableUtils'

// Explicit column list for board_objects queries (avoids pulling large JSONB when not needed)
const BOARD_OBJECT_COLUMNS = [
  'id', 'board_id', 'type', 'x', 'y', 'x2', 'y2', 'width', 'height', 'rotation',
  'text', 'color', 'font_size', 'font_family', 'font_style',
  'stroke_width', 'stroke_dash', 'stroke_color',
  'opacity', 'shadow_color', 'shadow_blur', 'shadow_offset_x', 'shadow_offset_y',
  'text_align', 'text_vertical_align', 'text_padding', 'text_color',
  'corner_radius', 'title', 'rich_text', 'locked_by',
  'sides', 'custom_points',
  'connect_start_id', 'connect_start_anchor', 'connect_end_id', 'connect_end_anchor', 'waypoints',
  'marker_start', 'marker_end', 'table_data',
  'storage_path', 'file_name', 'mime_type', 'file_size',
  'z_index', 'parent_id', 'created_by', 'created_at', 'updated_at', 'deleted_at',
].join(',')

const BOARD_OBJECT_SELECT = CRDT_ENABLED
  ? BOARD_OBJECT_COLUMNS + ',field_clocks'
  : BOARD_OBJECT_COLUMNS

// ── Pure helpers ─────────────────────────────────────────────────────

/**
 * Convert JSONB string fields (table_data, rich_text) to parsed objects so
 * Postgres stores them as JSONB objects rather than scalar string values.
 * String fields that are null/undefined are passed through unchanged.
 */
function toJsonbPayload(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  if (typeof out.table_data === 'string') {
    try { out.table_data = JSON.parse(out.table_data) } catch { /* leave as-is */ }
  }
  if (typeof out.rich_text === 'string') {
    try { out.rich_text = JSON.parse(out.rich_text) } catch { /* leave as-is */ }
  }
  return out
}

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
  notify: (msg: string) => void
  log: BoardLogger
}

// ── Hook ────────────────────────────────────────────────────────────

export function usePersistence({
  boardId, userId, canEdit, supabase,
  setObjects, objectsRef, setSelectedIds,
  getDescendants, getMaxZIndex,
  queueBroadcast, stampChange, stampCreate,
  fieldClocksRef, hlcRef,
  notify, log,
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
      .is('deleted_at', null)
      .limit(5000) as unknown as { data: (BoardObject & { field_clocks?: FieldClocks })[] | null; error: { message: string } | null }

    if (error) {
      log.error({ message: 'Failed to load board objects', operation: 'loadObjects', error })
      notify('Failed to load board')
      return
    }

    if (data && data.length === 5000) {
      console.warn('Board object limit reached (5000). Some objects may not be loaded.')
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
  }, [boardId, log, notify])

  // ── Reconcile on reconnect (CRDT Phase 3) ─────────────────────

  const reconcileOnReconnect = useCallback(async () => {
    if (!CRDT_ENABLED) return

    const { data: dbObjects, error } = await supabase
      .from('board_objects')
      .select('id, field_clocks')
      .eq('board_id', boardId)
      .is('deleted_at', null)

    if (error) {
      log.warn({ message: 'Failed to fetch DB state for reconciliation', operation: 'reconcileOnReconnect', error })
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
        log.warn({ message: 'Failed to reconcile on reconnect', operation: 'reconcileOnReconnect', error: fnError })
      }
    }

    await loadObjects()
  }, [boardId, loadObjects, log])

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
      table: { width: 360, height: 128, color: '#FFFFFF', text: '', table_data: serializeTableData(createDefaultTableData(3, 3)) },
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

    // Persist to Supabase with retry, then broadcast on success
    const { id: _id, created_at: _ca, updated_at: _ua, field_clocks: _fc, deleted_at: _da, ...insertData } = obj
    const insertRow = toJsonbPayload(CRDT_ENABLED
      ? { ...insertData, id: obj.id, field_clocks: fieldClocksRef.current.get(id) ?? {} }
      : { ...insertData, id: obj.id })
    const insertPromise = retryWithRollback({
      operation: () => supabase.from('board_objects').insert(insertRow),
      rollback: () => {
        setObjects(prev => { const next = new Map(prev); next.delete(id); return next })
        fieldClocksRef.current.delete(id)
      },
      onError: () => notify('Failed to save shape'),
      logError: (err, attempt) => log.error({ message: 'Failed to save object', operation: 'addObject', objectId: id, error: err }),
    }).then(ok => {
      persistPromisesRef.current.delete(id)
      if (ok) queueBroadcast([{ action: 'create', object: obj, clocks }])
      return ok
    })
    persistPromisesRef.current.set(id, insertPromise)

    return obj
  }, [userId, boardId, canEdit, getMaxZIndex, queueBroadcast, stampCreate, notify, log])

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
    const insertRow = toJsonbPayload(CRDT_ENABLED
      ? { ...insertData, id: obj.id, field_clocks: fieldClocksRef.current.get(obj.id) ?? {} }
      : { ...insertData, id: obj.id })
    fireAndRetry({
      operation: () => supabase.from('board_objects').upsert(insertRow, { onConflict: 'id' }),
      rollback: () => {
        setObjects(prev => { const next = new Map(prev); next.delete(obj.id); return next })
        fieldClocksRef.current.delete(obj.id)
      },
      onError: () => notify('Failed to save shape'),
      logError: (err) => log.error({ message: 'Failed to re-insert object', operation: 'addObjectWithId', objectId: obj.id, error: err }),
    }).then(ok => {
      if (ok) queueBroadcast([{ action: 'create', object: obj, clocks }])
    })
  }, [canEdit, queueBroadcast, stampCreate, notify, log])

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

    // Persist to Supabase with retry, then broadcast on success
    const dbUpdate: Record<string, unknown> = toJsonbPayload({ ...updates, updated_at: new Date().toISOString() })
    if (CRDT_ENABLED) {
      dbUpdate.field_clocks = fieldClocksRef.current.get(id) ?? {}
      dbUpdate.deleted_at = null // Clear tombstone — add-wins: any update resurrects
    }
    fireAndRetry({
      operation: () => supabase.from('board_objects').update(dbUpdate).eq('id', id),
      rollback: previousObj ? () => {
        setObjects(prev => { const next = new Map(prev); next.set(id, previousObj); return next })
      } : undefined,
      onError: () => notify('Failed to save changes'),
      logError: (err) => log.error({ message: 'Failed to update object', operation: 'updateObject', objectId: id, error: err }),
    }).then(ok => {
      if (ok) queueBroadcast([{ action: 'update', object: { id, ...updates }, clocks }])
    })
  }, [canEdit, queueBroadcast, stampChange, notify, log])

  // ── Delete ──────────────────────────────────────────────────────

  const deleteObject = useCallback(async (id: string) => {
    if (!canEdit) return

    // Lock guard
    if (checkLocked(objectsRef, id)) return

    // Also delete all descendants
    const descendants = getDescendants(id)
    const idsToDelete = [id, ...descendants.map(d => d.id)]

    // Capture snapshots for rollback
    const snapshots = new Map<string, BoardObject>()
    for (const did of idsToDelete) {
      const obj = objectsRef.current.get(did)
      if (obj) snapshots.set(did, { ...obj })
    }

    const rollbackDelete = () => {
      setObjects(prev => {
        const next = new Map(prev)
        for (const [did, obj] of snapshots) next.set(did, obj)
        return next
      })
    }

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
      const ok = await retryWithRollback({
        operation: () => supabase.from('board_objects').update({ deleted_at: now }).in('id', idsToDelete),
        rollback: rollbackDelete,
        onError: () => notify('Failed to delete'),
        logError: (err) => log.error({ message: 'Failed to soft-delete objects', operation: 'deleteObject', objectId: id, error: err }),
      })
      if (ok) {
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
        const childOk = await retryWithRollback({
          operation: () => supabase.from('board_objects').delete().in('id', childIds),
          rollback: rollbackDelete,
          onError: () => notify('Failed to delete'),
          logError: (err) => log.error({ message: 'Failed to delete children', operation: 'deleteObject', objectId: id, error: err }),
        })
        if (!childOk) return
      }
      const ok = await retryWithRollback({
        operation: () => supabase.from('board_objects').delete().eq('id', id),
        rollback: rollbackDelete,
        onError: () => notify('Failed to delete'),
        logError: (err) => log.error({ message: 'Failed to delete object', operation: 'deleteObject', objectId: id, error: err }),
      })
      if (ok) {
        queueBroadcast(idsToDelete.map(did => ({ action: 'delete' as const, object: { id: did } as BoardObject })))
      }
    }
  }, [canEdit, getDescendants, queueBroadcast, notify, log])

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

      // Persist: insert parent first (await), then children
      // Broadcast only after parent insert succeeds so remote peers don't receive orphaned objects
      const parentObj = newObjects[0]
      const childObjs = newObjects.slice(1)
      const { id: _pid, created_at: _pca, updated_at: _pua, field_clocks: _pfc, deleted_at: _pda, ...parentInsert } = parentObj
      const parentRow = toJsonbPayload(CRDT_ENABLED
        ? { ...parentInsert, id: parentObj.id, field_clocks: fieldClocksRef.current.get(parentObj.id) ?? {} }
        : { ...parentInsert, id: parentObj.id })
      const rollbackDup = () => {
        setObjects(prev => {
          const next = new Map(prev)
          for (const obj of newObjects) next.delete(obj.id)
          return next
        })
      }
      fireAndRetry({
        operation: () => supabase.from('board_objects').insert(parentRow),
        rollback: rollbackDup,
        onError: () => notify('Failed to duplicate'),
        logError: (err) => log.error({ message: 'Failed to save duplicated parent', operation: 'duplicateObject', objectId: parentObj.id, error: err }),
      }).then(ok => {
        if (!ok) return
        queueBroadcast(newObjects.map(obj => ({
          action: 'create' as const,
          object: obj,
          clocks: stampCreate(obj.id, obj),
        })))
        for (const obj of childObjs) {
          const { id: _cid, created_at: _cca, updated_at: _cua, field_clocks: _cfc, deleted_at: _cda, ...childInsert } = obj
          const childRow = toJsonbPayload(CRDT_ENABLED
            ? { ...childInsert, id: obj.id, field_clocks: fieldClocksRef.current.get(obj.id) ?? {} }
            : { ...childInsert, id: obj.id })
          fireAndRetry({
            operation: () => supabase.from('board_objects').insert(childRow),
            rollback: () => {
              setObjects(prev => { const next = new Map(prev); next.delete(obj.id); return next })
            },
            onError: () => notify('Failed to duplicate'),
            logError: (err) => log.error({ message: 'Failed to save duplicated child', operation: 'duplicateObject', objectId: obj.id, error: err }),
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
  }, [addObject, canEdit, getDescendants, getMaxZIndex, userId, queueBroadcast, stampCreate, notify, log])

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
      const failed = results.some(r => r.error)
      if (failed) {
        notify('Failed to update layer order')
        for (const { error } of results) {
          if (error) log.warn({ message: 'Failed to update z_index', operation: 'persistZIndexBatch', error })
        }
      }
    })
  }, [log])

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

    // Capture pre-update state for rollback BEFORE optimistic update
    const previousObj = objectsRef.current.get(id)

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
    fireAndRetry({
      operation: () => supabase.from('board_objects').update(dbUpdate).eq('id', id),
      rollback: previousObj ? () => {
        setObjects(prev => { const next = new Map(prev); next.set(id, previousObj); return next })
      } : undefined,
      onError: () => notify('Failed to save position'),
      logError: (err) => log.error({ message: 'Failed to update object drag end', operation: 'updateObjectDragEnd', objectId: id, error: err }),
    })
  }, [canEdit, queueBroadcast, stampChange, notify, log])

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

    // Capture rollback snapshot BEFORE the optimistic update (descendants holds pre-move state)
    const snapshot = new Map<string, BoardObject>()
    for (const d of descendants) {
      snapshot.set(d.id, { ...d })
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
      // Build an id -> change lookup so the DB patch uses the same final values
      // computed in the changes array (avoids re-deriving from potentially stale d.x / d.y)
      const changeById = new Map<string, Partial<BoardObject> & { id: string }>()
      for (const c of changes) {
        changeById.set(c.object.id, c.object as Partial<BoardObject> & { id: string })
      }

      Promise.all(descendants.map(d => {
        const change = changeById.get(d.id)!
        const patch: Record<string, unknown> = { x: change.x, y: change.y, updated_at: now }
        if (change.x2 != null) patch.x2 = change.x2
        if (change.y2 != null) patch.y2 = change.y2
        if (change.waypoints !== undefined) patch.waypoints = change.waypoints
        if (CRDT_ENABLED) {
          patch.field_clocks = fieldClocksRef.current.get(d.id) ?? {}
          patch.deleted_at = null
        }
        return supabase.from('board_objects').update(patch).eq('id', d.id)
      })).then(results => {
        const anyError = results.some(r => r.error)
        if (anyError) {
          for (const { error } of results) {
            if (error) log.error({ message: 'Failed to update child position', operation: 'moveGroupChildren', error })
          }
          // Rollback optimistic update on DB failure
          setObjects(prev => {
            const next = new Map(prev)
            for (const [sid, obj] of snapshot) next.set(sid, obj)
            return next
          })
          notify('Failed to save group move')
        }
      })
    }
  }, [canEdit, getDescendants, queueBroadcast, stampChange, notify, log])

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
