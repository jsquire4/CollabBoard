import { useCallback } from 'react'
import { BoardObject } from '@/types/board'
import { UndoEntry, useUndoStack } from '@/hooks/useUndoStack'

interface UseUndoExecutionParams {
  objects: Map<string, BoardObject>
  deleteObject: (id: string) => void
  addObjectWithId: (obj: BoardObject) => void
  updateObject: (id: string, updates: Partial<BoardObject>) => void
  getDescendants: (parentId: string) => BoardObject[]
  undoStack: ReturnType<typeof useUndoStack>
}

export function useUndoExecution({
  objects,
  deleteObject,
  addObjectWithId,
  updateObject,
  getDescendants,
  undoStack,
}: UseUndoExecutionParams) {
  const executeUndo = useCallback((entry: UndoEntry): UndoEntry | null => {
    switch (entry.type) {
      case 'add': {
        const snapshots: BoardObject[] = []
        for (const id of entry.ids) {
          const obj = objects.get(id)
          if (obj) {
            snapshots.push({ ...obj })
            deleteObject(id)
          }
        }
        return snapshots.length > 0 ? { type: 'delete', objects: snapshots } : null
      }
      case 'delete': {
        for (const obj of entry.objects) {
          addObjectWithId(obj)
        }
        return { type: 'add', ids: entry.objects.map(o => o.id) }
      }
      case 'update': {
        const inversePatches: { id: string; before: Partial<BoardObject> }[] = []
        for (const patch of entry.patches) {
          const current = objects.get(patch.id)
          if (!current) continue
          const inverseBefore: Partial<BoardObject> = {}
          for (const key of Object.keys(patch.before)) {
            (inverseBefore as unknown as Record<string, unknown>)[key] =
              (current as unknown as Record<string, unknown>)[key]
          }
          inversePatches.push({ id: patch.id, before: inverseBefore })
          updateObject(patch.id, patch.before)
        }
        return { type: 'update', patches: inversePatches }
      }
      case 'move': {
        const inversePatches: typeof entry.patches = []
        for (const patch of entry.patches) {
          const current = objects.get(patch.id)
          if (!current) continue
          inversePatches.push({
            id: patch.id,
            before: {
              x: current.x,
              y: current.y,
              x2: current.x2,
              y2: current.y2,
              parent_id: current.parent_id,
              waypoints: current.waypoints,
              connect_start_id: current.connect_start_id,
              connect_end_id: current.connect_end_id,
              connect_start_anchor: current.connect_start_anchor,
              connect_end_anchor: current.connect_end_anchor,
            },
          })
          const updates: Partial<BoardObject> = {
            x: patch.before.x,
            y: patch.before.y,
            parent_id: patch.before.parent_id,
          }
          if (patch.before.x2 !== undefined) updates.x2 = patch.before.x2
          if (patch.before.y2 !== undefined) updates.y2 = patch.before.y2
          if (patch.before.waypoints !== undefined) updates.waypoints = patch.before.waypoints
          if (patch.before.connect_start_id !== undefined)
            updates.connect_start_id = patch.before.connect_start_id
          if (patch.before.connect_end_id !== undefined)
            updates.connect_end_id = patch.before.connect_end_id
          if (patch.before.connect_start_anchor !== undefined)
            updates.connect_start_anchor = patch.before.connect_start_anchor
          if (patch.before.connect_end_anchor !== undefined)
            updates.connect_end_anchor = patch.before.connect_end_anchor
          updateObject(patch.id, updates)
        }
        return { type: 'move', patches: inversePatches }
      }
      case 'duplicate': {
        const snapshots: BoardObject[] = []
        for (const id of entry.ids) {
          const obj = objects.get(id)
          if (obj) {
            snapshots.push({ ...obj })
            const descendants = getDescendants(id)
            for (const d of descendants) {
              snapshots.push({ ...d })
            }
            deleteObject(id)
          }
        }
        return snapshots.length > 0 ? { type: 'delete', objects: snapshots } : null
      }
      case 'group': {
        const groupSnapshot = objects.get(entry.groupId)
        if (!groupSnapshot) return null
        for (const childId of entry.childIds) {
          const prevParent = entry.previousParentIds.get(childId) ?? null
          updateObject(childId, { parent_id: prevParent })
        }
        deleteObject(entry.groupId)
        return { type: 'ungroup', groupSnapshot, childIds: entry.childIds }
      }
      case 'ungroup': {
        // Capture current parent_ids BEFORE mutating, to avoid stale closure reads
        const previousParentIds = new Map<string, string | null>()
        for (const childId of entry.childIds) {
          const child = objects.get(childId)
          previousParentIds.set(childId, child?.parent_id ?? null)
        }
        addObjectWithId(entry.groupSnapshot)
        for (const childId of entry.childIds) {
          updateObject(childId, { parent_id: entry.groupSnapshot.id })
        }
        return {
          type: 'group',
          groupId: entry.groupSnapshot.id,
          childIds: entry.childIds,
          previousParentIds,
        }
      }
    }
  }, [objects, deleteObject, addObjectWithId, updateObject, getDescendants])

  const performUndo = useCallback(() => {
    const entry = undoStack.popUndo()
    if (!entry) return
    const inverse = executeUndo(entry)
    if (inverse) undoStack.pushRedo(inverse)
  }, [undoStack, executeUndo])

  const performRedo = useCallback(() => {
    const entry = undoStack.popRedo()
    if (!entry) return
    const inverse = executeUndo(entry)
    if (inverse) undoStack.pushUndo(inverse)
  }, [undoStack, executeUndo])

  return { executeUndo, performUndo, performRedo }
}
