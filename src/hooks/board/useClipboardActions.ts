import { useCallback, useRef } from 'react'
import { BoardObject } from '@/types/board'
import { UndoEntry } from '@/hooks/useUndoStack'

interface UseClipboardActionsDeps {
  objects: Map<string, BoardObject>
  selectedIds: Set<string>
  canEdit: boolean
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
  deleteSelected,
  duplicateSelected,
  duplicateObject,
  getDescendants,
  undoStack,
  markActivity,
}: UseClipboardActionsDeps) {
  const clipboardRef = useRef<string[]>([])

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
  }, [selectedIds, markActivity])

  const handleCut = useCallback(() => {
    if (!canEdit || selectedIds.size === 0) return
    markActivity()
    clipboardRef.current = Array.from(selectedIds)
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

  const handlePaste = useCallback(() => {
    if (!canEdit || clipboardRef.current.length === 0) return
    markActivity()
    const newIds: string[] = []
    for (const id of clipboardRef.current) {
      const newObj = duplicateObject(id)
      if (newObj) newIds.push(newObj.id)
    }
    if (newIds.length > 0) {
      undoStack.push({ type: 'duplicate', ids: newIds })
    }
  }, [canEdit, duplicateObject, undoStack, markActivity])

  return {
    handleDelete,
    handleDuplicate,
    handleCopy,
    handleCut,
    handlePaste,
  }
}
