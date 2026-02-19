'use client'

import { useCallback } from 'react'
import { BoardObject } from '@/types/board'
import { shapeRegistry } from '@/components/board/shapeRegistry'
import { getInitialVertexPoints } from '@/components/board/shapeUtils'

interface UseVertexActionsDeps {
  objects: Map<string, BoardObject>
  selectedIds: Set<string>
  canEdit: boolean
  updateObject: (id: string, updates: Partial<BoardObject>) => void
  undoStack: {
    push: (entry: { type: 'update'; patches: { id: string; before: Partial<BoardObject> }[] }) => void
  }
  setVertexEditId: (id: string | null) => void
}

export function useVertexActions({
  objects,
  selectedIds,
  canEdit,
  updateObject,
  undoStack,
  setVertexEditId,
}: UseVertexActionsDeps) {
  const handleEditVertices = useCallback(() => {
    if (!canEdit) return
    const id = Array.from(selectedIds).find(sid => {
      const obj = objects.get(sid)
      return obj && shapeRegistry.has(obj.type)
    })
    if (!id) return
    const obj = objects.get(id)
    if (!obj) return
    if (!obj.custom_points) {
      const pts = getInitialVertexPoints(obj)
      if (pts.length > 0) {
        updateObject(id, { custom_points: JSON.stringify(pts) })
      }
    }
    setVertexEditId(id)
  }, [canEdit, selectedIds, objects, updateObject, setVertexEditId])

  const handleVertexDragEnd = useCallback((id: string, index: number, x: number, y: number) => {
    const obj = objects.get(id)
    if (!obj?.custom_points) return
    try {
      const pts: number[] = JSON.parse(obj.custom_points)
      const before = obj.custom_points
      pts[index * 2] = x
      pts[index * 2 + 1] = y
      const after = JSON.stringify(pts)
      undoStack.push({ type: 'update', patches: [{ id, before: { custom_points: before } }] })
      updateObject(id, { custom_points: after })
    } catch { /* ignore */ }
  }, [objects, updateObject, undoStack])

  const handleVertexInsert = useCallback((id: string, afterIndex: number) => {
    const obj = objects.get(id)
    if (!obj?.custom_points) return
    try {
      const pts: number[] = JSON.parse(obj.custom_points)
      const numVerts = pts.length / 2
      const nextIndex = (afterIndex + 1) % numVerts
      const mx = (pts[afterIndex * 2] + pts[nextIndex * 2]) / 2
      const my = (pts[afterIndex * 2 + 1] + pts[nextIndex * 2 + 1]) / 2
      const insertPos = (afterIndex + 1) * 2
      pts.splice(insertPos, 0, mx, my)
      const before = obj.custom_points
      const after = JSON.stringify(pts)
      undoStack.push({ type: 'update', patches: [{ id, before: { custom_points: before } }] })
      updateObject(id, { custom_points: after })
    } catch { /* ignore */ }
  }, [objects, updateObject, undoStack])

  const handleExitVertexEdit = useCallback(() => {
    setVertexEditId(null)
  }, [setVertexEditId])

  return {
    handleEditVertices,
    handleVertexDragEnd,
    handleVertexInsert,
    handleExitVertexEdit,
  }
}
