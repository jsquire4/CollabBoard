'use client'

import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'
import { HLC, tickHLC } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'
import { BoardChange, CRDT_ENABLED } from '@/hooks/board/useBroadcast'
import { fireAndRetry } from '@/lib/retryWithRollback'
import { BoardLogger } from '@/lib/logger'

// ── Types ─────────────────────────────────────────────────────────────

export interface UseGroupPersistenceParams {
  boardId: string
  userId: string
  canEdit: boolean
  supabase: SupabaseClient
  selectedIds: Set<string>
  objects: Map<string, BoardObject>
  /** Callback to get direct children of a group/frame object. */
  getChildren: (parentId: string) => BoardObject[]
  /** updateObject from usePersistence — avoids circular dependency. */
  updateObject: (id: string, updates: Partial<BoardObject>) => void
  setObjects: React.Dispatch<React.SetStateAction<Map<string, BoardObject>>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  queueBroadcast: (changes: BoardChange[]) => void
  stampChange: (id: string, fields: string[]) => FieldClocks | undefined
  stampCreate: (id: string, obj: BoardObject) => FieldClocks | undefined
  fieldClocksRef: React.RefObject<Map<string, FieldClocks>>
  hlcRef: React.RefObject<HLC>
  notify: (msg: string) => void
  log: BoardLogger
}

export interface UseGroupPersistenceResult {
  groupSelected: () => Promise<BoardObject | null>
  ungroupSelected: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────

/**
 * Extracts group/ungroup persistence logic from useBoardState.
 * Directly calls Supabase for group operations (group inserts require FK-safe
 * sequencing that bypasses the generic usePersistence path).
 *
 * Pass `updateObject` from usePersistence to update child parent_id — this
 * avoids a circular dependency between useBoardState and this hook.
 */
export function useGroupPersistence({
  boardId,
  userId,
  canEdit,
  supabase,
  selectedIds,
  objects,
  getChildren,
  updateObject,
  setObjects,
  setSelectedIds,
  queueBroadcast,
  stampChange,
  stampCreate,
  fieldClocksRef,
  hlcRef,
  notify,
  log,
}: UseGroupPersistenceParams): UseGroupPersistenceResult {

  const groupSelected = useCallback(async (): Promise<BoardObject | null> => {
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

    // Persist: insert group first (FK-safe), then update children in parallel
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
  }, [
    canEdit, selectedIds, objects, boardId, userId,
    setObjects, setSelectedIds,
    queueBroadcast, stampCreate, stampChange,
    fieldClocksRef, supabase,
    notify, log,
  ])

  const ungroupSelected = useCallback((): void => {
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
  }, [
    canEdit, selectedIds, objects,
    getChildren, updateObject,
    setObjects, setSelectedIds,
    queueBroadcast,
    fieldClocksRef, hlcRef, supabase,
    notify, log,
  ])

  return { groupSelected, ungroupSelected }
}
