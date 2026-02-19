'use client'

import React, { useRef, useCallback, useEffect, useMemo } from 'react'
import { Stage, Layer, Transformer, Rect as KonvaRect, Group as KonvaGroup, Line as KonvaLine, Circle as KonvaCircle } from 'react-konva'
import Konva from 'konva'
import { useCanvas } from '@/hooks/useCanvas'
import { useModifierKeys } from '@/hooks/useModifierKeys'
import { BoardObject, BoardObjectType } from '@/types/board'
import { useBoardContext } from '@/contexts/BoardContext'
import { useStageInteractions } from '@/hooks/board/useStageInteractions'
import { useRemoteCursors } from '@/hooks/board/useRemoteCursors'
import { useRightClickPan } from '@/hooks/board/useRightClickPan'
import { useGridBackground } from '@/hooks/board/useGridBackground'
import { useTextEditing } from '@/hooks/board/useTextEditing'
import { useKeyboardShortcuts } from '@/hooks/board/useKeyboardShortcuts'
import { useShapeDrag } from '@/hooks/board/useShapeDrag'
import { useContextMenu } from '@/hooks/board/useContextMenu'
import { shapeRegistry } from './shapeRegistry'
import { isVectorType } from './shapeUtils'
import { renderShape, ShapeCallbacks, ShapeState } from './renderShape'
import { computeAutoRoute } from './autoRoute'
import { RemoteSelectionHighlights } from './RemoteSelectionHighlights'
import { LockIconOverlay } from './LockIconOverlay'
import { CanvasOverlays } from './CanvasOverlays'
import type { RemoteCursorData } from '@/hooks/useCursors'

// Shape types that support triple-click text editing (all registry shapes)
const TRIPLE_CLICK_TEXT_TYPES = new Set(shapeRegistry.keys())

interface CanvasProps {
  // Command callbacks (not in context — explicit for testability)
  onDrawShape?: (type: BoardObjectType, x: number, y: number, width: number, height: number) => void
  onCancelTool?: () => void
  onSelect: (id: string | null, opts?: { shift?: boolean; ctrl?: boolean }) => void
  onSelectObjects: (ids: string[]) => void
  onClearSelection: () => void
  onEnterGroup: (groupId: string, selectChildId?: string) => void
  onExitGroup: () => void
  onDragEnd: (id: string, x: number, y: number) => void
  onDragMove?: (id: string, x: number, y: number) => void
  onUpdateText: (id: string, text: string) => void
  onUpdateTitle: (id: string, title: string) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
  onDelete: () => void
  onDuplicate: () => void
  onCopy?: () => void
  onPaste?: () => void
  onColorChange: (color: string) => void
  onBringToFront: (id: string) => void
  onBringForward: (id: string) => void
  onSendBackward: (id: string) => void
  onSendToBack: (id: string) => void
  onGroup: () => void
  onUngroup: () => void
  canGroup: boolean
  canUngroup: boolean
  onStrokeStyleChange?: (updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => void
  onOpacityChange?: (opacity: number) => void
  onMarkerChange?: (updates: { marker_start?: string; marker_end?: string }) => void
  onDragStart?: (id: string) => void
  onUndo?: () => void
  onRedo?: () => void
  onCheckFrameContainment: (id: string) => void
  onMoveGroupChildren: (parentId: string, dx: number, dy: number, skipDb?: boolean) => void
  recentColors?: string[]
  colors: string[]
  selectedColor?: string
  onEndpointDragMove?: (id: string, updates: Partial<BoardObject>) => void
  onEndpointDragEnd?: (id: string, updates: Partial<BoardObject>) => void
  onCursorMove?: (x: number, y: number) => void
  onCursorUpdate?: (fn: (cursors: Map<string, RemoteCursorData>) => void) => void
  onEditingChange?: (isEditing: boolean) => void
  anySelectedLocked?: boolean
  onLock?: () => void
  onUnlock?: () => void
  canLock?: boolean
  canUnlock?: boolean
  vertexEditId?: string | null
  onEditVertices?: () => void
  onExitVertexEdit?: () => void
  onVertexDragEnd?: (id: string, index: number, x: number, y: number) => void
  onVertexInsert?: (id: string, afterIndex: number) => void
  canEditVertices?: boolean
  snapIndicator?: { x: number; y: number } | null
  onActivity?: () => void
  pendingEditId?: string | null
  onPendingEditConsumed?: () => void
  onUpdateBoardSettings?: (updates: { grid_size?: number; grid_subdivisions?: number; grid_visible?: boolean; snap_to_grid?: boolean; grid_style?: string; canvas_color?: string; grid_color?: string; subdivision_color?: string }) => void
  onWaypointDragEnd?: (id: string, waypointIndex: number, x: number, y: number) => void
  onWaypointInsert?: (id: string, afterSegmentIndex: number) => void
  onWaypointDelete?: (id: string, waypointIndex: number) => void
  autoRoutePointsRef?: React.MutableRefObject<Map<string, number[]>>
  onDrawLineFromAnchor?: (type: BoardObjectType, startShapeId: string, startAnchor: string, startX: number, startY: number, endX: number, endY: number, screenEndX?: number, screenEndY?: number) => void
}

export function Canvas({
  onDrawShape, onCancelTool,
  onSelect, onSelectObjects, onClearSelection, onEnterGroup, onExitGroup,
  onDragEnd, onDragMove, onUpdateText, onUpdateTitle, onTransformEnd,
  onDelete, onDuplicate, onCopy, onPaste, onColorChange,
  onBringToFront, onBringForward, onSendBackward, onSendToBack,
  onGroup, onUngroup, canGroup, canUngroup,
  onStrokeStyleChange,
  onOpacityChange,
  onMarkerChange,
  onDragStart: onDragStartProp,
  onUndo, onRedo,
  onCheckFrameContainment, onMoveGroupChildren,
  recentColors, colors, selectedColor,
  onEndpointDragMove, onEndpointDragEnd,
  onCursorMove, onCursorUpdate,
  onEditingChange,
  anySelectedLocked,
  onLock, onUnlock, canLock, canUnlock,
  vertexEditId, onEditVertices, onExitVertexEdit, onVertexDragEnd, onVertexInsert,
  canEditVertices,
  snapIndicator,
  onActivity,
  pendingEditId,
  onPendingEditConsumed,
  onUpdateBoardSettings,
  onWaypointDragEnd,
  onWaypointInsert,
  onWaypointDelete,
  autoRoutePointsRef,
  onDrawLineFromAnchor,
}: CanvasProps) {
  // ── Read shared state from context ──────────────────────────────
  const {
    objects, sortedObjects, selectedIds, activeGroupId, activeTool,
    getDescendants,
    canEdit,
    onlineUsers, remoteSelections, isObjectLocked,
    gridSize, gridSubdivisions, gridVisible,
    snapToGrid: snapToGridEnabled,
    gridStyle, canvasColor, gridColor, subdivisionColor, uiDarkMode,
  } = useBoardContext()
  const { stagePos, setStagePos, stageScale, handleWheel, zoomIn, zoomOut, resetZoom } = useCanvas()
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map())
  const reverseShapeRefs = useRef<Map<Konva.Node, string>>(new Map())
  const objectsRef = useRef(objects)
  objectsRef.current = objects

  // ── Extracted hooks ────────────────────────────────────────────────

  const {
    handleStageMouseDown, handleStageMouseMove, handleStageMouseUp,
    marquee, drawPreview, linePreview, hoveredAnchors, connectorHint,
    connectorHintDrawingRef, drawSnapStartRef,
    isDrawing, drawStart, drawIsLineRef,
    marqueeJustCompletedRef, drawJustCompletedRef,
    setDrawPreview, setLinePreview, setConnectorHint,
  } = useStageInteractions({
    stageRef, stagePos, stageScale, shapeRefs, reverseShapeRefs,
    onDrawShape, onSelectObjects, onDrawLineFromAnchor,
    onCursorMove, onActivity,
  })

  const { cursorLayerRef } = useRemoteCursors({ onCursorUpdate, onlineUsers })

  const { containerRef, dimensions, gridStyles } = useGridBackground({
    stagePos, stageScale, gridSize, gridSubdivisions, gridStyle,
    gridVisible, canvasColor, gridColor, subdivisionColor, snapToGridEnabled,
  })

  const { isPanning, didPanRef } = useRightClickPan({
    stageRef, containerRef, setStagePos,
    stageScale, gridSize, gridSubdivisions, gridStyle,
  })

  const { handleShapeDragStart, handleShapeDragMove, handleShapeDragEnd, shapeDragBoundFunc } = useShapeDrag({
    shapeRefs, stageRef, stagePos, stageScale,
    onDragStart: onDragStartProp, onDragEnd, onDragMove,
    onMoveGroupChildren, onCheckFrameContainment, onCursorMove,
  })

  const {
    contextMenu, setContextMenu, handleContextMenu, handleStageContextMenu,
    contextTargetId, handleCtxBringToFront, handleCtxBringForward, handleCtxSendBackward, handleCtxSendToBack,
  } = useContextMenu({
    onSelect, onBringToFront, onBringForward, onSendBackward, onSendToBack,
    didPanRef, onActivity,
  })

  const { shiftHeld, ctrlHeld } = useModifierKeys()

  // Expand group IDs in selectedIds to their visible children (for Transformer attachment).
  // Vector types (line/arrow) are excluded — they use endpoint anchors instead.
  const effectiveNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      // Skip locked shapes — they should not be part of the Transformer
      if (isObjectLocked?.(id)) continue
      if (obj?.type === 'group') {
        for (const d of getDescendants(id)) {
          if (d.type !== 'group' && !isVectorType(d.type)) ids.add(d.id)
        }
      } else if (obj && !isVectorType(obj.type)) {
        ids.add(id)
      }
    }
    return ids
  }, [selectedIds, objects, getDescendants, isObjectLocked])

  // Ref callback for shape registration (maintains both forward and reverse maps)
  const handleShapeRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) {
      shapeRefs.current.set(id, node)
      reverseShapeRefs.current.set(node, id)
    } else {
      const existing = shapeRefs.current.get(id)
      if (existing) reverseShapeRefs.current.delete(existing)
      shapeRefs.current.delete(id)
    }
  }, [])

  // Check if a double-click should enter a group instead of its normal action.
  // Returns true if we entered a group (caller should skip its normal behavior).
  const tryEnterGroup = useCallback((id: string): boolean => {
    const obj = objects.get(id)
    if (!obj?.parent_id) return false
    // If the parent group/frame is currently selected but not entered, enter it
    const parent = objects.get(obj.parent_id)
    if (!parent || (parent.type !== 'group' && parent.type !== 'frame')) return false
    if (selectedIds.has(parent.id) && activeGroupId !== parent.id) {
      onEnterGroup(parent.id, id)
      return true
    }
    return false
  }, [objects, selectedIds, activeGroupId, onEnterGroup])

  const {
    editingId, editingField, editText, setEditText,
    textareaStyle, textareaRef,
    handleStartEdit, handleFinishEdit,
    handleShapeDoubleClick, startGeometricTextEdit, lastDblClickRef,
  } = useTextEditing({
    objects, stageScale, canEdit, stageRef, shapeRefs,
    onUpdateText, onUpdateTitle, onEditingChange, onActivity,
    pendingEditId, onPendingEditConsumed, tryEnterGroup,
  })

  // Keyboard shortcuts (delegated to extracted hook)
  useKeyboardShortcuts({
    editingId, canEdit, selectedIds, activeGroupId, activeTool,
    vertexEditId: vertexEditId ?? null, anySelectedLocked: anySelectedLocked ?? false,
    onDelete, onDuplicate, onCopy, onPaste, onGroup, onUngroup,
    onClearSelection, onExitGroup, onCancelTool, onUndo, onRedo,
    onExitVertexEdit,
    onBringToFront, onBringForward, onSendBackward, onSendToBack,
    onCancelDraw: () => {
      isDrawing.current = false
      drawStart.current = null
      setDrawPreview(null)
    },
    onEscapeContextMenu: () => setContextMenu(null),
  })

  // Attach/detach Transformer to effective selected shapes (groups expanded to children)
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return

    if (effectiveNodeIds.size > 0 && !editingId) {
      const nodes: Konva.Node[] = []
      for (const id of effectiveNodeIds) {
        const node = shapeRefs.current.get(id)
        if (node) nodes.push(node)
      }

      if (nodes.length > 0) {
        tr.nodes(nodes)

        // For single circle selection, constrain ratio
        if (nodes.length === 1) {
          const obj = objectsRef.current.get(Array.from(effectiveNodeIds)[0])
          if (obj?.type === 'circle') {
            tr.keepRatio(true)
            tr.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
          } else {
            tr.keepRatio(shiftHeld)
            tr.enabledAnchors([
              'top-left', 'top-center', 'top-right',
              'middle-left', 'middle-right',
              'bottom-left', 'bottom-center', 'bottom-right',
            ])
          }
        } else {
          tr.keepRatio(shiftHeld)
          tr.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
        }

        tr.getLayer()?.batchDraw()
        return
      }
    }

    tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [effectiveNodeIds, editingId, shiftHeld])

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (marqueeJustCompletedRef.current) {
      marqueeJustCompletedRef.current = false
      return
    }
    if (drawJustCompletedRef.current) {
      drawJustCompletedRef.current = false
      return
    }
    if (activeTool) return
    if (e.target === e.target.getStage()) {
      if (activeGroupId) {
        onExitGroup()
      } else {
        onClearSelection()
      }
    }
  }, [onClearSelection, onExitGroup, activeGroupId, activeTool])

  // Handle shape click with modifier keys + triple-click detection
  const handleShapeSelect = useCallback((id: string) => {
    onActivity?.()
    // Triple-click detection: a click shortly after a double-click on the same shape
    const prev = lastDblClickRef.current
    if (prev && prev.id === id && Date.now() - prev.time < 500) {
      lastDblClickRef.current = null
      const obj = objects.get(id)
      if (obj && TRIPLE_CLICK_TEXT_TYPES.has(obj.type)) {
        startGeometricTextEdit(id)
        return
      }
    }
    onSelect(id, { shift: shiftHeld, ctrl: ctrlHeld })
  }, [onSelect, shiftHeld, ctrlHeld, objects, startGeometricTextEdit, onActivity])

  // Auto-route cache: keyed by connector ID, stores { cacheKey, points }.
  // Recomputes only when the connector or connected shapes' positions change.
  const autoRouteCacheRef = useRef<Map<string, { key: string; points: number[] | null }>>(new Map())

  const getAutoRoutePoints = useCallback((obj: BoardObject): number[] | null => {
    // Build a cache key from the connector's relevant fields + connected shape positions
    const startShape = obj.connect_start_id ? objects.get(obj.connect_start_id) : null
    const endShape = obj.connect_end_id ? objects.get(obj.connect_end_id) : null
    const cacheKey = [
      obj.x, obj.y, obj.x2, obj.y2,
      obj.connect_start_id, obj.connect_start_anchor,
      obj.connect_end_id, obj.connect_end_anchor,
      obj.waypoints,
      startShape?.x, startShape?.y, startShape?.width, startShape?.height, startShape?.rotation,
      endShape?.x, endShape?.y, endShape?.width, endShape?.height, endShape?.rotation,
    ].join(',')

    const cached = autoRouteCacheRef.current.get(obj.id)
    if (cached && cached.key === cacheKey) return cached.points

    const points = computeAutoRoute(obj, objects)
    autoRouteCacheRef.current.set(obj.id, { key: cacheKey, points })
    return points
  }, [objects])

  // Viewport culling: only render objects within the visible canvas area (+ margin)
  const visibleObjects = useMemo(() => {
    const margin = 200 // extra canvas-space pixels to avoid pop-in at edges
    const left = -stagePos.x / stageScale - margin
    const top = -stagePos.y / stageScale - margin
    const right = (-stagePos.x + dimensions.width) / stageScale + margin
    const bottom = (-stagePos.y + dimensions.height) / stageScale + margin

    return sortedObjects.filter(obj => {
      if (obj.type === 'group') return false // groups render nothing
      if (isVectorType(obj.type)) {
        const ex2 = obj.x2 ?? obj.x + obj.width
        const ey2 = obj.y2 ?? obj.y + obj.height
        const objLeft = Math.min(obj.x, ex2)
        const objTop = Math.min(obj.y, ey2)
        const objRight = Math.max(obj.x, ex2)
        const objBottom = Math.max(obj.y, ey2)
        return objRight >= left && objLeft <= right && objBottom >= top && objTop <= bottom
      }
      return (obj.x + obj.width) >= left && obj.x <= right &&
             (obj.y + obj.height) >= top && obj.y <= bottom
    })
  }, [sortedObjects, stagePos, stageScale, dimensions])

  // Compute group bounding boxes for visual treatment
  const getGroupBoundingBox = useCallback((groupId: string) => {
    const children = getDescendants(groupId).filter(c => c.type !== 'group')
    if (children.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const c of children) {
      if (isVectorType(c.type)) {
        const cx2 = c.x2 ?? c.x + c.width
        const cy2 = c.y2 ?? c.y + c.height
        minX = Math.min(minX, c.x, cx2)
        minY = Math.min(minY, c.y, cy2)
        maxX = Math.max(maxX, c.x, cx2)
        maxY = Math.max(maxY, c.y, cy2)
      } else {
        minX = Math.min(minX, c.x)
        minY = Math.min(minY, c.y)
        maxX = Math.max(maxX, c.x + c.width)
        maxY = Math.max(maxY, c.y + c.height)
      }
    }
    return { x: minX - 8, y: minY - 8, width: maxX - minX + 16, height: maxY - minY + 16 }
  }, [getDescendants])

  // Determine which groups are selected (for drop shadow visual)
  const selectedGroupIds = useMemo(() => {
    const ids = new Set<string>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'group') ids.add(id)
    }
    return ids
  }, [selectedIds, objects])

  // Shape rendering state + callbacks (stable references for renderShape)
  const shapeState: ShapeState = useMemo(() => ({
    selectedIds, isObjectLocked: isObjectLocked ?? (() => false), canEdit, editingId, editingField,
  }), [selectedIds, isObjectLocked, canEdit, editingId, editingField])

  const shapeCallbacks: ShapeCallbacks = useMemo(() => ({
    handleShapeDragEnd, handleShapeDragMove, handleShapeDragStart,
    handleShapeSelect, handleShapeRef, onTransformEnd, handleContextMenu,
    handleShapeDoubleClick, handleStartEdit, shapeDragBoundFunc,
    onEndpointDragMove, onEndpointDragEnd,
    onWaypointDragEnd, onWaypointInsert, onWaypointDelete,
    getAutoRoutePoints, autoRoutePointsRef,
  }), [
    handleShapeDragEnd, handleShapeDragMove, handleShapeDragStart,
    handleShapeSelect, handleShapeRef, onTransformEnd, handleContextMenu,
    handleShapeDoubleClick, handleStartEdit, shapeDragBoundFunc,
    onEndpointDragMove, onEndpointDragEnd,
    onWaypointDragEnd, onWaypointInsert, onWaypointDelete,
    getAutoRoutePoints, autoRoutePointsRef,
  ])

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: canvasColor,
        ...gridStyles,
        cursor: isPanning ? 'grabbing' : activeTool ? 'crosshair' : undefined,
      }}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={false}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onContextMenu={handleStageContextMenu}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <Layer>
          {/* Group bounding box drop shadows (behind everything) */}
          {Array.from(selectedGroupIds).map(gid => {
            const bbox = getGroupBoundingBox(gid)
            if (!bbox) return null
            return (
              <KonvaRect
                key={`group-shadow-${gid}`}
                x={bbox.x}
                y={bbox.y}
                width={bbox.width}
                height={bbox.height}
                fill="transparent"
                stroke="#0EA5E9"
                strokeWidth={2}
                dash={[8, 4]}
                cornerRadius={6}
                shadowColor="rgba(14, 165, 233, 0.3)"
                shadowBlur={12}
                shadowOffsetX={0}
                shadowOffsetY={0}
                listening={false}
              />
            )
          })}

          {/* Active group highlight */}
          {activeGroupId && (() => {
            const bbox = getGroupBoundingBox(activeGroupId)
            if (!bbox) return null
            return (
              <KonvaRect
                key={`active-group-${activeGroupId}`}
                x={bbox.x}
                y={bbox.y}
                width={bbox.width}
                height={bbox.height}
                fill="rgba(14, 165, 233, 0.05)"
                stroke="#0EA5E9"
                strokeWidth={1}
                dash={[4, 4]}
                cornerRadius={6}
                listening={false}
              />
            )
          })()}

          {/* Remote selection highlights */}
          {remoteSelections && remoteSelections.size > 0 && (
            <RemoteSelectionHighlights
              remoteSelections={remoteSelections}
              onlineUsers={onlineUsers}
              objects={objects}
              getDescendants={getDescendants}
            />
          )}

          {/* Render visible objects sorted by z_index (viewport culled) */}
          {visibleObjects.map(obj => renderShape(obj, shapeState, shapeCallbacks))}

          {/* Lock icon overlays for locked shapes */}
          <LockIconOverlay visibleObjects={visibleObjects} isObjectLocked={isObjectLocked ?? (() => false)} />

          {/* Marquee selection rectangle */}
          {marquee && (
            <KonvaRect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgba(14, 165, 233, 0.1)"
              stroke="#0EA5E9"
              strokeWidth={1}
              dash={[4, 2]}
              listening={false}
            />
          )}

          {/* Connector snap indicator dot */}
          {snapIndicator && (
            <KonvaCircle
              x={snapIndicator.x}
              y={snapIndicator.y}
              radius={8 / stageScale}
              fill="rgba(59, 130, 246, 0.4)"
              stroke="#3B82F6"
              strokeWidth={2 / stageScale}
              listening={false}
            />
          )}

          {/* Anchor preview dots for line/arrow tool hover */}
          {hoveredAnchors && hoveredAnchors.map(anchor => (
            <KonvaCircle
              key={`anchor-preview-${anchor.id}`}
              x={anchor.x}
              y={anchor.y}
              radius={5 / stageScale}
              fill="rgba(59, 130, 246, 0.3)"
              stroke="#3B82F6"
              strokeWidth={1.5 / stageScale}
              listening={false}
            />
          ))}

          {/* Draw-to-create preview rectangle (non-line shapes) */}
          {drawPreview && drawPreview.width > 0 && drawPreview.height > 0 && (
            <KonvaRect
              x={drawPreview.x}
              y={drawPreview.y}
              width={drawPreview.width}
              height={drawPreview.height}
              fill="rgba(99, 102, 241, 0.08)"
              stroke="#6366F1"
              strokeWidth={1.5}
              dash={[6, 3]}
              listening={false}
            />
          )}

          {/* Draw-to-create preview line (line/arrow/connector) */}
          {linePreview && (
            <KonvaLine
              points={[linePreview.x1, linePreview.y1, linePreview.x2, linePreview.y2]}
              stroke="#6366F1"
              strokeWidth={1.5 / stageScale}
              dash={[6 / stageScale, 3 / stageScale]}
              listening={false}
            />
          )}

          {canEdit && (
            <Transformer
              ref={trRef}
              rotateEnabled={true}
              boundBoxFunc={(_oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) {
                  return _oldBox
                }
                return newBox
              }}
              // No onTransform handler — Konva's Transformer handles the
              // visual resize natively via scale. Updating React state mid-
              // transform causes re-renders that fight with the Transformer
              // on plain nodes (shapes without text). Final dimensions are
              // committed in onTransformEnd (via handleShapeTransformEnd).}
            />
          )}

          {/* Vertex edit handles — rendered AFTER Transformer so they sit on top of resize anchors */}
          {vertexEditId && (() => {
            const vObj = objects.get(vertexEditId)
            if (!vObj) return null
            const pts = vObj.custom_points ? (() => { try { return JSON.parse(vObj.custom_points!) as number[] } catch { return null } })() : null
            if (!pts || pts.length < 4) return null
            const numVerts = pts.length / 2
            return (
              <KonvaGroup x={vObj.x} y={vObj.y} rotation={vObj.rotation}>
                {/* Midpoint "add vertex" handles — click to insert a new vertex on this edge */}
                {Array.from({ length: numVerts }, (_, i) => {
                  const j = (i + 1) % numVerts
                  const mx = (pts[i * 2] + pts[j * 2]) / 2
                  const my = (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2
                  return (
                    <KonvaCircle
                      key={`mid-${i}`}
                      x={mx}
                      y={my}
                      radius={4 / stageScale}
                      fill="#E0E7FF"
                      stroke="#818CF8"
                      strokeWidth={1.5 / stageScale}
                      hitStrokeWidth={12 / stageScale}
                      onClick={() => onVertexInsert?.(vertexEditId, i)}
                      onTap={() => onVertexInsert?.(vertexEditId, i)}
                    />
                  )
                })}
                {/* Vertex handles — draggable */}
                {Array.from({ length: numVerts }, (_, i) => (
                  <KonvaCircle
                    key={`vtx-${i}`}
                    x={pts[i * 2]}
                    y={pts[i * 2 + 1]}
                    radius={6 / stageScale}
                    fill="white"
                    stroke="#6366F1"
                    strokeWidth={2 / stageScale}
                    draggable
                    onDragEnd={(e) => {
                      const node = e.target
                      onVertexDragEnd?.(vertexEditId, i, node.x(), node.y())
                    }}
                  />
                ))}
              </KonvaGroup>
            )
          })()}
        </Layer>
        {/* Remote cursors layer — updated imperatively via rAF, no React re-renders */}
        <Layer ref={cursorLayerRef} listening={false} />
      </Stage>

      <CanvasOverlays
        editingId={editingId}
        editingField={editingField}
        editText={editText}
        setEditText={setEditText}
        textareaRef={textareaRef}
        textareaStyle={textareaStyle}
        handleFinishEdit={handleFinishEdit}
        onUpdateText={onUpdateText}
        onUpdateTitle={onUpdateTitle}
        objects={objects}
        connectorHint={connectorHint}
        stageScale={stageScale}
        stagePos={stagePos}
        connectorDrawingRefs={{
          drawSnapStartRef, connectorHintDrawingRef, drawIsLineRef,
          isDrawing, drawStart, setDrawPreview, setLinePreview, setConnectorHint,
        }}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetZoom={resetZoom}
        uiDarkMode={uiDarkMode}
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onColorChange={onColorChange}
        recentColors={recentColors}
        colors={colors}
        selectedColor={selectedColor}
        onStrokeStyleChange={onStrokeStyleChange}
        onOpacityChange={onOpacityChange}
        handleCtxBringToFront={handleCtxBringToFront}
        handleCtxBringForward={handleCtxBringForward}
        handleCtxSendBackward={handleCtxSendBackward}
        handleCtxSendToBack={handleCtxSendToBack}
        onGroup={onGroup}
        onUngroup={onUngroup}
        canGroup={canGroup}
        canUngroup={canUngroup}
        isObjectLocked={isObjectLocked ?? (() => false)}
        onLock={onLock}
        onUnlock={onUnlock}
        canLock={canLock}
        canUnlock={canUnlock}
        onEditVertices={onEditVertices}
        canEditVertices={canEditVertices}
        onMarkerChange={onMarkerChange}
      />

    </div>
  )
}


