'use client'

import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject, BoardObjectType } from '@/types/board'
import { HLC, tickHLC } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'
import { shapeRegistry } from '@/components/board/shapeRegistry'
import { BoardChange, CRDT_ENABLED } from '@/hooks/board/useBroadcast'
import { fireAndRetry, retryWithRollback } from '@/lib/retryWithRollback'
import { BoardLogger } from '@/lib/logger'
import { createDefaultTableData, serializeTableData } from '@/lib/table/tableUtils'
import { toJsonbPayload, checkLocked } from '@/hooks/board/persistenceConstants'

export interface UsePersistenceWriteDeps {
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
  persistPromisesRef: React.MutableRefObject<Map<string, Promise<boolean>>>
  notify: (msg: string) => void
  log: BoardLogger
}

export function usePersistenceWrite({
  boardId, userId, canEdit, supabase,
  setObjects, objectsRef, setSelectedIds,
  getDescendants, getMaxZIndex,
  queueBroadcast, stampChange, stampCreate,
  fieldClocksRef, hlcRef,
  persistPromisesRef,
  notify, log,
}: UsePersistenceWriteDeps) {

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
  }, [userId, boardId, canEdit, getMaxZIndex, queueBroadcast, stampCreate, notify, log, persistPromisesRef])

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

  return {
    addObject,
    addObjectWithId,
    updateObject,
    deleteObject,
  }
}
