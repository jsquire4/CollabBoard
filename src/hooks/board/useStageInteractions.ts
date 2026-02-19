'use client'

import { useState, useCallback, useRef } from 'react'
import Konva from 'konva'
import { BoardObjectType } from '@/types/board'
import { useBoardContext } from '@/contexts/BoardContext'
import { isVectorType, snapToGrid } from '@/components/board/shapeUtils'
import { getShapeAnchors, findNearestAnchor, AnchorPoint } from '@/components/board/anchorPoints'

// ── Hook interface ──────────────────────────────────────────────────

export interface UseStageInteractionsDeps {
  stageRef: React.RefObject<Konva.Stage | null>
  stagePos: { x: number; y: number }
  stageScale: number
  shapeRefs: React.RefObject<Map<string, Konva.Node>>
  reverseShapeRefs?: React.RefObject<Map<Konva.Node, string>>
  onDrawShape?: (type: BoardObjectType, x: number, y: number, width: number, height: number) => void
  onSelectObjects: (ids: string[]) => void
  onDrawLineFromAnchor?: (type: BoardObjectType, startShapeId: string, startAnchor: string, startX: number, startY: number, endX: number, endY: number, screenEndX?: number, screenEndY?: number) => void
  onCursorMove?: (x: number, y: number) => void
  onActivity?: () => void
}

// ── Hook ────────────────────────────────────────────────────────────

export function useStageInteractions({
  stageRef, stagePos, stageScale, shapeRefs, reverseShapeRefs,
  onDrawShape, onSelectObjects, onDrawLineFromAnchor,
  onCursorMove, onActivity,
}: UseStageInteractionsDeps) {
  const {
    objects, sortedObjects, selectedIds, activeGroupId, activeTool,
    gridSize, gridSubdivisions, snapToGrid: snapToGridEnabled,
  } = useBoardContext()

  // ── Refs synced from context (avoid dep churn in callbacks) ──────

  const objectsRef = useRef(objects)
  objectsRef.current = objects
  const snapToGridEnabledRef = useRef(snapToGridEnabled)
  snapToGridEnabledRef.current = snapToGridEnabled
  const gridSizeRef = useRef(gridSize)
  gridSizeRef.current = gridSize
  const gridSubdivisionsRef = useRef(gridSubdivisions)
  gridSubdivisionsRef.current = gridSubdivisions

  // ── Marquee selection state ──────────────────────────────────────

  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const marqueeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const isMarqueeActive = useRef(false)
  const marqueeJustCompletedRef = useRef(false)

  // ── Draw-to-create state ─────────────────────────────────────────

  const drawStart = useRef<{ x: number; y: number } | null>(null)
  const isDrawing = useRef(false)
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const drawIsLineRef = useRef(false)
  const [linePreview, setLinePreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const drawJustCompletedRef = useRef(false)

  // ── Anchor / connector hint state ────────────────────────────────

  const [hoveredAnchors, setHoveredAnchors] = useState<AnchorPoint[] | null>(null)
  const drawSnapStartRef = useRef<{ shapeId: string; anchorId: string; x: number; y: number } | null>(null)
  const [connectorHint, setConnectorHint] = useState<{ shapeId: string; anchor: AnchorPoint } | null>(null)
  const connectorHintDrawingRef = useRef(false)

  // ── Refs to avoid stale closures in handleStageMouseMove ────────

  const hoveredAnchorsRef = useRef(hoveredAnchors)
  hoveredAnchorsRef.current = hoveredAnchors
  const connectorHintRef = useRef(connectorHint)
  connectorHintRef.current = connectorHint
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  const activeToolRef = useRef(activeTool)
  activeToolRef.current = activeTool

  // ── Throttle ref for hover detection ─────────────────────────────

  const lastHoverCheckRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // ── Helpers ──────────────────────────────────────────────────────

  const findShapeIdFromNode = (node: Konva.Node): string | null => {
    let current: Konva.Node | null = node
    const stage = stageRef.current
    const reverseMap = reverseShapeRefs?.current
    while (current && current !== stage) {
      if (reverseMap) {
        const id = reverseMap.get(current)
        if (id) return id
      } else {
        // Fallback: O(n) scan when reverse map not available
        const id = Array.from(shapeRefs.current.entries()).find(([, n]) => n === current)?.[0]
        if (id) return id
      }
      current = current.parent
    }
    return null
  }

  // ── handleStageMouseDown ─────────────────────────────────────────

  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 2) return
    onActivity?.()
    if (e.evt.button !== 0) return
    const stage = stageRef.current
    if (!stage) return

    const isOnStage = e.target === e.target.getStage()
    const isLineTool = activeTool === 'line' || activeTool === 'arrow'
    if (!isOnStage && !isLineTool) return

    const pos = stage.getPointerPosition()
    if (!pos) return

    const canvasX = (pos.x - stagePos.x) / stageScale
    const canvasY = (pos.y - stagePos.y) / stageScale

    if (activeTool) {
      let sx = snapToGridEnabledRef.current ? snapToGrid(canvasX, gridSizeRef.current, gridSubdivisionsRef.current) : canvasX
      let sy = snapToGridEnabledRef.current ? snapToGrid(canvasY, gridSizeRef.current, gridSubdivisionsRef.current) : canvasY

      drawSnapStartRef.current = null
      if ((activeTool === 'line' || activeTool === 'arrow') && hoveredAnchorsRef.current) {
        const nearest = findNearestAnchor(hoveredAnchorsRef.current, canvasX, canvasY, 20)
        if (nearest) {
          for (const [objId, obj] of objectsRef.current) {
            if (isVectorType(obj.type) || obj.type === 'group' || obj.deleted_at) continue
            const anchors = getShapeAnchors(obj)
            if (anchors.some(a => a.id === nearest.id && Math.abs(a.x - nearest.x) < 0.1 && Math.abs(a.y - nearest.y) < 0.1)) {
              drawSnapStartRef.current = { shapeId: objId, anchorId: nearest.id, x: nearest.x, y: nearest.y }
              sx = nearest.x
              sy = nearest.y
              break
            }
          }
        }
      }

      drawStart.current = { x: sx, y: sy }
      isDrawing.current = true
      drawIsLineRef.current = (activeTool === 'line' || activeTool === 'arrow')
      setDrawPreview({ x: sx, y: sy, width: 0, height: 0 })
      return
    }

    if (e.target !== e.target.getStage()) return

    marqueeStart.current = { x: canvasX, y: canvasY }
    isMarqueeActive.current = true
    const rect = { x: canvasX, y: canvasY, width: 0, height: 0 }
    marqueeRef.current = rect
    setMarquee(rect)
  }, [stagePos, stageScale, activeTool, onActivity])

  // ── handleStageMouseMove ─────────────────────────────────────────

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    const canvasX = (pos.x - stagePos.x) / stageScale
    const canvasY = (pos.y - stagePos.y) / stageScale

    // Broadcast cursor position for remote users (skip during marquee/draw)
    if (onCursorMove && !isMarqueeActive.current && !isDrawing.current) {
      onCursorMove(canvasX, canvasY)
    }

    // Line/arrow tool: show anchor dots on hovered shape
    const isLineTool = activeToolRef.current === 'line' || activeToolRef.current === 'arrow'
    if (isLineTool && !isDrawing.current) {
      const hoverDx = pos.x - lastHoverCheckRef.current.x
      const hoverDy = pos.y - lastHoverCheckRef.current.y
      const hoverDistSq = hoverDx * hoverDx + hoverDy * hoverDy
      if (hoverDistSq >= 64) {
        lastHoverCheckRef.current = { x: pos.x, y: pos.y }

        const hit = stage.getIntersection(pos)
        const hitTarget = hit ?? null
        const shapeId = hitTarget ? findShapeIdFromNode(hitTarget) : null

        if (shapeId) {
          const obj = objectsRef.current.get(shapeId)
          if (obj && !isVectorType(obj.type) && obj.type !== 'group') {
            const anchors = getShapeAnchors(obj).filter(a => a.id !== 'center')
            setHoveredAnchors(anchors.length > 0 ? anchors : null)
          } else {
            setHoveredAnchors(null)
          }
        } else {
          setHoveredAnchors(null)
        }
      }
    } else if (!isLineTool && hoveredAnchorsRef.current) {
      setHoveredAnchors(null)
    }

    // Selection mode: connector hint on hover near shape edge
    if (!activeToolRef.current && !isDrawing.current && !isMarqueeActive.current && selectedIdsRef.current.size === 0) {
      const hoverDx = pos.x - lastHoverCheckRef.current.x
      const hoverDy = pos.y - lastHoverCheckRef.current.y
      const hoverDistSq = hoverDx * hoverDx + hoverDy * hoverDy
      if (hoverDistSq >= 64) {
        lastHoverCheckRef.current = { x: pos.x, y: pos.y }

        const hit = stage.getIntersection(pos)
        const hitTarget = hit ?? null
        const shapeId = hitTarget ? findShapeIdFromNode(hitTarget) : null

        if (shapeId) {
          const obj = objectsRef.current.get(shapeId)
          if (obj && !isVectorType(obj.type) && obj.type !== 'group') {
            const anchors = getShapeAnchors(obj).filter(a => a.id !== 'center')
            const nearest = findNearestAnchor(anchors, canvasX, canvasY, 30)
            if (nearest) {
              setConnectorHint({ shapeId, anchor: nearest })
            } else {
              setConnectorHint(null)
            }
          } else {
            setConnectorHint(null)
          }
        } else {
          setConnectorHint(null)
        }
      }
    } else if (connectorHintRef.current && (activeToolRef.current || selectedIdsRef.current.size > 0)) {
      setConnectorHint(null)
    }

    // Draw preview update
    if (isDrawing.current && drawStart.current) {
      const cx = snapToGridEnabledRef.current ? snapToGrid(canvasX, gridSizeRef.current, gridSubdivisionsRef.current) : canvasX
      const cy = snapToGridEnabledRef.current ? snapToGrid(canvasY, gridSizeRef.current, gridSubdivisionsRef.current) : canvasY
      if (drawIsLineRef.current) {
        setLinePreview({ x1: drawStart.current.x, y1: drawStart.current.y, x2: cx, y2: cy })
        setDrawPreview(null)
      } else {
        const x = Math.min(drawStart.current.x, cx)
        const y = Math.min(drawStart.current.y, cy)
        const width = Math.abs(cx - drawStart.current.x)
        const height = Math.abs(cy - drawStart.current.y)
        setDrawPreview({ x, y, width, height })
        setLinePreview(null)
      }
      return
    }

    if (!isMarqueeActive.current || !marqueeStart.current) return

    const x = Math.min(marqueeStart.current.x, canvasX)
    const y = Math.min(marqueeStart.current.y, canvasY)
    const width = Math.abs(canvasX - marqueeStart.current.x)
    const height = Math.abs(canvasY - marqueeStart.current.y)

    const rect = { x, y, width, height }
    marqueeRef.current = rect
    setMarquee(rect)
  }, [stagePos, stageScale, onCursorMove])

  // ── handleStageMouseUp ───────────────────────────────────────────

  const handleStageMouseUp = useCallback(() => {
    onActivity?.()
    const effectiveTool = connectorHintDrawingRef.current ? 'line' as BoardObjectType : activeTool
    if (isDrawing.current && drawStart.current && effectiveTool && onDrawShape) {
      const stage = stageRef.current
      const pos = stage?.getPointerPosition()
      if (pos) {
        const rawX = (pos.x - stagePos.x) / stageScale
        const rawY = (pos.y - stagePos.y) / stageScale
        const canvasX = snapToGridEnabledRef.current ? snapToGrid(rawX, gridSizeRef.current, gridSubdivisionsRef.current) : rawX
        const canvasY = snapToGridEnabledRef.current ? snapToGrid(rawY, gridSizeRef.current, gridSubdivisionsRef.current) : rawY

        const snap = drawSnapStartRef.current
        if (snap && onDrawLineFromAnchor && (effectiveTool === 'line' || effectiveTool === 'arrow')) {
          const screenEndX = canvasX * stageScale + stagePos.x
          const screenEndY = canvasY * stageScale + stagePos.y
          onDrawLineFromAnchor(effectiveTool, snap.shapeId, snap.anchorId, snap.x, snap.y, canvasX, canvasY, screenEndX, screenEndY)
        } else {
          const x = Math.min(drawStart.current.x, canvasX)
          const y = Math.min(drawStart.current.y, canvasY)
          const width = Math.abs(canvasX - drawStart.current.x)
          const height = Math.abs(canvasY - drawStart.current.y)

          if (width >= 5 && height >= 5) {
            onDrawShape(effectiveTool, x, y, width, height)
          } else {
            onDrawShape(effectiveTool, drawStart.current.x, drawStart.current.y, 0, 0)
          }
        }
      }

      isDrawing.current = false
      drawStart.current = null
      drawSnapStartRef.current = null
      connectorHintDrawingRef.current = false
      drawIsLineRef.current = false
      setDrawPreview(null)
      setLinePreview(null)
      setHoveredAnchors(null)
      drawJustCompletedRef.current = true
      return
    }

    if (!isMarqueeActive.current) return

    const m = marqueeRef.current
    if (m && m.width > 2 && m.height > 2) {
      const selected: string[] = []
      for (const obj of sortedObjects) {
        if (obj.type === 'group') continue
        if (activeGroupId && obj.parent_id !== activeGroupId) continue

        let objLeft: number, objTop: number, objRight: number, objBottom: number
        if (isVectorType(obj.type)) {
          const ex2 = obj.x2 ?? obj.x + obj.width
          const ey2 = obj.y2 ?? obj.y + obj.height
          objLeft = Math.min(obj.x, ex2)
          objTop = Math.min(obj.y, ey2)
          objRight = Math.max(obj.x, ex2)
          objBottom = Math.max(obj.y, ey2)
        } else {
          objLeft = obj.x
          objTop = obj.y
          objRight = obj.x + obj.width
          objBottom = obj.y + obj.height
        }
        const marqRight = m.x + m.width
        const marqBottom = m.y + m.height

        const intersects =
          objLeft < marqRight &&
          objRight > m.x &&
          objTop < marqBottom &&
          objBottom > m.y

        if (intersects) {
          selected.push(obj.id)
        }
      }
      if (selected.length > 0) {
        onSelectObjects(selected)
        marqueeJustCompletedRef.current = true
      }
    }

    isMarqueeActive.current = false
    marqueeStart.current = null
    marqueeRef.current = null
    setMarquee(null)
  }, [sortedObjects, activeGroupId, onSelectObjects, activeTool, onDrawShape, stagePos, stageScale, onActivity, onDrawLineFromAnchor])

  return {
    handleStageMouseDown,
    handleStageMouseMove,
    handleStageMouseUp,
    // Render state
    marquee,
    drawPreview,
    linePreview,
    hoveredAnchors,
    connectorHint,
    // Refs needed by other Canvas code
    connectorHintDrawingRef,
    drawSnapStartRef,
    isDrawing,
    drawStart,
    drawIsLineRef,
    marqueeJustCompletedRef,
    drawJustCompletedRef,
    // Setters for external use (e.g., keyboard escape)
    setDrawPreview,
    setLinePreview,
    setHoveredAnchors,
    setConnectorHint,
  }
}
