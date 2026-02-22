'use client'

import { useCallback, useRef } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'
import { hlcGreaterThan } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'
import { CRDT_ENABLED } from '@/hooks/board/useBroadcast'
import { BoardLogger } from '@/lib/logger'
import { BOARD_OBJECT_SELECT } from '@/hooks/board/persistenceConstants'

export interface UsePersistenceCoreDeps {
  boardId: string
  supabase: SupabaseClient
  setObjects: React.Dispatch<React.SetStateAction<Map<string, BoardObject>>>
  objectsRef: React.RefObject<Map<string, BoardObject>>
  fieldClocksRef: React.RefObject<Map<string, FieldClocks>>
  notify: (msg: string) => void
  log: BoardLogger
}

export function usePersistenceCore({
  boardId,
  supabase,
  setObjects,
  objectsRef,
  fieldClocksRef,
  notify,
  log,
}: UsePersistenceCoreDeps) {
  // Single source of truth for in-flight insert promises.
  // This ref is passed by reference to usePersistenceWrite so both share the same Map.
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
      notify('This board has too many objects to display all of them (limit: 5000).')
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

  return {
    persistPromisesRef,
    waitForPersist,
    loadObjects,
    reconcileOnReconnect,
  }
}
