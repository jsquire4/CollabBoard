'use client'

import { useState, useCallback } from 'react'
import Konva from 'konva'

const MIN_SCALE = 0.1
const MAX_SCALE = 5.0
const ZOOM_SPEED = 1.1

export function useCanvas() {
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageScale, setStageScale] = useState(1)

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()

    const stage = e.target.getStage()
    if (!stage) return

    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    // Zoom toward cursor position
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }

    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = direction > 0
      ? Math.min(oldScale * ZOOM_SPEED, MAX_SCALE)
      : Math.max(oldScale / ZOOM_SPEED, MIN_SCALE)

    setStageScale(newScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }, [])

  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    // Only update if the stage itself was dragged (not a child)
    if (e.target === e.target.getStage()) {
      setStagePos({ x: e.target.x(), y: e.target.y() })
    }
  }, [])

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - stagePos.x) / stageScale,
      y: (screenY - stagePos.y) / stageScale,
    }
  }, [stagePos, stageScale])

  // Get center of current viewport in canvas coordinates
  const getViewportCenter = useCallback(() => {
    return screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
  }, [screenToCanvas])

  const zoomIn = useCallback(() => {
    setStageScale(s => Math.min(s * ZOOM_SPEED, MAX_SCALE))
  }, [])

  const zoomOut = useCallback(() => {
    setStageScale(s => Math.max(s / ZOOM_SPEED, MIN_SCALE))
  }, [])

  const resetZoom = useCallback(() => {
    setStageScale(1)
    setStagePos({ x: 0, y: 0 })
  }, [])

  return {
    stagePos,
    setStagePos,
    stageScale,
    handleWheel,
    handleDragEnd,
    screenToCanvas,
    getViewportCenter,
    zoomIn,
    zoomOut,
    resetZoom,
  }
}
