'use client'

import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { Stage, Layer, Transformer, Rect as KonvaRect, Group as KonvaGroup, Line as KonvaLine, Circle as KonvaCircle } from 'react-konva'
import Konva from 'konva'
import { useCanvas } from '@/hooks/useCanvas'
import { useModifierKeys } from '@/hooks/useModifierKeys'
import { BoardObject } from '@/types/board'
import { useBoardContext } from '@/contexts/BoardContext'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import { useStageInteractions } from '@/hooks/board/useStageInteractions'
import { useRemoteCursors } from '@/hooks/board/useRemoteCursors'
import { useRightClickPan } from '@/hooks/board/useRightClickPan'
import { useGridBackground } from '@/hooks/board/useGridBackground'
import { useTextEditing } from '@/hooks/board/useTextEditing'
import { useRichTextEditing } from '@/hooks/board/useRichTextEditing'
import { TipTapEditorOverlay } from './TipTapEditorOverlay'
import type { Editor } from '@tiptap/react'
import { useKeyboardShortcuts } from '@/hooks/board/useKeyboardShortcuts'
import { useShapeDrag } from '@/hooks/board/useShapeDrag'
import { useContextMenu } from '@/hooks/board/useContextMenu'
import { shapeRegistry } from './shapeRegistry'
import { isVectorType } from './shapeUtils'
import { getGroupBoundingBox as getGroupBoundingBoxPure, isObjectInViewport } from '@/lib/geometry/bbox'
import { renderShape, ShapeCallbacks, ShapeState } from './renderShape'
import { computeAutoRoute } from './autoRoute'
import { RemoteSelectionHighlights } from './RemoteSelectionHighlights'
import { LockIconOverlay } from './LockIconOverlay'
import { ObjectIndicators } from './ObjectIndicators'
import { CanvasOverlays } from './CanvasOverlays'
import { RichTextStaticLayer } from './RichTextStaticLayer'
import { RICH_TEXT_ENABLED } from '@/lib/richText'

// Shape types that support triple-click text editing (all registry shapes)
const TRIPLE_CLICK_TEXT_TYPES = new Set(shapeRegistry.keys())

// ── VertexEditHandles ────────────────────────────────────────────────────────
// Renders draggable vertex handles and midpoint "insert vertex" handles for the
// shape currently in vertex-edit mode. Placed after the Transformer in the layer
// so it sits on top of resize anchors.

interface VertexEditHandlesProps {
  vertexEditId: string
  vObj: { x: number; y: number; rotation?: number; custom_points?: string | null }
  pts: number[]
  stageScale: number
  onVertexInsert?: (id: string, index: number) => void
  onVertexDragEnd?: (id: string, index: number, x: number, y: number) => void
}

function VertexEditHandles({
  vertexEditId,
  vObj,
  pts,
  stageScale,
  onVertexInsert,
  onVertexDragEnd,
}: VertexEditHandlesProps) {
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
            fill="#FAF8F4"
            stroke="#1B3A6B"
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
          stroke="#1E4330"
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
}

export function Canvas() {
  // ── Read mutations from context (formerly 75+ props from BoardClient) ──
  const {
    onDrawShape, onCancelTool,
    onSelect, onSelectObjects, onClearSelection, onEnterGroup, onExitGroup,
    onDragEnd, onDragMove, onUpdateText, onUpdateTitle, onUpdateRichText, onEditorReady, onTransformEnd,
    onDelete, onDuplicate, onCopy, onPaste, onColorChange,
    onBringToFront, onBringForward, onSendBackward, onSendToBack,
    onGroup, onUngroup, canGroup, canUngroup,
    onStrokeStyleChange, onOpacityChange, onMarkerChange,
    onDragStart: onDragStartProp, onUndo, onRedo,
    onCheckFrameContainment, onMoveGroupChildren,
    recentColors, colors, selectedColor,
    onEndpointDragMove, onEndpointDragEnd,
    onCursorMove, onCursorUpdate,
    onEditingChange,
    anySelectedLocked, onLock, onUnlock, canLock, canUnlock,
    vertexEditId, onEditVertices, onExitVertexEdit, onVertexDragEnd, onVertexInsert,
    canEditVertices, snapIndicator,
    onActivity, pendingEditId, onPendingEditConsumed,
    onWaypointDragEnd, onWaypointInsert, onWaypointDelete,
    autoRoutePointsRef, onDrawLineFromAnchor,
    onUpdateTableCell, onTableDataChange,
    onAddRow, onDeleteRow, onAddColumn, onDeleteColumn,
    onAddRowAt, onDeleteRowAt, onAddColumnAt, onDeleteColumnAt,
    onAgentClick,
    onApiConfigChange,
    onCut,
    onCommentOpen,
  } = useBoardMutations()
  // ── Read shared state from context ──────────────────────────────
  const {
    objects, sortedObjects, selectedIds, activeGroupId, activeTool,
    getDescendants,
    boardId, canEdit,
    onlineUsers, remoteSelections, isObjectLocked, commentCounts,
    gridSize, gridSubdivisions, gridVisible,
    snapToGrid: snapToGridEnabled,
    gridStyle, canvasColor, gridColor, subdivisionColor,
  } = useBoardContext()
  const { stagePos, setStagePos, stageScale, handleWheel, zoomIn, zoomOut, resetZoom } = useCanvas()
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map())
  const reverseShapeRefs = useRef<Map<Konva.Node, string>>(new Map())
  const objectsRef = useRef(objects)
  objectsRef.current = objects

  // Track shapes being resized so static DOM overlays can hide during transform
  const [transformingIds, setTransformingIds] = useState<Set<string>>(new Set())

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
    objectsRef,
    onDragStart: onDragStartProp, onDragEnd, onDragMove,
    onMoveGroupChildren, onCheckFrameContainment, onCursorMove,
  })

  const {
    contextMenu, setContextMenu, handleContextMenu, handleStageContextMenu,
  } = useContextMenu({
    onSelect, onBringToFront, onBringForward, onSendBackward, onSendToBack,
    didPanRef, onActivity,
  })

  const { shiftHeld, ctrlHeld } = useModifierKeys()

  // Expand group IDs in selectedIds to their visible children (for Transformer attachment).
  // Vector types (line/arrow) are excluded — they use endpoint anchors instead.
  // Stabilized with a ref so the Transformer useEffect doesn't re-run during drag
  // when connector updates cause objects to change but the selected set stays the same.
  const prevEffectiveRef = useRef<Set<string>>(new Set())
  const effectiveNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      // Skip locked shapes — they should not be part of the Transformer
      if (isObjectLocked(id)) continue
      if (obj?.type === 'group') {
        for (const d of getDescendants(id)) {
          if (d.type !== 'group' && !isVectorType(d.type)) ids.add(d.id)
        }
      } else if (obj && !isVectorType(obj.type) && obj.type !== 'agent' && obj.type !== 'context_object' && obj.type !== 'agent_output' && obj.type !== 'api_object') {
        ids.add(id)
      }
    }
    // Return previous reference if contents haven't changed
    const prev = prevEffectiveRef.current
    if (ids.size === prev.size && [...ids].every(id => prev.has(id))) {
      return prev
    }
    prevEffectiveRef.current = ids
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

  // Text editing: use rich text hook when feature is enabled, otherwise use plain text
  const plainTextEditing = useTextEditing({
    objects, stageScale, canEdit, stageRef, shapeRefs,
    onUpdateText, onUpdateTitle, onEditingChange, onActivity,
    onUpdateTableCell,
    pendingEditId: RICH_TEXT_ENABLED ? undefined : pendingEditId,
    onPendingEditConsumed: RICH_TEXT_ENABLED ? undefined : onPendingEditConsumed,
    tryEnterGroup,
  })

  const richTextEditing = useRichTextEditing({
    objects, stageScale, canEdit, shapeRefs,
    enabled: RICH_TEXT_ENABLED,
    onUpdateText, onUpdateTitle,
    onUpdateRichText: onUpdateRichText ?? ((_id: string, _json: string, _before: { text: string; rich_text: string | null }) => {}),
    onEditingChange, onActivity,
    pendingEditId: RICH_TEXT_ENABLED ? pendingEditId : undefined,
    onPendingEditConsumed: RICH_TEXT_ENABLED ? onPendingEditConsumed : undefined,
    tryEnterGroup,
  })

  const {
    editingId, editingField, editText, setEditText,
    textareaStyle, textareaRef,
    handleStartEdit, handleFinishEdit,
    handleShapeDoubleClick, startGeometricTextEdit, lastDblClickRef,
  } = RICH_TEXT_ENABLED ? richTextEditing : plainTextEditing

  // Table cell handlers and coords always use plain text editing (table cells are never rich text)
  const { handleStartCellEdit, handleCellKeyDown, editingCellCoords } = plainTextEditing

  // Expose editor ref to parent
  useEffect(() => {
    if (RICH_TEXT_ENABLED && richTextEditing.editor && onEditorReady) {
      onEditorReady(richTextEditing.editor)
    }
  }, [richTextEditing.editor, onEditorReady])

  // Keyboard shortcuts (delegated to extracted hook)
  const firstSelectedId = selectedIds.size > 0 ? selectedIds.values().next().value as string : null

  useKeyboardShortcuts({
    editingId, canEdit, selectedIds, activeGroupId, activeTool,
    vertexEditId, anySelectedLocked,
    onDelete, onDuplicate, onCopy, onPaste, onGroup, onUngroup,
    onClearSelection, onExitGroup, onCancelTool, onUndo, onRedo,
    onExitVertexEdit,
    onBringToFront, onBringForward, onSendBackward, onSendToBack,
    onCut, onLock, onUnlock, onCommentOpen, firstSelectedId,
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
    if (RICH_TEXT_ENABLED) setTransformingIds(new Set())
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
    onActivity()
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

    return sortedObjects.filter(obj => isObjectInViewport(obj, left, top, right, bottom))
  }, [sortedObjects, stagePos, stageScale, dimensions])

  // Compute group bounding boxes for visual treatment
  const getGroupBoundingBox = useCallback(
    (groupId: string) => getGroupBoundingBoxPure(groupId, getDescendants),
    [getDescendants]
  )

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
    selectedIds, isObjectLocked, canEdit, editingId, editingField, editingCellCoords,
  }), [selectedIds, isObjectLocked, canEdit, editingId, editingField, editingCellCoords])

  const shapeCallbacks: ShapeCallbacks = useMemo(() => ({
    handleShapeDragEnd, handleShapeDragMove, handleShapeDragStart,
    handleShapeSelect, handleShapeRef, onTransformEnd, handleContextMenu,
    handleShapeDoubleClick, handleStartEdit, shapeDragBoundFunc,
    onEndpointDragMove, onEndpointDragEnd,
    onWaypointDragEnd, onWaypointInsert, onWaypointDelete,
    getAutoRoutePoints, autoRoutePointsRef,
    handleStartCellEdit, handleTableDataChange: onTableDataChange,
    handleAddRowAt: onAddRowAt, handleDeleteRowAt: onDeleteRowAt,
    handleAddColumnAt: onAddColumnAt, handleDeleteColumnAt: onDeleteColumnAt,
    onAgentClick,
  }), [
    handleShapeDragEnd, handleShapeDragMove, handleShapeDragStart,
    handleShapeSelect, handleShapeRef, onTransformEnd, handleContextMenu,
    handleShapeDoubleClick, handleStartEdit, shapeDragBoundFunc,
    onEndpointDragMove, onEndpointDragEnd,
    onWaypointDragEnd, onWaypointInsert, onWaypointDelete,
    getAutoRoutePoints, autoRoutePointsRef,
    handleStartCellEdit, onTableDataChange,
    onAddRowAt, onDeleteRowAt, onAddColumnAt, onDeleteColumnAt,
    onAgentClick,
  ])

  // ── RICH_TEXT_ENABLED — centralised flag checks ──────────────────────────────
  //
  // The flag is checked in several structurally distinct places:
  //   • Hook arguments (plainTextEditing / richTextEditing setup, lines ~187-208):
  //     each hook receives complementary subsets of pendingEditId/onPendingEditConsumed,
  //     so each ternary is load-bearing and cannot be collapsed further.
  //   • useEffect guards (editor-ready notification, line ~215; transformingIds reset,
  //     line ~343): both are single conditional statements, already minimal.
  //   • Transformer event handlers (onTransformStart / onTransform / onTransformEnd):
  //     three adjacent ternaries that all guard rich-text–specific side effects —
  //     consolidated below into richTextTransformHandlers and spread onto Transformer.
  //   • JSX gate for RichTextStaticLayer + TipTapEditorOverlay (line ~729):
  //     already a single block-level check, no further reduction possible.
  //
  // Net reduction: 3 scattered ternaries → 1 object literal checked once.

  const richTextTransformHandlers = RICH_TEXT_ENABLED
    ? {
        onTransformStart: () => {
          const tr = trRef.current
          if (!tr) return
          const ids = new Set<string>()
          for (const node of tr.nodes()) {
            const id = reverseShapeRefs.current.get(node)
            if (id) ids.add(id)
          }
          if (ids.size > 0) setTransformingIds(ids)
        },
        onTransform: () => {
          // For rich text shapes: reset scale to 1 and convert to width/height
          // so the DOM text overlay reflows at the new dimensions after resize.
          const tr = trRef.current
          if (!tr) return
          const nodes = tr.nodes()
          for (const node of nodes) {
            const scaleX = node.scaleX()
            const scaleY = node.scaleY()
            if (scaleX === 1 && scaleY === 1) continue
            const id = reverseShapeRefs.current.get(node)
            if (!id) continue
            const obj = objectsRef.current.get(id)
            if (!obj?.rich_text) continue
            // Convert scale into width/height
            node.width(Math.max(5, node.width() * scaleX))
            node.height(Math.max(5, node.height() * scaleY))
            node.scaleX(1)
            node.scaleY(1)
          }
        },
        onTransformEnd: () => {
          setTransformingIds(new Set())
        },
      }
    : {}

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
                stroke="#1B3A6B"
                strokeWidth={2}
                dash={[8, 4]}
                cornerRadius={6}
                shadowColor="rgba(27, 58, 107, 0.3)"
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
                fill="rgba(27, 58, 107, 0.05)"
                stroke="#1B3A6B"
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
          <LockIconOverlay visibleObjects={visibleObjects} isObjectLocked={isObjectLocked} />

          {/* Comment count badges */}
          <ObjectIndicators
            visibleObjects={visibleObjects}
            commentCounts={commentCounts}
            isObjectLocked={isObjectLocked}
          />

          {/* Marquee selection rectangle */}
          {marquee && (
            <KonvaRect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgba(27, 58, 107, 0.1)"
              stroke="#1B3A6B"
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
              fill="rgba(27, 58, 107, 0.4)"
              stroke="#1B3A6B"
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
              fill="rgba(27, 58, 107, 0.3)"
              stroke="#1B3A6B"
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
              fill="rgba(30, 67, 48, 0.08)"
              stroke="#1E4330"
              strokeWidth={1.5}
              dash={[6, 3]}
              listening={false}
            />
          )}

          {/* Draw-to-create preview line (line/arrow/connector) */}
          {linePreview && (
            <KonvaLine
              points={[linePreview.x1, linePreview.y1, linePreview.x2, linePreview.y2]}
              stroke="#1E4330"
              strokeWidth={1.5 / stageScale}
              dash={[6 / stageScale, 3 / stageScale]}
              listening={false}
            />
          )}

          {canEdit && (
            <Transformer
              ref={trRef}
              rotateEnabled={true}
              anchorFill="#FAF8F4"
              anchorStroke="#1B3A6B"
              anchorStrokeWidth={1.5}
              anchorSize={9}
              anchorCornerRadius={2}
              borderStroke="#1B3A6B"
              borderStrokeWidth={1.5}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={5}
              boundBoxFunc={(_oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) {
                  return _oldBox
                }
                return newBox
              }}
              {...richTextTransformHandlers}
            />
          )}

          {/* Vertex edit handles — rendered AFTER Transformer so they sit on top of resize anchors */}
          {vertexEditId && (() => {
            const vObj = objects.get(vertexEditId)
            if (!vObj) return null
            const pts = vObj.custom_points
              ? (() => { try { return JSON.parse(vObj.custom_points!) as number[] } catch { return null } })()
              : null
            if (!pts || pts.length < 4) return null
            return (
              <VertexEditHandles
                key={`vertex-handles-${vertexEditId}`}
                vertexEditId={vertexEditId}
                vObj={vObj}
                pts={pts}
                stageScale={stageScale}
                onVertexInsert={onVertexInsert}
                onVertexDragEnd={onVertexDragEnd}
              />
            )
          })()}
        </Layer>
        {/* Remote cursors layer — updated imperatively via rAF, no React re-renders */}
        <Layer ref={cursorLayerRef} listening={false} />
      </Stage>

      {RICH_TEXT_ENABLED && (
        <>
          <RichTextStaticLayer
            visibleObjects={visibleObjects}
            editingId={editingId}
            transformingIds={transformingIds}
            stagePos={stagePos}
            stageScale={stageScale}
          />
          <div
            className="absolute top-0 left-0"
            style={{
              pointerEvents: 'none',
              transform: `translate(${stagePos.x}px, ${stagePos.y}px) scale(${stageScale})`,
              transformOrigin: '0 0',
              zIndex: 2,
            }}
          >
            <TipTapEditorOverlay
              editor={richTextEditing.editor}
              editingId={editingId}
              editingField={editingField ?? 'text'}
              overlayStyle={richTextEditing.overlayStyle}
              onFinish={handleFinishEdit}
            />
          </div>
        </>
      )}

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
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        onCellKeyDown={handleCellKeyDown}
        boardId={boardId}
        onApiConfigChange={onApiConfigChange}
      />

    </div>
  )
}


