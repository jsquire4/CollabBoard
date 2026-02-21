import { useCallback, useRef } from 'react'
import { BoardObject } from '@/types/board'
import { UndoEntry } from '@/hooks/useUndoStack'

interface UseClipboardActionsDeps {
  objects: Map<string, BoardObject>
  selectedIds: Set<string>
  canEdit: boolean
  addObject: (type: BoardObject['type'], x: number, y: number, overrides?: Partial<BoardObject>) => BoardObject | null
  deleteSelected: () => void
  duplicateSelected: () => string[]
  duplicateObject: (id: string) => BoardObject | null
  getDescendants: (id: string) => BoardObject[]
  undoStack: {
    push: (entry: UndoEntry) => void
  }
  markActivity: () => void
}

export function useClipboardActions({
  objects,
  selectedIds,
  canEdit,
  addObject,
  deleteSelected,
  duplicateSelected,
  duplicateObject,
  getDescendants,
  undoStack,
  markActivity,
}: UseClipboardActionsDeps) {
  const clipboardRef = useRef<string[]>([])
  const cutSnapshotsRef = useRef<Map<string, BoardObject>>(new Map())

  const handleDelete = useCallback(() => {
    if (!canEdit) return
    markActivity()
    const snapshots: BoardObject[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      snapshots.push({ ...obj })
      for (const d of getDescendants(id)) {
        snapshots.push({ ...d })
      }
    }
    if (snapshots.length > 0) {
      undoStack.push({ type: 'delete', objects: snapshots })
    }
    deleteSelected()
  }, [canEdit, selectedIds, objects, getDescendants, deleteSelected, undoStack, markActivity])

  const handleDuplicate = useCallback(() => {
    if (!canEdit) return
    markActivity()
    const newIds = duplicateSelected()
    if (newIds.length > 0) {
      undoStack.push({ type: 'duplicate', ids: newIds })
    }
  }, [canEdit, duplicateSelected, undoStack, markActivity])

  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) return
    markActivity()
    clipboardRef.current = Array.from(selectedIds)
    cutSnapshotsRef.current = new Map()
  }, [selectedIds, markActivity])

  const handleCut = useCallback(() => {
    if (!canEdit || selectedIds.size === 0) return
    markActivity()
    clipboardRef.current = Array.from(selectedIds)
    const snapshots: BoardObject[] = []
    const cutSnapshotsMap = new Map<string, BoardObject>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      snapshots.push({ ...obj })
      cutSnapshotsMap.set(id, { ...obj })
      for (const d of getDescendants(id)) {
        snapshots.push({ ...d })
      }
    }
    cutSnapshotsRef.current = cutSnapshotsMap
    if (snapshots.length > 0) {
      undoStack.push({ type: 'delete', objects: snapshots })
    }
    deleteSelected()
  }, [canEdit, selectedIds, objects, getDescendants, deleteSelected, undoStack, markActivity])

  const handlePaste = useCallback(() => {
    if (!canEdit || clipboardRef.current.length === 0) return
    markActivity()
    const newIds: string[] = []
    for (const id of clipboardRef.current) {
      const newObj = duplicateObject(id)
      if (newObj) {
        newIds.push(newObj.id)
      } else {
        const snapshot = cutSnapshotsRef.current.get(id)
        if (snapshot) {
          const restored = addObject(snapshot.type, snapshot.x + 20, snapshot.y + 20, { ...snapshot })
          if (restored) newIds.push(restored.id)
        }
      }
    }
    cutSnapshotsRef.current = new Map()
    if (newIds.length > 0) {
      undoStack.push({ type: 'duplicate', ids: newIds })
    }
  }, [canEdit, addObject, duplicateObject, undoStack, markActivity])

  return {
    handleDelete,
    handleDuplicate,
    handleCopy,
    handleCut,
    handlePaste,
  }
}
