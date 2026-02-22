import { useCallback } from 'react'
import React from 'react'

export interface ConnectorHintData {
  shapeId: string
  anchor: { id: string; x: number; y: number }
  /** All vertex anchors on the hinted shape */
  allAnchors: { id: string; x: number; y: number }[]
  /** Shape center in canvas coords — used to compute outward offset for the button */
  center: { x: number; y: number }
}

export interface ConnectorDrawingRefs {
  drawSnapStartRef: React.MutableRefObject<{ shapeId: string; anchorId: string; x: number; y: number } | null>
  connectorHintDrawingRef: React.MutableRefObject<boolean>
  drawIsLineRef: React.MutableRefObject<boolean>
  isDrawing: React.MutableRefObject<boolean>
  drawStart: React.MutableRefObject<{ x: number; y: number } | null>
  setDrawPreview: (p: { x: number; y: number; width: number; height: number } | null) => void
  setLinePreview: (p: { x1: number; y1: number; x2: number; y2: number } | null) => void
  setConnectorHint: (h: ConnectorHintData | null) => void
}

interface UseDrawInteractionParams {
  connectorHint: ConnectorHintData | null
  connectorDrawingRefs: ConnectorDrawingRefs
}

interface UseDrawInteractionReturn {
  handleConnectorHintMouseDown: (ev: React.MouseEvent, anchor: { id: string; x: number; y: number }) => void
}

export function useDrawInteraction({
  connectorHint,
  connectorDrawingRefs,
}: UseDrawInteractionParams): UseDrawInteractionReturn {
  const handleConnectorHintMouseDown = useCallback(
    (ev: React.MouseEvent, anchor: { id: string; x: number; y: number }) => {
      if (!connectorHint) return
      ev.stopPropagation()

      const {
        drawSnapStartRef,
        connectorHintDrawingRef,
        drawIsLineRef,
        isDrawing,
        drawStart,
        setDrawPreview,
        setLinePreview,
        setConnectorHint,
      } = connectorDrawingRefs

      // Pre-store anchor and activate connector drawing
      drawSnapStartRef.current = {
        shapeId: connectorHint.shapeId,
        anchorId: anchor.id,
        x: anchor.x,
        y: anchor.y,
      }
      connectorHintDrawingRef.current = true
      drawIsLineRef.current = true
      setConnectorHint(null)
      drawStart.current = { x: anchor.x, y: anchor.y }
      isDrawing.current = true
      setDrawPreview({ x: anchor.x, y: anchor.y, width: 0, height: 0 })

      const cleanup = () => {
        // If Konva's mouseUp already handled it, these are no-ops
        isDrawing.current = false
        drawStart.current = null
        drawSnapStartRef.current = null
        connectorHintDrawingRef.current = false
        drawIsLineRef.current = false
        setDrawPreview(null)
        setLinePreview(null)
        window.removeEventListener('mouseup', cleanup)
      }
      window.addEventListener('mouseup', cleanup, { once: true })
    },
    [connectorHint, connectorDrawingRefs],
  )

  return { handleConnectorHintMouseDown }
}
