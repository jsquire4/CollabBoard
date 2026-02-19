import { useCallback, useMemo } from 'react'
import { BoardObject } from '@/types/board'
import { UndoEntry } from '@/hooks/useUndoStack'

interface UseGroupActionsDeps {
  objects: Map<string, BoardObject>
  selectedIds: Set<string>
  canEdit: boolean
  groupSelected: () => Promise<BoardObject | null>
  ungroupSelected: () => void
  getChildren: (id: string) => BoardObject[]
  undoStack: {
    push: (entry: UndoEntry) => void
  }
  markActivity: () => void
}

export function useGroupActions({
  objects,
  selectedIds,
  canEdit,
  groupSelected,
  ungroupSelected,
  getChildren,
  undoStack,
  markActivity,
}: UseGroupActionsDeps) {
  const handleGroup = useCallback(async () => {
    if (!canEdit || selectedIds.size < 2) return
    markActivity()
    const previousParentIds = new Map<string, string | null>()
    const childIds = Array.from(selectedIds)
    for (const id of childIds) {
      const obj = objects.get(id)
      previousParentIds.set(id, obj?.parent_id ?? null)
    }
    const groupObj = await groupSelected()
    if (groupObj) {
      undoStack.push({ type: 'group', groupId: groupObj.id, childIds, previousParentIds })
    }
  }, [canEdit, selectedIds, objects, groupSelected, undoStack, markActivity])

  const handleUngroup = useCallback(() => {
    if (!canEdit) return
    markActivity()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj || obj.type !== 'group') continue
      const childIds = getChildren(id).map(c => c.id)
      undoStack.push({ type: 'ungroup', groupSnapshot: { ...obj }, childIds })
    }
    ungroupSelected()
  }, [canEdit, selectedIds, objects, getChildren, ungroupSelected, undoStack, markActivity])

  const canGroup = useMemo(() => selectedIds.size > 1, [selectedIds])

  const canUngroup = useMemo(() => {
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'group') return true
    }
    return false
  }, [selectedIds, objects])

  return {
    handleGroup,
    handleUngroup,
    canGroup,
    canUngroup,
  }
}
