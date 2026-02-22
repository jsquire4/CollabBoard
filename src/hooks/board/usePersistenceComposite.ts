'use client'

import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'
import { FieldClocks } from '@/lib/crdt/merge'
import { BoardChange, CRDT_ENABLED } from '@/hooks/board/useBroadcast'
import { fireAndRetry } from '@/lib/retryWithRollback'
import { BoardLogger } from '@/lib/logger'
import { toJsonbPayload } from '@/hooks/board/persistenceConstants'

export interface UsePersistenceCompositeDeps {
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
  stampCreate: (objectId: string, obj: Partial<BoardObject>) => FieldClocks | undefined
  fieldClocksRef: React.RefObject<Map<string, FieldClocks>>
  addObject: (type: BoardObject['type'], x: number, y: number, overrides?: Partial<BoardObject>) => BoardObject | null
  notify: (msg: string) => void
  log: BoardLogger
}

export function usePersistenceComposite({
  boardId, userId, canEdit, supabase,
  setObjects, objectsRef, setSelectedIds,
  getDescendants, getMaxZIndex,
  queueBroadcast, stampCreate,
  fieldClocksRef,
  addObject,
  notify, log,
}: UsePersistenceCompositeDeps) {

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
        setSelectedIds(new Set())
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
    }).catch((err: unknown) => {
      log.error({ message: 'Unexpected error in persistZIndexBatch', operation: 'persistZIndexBatch', error: err })
    })
  }, [log, notify])

  return {
    duplicateObject,
    persistZIndexBatch,
  }
}
