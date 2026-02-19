'use client'

import { useCallback } from 'react'
import { BoardObject } from '@/types/board'

interface UseZOrderActionsDeps {
  objects: Map<string, BoardObject>
  getZOrderSet: (id: string) => BoardObject[]
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
  undoStack: {
    push: (entry: { type: 'update'; patches: { id: string; before: Partial<BoardObject> }[] }) => void
  }
}

export function useZOrderActions({
  objects,
  getZOrderSet,
  bringToFront,
  sendToBack,
  bringForward,
  sendBackward,
  undoStack,
}: UseZOrderActionsDeps) {
  const handleBringToFront = useCallback((id: string) => {
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const patches = set.map(o => ({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> }))
    undoStack.push({ type: 'update', patches })
    bringToFront(id)
  }, [getZOrderSet, bringToFront, undoStack])

  const handleSendToBack = useCallback((id: string) => {
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const patches = set.map(o => ({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> }))
    undoStack.push({ type: 'update', patches })
    sendToBack(id)
  }, [getZOrderSet, sendToBack, undoStack])

  const handleBringForward = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const allObjects = Array.from(objects.values())
    const setIds = new Set(set.map(o => o.id))
    const maxInSet = Math.max(...set.map(o => o.z_index))
    const sorted = allObjects.filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id).sort((a, b) => a.z_index - b.z_index)
    const nextHigher = sorted.find(o => o.z_index > maxInSet)
    const patches = set.map(o => ({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> }))
    if (nextHigher) {
      const nextSet = getZOrderSet(nextHigher.id)
      for (const o of nextSet) {
        patches.push({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> })
      }
    }
    undoStack.push({ type: 'update', patches })
    bringForward(id)
  }, [objects, getZOrderSet, bringForward, undoStack])

  const handleSendBackward = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const allObjects = Array.from(objects.values())
    const setIds = new Set(set.map(o => o.id))
    const minInSet = Math.min(...set.map(o => o.z_index))
    const sorted = allObjects.filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id).sort((a, b) => b.z_index - a.z_index)
    const nextLower = sorted.find(o => o.z_index < minInSet)
    const patches = set.map(o => ({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> }))
    if (nextLower) {
      const nextSet = getZOrderSet(nextLower.id)
      for (const o of nextSet) {
        patches.push({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> })
      }
    }
    undoStack.push({ type: 'update', patches })
    sendBackward(id)
  }, [objects, getZOrderSet, sendBackward, undoStack])

  return {
    handleBringToFront,
    handleSendToBack,
    handleBringForward,
    handleSendBackward,
  }
}
