'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import Konva from 'konva'
import { BoardObject } from '@/types/board'
import { useBoardContext } from '@/contexts/BoardContext'
import { snapToGrid } from '@/components/board/shapeUtils'
import { shapeRegistry } from '@/components/board/shapeRegistry'

interface UseShapeDragDeps {
  shapeRefs: React.RefObject<Map<string, Konva.Node>>
  stageRef: React.RefObject<Konva.Stage | null>
  stagePos: { x: number; y: number }
  stageScale: number
  objectsRef: React.RefObject<Map<string, BoardObject>>
  onDragStart?: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onDragMove?: (id: string, x: number, y: number) => void
  onMoveGroupChildren: (parentId: string, dx: number, dy: number, skipDb?: boolean) => void
  onCheckFrameContainment: (id: string) => void
  onCursorMove?: (x: number, y: number) => void
  isDraggingRef?: React.MutableRefObject<boolean>
  lastDragCursorPosRef?: React.MutableRefObject<{ x: number; y: number } | null>
  dragPositionsRef?: React.MutableRefObject<Map<string, Partial<BoardObject>>>
  sendCursorDirect?: (x: number, y: number) => void
}

export function useShapeDrag({
  shapeRefs, stageRef, stagePos, stageScale,
  objectsRef,
  onDragStart: onDragStartProp, onDragEnd, onDragMove, onMoveGroupChildren,
  onCheckFrameContainment, onCursorMove,
  isDraggingRef, lastDragCursorPosRef, dragPositionsRef, sendCursorDirect,
}: UseShapeDragDeps) {
  const { canEdit, snapToGrid: snapToGridEnabled, gridSize, gridSubdivisions } = useBoardContext()

  // Keepalive interval ref — sends cursor position every 4s if mouse is held still during drag
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Grid snap dragBoundFunc — passed to shapes for Konva-level drag constraint
  const shapeDragBoundFunc = useMemo(() => {
    if (!snapToGridEnabled) return undefined
    return (pos: { x: number; y: number }) => ({
      x: snapToGrid(pos.x, gridSize, gridSubdivisions),
      y: snapToGrid(pos.y, gridSize, gridSubdivisions),
    })
  }, [snapToGridEnabled, gridSize, gridSubdivisions])

  // Handle drag start: notify parent for undo capture, set drag flags, start cursor keepalive
  const handleShapeDragStart = useCallback((id: string) => {
    if (isDraggingRef) isDraggingRef.current = true
    if (keepaliveRef.current) clearInterval(keepaliveRef.current)
    keepaliveRef.current = setInterval(() => {
      if (isDraggingRef?.current && lastDragCursorPosRef?.current) {
        sendCursorDirect?.(lastDragCursorPosRef.current.x, lastDragCursorPosRef.current.y)
      }
    }, 4000)
    onDragStartProp?.(id)
  }, [onDragStartProp, isDraggingRef, lastDragCursorPosRef, sendCursorDirect])

  // Handle drag move: update drag overlay + broadcast, no DB write, no React re-render
  const handleShapeDragMove = useCallback((id: string, x: number, y: number) => {
    if (!canEdit || !onDragMove) return
    const obj = objectsRef.current.get(id)
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

    // Imperatively reposition rich-text DOM overlay so it stays locked to the shape
    // during drag — avoids waiting for React state to propagate (no re-render needed).
    const rtOverlay = document.getElementById(`rt-overlay-${id}`)
    if (rtOverlay) {
      const padding = obj.text_padding ?? 8
      const topOffset = obj.type === 'sticky_note' ? 50 : 0
      rtOverlay.style.left = `${finalX + padding}px`
      rtOverlay.style.top = `${finalY + topOffset + padding}px`
    }

    // Track and broadcast cursor position during drag — stage onMouseMove doesn't fire
    // while Konva is handling a shape drag, so we push the pointer position here.
    if (onCursorMove) {
      const stage = stageRef.current
      const pos = stage?.getPointerPosition()
      if (pos) {
        const canvasX = (pos.x - stagePos.x) / stageScale
        const canvasY = (pos.y - stagePos.y) / stageScale
        // Capture for keepalive and piggybacking before suppression in sendCursor
        if (lastDragCursorPosRef) lastDragCursorPosRef.current = { x: canvasX, y: canvasY }
        onCursorMove(canvasX, canvasY)
      }
    }

    // If this is a frame, move children with skipDb
    if (obj.type === 'frame') {
      onMoveGroupChildren(id, dx, dy, true)
    }
  }, [canEdit, objectsRef, onDragMove, onMoveGroupChildren, onCursorMove, stagePos, stageScale, snapToGridEnabled, gridSize, gridSubdivisions, shapeRefs, stageRef, lastDragCursorPosRef])

  // Timeout ref for deferred frame-containment check — cleared on unmount
  const dragEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (dragEndTimeoutRef.current !== null) {
        clearTimeout(dragEndTimeoutRef.current)
      }
      if (keepaliveRef.current !== null) {
        clearInterval(keepaliveRef.current)
        keepaliveRef.current = null
      }
    }
  }, [])

  // Handle drag end with frame containment check and group child movement
  const handleShapeDragEnd = useCallback((id: string, x: number, y: number) => {
    if (!canEdit) return
    const obj = objectsRef.current.get(id)
    if (!obj) return

    // GenericShape already converts center→top-left for centerOrigin shapes
    // before calling this handler, so x/y are always in stored coordinate space.
    const finalX = snapToGridEnabled ? snapToGrid(x, gridSize, gridSubdivisions) : x
    const finalY = snapToGridEnabled ? snapToGrid(y, gridSize, gridSubdivisions) : y

    const dx = finalX - obj.x
    const dy = finalY - obj.y

    onDragEnd(id, finalX, finalY)

    // If this is a frame, move all children (with DB write)
    if (obj.type === 'frame') {
      onMoveGroupChildren(id, dx, dy, false)
    }

    // Clear drag state — dragPositionsRef cleared AFTER onDragEnd/onMoveGroupChildren have
    // queued their setObjects calls; React 18 batches the updates and renders fresh positions.
    if (isDraggingRef) isDraggingRef.current = false
    if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null }
    if (dragPositionsRef) dragPositionsRef.current.clear()

    // Check frame containment for non-frame objects
    if (obj.type !== 'frame' && obj.type !== 'group') {
      if (dragEndTimeoutRef.current !== null) {
        clearTimeout(dragEndTimeoutRef.current)
      }
      dragEndTimeoutRef.current = setTimeout(() => {
        dragEndTimeoutRef.current = null
        onCheckFrameContainment(id)
      }, 0)
    }
  }, [canEdit, objectsRef, onDragEnd, onMoveGroupChildren, onCheckFrameContainment, snapToGridEnabled, gridSize, gridSubdivisions, isDraggingRef, dragPositionsRef])

  return { handleShapeDragStart, handleShapeDragMove, handleShapeDragEnd, shapeDragBoundFunc }
}
