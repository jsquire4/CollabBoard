'use client'

import React, { useRef, useState, useCallback, useEffect, useMemo, memo } from 'react'
import { Stage, Layer, Transformer, Rect as KonvaRect, Text as KonvaText, Group as KonvaGroup } from 'react-konva'
import Konva from 'konva'
import { useCanvas } from '@/hooks/useCanvas'
import { useModifierKeys } from '@/hooks/useShiftKey'
import { BoardObject } from '@/types/board'
import { BoardRole } from '@/types/sharing'
import { StickyNote } from './StickyNote'
import { RectangleShape } from './RectangleShape'
import { CircleShape } from './CircleShape'
import { FrameShape } from './FrameShape'
import { LineShape } from './LineShape'
import { TriangleShape } from './TriangleShape'
import { HexagonShape } from './HexagonShape'
import { ArrowShape } from './ArrowShape'
import { ParallelogramShape } from './ParallelogramShape'
import { ContextMenu } from './ContextMenu'
import { ZoomControls } from './ZoomControls'
import { RemoteCursorData } from '@/hooks/useCursors'
import { OnlineUser, getColorForUser } from '@/hooks/usePresence'

// Memoized remote selection highlights — only re-renders when selections/objects change,
// not when the parent Canvas re-renders from drags, transforms, etc.
const RemoteSelectionHighlights = memo(function RemoteSelectionHighlights({
  remoteSelections,
  onlineUsers,
  objects,
}: {
  remoteSelections: Map<string, Set<string>>
  onlineUsers?: OnlineUser[]
  objects: Map<string, BoardObject>
}) {
  return (
    <>
      {Array.from(remoteSelections.entries()).map(([uid, objIds]) => {
        const user = onlineUsers?.find(u => u.user_id === uid)
        const color = user?.color ?? getColorForUser(uid)
        const name = user?.display_name ?? 'User'
        return Array.from(objIds).map(objId => {
          const obj = objects.get(objId)
          if (!obj || obj.type === 'group') return null
          return (
            <KonvaGroup key={`remote-sel-${uid}-${objId}`} listening={false}>
              <KonvaRect
                x={obj.x - 4}
                y={obj.y - 4}
                width={obj.width + 8}
                height={obj.height + 8}
                fill="transparent"
                stroke={color}
                strokeWidth={2}
                cornerRadius={4}
                dash={[6, 3]}
              />
              <KonvaRect
                x={obj.x - 4}
                y={obj.y - 20}
                width={Math.min(name.length * 7 + 12, 120)}
                height={16}
                fill={color}
                cornerRadius={3}
              />
              <KonvaText
                x={obj.x - 4 + 6}
                y={obj.y - 20 + 2}
                text={name}
                fontSize={10}
                fill="white"
                width={Math.min(name.length * 7 + 12, 120) - 12}
                ellipsis={true}
                wrap="none"
              />
            </KonvaGroup>
          )
        })
      })}
    </>
  )
})

interface CanvasProps {
  objects: Map<string, BoardObject>
  sortedObjects: BoardObject[]
  selectedIds: Set<string>
  activeGroupId: string | null
  onSelect: (id: string | null, opts?: { shift?: boolean; ctrl?: boolean }) => void
  onSelectObjects: (ids: string[]) => void
  onClearSelection: () => void
  onEnterGroup: (groupId: string, selectChildId?: string) => void
  onExitGroup: () => void
  onDragEnd: (id: string, x: number, y: number) => void
  onDragMove?: (id: string, x: number, y: number) => void
  onUpdateText: (id: string, text: string) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
  onDelete: () => void
  onDuplicate: () => void
  onColorChange: (color: string) => void
  onBringToFront: (id: string) => void
  onBringForward: (id: string) => void
  onSendBackward: (id: string) => void
  onSendToBack: (id: string) => void
  onGroup: () => void
  onUngroup: () => void
  canGroup: boolean
  canUngroup: boolean
  onStrokeChange?: (updates: { stroke_width?: number; stroke_dash?: string }) => void
  onDragStart?: (id: string) => void
  onUndo?: () => void
  onRedo?: () => void
  onCheckFrameContainment: (id: string) => void
  onMoveGroupChildren: (parentId: string, dx: number, dy: number, skipDb?: boolean) => void
  getChildren: (parentId: string) => BoardObject[]
  getDescendants: (parentId: string) => BoardObject[]
  colors: string[]
  selectedColor?: string
  userRole: BoardRole
  onlineUsers?: OnlineUser[]
  onCursorMove?: (x: number, y: number) => void
  onCursorUpdate?: (fn: (cursors: Map<string, RemoteCursorData>) => void) => void
  remoteSelections?: Map<string, Set<string>>
}

export function Canvas({
  objects, sortedObjects, selectedIds, activeGroupId,
  onSelect, onSelectObjects, onClearSelection, onEnterGroup, onExitGroup,
  onDragEnd, onDragMove, onUpdateText, onTransformEnd,
  onDelete, onDuplicate, onColorChange,
  onBringToFront, onBringForward, onSendBackward, onSendToBack,
  onGroup, onUngroup, canGroup, canUngroup,
  onStrokeChange,
  onDragStart: onDragStartProp,
  onUndo, onRedo,
  onCheckFrameContainment, onMoveGroupChildren,
  getChildren, getDescendants,
  colors, selectedColor, userRole,
  onlineUsers, onCursorMove, onCursorUpdate, remoteSelections,
}: CanvasProps) {
  const canEdit = userRole !== 'viewer'
  const { stagePos, setStagePos, stageScale, handleWheel, zoomIn, zoomOut, resetZoom } = useCanvas()
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const cursorLayerRef = useRef<Konva.Layer>(null)
  const cursorNodesRef = useRef<Map<string, Konva.Group>>(new Map())
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map())
  const onlineUsersRef = useRef(onlineUsers)
  onlineUsersRef.current = onlineUsers
  const { shiftHeld, ctrlHeld } = useModifierKeys()

  // Right-click pan state (manual, bypasses Konva drag system)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const stagePosAtPanStartRef = useRef({ x: 0, y: 0 })

  // Imperatively update Konva cursor nodes — no React re-renders.
  // Positions are snapped directly (same as remote shape updates) to avoid
  // lag. The cursor broadcast is already throttled at 50ms intervals, which
  // provides enough temporal density for smooth visual movement.
  useEffect(() => {
    if (!onCursorUpdate) return

    onCursorUpdate((cursors: Map<string, RemoteCursorData>) => {
      const layer = cursorLayerRef.current
      if (!layer) return

      const activeIds = new Set<string>()

      for (const [uid, cursor] of cursors.entries()) {
        activeIds.add(uid)
        let group = cursorNodesRef.current.get(uid)

        if (!group) {
          // Create new cursor node imperatively
          const users = onlineUsersRef.current
          const user = users?.find(u => u.user_id === uid)
          const color = user?.color ?? getColorForUser(uid)
          const name = user?.display_name ?? 'User'

          group = new Konva.Group({ listening: false })
          const arrow = new Konva.Line({
            points: [0, 0, 0, 18, 12, 12],
            fill: color,
            closed: true,
            stroke: color,
            strokeWidth: 1,
          })
          const label = new Konva.Text({
            x: 14,
            y: 10,
            text: name,
            fontSize: 12,
            fill: color,
            fontStyle: 'bold',
          })
          group.add(arrow, label)
          layer.add(group)
          cursorNodesRef.current.set(uid, group)
        }

        group.position({ x: cursor.x, y: cursor.y })
      }

      // Remove stale cursor nodes
      for (const [uid, group] of cursorNodesRef.current.entries()) {
        if (!activeIds.has(uid)) {
          group.destroy()
          cursorNodesRef.current.delete(uid)
        }
      }

      layer.batchDraw()
    })
  }, [onCursorUpdate])

  // Expand group IDs in selectedIds to their visible children (for Transformer attachment)
  const effectiveNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'group') {
        // Expand group to all descendant non-group shapes
        for (const d of getDescendants(id)) {
          if (d.type !== 'group') ids.add(d.id)
        }
      } else {
        ids.add(id)
      }
    }
    return ids
  }, [selectedIds, objects, getDescendants])

  // Textarea overlay state for editing sticky notes / frame titles
  const [editingId, setEditingId] = useState<string | null>(null)
  const [textareaStyle, setTextareaStyle] = useState<React.CSSProperties>({})
  const [editText, setEditText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; objectId: string } | null>(null)

  // Marquee selection state
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const marqueeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const isMarqueeActive = useRef(false)

  // Ref callback for shape registration
  const handleShapeRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) {
      shapeRefs.current.set(id, node)
    } else {
      shapeRefs.current.delete(id)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingId) return

      if (canEdit && (e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        onDelete()
      } else if (canEdit && (e.ctrlKey || e.metaKey) && e.key === 'd' && selectedIds.size > 0) {
        e.preventDefault()
        onDuplicate()
      } else if (canEdit && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        onUngroup()
      } else if (canEdit && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        onGroup()
      } else if (canEdit && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        onRedo?.()
      } else if (canEdit && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        onUndo?.()
      } else if (e.key === 'Escape') {
        if (activeGroupId) {
          onExitGroup()
        } else {
          onClearSelection()
        }
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingId, selectedIds, activeGroupId, onDelete, onDuplicate, onGroup, onUngroup, onClearSelection, onExitGroup, canEdit, onUndo, onRedo])

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
          const obj = objects.get(Array.from(effectiveNodeIds)[0])
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
  }, [effectiveNodeIds, editingId, objects, shiftHeld])

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

  const handleStartEdit = useCallback((id: string, textNode: Konva.Text) => {
    if (!canEdit) return
    // If double-clicking a child of a selected group, enter the group instead
    if (tryEnterGroup(id)) return

    const stage = stageRef.current
    if (!stage) return

    const obj = objects.get(id)
    if (!obj) return

    const textRect = textNode.getClientRect()

    setEditingId(id)
    setEditText(obj.text || '')
    setTextareaStyle({
      position: 'absolute',
      top: `${textRect.y}px`,
      left: `${textRect.x}px`,
      width: `${textRect.width}px`,
      height: `${textRect.height}px`,
      fontSize: `${obj.font_size * stageScale}px`,
      fontFamily: 'sans-serif',
      padding: '0px',
      margin: '0px',
      border: 'none',
      outline: 'none',
      resize: 'none',
      background: 'transparent',
      color: '#333',
      overflow: 'hidden',
      lineHeight: '1.2',
      zIndex: 100,
    })
  }, [objects, stageScale, canEdit, tryEnterGroup])

  // Double-click handler for non-text shapes (Rectangle, Circle)
  const handleShapeDoubleClick = useCallback((id: string) => {
    tryEnterGroup(id)
  }, [tryEnterGroup])

  const handleFinishEdit = useCallback(() => {
    if (editingId) {
      onUpdateText(editingId, editText)
      setEditingId(null)
    }
  }, [editingId, editText, onUpdateText])

  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editingId])

  // Track whether a marquee just completed, so the click handler doesn't
  // immediately clear the selection (click fires after mousedown+mouseup).
  const marqueeJustCompletedRef = useRef(false)

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (marqueeJustCompletedRef.current) {
      marqueeJustCompletedRef.current = false
      return
    }
    if (e.target === e.target.getStage()) {
      if (activeGroupId) {
        onExitGroup()
      } else {
        onClearSelection()
      }
    }
  }, [onClearSelection, onExitGroup, activeGroupId])

  // Handle shape click with modifier keys
  const handleShapeSelect = useCallback((id: string) => {
    onSelect(id, { shift: shiftHeld, ctrl: ctrlHeld })
  }, [onSelect, shiftHeld, ctrlHeld])

  // Handle double-click on group/frame to enter it
  const handleShapeDblClick = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj) return
    if (obj.type === 'group' || obj.type === 'frame') {
      onEnterGroup(id)
    }
  }, [objects, onEnterGroup])

  // Handle drag start: notify parent for undo capture
  const handleShapeDragStart = useCallback((id: string) => {
    onDragStartProp?.(id)
  }, [onDragStartProp])

  // Handle drag move: update local state + broadcast, no DB write
  const handleShapeDragMove = useCallback((id: string, x: number, y: number) => {
    if (!canEdit || !onDragMove) return
    const obj = objects.get(id)
    if (!obj) return

    const dx = x - obj.x
    const dy = y - obj.y

    onDragMove(id, x, y)

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
  }, [canEdit, objects, onDragMove, onMoveGroupChildren, onCursorMove, stagePos, stageScale])

  // Handle drag end with frame containment check and group child movement
  const handleShapeDragEnd = useCallback((id: string, x: number, y: number) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return

    const dx = x - obj.x
    const dy = y - obj.y

    onDragEnd(id, x, y)

    // If this is a frame, move all children (with DB write)
    if (obj.type === 'frame') {
      onMoveGroupChildren(id, dx, dy, false)
    }

    // Check frame containment for non-frame objects
    if (obj.type !== 'frame' && obj.type !== 'group') {
      setTimeout(() => onCheckFrameContainment(id), 0)
    }
  }, [canEdit, objects, onDragEnd, onMoveGroupChildren, onCheckFrameContainment])

  const handleContextMenu = useCallback((id: string, clientX: number, clientY: number) => {
    if (!canEdit) return
    onSelect(id, { shift: shiftHeld, ctrl: ctrlHeld })
    setContextMenu({ x: clientX, y: clientY, objectId: id })
  }, [onSelect, canEdit, shiftHeld, ctrlHeld])

  const handleStageContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault()
  }, [])

  // Marquee selection (left-click on empty area)
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Right-click is handled by the manual pan listener — ignore here
    if (e.evt.button === 2) return

    // Only left-click on empty area starts marquee
    if (e.evt.button !== 0) return
    const stage = stageRef.current
    if (!stage) return
    if (e.target !== e.target.getStage()) return

    const pos = stage.getPointerPosition()
    if (!pos) return

    const canvasX = (pos.x - stagePos.x) / stageScale
    const canvasY = (pos.y - stagePos.y) / stageScale

    marqueeStart.current = { x: canvasX, y: canvasY }
    isMarqueeActive.current = true
    const rect = { x: canvasX, y: canvasY, width: 0, height: 0 }
    marqueeRef.current = rect
    setMarquee(rect)
  }, [stagePos, stageScale])

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    const canvasX = (pos.x - stagePos.x) / stageScale
    const canvasY = (pos.y - stagePos.y) / stageScale

    // Broadcast cursor position for remote users (skip during marquee)
    if (onCursorMove && !isMarqueeActive.current) {
      onCursorMove(canvasX, canvasY)
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

  const handleStageMouseUp = useCallback(() => {
    if (!isMarqueeActive.current) return

    // Read from ref (always current) instead of React state (may be stale)
    const m = marqueeRef.current
    if (m && m.width > 2 && m.height > 2) {
      const selected: string[] = []
      for (const obj of sortedObjects) {
        if (obj.type === 'group') continue
        if (activeGroupId && obj.parent_id !== activeGroupId) continue

        const objRight = obj.x + obj.width
        const objBottom = obj.y + obj.height
        const marqRight = m.x + m.width
        const marqBottom = m.y + m.height

        const intersects =
          obj.x < marqRight &&
          objRight > m.x &&
          obj.y < marqBottom &&
          objBottom > m.y

        if (intersects) {
          selected.push(obj.id)
        }
      }
      if (selected.length > 0) {
        onSelectObjects(selected)
        // Prevent the subsequent click event from clearing the selection
        marqueeJustCompletedRef.current = true
      }
    }

    isMarqueeActive.current = false
    marqueeStart.current = null
    marqueeRef.current = null
    setMarquee(null)
  }, [sortedObjects, activeGroupId, onSelectObjects])

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

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
      panStartRef.current = { x: e.clientX, y: e.clientY }
      stagePosAtPanStartRef.current = { x: stage.x(), y: stage.y() }
      container.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isPanningRef.current) return
      const stage = stageRef.current
      if (!stage) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      const newX = stagePosAtPanStartRef.current.x + dx
      const newY = stagePosAtPanStartRef.current.y + dy
      stage.position({ x: newX, y: newY })
      stage.batchDraw()
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!isPanningRef.current) return
      isPanningRef.current = false
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

  useEffect(() => {
    const updateSize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Compute group bounding boxes for visual treatment
  const getGroupBoundingBox = useCallback((groupId: string) => {
    const children = getDescendants(groupId).filter(c => c.type !== 'group')
    if (children.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const c of children) {
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x + c.width)
      maxY = Math.max(maxY, c.y + c.height)
    }
    return { x: minX - 8, y: minY - 8, width: maxX - minX + 16, height: maxY - minY + 16 }
  }, [getDescendants])

  // Determine which groups are selected (for drop shadow visual)
  const selectedGroupIds = new Set<string>()
  for (const id of selectedIds) {
    const obj = objects.get(id)
    if (obj?.type === 'group') {
      selectedGroupIds.add(id)
    }
  }

  // Context menu z-order handlers — resolve to group if shape is in a group
  const contextTargetId = useMemo(() => {
    if (!contextMenu) return null
    const obj = objects.get(contextMenu.objectId)
    if (obj?.parent_id && !activeGroupId) {
      // Find top-level group/frame ancestor
      let current = obj
      while (current.parent_id) {
        const parent = objects.get(current.parent_id)
        if (!parent) break
        current = parent
      }
      return current.id
    }
    return contextMenu.objectId
  }, [contextMenu, objects, activeGroupId])
  const handleCtxBringToFront = useCallback(() => {
    if (contextTargetId) onBringToFront(contextTargetId)
  }, [contextTargetId, onBringToFront])
  const handleCtxBringForward = useCallback(() => {
    if (contextTargetId) onBringForward(contextTargetId)
  }, [contextTargetId, onBringForward])
  const handleCtxSendBackward = useCallback(() => {
    if (contextTargetId) onSendBackward(contextTargetId)
  }, [contextTargetId, onSendBackward])
  const handleCtxSendToBack = useCallback(() => {
    if (contextTargetId) onSendToBack(contextTargetId)
  }, [contextTargetId, onSendToBack])

  // Render a shape by type
  const renderShape = (obj: BoardObject) => {
    const isSelected = selectedIds.has(obj.id)

    switch (obj.type) {
      case 'sticky_note':
        return (
          <StickyNote
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            onStartEdit={handleStartEdit}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            editable={canEdit}
            isEditing={editingId === obj.id}
          />
        )
      case 'rectangle':
        return (
          <RectangleShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleShapeDoubleClick}
            editable={canEdit}
          />
        )
      case 'circle':
        return (
          <CircleShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleShapeDoubleClick}
            editable={canEdit}
          />
        )
      case 'frame':
        return (
          <FrameShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            onStartEdit={handleStartEdit}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            editable={canEdit}
            isEditing={editingId === obj.id}
          />
        )
      case 'line':
        return (
          <LineShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            editable={canEdit}
          />
        )
      case 'triangle':
        return (
          <TriangleShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleShapeDoubleClick}
            editable={canEdit}
          />
        )
      case 'chevron':
        return (
          <HexagonShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleShapeDoubleClick}
            editable={canEdit}
          />
        )
      case 'arrow':
        return (
          <ArrowShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleShapeDoubleClick}
            editable={canEdit}
          />
        )
      case 'parallelogram':
        return (
          <ParallelogramShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
            onDragMove={handleShapeDragMove}
            onDragStart={handleShapeDragStart}
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleShapeDoubleClick}
            editable={canEdit}
          />
        )
      case 'group':
        return null
      default:
        return null
    }
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        backgroundColor: '#cbd5e1',
        backgroundImage: `
          linear-gradient(rgba(148, 163, 184, 0.5) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, 0.5) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
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
            />
          )}

          {/* Render all objects sorted by z_index */}
          {sortedObjects.map(obj => renderShape(obj))}

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
            />
          )}
        </Layer>
        {/* Remote cursors layer — updated imperatively via rAF, no React re-renders */}
        <Layer ref={cursorLayerRef} listening={false} />
      </Stage>

      {/* Textarea overlay for editing text */}
      {editingId && (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={e => {
            setEditText(e.target.value)
            if (editingId) onUpdateText(editingId, e.target.value)
          }}
          onBlur={handleFinishEdit}
          onKeyDown={e => {
            if (e.key === 'Escape') handleFinishEdit()
          }}
          style={textareaStyle}
        />
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4">
        <ZoomControls
          scale={stageScale}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={resetZoom}
        />
      </div>

      {/* Right-click context menu */}
      {contextMenu && (() => {
        const ctxObj = objects.get(contextMenu.objectId)
        const isLine = ctxObj?.type === 'line' || ctxObj?.type === 'arrow'
        return (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onColorChange={onColorChange}
          onClose={() => setContextMenu(null)}
          colors={colors}
          currentColor={selectedColor}
          isLine={isLine}
          onStrokeChange={onStrokeChange}
          currentStrokeWidth={ctxObj?.stroke_width}
          currentStrokeDash={ctxObj?.stroke_dash}
          onBringToFront={handleCtxBringToFront}
          onBringForward={handleCtxBringForward}
          onSendBackward={handleCtxSendBackward}
          onSendToBack={handleCtxSendToBack}
          onGroup={onGroup}
          onUngroup={onUngroup}
          canGroup={canGroup}
          canUngroup={canUngroup}
        />
        )
      })()}
    </div>
  )
}
