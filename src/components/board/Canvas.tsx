'use client'

import React, { useRef, useState, useCallback, useEffect, useMemo, memo } from 'react'
import { Stage, Layer, Transformer, Rect as KonvaRect, Text as KonvaText, Group as KonvaGroup, Line as KonvaLine } from 'react-konva'
import Konva from 'konva'
import { useCanvas } from '@/hooks/useCanvas'
import { useModifierKeys } from '@/hooks/useShiftKey'
import { BoardObject, BoardObjectType } from '@/types/board'
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
import { isVectorType } from './shapeUtils'
import { ContextMenu } from './ContextMenu'
import { ZoomControls } from './ZoomControls'
import { RemoteCursorData } from '@/hooks/useCursors'
import { OnlineUser, getColorForUser } from '@/hooks/usePresence'

// Shape types that support triple-click text editing
const TRIPLE_CLICK_TEXT_TYPES = new Set(['rectangle', 'circle', 'triangle', 'chevron', 'parallelogram'])
// Character limits by shape type (sticky notes are unlimited)
const SHAPE_TEXT_CHAR_LIMIT = 256
const FRAME_TITLE_CHAR_LIMIT = 256
const STICKY_TITLE_CHAR_LIMIT = 256
const UNLIMITED_TEXT_TYPES = new Set(['sticky_note'])

function getTextCharLimit(type: string): number | undefined {
  if (UNLIMITED_TEXT_TYPES.has(type)) return undefined
  if (type === 'frame') return FRAME_TITLE_CHAR_LIMIT
  return SHAPE_TEXT_CHAR_LIMIT
}

// Compute the axis-aligned bounding box of a rect after rotation around its top-left corner.
// Returns { minX, minY } of the rotated AABB — used to position the name label at the visual top.
function getRotatedAABB(
  ox: number, oy: number, w: number, h: number, rotDeg: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const rad = (rotDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Four corners of the highlight rect relative to the rotation origin (ox, oy)
  const corners = [
    { x: -4, y: -4 },
    { x: w + 4, y: -4 },
    { x: -4, y: h + 4 },
    { x: w + 4, y: h + 4 },
  ]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of corners) {
    const rx = ox + c.x * cos - c.y * sin
    const ry = oy + c.x * sin + c.y * cos
    if (rx < minX) minX = rx
    if (ry < minY) minY = ry
    if (rx > maxX) maxX = rx
    if (ry > maxY) maxY = ry
  }
  return { minX, minY, maxX, maxY }
}

// Memoized remote selection highlights — only re-renders when selections/objects change,
// not when the parent Canvas re-renders from drags, transforms, etc.
const RemoteSelectionHighlights = memo(function RemoteSelectionHighlights({
  remoteSelections,
  onlineUsers,
  objects,
  getDescendants,
}: {
  remoteSelections: Map<string, Set<string>>
  onlineUsers?: OnlineUser[]
  objects: Map<string, BoardObject>
  getDescendants: (parentId: string) => BoardObject[]
}) {
  return (
    <>
      {Array.from(remoteSelections.entries()).map(([uid, objIds]) => {
        const user = onlineUsers?.find(u => u.user_id === uid)
        const color = user?.color ?? getColorForUser(uid)
        const name = user?.display_name ?? 'User'
        return Array.from(objIds).map(objId => {
          const obj = objects.get(objId)
          if (!obj) return null

          // For groups, compute bounding box from descendants
          if (obj.type === 'group') {
            const children = getDescendants(objId).filter(c => c.type !== 'group')
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
            const gx = minX - 8
            const gy = minY - 8
            const gw = maxX - minX + 16
            const gh = maxY - minY + 16
            const labelWidth = Math.min(name.length * 7 + 12, 120)
            return (
              <KonvaGroup key={`remote-sel-${uid}-${objId}`} listening={false}>
                <KonvaRect
                  x={gx} y={gy} width={gw} height={gh}
                  fill="transparent" stroke={color} strokeWidth={2}
                  cornerRadius={6} dash={[8, 4]}
                  shadowColor={`${color}4D`} shadowBlur={12}
                />
                <KonvaRect
                  x={gx} y={gy - 20}
                  width={labelWidth} height={16}
                  fill={color} cornerRadius={3}
                />
                <KonvaText
                  x={gx + 6} y={gy - 20 + 2}
                  text={name} fontSize={10} fill="white"
                  width={labelWidth - 12} ellipsis={true} wrap="none"
                />
              </KonvaGroup>
            )
          }

          const labelWidth = Math.min(name.length * 7 + 12, 120)

          // For vector types, use AABB from endpoints (no rotation)
          if (isVectorType(obj.type)) {
            const ex2 = obj.x2 ?? obj.x + obj.width
            const ey2 = obj.y2 ?? obj.y + obj.height
            const bx = Math.min(obj.x, ex2)
            const by = Math.min(obj.y, ey2)
            const bw = Math.abs(ex2 - obj.x)
            const bh = Math.abs(ey2 - obj.y)
            return (
              <KonvaGroup key={`remote-sel-${uid}-${objId}`} listening={false}>
                <KonvaRect
                  x={bx - 4} y={by - 4}
                  width={bw + 8} height={bh + 8}
                  fill="transparent" stroke={color} strokeWidth={2}
                  cornerRadius={4} dash={[6, 3]}
                />
                <KonvaRect
                  x={bx - 4} y={by - 20}
                  width={labelWidth} height={16}
                  fill={color} cornerRadius={3}
                />
                <KonvaText
                  x={bx - 4 + 6} y={by - 20 + 2}
                  text={name} fontSize={10} fill="white"
                  width={labelWidth - 12} ellipsis={true} wrap="none"
                />
              </KonvaGroup>
            )
          }

          // For non-vector shapes: rotate the highlight with the shape
          const rotation = (obj.type === 'circle') ? 0 : (obj.rotation || 0)
          const bw = obj.width
          const bh = obj.height

          // Compute where the visual top of the rotated box is for the name label
          let labelX: number, labelY: number
          if (rotation !== 0) {
            const aabb = getRotatedAABB(obj.x, obj.y, bw, bh, rotation)
            labelX = aabb.minX
            labelY = aabb.minY - 16
          } else {
            labelX = obj.x - 4
            labelY = obj.y - 20
          }

          return (
            <KonvaGroup key={`remote-sel-${uid}-${objId}`} listening={false}>
              {/* Dashed highlight rect — rotated with the shape */}
              <KonvaGroup x={obj.x} y={obj.y} rotation={rotation}>
                <KonvaRect
                  x={-4} y={-4}
                  width={bw + 8} height={bh + 8}
                  fill="transparent" stroke={color} strokeWidth={2}
                  cornerRadius={4} dash={[6, 3]}
                />
              </KonvaGroup>
              {/* Name label — always horizontal, at visual top */}
              <KonvaRect
                x={labelX} y={labelY}
                width={labelWidth} height={16}
                fill={color} cornerRadius={3}
              />
              <KonvaText
                x={labelX + 6} y={labelY + 2}
                text={name} fontSize={10} fill="white"
                width={labelWidth - 12} ellipsis={true} wrap="none"
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
  activeTool?: BoardObjectType | null
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
  onTransformMove?: (id: string, updates: Partial<BoardObject>) => void
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
  onStrokeStyleChange?: (updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => void
  onOpacityChange?: (opacity: number) => void
  onDragStart?: (id: string) => void
  onUndo?: () => void
  onRedo?: () => void
  onCheckFrameContainment: (id: string) => void
  onMoveGroupChildren: (parentId: string, dx: number, dy: number, skipDb?: boolean) => void
  getChildren: (parentId: string) => BoardObject[]
  getDescendants: (parentId: string) => BoardObject[]
  recentColors?: string[]
  colors: string[]
  selectedColor?: string
  userRole: BoardRole
  onlineUsers?: OnlineUser[]
  onEndpointDragMove?: (id: string, updates: Partial<BoardObject>) => void
  onEndpointDragEnd?: (id: string, updates: Partial<BoardObject>) => void
  onCursorMove?: (x: number, y: number) => void
  onCursorUpdate?: (fn: (cursors: Map<string, RemoteCursorData>) => void) => void
  remoteSelections?: Map<string, Set<string>>
  onEditingChange?: (isEditing: boolean) => void
  isObjectLocked?: (id: string) => boolean
  anySelectedLocked?: boolean
  onLock?: () => void
  onUnlock?: () => void
  canLock?: boolean
  canUnlock?: boolean
}

export function Canvas({
  objects, sortedObjects, selectedIds, activeGroupId,
  activeTool, onDrawShape, onCancelTool,
  onSelect, onSelectObjects, onClearSelection, onEnterGroup, onExitGroup,
  onDragEnd, onDragMove, onUpdateText, onUpdateTitle, onTransformEnd, onTransformMove,
  onDelete, onDuplicate, onColorChange,
  onBringToFront, onBringForward, onSendBackward, onSendToBack,
  onGroup, onUngroup, canGroup, canUngroup,
  onStrokeStyleChange,
  onOpacityChange,
  onDragStart: onDragStartProp,
  onUndo, onRedo,
  onCheckFrameContainment, onMoveGroupChildren,
  getChildren, getDescendants,
  recentColors, colors, selectedColor, userRole,
  onEndpointDragMove, onEndpointDragEnd,
  onlineUsers, onCursorMove, onCursorUpdate, remoteSelections,
  onEditingChange,
  isObjectLocked, anySelectedLocked,
  onLock, onUnlock, canLock, canUnlock,
}: CanvasProps) {
  const canEdit = userRole !== 'viewer'
  const { stagePos, setStagePos, stageScale, handleWheel, zoomIn, zoomOut, resetZoom } = useCanvas()
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const cursorLayerRef = useRef<Konva.Layer>(null)
  const cursorNodesRef = useRef<Map<string, Konva.Group>>(new Map())
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map())
  // Snapshot of each node's width/height at transform start — prevents feedback loops
  // when onTransformMove updates state and the next tick reads stale dimensions.
  const transformOriginRef = useRef<Map<string, { width: number; height: number }>>(new Map())
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
          // Traditional pointer cursor shape
          const arrow = new Konva.Line({
            points: [
              0, 0,       // tip
              0, 20,      // down left edge
              5.5, 15.5,  // notch inward
              10, 22,     // lower-right tail
              12.5, 20.5, // tail right edge
              8, 14,      // notch back
              14, 14,     // right wing
            ],
            fill: color,
            closed: true,
            stroke: '#FFFFFF',
            strokeWidth: 1.5,
            lineJoin: 'round',
          })
          // Name label with background pill
          const labelText = name
          const tempText = new Konva.Text({ text: labelText, fontSize: 11, fontStyle: 'bold' })
          const textW = tempText.width()
          tempText.destroy()
          const pillPadX = 6
          const pillPadY = 3
          const labelBg = new Konva.Rect({
            x: 12,
            y: 18,
            width: textW + pillPadX * 2,
            height: 11 + pillPadY * 2,
            fill: color,
            cornerRadius: 4,
          })
          const label = new Konva.Text({
            x: 12 + pillPadX,
            y: 18 + pillPadY,
            text: labelText,
            fontSize: 11,
            fill: '#FFFFFF',
            fontStyle: 'bold',
          })
          group.add(arrow, labelBg, label)
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

  // Textarea overlay state for editing sticky notes / frame titles
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'text' | 'title'>('text')
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

  // Draw-to-create state
  const drawStart = useRef<{ x: number; y: number } | null>(null)
  const isDrawing = useRef(false)
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

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

      if (canEdit && (e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && !anySelectedLocked) {
        e.preventDefault()
        onDelete()
      } else if (canEdit && (e.ctrlKey || e.metaKey) && e.key === 'd' && selectedIds.size > 0 && !anySelectedLocked) {
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
        if (activeTool) {
          onCancelTool?.()
          // Cancel in-progress draw
          isDrawing.current = false
          drawStart.current = null
          setDrawPreview(null)
        } else if (activeGroupId) {
          onExitGroup()
        } else {
          onClearSelection()
        }
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingId, selectedIds, activeGroupId, activeTool, onDelete, onDuplicate, onGroup, onUngroup, onClearSelection, onExitGroup, onCancelTool, canEdit, onUndo, onRedo, anySelectedLocked])

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

  const handleStartEdit = useCallback((id: string, textNode: Konva.Text, field: 'text' | 'title' = 'text') => {
    if (!canEdit) return
    // If double-clicking a child of a selected group, enter the group instead
    if (tryEnterGroup(id)) return

    const stage = stageRef.current
    if (!stage) return

    const obj = objects.get(id)
    if (!obj) return

    const textRect = textNode.getClientRect()

    setEditingId(id)
    setEditingField(field)

    let initialText: string
    if (field === 'title') {
      initialText = (obj.title ?? 'Note').slice(0, STICKY_TITLE_CHAR_LIMIT)
    } else {
      const charLimit = getTextCharLimit(obj.type)
      initialText = charLimit ? (obj.text || '').slice(0, charLimit) : (obj.text || '')
    }
    setEditText(initialText)

    const fontSize = field === 'title' ? 14 : obj.font_size
    const fontFamily = obj.font_family || 'sans-serif'
    const fontStyle = obj.font_style || 'normal'
    const isBold = fontStyle === 'bold' || fontStyle === 'bold italic'
    const isItalic = fontStyle === 'italic' || fontStyle === 'bold italic'
    const textColor = field === 'title' ? (obj.text_color ?? '#374151') : (obj.text_color ?? '#000000')
    const textAlign = (obj.text_align ?? (obj.type === 'sticky_note' ? 'left' : 'center')) as React.CSSProperties['textAlign']
    setTextareaStyle({
      position: 'absolute',
      top: `${textRect.y}px`,
      left: `${textRect.x}px`,
      width: `${textRect.width}px`,
      height: `${textRect.height}px`,
      fontSize: `${fontSize * stageScale}px`,
      fontFamily,
      fontWeight: isBold || field === 'title' ? 'bold' : 'normal',
      fontStyle: isItalic ? 'italic' : 'normal',
      textAlign,
      padding: '0px',
      margin: '0px',
      border: 'none',
      outline: 'none',
      resize: 'none',
      background: 'transparent',
      color: textColor,
      overflow: 'hidden',
      lineHeight: field === 'title' ? '1.3' : '1.2',
      zIndex: 100,
    })
  }, [objects, stageScale, canEdit, tryEnterGroup])

  // Track last double-click for triple-click detection on geometric shapes
  const lastDblClickRef = useRef<{ id: string; time: number } | null>(null)

  // Double-click handler for non-text shapes — only enters group, records for triple-click
  const handleShapeDoubleClick = useCallback((id: string) => {
    if (tryEnterGroup(id)) return
    // Record for triple-click detection (geometric shapes use triple-click to edit text)
    lastDblClickRef.current = { id, time: Date.now() }
  }, [tryEnterGroup])

  // Start text editing on a geometric shape (used by triple-click)
  const startGeometricTextEdit = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj || !canEdit) return
    const konvaNode = shapeRefs.current.get(id)
    if (!konvaNode) return
    const textNode = (konvaNode as Konva.Group).findOne?.('Text') as Konva.Text | undefined
    if (textNode) {
      handleStartEdit(id, textNode)
    } else {
      // Shape has no text yet — add empty text so re-render creates the Text node
      onUpdateText(id, ' ')
      setTimeout(() => {
        const node = shapeRefs.current.get(id)
        const tn = (node as Konva.Group)?.findOne?.('Text') as Konva.Text | undefined
        if (tn) handleStartEdit(id, tn)
      }, 50)
    }
  }, [objects, canEdit, handleStartEdit, onUpdateText])

  const handleFinishEdit = useCallback(() => {
    if (editingId) {
      if (editingField === 'title') {
        onUpdateTitle(editingId, editText.slice(0, STICKY_TITLE_CHAR_LIMIT))
      } else {
        onUpdateText(editingId, editText)
      }
      setEditingId(null)
    }
  }, [editingId, editingField, editText, onUpdateText, onUpdateTitle])

  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editingId])

  // Sync textarea style live when font/text properties change during editing
  useEffect(() => {
    if (!editingId) return
    const obj = objects.get(editingId)
    if (!obj) return
    const fontFamily = obj.font_family || 'sans-serif'
    const fontStyle = obj.font_style || 'normal'
    const isBold = fontStyle === 'bold' || fontStyle === 'bold italic'
    const isItalic = fontStyle === 'italic' || fontStyle === 'bold italic'
    const textColor = editingField === 'title' ? (obj.text_color ?? '#374151') : (obj.text_color ?? '#000000')
    const textAlign = (obj.text_align ?? (obj.type === 'sticky_note' ? 'left' : 'center')) as React.CSSProperties['textAlign']
    const fontSize = editingField === 'title' ? 14 : obj.font_size
    setTextareaStyle(prev => ({
      ...prev,
      fontFamily,
      fontWeight: isBold || editingField === 'title' ? 'bold' : 'normal',
      fontStyle: isItalic ? 'italic' : 'normal',
      color: textColor,
      textAlign,
      fontSize: `${fontSize * stageScale}px`,
    }))
  }, [editingId, editingField, objects, stageScale])

  useEffect(() => {
    onEditingChange?.(!!editingId)
  }, [editingId, onEditingChange])

  // Track whether a marquee just completed, so the click handler doesn't
  // immediately clear the selection (click fires after mousedown+mouseup).
  const marqueeJustCompletedRef = useRef(false)

  // Track whether a draw just completed, so the click handler doesn't
  // immediately clear the selection or tool.
  const drawJustCompletedRef = useRef(false)

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
  }, [onSelect, shiftHeld, ctrlHeld, objects, startGeometricTextEdit])

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

    // Only left-click on empty area
    if (e.evt.button !== 0) return
    const stage = stageRef.current
    if (!stage) return
    if (e.target !== e.target.getStage()) return

    const pos = stage.getPointerPosition()
    if (!pos) return

    const canvasX = (pos.x - stagePos.x) / stageScale
    const canvasY = (pos.y - stagePos.y) / stageScale

    // Draw mode takes priority over marquee
    if (activeTool) {
      drawStart.current = { x: canvasX, y: canvasY }
      isDrawing.current = true
      setDrawPreview({ x: canvasX, y: canvasY, width: 0, height: 0 })
      return
    }

    marqueeStart.current = { x: canvasX, y: canvasY }
    isMarqueeActive.current = true
    const rect = { x: canvasX, y: canvasY, width: 0, height: 0 }
    marqueeRef.current = rect
    setMarquee(rect)
  }, [stagePos, stageScale, activeTool])

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

    // Draw preview update
    if (isDrawing.current && drawStart.current) {
      const x = Math.min(drawStart.current.x, canvasX)
      const y = Math.min(drawStart.current.y, canvasY)
      const width = Math.abs(canvasX - drawStart.current.x)
      const height = Math.abs(canvasY - drawStart.current.y)
      setDrawPreview({ x, y, width, height })
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

  const handleStageMouseUp = useCallback(() => {
    // Finalize draw-to-create
    if (isDrawing.current && drawStart.current && activeTool && onDrawShape) {
      const stage = stageRef.current
      const pos = stage?.getPointerPosition()
      if (pos) {
        const canvasX = (pos.x - stagePos.x) / stageScale
        const canvasY = (pos.y - stagePos.y) / stageScale
        const x = Math.min(drawStart.current.x, canvasX)
        const y = Math.min(drawStart.current.y, canvasY)
        const width = Math.abs(canvasX - drawStart.current.x)
        const height = Math.abs(canvasY - drawStart.current.y)

        if (width >= 5 && height >= 5) {
          onDrawShape(activeTool, x, y, width, height)
        } else {
          // Click without drag — create at click point with default dimensions
          onDrawShape(activeTool, drawStart.current.x, drawStart.current.y, 0, 0)
        }
      }

      isDrawing.current = false
      drawStart.current = null
      setDrawPreview(null)
      drawJustCompletedRef.current = true
      return
    }

    if (!isMarqueeActive.current) return

    // Read from ref (always current) instead of React state (may be stale)
    const m = marqueeRef.current
    if (m && m.width > 2 && m.height > 2) {
      const selected: string[] = []
      for (const obj of sortedObjects) {
        if (obj.type === 'group') continue
        if (activeGroupId && obj.parent_id !== activeGroupId) continue

        // For vector types, compute AABB from endpoints
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
        // Prevent the subsequent click event from clearing the selection
        marqueeJustCompletedRef.current = true
      }
    }

    isMarqueeActive.current = false
    marqueeStart.current = null
    marqueeRef.current = null
    setMarquee(null)
  }, [sortedObjects, activeGroupId, onSelectObjects, activeTool, onDrawShape, stagePos, stageScale])

  const containerRef = useRef<HTMLDivElement>(null)
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
    const el = containerRef.current
    if (!el) return
    const updateSize = () => {
      setDimensions({ width: el.clientWidth, height: el.clientHeight })
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    const shapeLocked = isObjectLocked?.(obj.id) ?? false
    const shapeEditable = canEdit && !shapeLocked

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
            editable={shapeEditable}
            isEditing={editingId === obj.id}
            editingField={editingId === obj.id ? editingField : undefined}
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
            isEditing={editingId === obj.id}
            editable={shapeEditable}
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
            isEditing={editingId === obj.id}
            editable={shapeEditable}
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
            editable={shapeEditable}
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
            editable={shapeEditable}
            onEndpointDragMove={onEndpointDragMove}
            onEndpointDragEnd={onEndpointDragEnd}
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
            isEditing={editingId === obj.id}
            editable={shapeEditable}
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
            isEditing={editingId === obj.id}
            editable={shapeEditable}
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
            editable={shapeEditable}
            onEndpointDragMove={onEndpointDragMove}
            onEndpointDragEnd={onEndpointDragEnd}
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
            isEditing={editingId === obj.id}
            editable={shapeEditable}
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
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: '#cbd5e1',
        backgroundImage: `
          linear-gradient(rgba(148, 163, 184, 0.5) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, 0.5) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        cursor: activeTool ? 'crosshair' : undefined,
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

          {/* Render all objects sorted by z_index */}
          {sortedObjects.map(obj => renderShape(obj))}

          {/* Lock icon overlays for locked shapes */}
          {sortedObjects.map(obj => {
            if (obj.type === 'group') return null
            if (!(isObjectLocked?.(obj.id))) return null
            let iconX: number, iconY: number
            if (isVectorType(obj.type)) {
              const ex2 = obj.x2 ?? obj.x + obj.width
              const ey2 = obj.y2 ?? obj.y + obj.height
              iconX = (obj.x + ex2) / 2 + 8
              iconY = (obj.y + ey2) / 2 - 20
            } else {
              iconX = obj.x + obj.width - 6
              iconY = obj.y - 6
            }
            return (
              <KonvaGroup key={`lock-${obj.id}`} x={iconX} y={iconY} listening={false}>
                {/* Lock body */}
                <KonvaRect
                  x={-6} y={-3}
                  width={12} height={9}
                  fill="#9CA3AF"
                  cornerRadius={2}
                />
                {/* Lock shackle (arc drawn as line) */}
                <KonvaLine
                  points={[-3, -3, -3, -6, 0, -9, 3, -6, 3, -3]}
                  stroke="#9CA3AF"
                  strokeWidth={2.5}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.4}
                />
                {/* Keyhole */}
                <KonvaRect
                  x={-1.5} y={0}
                  width={3} height={3}
                  fill="#F3F4F6"
                  cornerRadius={1}
                />
              </KonvaGroup>
            )
          })}

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

          {/* Draw-to-create preview rectangle */}
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
              onTransformStart={() => {
                const tr = trRef.current
                if (!tr) return
                const origins = new Map<string, { width: number; height: number }>()
                for (const node of tr.nodes()) {
                  const id = Array.from(shapeRefs.current.entries()).find(([, n]) => n === node)?.[0]
                  if (!id) continue
                  const obj = objects.get(id)
                  if (obj) origins.set(id, { width: obj.width, height: obj.height })
                }
                transformOriginRef.current = origins
              }}
              // No onTransform handler — Konva's Transformer handles the
              // visual resize natively via scale. Updating React state mid-
              // transform causes re-renders that fight with the Transformer
              // on plain nodes (shapes without text). Final dimensions are
              // committed in onTransformEnd (via handleShapeTransformEnd).}
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
          maxLength={editingField === 'title' ? STICKY_TITLE_CHAR_LIMIT : (editingId ? getTextCharLimit(objects.get(editingId)?.type ?? '') : undefined)}
          onChange={e => {
            let value = e.target.value
            if (editingField === 'title') {
              value = value.slice(0, STICKY_TITLE_CHAR_LIMIT)
            } else if (editingId) {
              const limit = getTextCharLimit(objects.get(editingId)?.type ?? '')
              if (limit !== undefined) {
                value = value.slice(0, limit)
              }
            }
            setEditText(value)
            if (editingId) {
              if (editingField === 'title') {
                onUpdateTitle(editingId, value)
              } else {
                onUpdateText(editingId, value)
              }
            }
          }}
          onBlur={handleFinishEdit}
          onKeyDown={e => {
            if (e.key === 'Escape') handleFinishEdit()
          }}
          style={textareaStyle}
        />
      )}

      {/* Zoom controls */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-50">
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
          recentColors={recentColors}
          colors={colors}
          currentColor={selectedColor}
          isLine={isLine}
          onStrokeStyleChange={onStrokeStyleChange}
          onOpacityChange={onOpacityChange}
          currentStrokeWidth={ctxObj?.stroke_width}
          currentStrokeDash={ctxObj?.stroke_dash}
          currentStrokeColor={ctxObj?.stroke_color}
          currentOpacity={ctxObj?.opacity ?? 1}
          onBringToFront={handleCtxBringToFront}
          onBringForward={handleCtxBringForward}
          onSendBackward={handleCtxSendBackward}
          onSendToBack={handleCtxSendToBack}
          onGroup={onGroup}
          onUngroup={onUngroup}
          canGroup={canGroup}
          canUngroup={canUngroup}
          isLocked={isObjectLocked?.(contextMenu.objectId) ?? false}
          onLock={() => { onLock?.(); setContextMenu(null) }}
          onUnlock={() => { onUnlock?.(); setContextMenu(null) }}
          canLockShape={canLock}
          canUnlockShape={canUnlock}
        />
        )
      })()}
    </div>
  )
}
