// src/hooks/board/useCanvasOverlayPosition.ts
'use client'

import { useEffect, useState, RefObject } from 'react'

export interface OverlayBBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface OverlayPosition {
  top: number
  left: number
}

/**
 * Converts a canvas-space bounding box to a screen-space position for an overlay element.
 * Positions the overlay centered above the bounding box, with viewport clamping.
 *
 * Returns null when:
 * - bbox is null
 * - stageScale is 0, negative, or NaN
 *
 * @param bbox - Canvas-space bounding box (can be null when nothing is selected)
 * @param stagePos - Stage translation (Konva stagePos)
 * @param stageScale - Stage zoom scale (Konva stageScale)
 * @param elementRef - Ref to the overlay element (for size measurement)
 * @param options.gap - Gap in px between selection top and overlay bottom (default: 8)
 * @param options.margin - Viewport edge margin in px (default: 8)
 */
export function useCanvasOverlayPosition(
  bbox: OverlayBBox | null,
  stagePos: { x: number; y: number },
  stageScale: number,
  elementRef: RefObject<HTMLElement | null>,
  options?: { gap?: number; margin?: number; extraDeps?: readonly unknown[] }
): OverlayPosition | null {
  const gap = options?.gap ?? 8
  const margin = options?.margin ?? 8
  const [pos, setPos] = useState<OverlayPosition | null>(null)

  useEffect(() => {
    if (!bbox || !stageScale || stageScale <= 0 || !isFinite(stageScale)) {
      setPos(null)
      return
    }

    const screenLeft = bbox.minX * stageScale + stagePos.x
    const screenRight = bbox.maxX * stageScale + stagePos.x
    const screenTop = bbox.minY * stageScale + stagePos.y

    const elWidth = elementRef.current?.offsetWidth ?? 240
    const elHeight = elementRef.current?.offsetHeight ?? 40

    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = (screenLeft + screenRight) / 2 - elWidth / 2
    let top = screenTop - elHeight - gap

    left = Math.max(margin, Math.min(left, vw - elWidth - margin))
    top = Math.max(margin, Math.min(top, vh - elHeight - margin))

    setPos(prev => {
      if (prev !== null && prev.top === top && prev.left === left) return prev
      return { top, left }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox, stagePos, stageScale, gap, margin, elementRef, ...(options?.extraDeps ?? [])])

  return pos
}
