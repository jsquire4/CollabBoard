'use client'

import { useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'
import { FieldClocks } from '@/lib/crdt/merge'
import { BoardChange, CRDT_ENABLED } from '@/hooks/board/useBroadcast'
import { fireAndRetry } from '@/lib/retryWithRollback'
import { BoardLogger } from '@/lib/logger'
import { checkLocked } from '@/hooks/board/persistenceConstants'

export interface UsePersistenceDragDeps {
  canEdit: boolean
  supabase: SupabaseClient
  setObjects: React.Dispatch<React.SetStateAction<Map<string, BoardObject>>>
  objectsRef: React.RefObject<Map<string, BoardObject>>
  getDescendants: (parentId: string) => BoardObject[]
  queueBroadcast: (changes: BoardChange[]) => void
  stampChange: (objectId: string, changedFields: string[]) => FieldClocks | undefined
  fieldClocksRef: React.RefObject<Map<string, FieldClocks>>
  notify: (msg: string) => void
  log: BoardLogger
  dragPositionsRef?: React.MutableRefObject<Map<string, Partial<BoardObject>>>
}

export function usePersistenceDrag({
  canEdit, supabase,
  setObjects, objectsRef,
  getDescendants,
  queueBroadcast, stampChange,
  fieldClocksRef,
  notify, log,
  dragPositionsRef,
}: UsePersistenceDragDeps) {

  // ── Drag (no DB) ──────────────────────────────────────────────

  const updateObjectDrag = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    if (checkLocked(objectsRef, id)) return

    if (dragPositionsRef) {
      // Ref-based drag: skip React re-render, write to overlay ref instead
      dragPositionsRef.current.set(id, {
        ...(dragPositionsRef.current.get(id) ?? {}),
        ...updates,
        updated_at: new Date().toISOString(),
      })
    } else {
      setObjects(prev => {
        const existing = prev.get(id)
        if (!existing) return prev
        const next = new Map(prev)
        next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
        return next
      })
    }

    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at')
    const clocks = stampChange(id, changedFields)
    queueBroadcast([{ action: 'update', object: { id, ...updates }, clocks }])
  }, [canEdit, queueBroadcast, stampChange, dragPositionsRef])

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

    if (skipDb && dragPositionsRef) {
      // During drag: write to overlay ref to avoid O(N×M) React re-renders
      for (const c of changes) {
        const update = c.object as Partial<BoardObject>
        dragPositionsRef.current.set(c.object.id, {
          ...(dragPositionsRef.current.get(c.object.id) ?? {}),
          ...update,
          updated_at: now,
        })
      }
    } else {
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
    }

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
  }, [canEdit, getDescendants, queueBroadcast, stampChange, notify, log, dragPositionsRef])

  return {
    updateObjectDrag,
    updateObjectDragEnd,
    moveGroupChildren,
  }
}
