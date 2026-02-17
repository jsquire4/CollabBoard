'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Stage, Layer, Transformer, Rect as KonvaRect } from 'react-konva'
import Konva from 'konva'
import { useCanvas } from '@/hooks/useCanvas'
import { useModifierKeys } from '@/hooks/useShiftKey'
import { BoardObject } from '@/types/board'
import { BoardRole } from '@/types/sharing'
import { StickyNote } from './StickyNote'
import { RectangleShape } from './RectangleShape'
import { CircleShape } from './CircleShape'
import { FrameShape } from './FrameShape'
import { ContextMenu } from './ContextMenu'

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
  onCheckFrameContainment: (id: string) => void
  onMoveGroupChildren: (parentId: string, dx: number, dy: number) => void
  getChildren: (parentId: string) => BoardObject[]
  getDescendants: (parentId: string) => BoardObject[]
  colors: string[]
  selectedColor?: string
  userRole: BoardRole
}

export function Canvas({
  objects, sortedObjects, selectedIds, activeGroupId,
  onSelect, onSelectObjects, onClearSelection, onEnterGroup, onExitGroup,
  onDragEnd, onUpdateText, onTransformEnd,
  onDelete, onDuplicate, onColorChange,
  onBringToFront, onBringForward, onSendBackward, onSendToBack,
  onGroup, onUngroup, canGroup, canUngroup,
  onCheckFrameContainment, onMoveGroupChildren,
  getChildren, getDescendants,
  colors, selectedColor, userRole,
}: CanvasProps) {
  const canEdit = userRole !== 'viewer'
  const { stagePos, stageScale, handleWheel, handleDragEnd: handleStageDragEnd } = useCanvas()
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map())
  const { shiftHeld, ctrlHeld } = useModifierKeys()

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
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const isMarqueeActive = useRef(false)

  // Track previous positions for group drag delta
  const dragStartPos = useRef<Map<string, { x: number; y: number }>>(new Map())

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
  }, [editingId, selectedIds, activeGroupId, onDelete, onDuplicate, onGroup, onUngroup, onClearSelection, onExitGroup, canEdit])

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

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
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

  // Handle drag end with frame containment check and group child movement
  // NOTE: Group children movement is handled by the Transformer (all children are
  // attached via effectiveNodeIds). Each child's own onTransformEnd persists its
  // new position. We do NOT manually move siblings here to avoid doubling.
  const handleShapeDragEnd = useCallback((id: string, x: number, y: number) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return

    const dx = x - obj.x
    const dy = y - obj.y

    onDragEnd(id, x, y)

    // If this is a frame, move all children
    if (obj.type === 'frame') {
      onMoveGroupChildren(id, dx, dy)
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

  // Marquee selection handlers
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only start marquee if clicking on empty area with shift held
    if (!shiftHeld) return
    if (e.target !== e.target.getStage()) return

    const stage = stageRef.current
    if (!stage) return

    const pos = stage.getPointerPosition()
    if (!pos) return

    // Convert screen position to canvas coordinates
    const canvasX = (pos.x - stagePos.x) / stageScale
    const canvasY = (pos.y - stagePos.y) / stageScale

    marqueeStart.current = { x: canvasX, y: canvasY }
    isMarqueeActive.current = true
    setMarquee({ x: canvasX, y: canvasY, width: 0, height: 0 })

    // Disable stage dragging during marquee
    stage.draggable(false)
  }, [shiftHeld, stagePos, stageScale])

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isMarqueeActive.current || !marqueeStart.current) return

    const stage = stageRef.current
    if (!stage) return

    const pos = stage.getPointerPosition()
    if (!pos) return

    const canvasX = (pos.x - stagePos.x) / stageScale
    const canvasY = (pos.y - stagePos.y) / stageScale

    const x = Math.min(marqueeStart.current.x, canvasX)
    const y = Math.min(marqueeStart.current.y, canvasY)
    const width = Math.abs(canvasX - marqueeStart.current.x)
    const height = Math.abs(canvasY - marqueeStart.current.y)

    setMarquee({ x, y, width, height })
  }, [stagePos, stageScale])

  const handleStageMouseUp = useCallback(() => {
    if (!isMarqueeActive.current || !marquee) {
      return
    }

    const stage = stageRef.current
    if (stage) stage.draggable(true)

    // Find all objects intersecting the marquee
    if (marquee.width > 2 && marquee.height > 2) {
      const selected: string[] = []
      for (const obj of sortedObjects) {
        // Skip group objects (they're virtual containers)
        if (obj.type === 'group') continue
        // If in active group mode, only select children of the active group
        if (activeGroupId && obj.parent_id !== activeGroupId) continue

        const objRight = obj.x + obj.width
        const objBottom = obj.y + obj.height
        const marqRight = marquee.x + marquee.width
        const marqBottom = marquee.y + marquee.height

        const intersects =
          obj.x < marqRight &&
          objRight > marquee.x &&
          obj.y < marqBottom &&
          objBottom > marquee.y

        if (intersects) {
          selected.push(obj.id)
        }
      }
      if (selected.length > 0) {
        onSelectObjects(selected)
      }
    }

    isMarqueeActive.current = false
    marqueeStart.current = null
    setMarquee(null)
  }, [marquee, sortedObjects, activeGroupId, onSelectObjects])

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

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
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            onStartEdit={handleStartEdit}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            editable={canEdit}
          />
        )
      case 'rectangle':
        return (
          <RectangleShape
            key={obj.id}
            object={obj}
            onDragEnd={handleShapeDragEnd}
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
            isSelected={isSelected}
            onSelect={handleShapeSelect}
            onStartEdit={handleStartEdit}
            shapeRef={handleShapeRef}
            onTransformEnd={onTransformEnd}
            onContextMenu={handleContextMenu}
            editable={canEdit}
          />
        )
      case 'group':
        // Groups don't render visually — only their children do
        return null
      default:
        return null
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={!isMarqueeActive.current}
        onWheel={handleWheel}
        onDragEnd={handleStageDragEnd}
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
      </Stage>

      {/* Textarea overlay for editing text */}
      {editingId && (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={handleFinishEdit}
          onKeyDown={e => {
            if (e.key === 'Escape') handleFinishEdit()
          }}
          style={textareaStyle}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onColorChange={onColorChange}
          onClose={() => setContextMenu(null)}
          colors={colors}
          currentColor={selectedColor}
          onBringToFront={handleCtxBringToFront}
          onBringForward={handleCtxBringForward}
          onSendBackward={handleCtxSendBackward}
          onSendToBack={handleCtxSendToBack}
          onGroup={onGroup}
          onUngroup={onUngroup}
          canGroup={canGroup}
          canUngroup={canUngroup}
        />
      )}
    </div>
  )
}
