'use client'

import { useCallback, useMemo } from 'react'
import Konva from 'konva'
import { useBoardContext } from '@/contexts/BoardContext'
import { snapToGrid } from '@/components/board/shapeUtils'
import { shapeRegistry } from '@/components/board/shapeRegistry'

interface UseShapeDragDeps {
  shapeRefs: React.RefObject<Map<string, Konva.Node>>
  stageRef: React.RefObject<Konva.Stage | null>
  stagePos: { x: number; y: number }
  stageScale: number
  onDragStart?: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onDragMove?: (id: string, x: number, y: number) => void
  onMoveGroupChildren: (parentId: string, dx: number, dy: number, skipDb?: boolean) => void
  onCheckFrameContainment: (id: string) => void
  onCursorMove?: (x: number, y: number) => void
}

export function useShapeDrag({
  shapeRefs, stageRef, stagePos, stageScale,
  onDragStart: onDragStartProp, onDragEnd, onDragMove, onMoveGroupChildren,
  onCheckFrameContainment, onCursorMove,
}: UseShapeDragDeps) {
  const { objects, canEdit, snapToGrid: snapToGridEnabled, gridSize, gridSubdivisions } = useBoardContext()

  // Grid snap dragBoundFunc — passed to shapes for Konva-level drag constraint
  const shapeDragBoundFunc = useMemo(() => {
    if (!snapToGridEnabled) return undefined
    return (pos: { x: number; y: number }) => ({
      x: snapToGrid(pos.x, gridSize, gridSubdivisions),
      y: snapToGrid(pos.y, gridSize, gridSubdivisions),
    })
  }, [snapToGridEnabled, gridSize, gridSubdivisions])

  // Handle drag start: notify parent for undo capture
  const handleShapeDragStart = useCallback((id: string) => {
    onDragStartProp?.(id)
  }, [onDragStartProp])

  // Handle drag move: update local state + broadcast, no DB write
  const handleShapeDragMove = useCallback((id: string, x: number, y: number) => {
    if (!canEdit || !onDragMove) return
    const obj = objects.get(id)
    if (!obj) return

    // Apply grid snapping if enabled
    const finalX = snapToGridEnabled ? snapToGrid(x, gridSize, gridSubdivisions) : x
    const finalY = snapToGridEnabled ? snapToGrid(y, gridSize, gridSubdivisions) : y
    if (snapToGridEnabled) {
      const node = shapeRefs.current.get(id)
      if (node) {
        const def = shapeRegistry.get(obj.type)
        if (def?.centerOrigin) {
          node.position({ x: finalX + obj.width / 2, y: finalY + obj.height / 2 })
        } else {
          node.position({ x: finalX, y: finalY })
        }
      }
    }

    const dx = finalX - obj.x
    const dy = finalY - obj.y

    onDragMove(id, finalX, finalY)

    // Broadcast cursor position during drag — stage onMouseMove doesn't fire
    // while Konva is handling a shape drag, so we push the pointer position here.
    if (onCursorMove) {
      const stage = stageRef.current
      const pos = stage?.getPointerPosition()
      if (pos) {
        const canvasX = (pos.x - stagePos.x) / stageScale
        const canvasY = (pos.y - stagePos.y) / stageScale
        onCursorMove(canvasX, canvasY)
      }
    }

    // If this is a frame, move children with skipDb
    if (obj.type === 'frame') {
      onMoveGroupChildren(id, dx, dy, true)
    }
  }, [canEdit, objects, onDragMove, onMoveGroupChildren, onCursorMove, stagePos, stageScale, snapToGridEnabled, gridSize, gridSubdivisions, shapeRefs, stageRef])

  // Handle drag end with frame containment check and group child movement
  const handleShapeDragEnd = useCallback((id: string, x: number, y: number) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return

    const finalX = snapToGridEnabled ? snapToGrid(x, gridSize, gridSubdivisions) : x
    const finalY = snapToGridEnabled ? snapToGrid(y, gridSize, gridSubdivisions) : y

    const dx = finalX - obj.x
    const dy = finalY - obj.y

    onDragEnd(id, finalX, finalY)

    // If this is a frame, move all children (with DB write)
    if (obj.type === 'frame') {
      onMoveGroupChildren(id, dx, dy, false)
    }

    // Check frame containment for non-frame objects
    if (obj.type !== 'frame' && obj.type !== 'group') {
      setTimeout(() => onCheckFrameContainment(id), 0)
    }
  }, [canEdit, objects, onDragEnd, onMoveGroupChildren, onCheckFrameContainment, snapToGridEnabled, gridSize, gridSubdivisions])

  return { handleShapeDragStart, handleShapeDragMove, handleShapeDragEnd, shapeDragBoundFunc }
}
