'use client'

import { useEffect, useRef, useState } from 'react'
import Konva from 'konva'

// ── Hook interface ──────────────────────────────────────────────────

export interface UseRightClickPanDeps {
  stageRef: React.RefObject<Konva.Stage | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  setStagePos: (pos: { x: number; y: number }) => void
  stageScale: number
  gridSize: number
  gridSubdivisions: number
  gridStyle: string
}

// ── Hook ────────────────────────────────────────────────────────────

export function useRightClickPan({
  stageRef, containerRef, setStagePos,
  stageScale, gridSize, gridSubdivisions, gridStyle,
}: UseRightClickPanDeps) {
  const isPanningRef = useRef(false)
  const didPanRef = useRef(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const stagePosAtPanStartRef = useRef({ x: 0, y: 0 })

  // Store grid params in refs so the pointer event listener closure
  // always reads fresh values without needing re-registration.
  const gridParamsRef = useRef({ stageScale, gridSize, gridSubdivisions, gridStyle })
  gridParamsRef.current = { stageScale, gridSize, gridSubdivisions, gridStyle }

  // Manual right-click pan using native pointer events.
  // Bypasses Konva's drag system entirely — Konva's drag is unreliable for
  // non-primary button drags due to internal dragButton/timing issues.
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return
      const stage = stageRef.current
      if (!stage) return

      // Check if right-click hit a shape — if so, let context menu handle it
      const rect = container.getBoundingClientRect()
      const hit = stage.getIntersection({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      if (hit) return

      isPanningRef.current = true
      didPanRef.current = false
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY }
      stagePosAtPanStartRef.current = { x: stage.x(), y: stage.y() }
      container.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isPanningRef.current) return
      didPanRef.current = true
      const stage = stageRef.current
      if (!stage) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      const newX = stagePosAtPanStartRef.current.x + dx
      const newY = stagePosAtPanStartRef.current.y + dy
      stage.position({ x: newX, y: newY })
      stage.batchDraw()
      // Update grid background position live during pan
      const bgEl = containerRef.current
      if (bgEl) {
        // Compute per-layer positions matching the grid rendering logic:
        // dot layers offset by -halfTile so dot centers land on intersections
        const gp = gridParamsRef.current
        const sc = gp.stageScale
        const major = gp.gridSize * sc
        const sub = gp.gridSubdivisions > 1 ? (gp.gridSize / gp.gridSubdivisions) * sc : 0
        const lineP = `${newX}px ${newY}px`
        const majDotP = `${newX - major / 2}px ${newY - major / 2}px`
        const subDotP = sub ? `${newX - sub / 2}px ${newY - sub / 2}px` : ''
        const showL = gp.gridStyle === 'lines' || gp.gridStyle === 'both'
        const showD = gp.gridStyle === 'dots' || gp.gridStyle === 'both'
        const posArr: string[] = []
        if (gp.gridSubdivisions > 1 && showD) posArr.push(subDotP)
        if (showD) posArr.push(majDotP)
        if (showL) posArr.push(lineP, lineP)
        if (gp.gridSubdivisions > 1 && showL) posArr.push(lineP, lineP)
        bgEl.style.backgroundPosition = posArr.join(',')
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!isPanningRef.current) return
      isPanningRef.current = false
      setIsPanning(false)
      container.releasePointerCapture(e.pointerId)
      const stage = stageRef.current
      if (stage) {
        setStagePos({ x: stage.x(), y: stage.y() })
      }
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
    }
  }, [setStagePos])

  return { isPanning, didPanRef }
}
