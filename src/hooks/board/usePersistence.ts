'use client'

import type React from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'
import { HLC } from '@/lib/crdt/hlc'
import { FieldClocks } from '@/lib/crdt/merge'
import { BoardChange } from '@/hooks/board/useBroadcast'
import { BoardLogger } from '@/lib/logger'

// Re-export checkLocked so existing imports from usePersistence keep working
export { checkLocked } from '@/hooks/board/persistenceConstants'

import { usePersistenceCore } from '@/hooks/board/usePersistenceCore'
import { usePersistenceWrite } from '@/hooks/board/usePersistenceWrite'
import { usePersistenceDrag } from '@/hooks/board/usePersistenceDrag'
import { usePersistenceComposite } from '@/hooks/board/usePersistenceComposite'

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
  dragPositionsRef?: React.MutableRefObject<Map<string, Partial<BoardObject>>>
}

// ── Orchestrator hook ────────────────────────────────────────────────

export function usePersistence({
  boardId, userId, canEdit, supabase,
  setObjects, objectsRef, setSelectedIds,
  getDescendants, getMaxZIndex,
  queueBroadcast, stampChange, stampCreate,
  fieldClocksRef, hlcRef,
  notify, log,
  dragPositionsRef,
}: UsePersistenceDeps) {

  // Core: owns persistPromisesRef, provides loadObjects + reconcileOnReconnect + waitForPersist
  const { persistPromisesRef, waitForPersist, loadObjects, reconcileOnReconnect } = usePersistenceCore({
    boardId, supabase, setObjects, objectsRef, fieldClocksRef, notify, log,
  })

  // Write: addObject, addObjectWithId, updateObject, deleteObject
  // Receives persistPromisesRef by ref so insert promises are tracked in the same Map
  const { addObject, addObjectWithId, updateObject, deleteObject } = usePersistenceWrite({
    boardId, userId, canEdit, supabase,
    setObjects, objectsRef, setSelectedIds,
    getDescendants, getMaxZIndex,
    queueBroadcast, stampChange, stampCreate,
    fieldClocksRef, hlcRef,
    persistPromisesRef,
    notify, log,
  })

  // Drag: updateObjectDrag, updateObjectDragEnd, moveGroupChildren
  const { updateObjectDrag, updateObjectDragEnd, moveGroupChildren } = usePersistenceDrag({
    canEdit, supabase,
    setObjects, objectsRef,
    getDescendants,
    queueBroadcast, stampChange,
    fieldClocksRef,
    notify, log,
    dragPositionsRef,
  })

  // Composite: duplicateObject, persistZIndexBatch
  const { duplicateObject, persistZIndexBatch } = usePersistenceComposite({
    boardId, userId, canEdit, supabase,
    setObjects, objectsRef, setSelectedIds,
    getDescendants, getMaxZIndex,
    queueBroadcast, stampCreate,
    fieldClocksRef,
    addObject,
    notify, log,
  })

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
