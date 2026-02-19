'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useBoardState } from '@/hooks/useBoardState'
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel'
import { usePresence } from '@/hooks/usePresence'
import { useCursors } from '@/hooks/useCursors'
import { useUndoStack, UndoEntry } from '@/hooks/useUndoStack'
import { useDarkMode } from '@/hooks/useDarkMode'
import { createClient } from '@/lib/supabase/client'
import { BoardObject, BoardObjectType } from '@/types/board'
import { BoardRole } from '@/types/sharing'
import { BoardTopBar } from './BoardTopBar'
import { LeftToolbar } from './LeftToolbar'
import { EXPANDED_PALETTE } from './ColorPicker'
import { ShareDialog } from './ShareDialog'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'
import { GroupBreadcrumb } from './GroupBreadcrumb'
import { getInitialVertexPoints, isVectorType } from './shapeUtils'
import { FloatingShapePalette } from './FloatingShapePalette'
import { shapeRegistry } from './shapeRegistry'
import { getShapeAnchors, findNearestAnchor, AnchorPoint } from './anchorPoints'
import { parseWaypoints, computeAutoRoute } from './autoRoute'
import type { ShapePreset } from './shapePresets'
import { scaleCustomPoints } from './shapePresets'

// Konva is client-only — must disable SSR
const Canvas = dynamic(() => import('./Canvas').then(mod => ({ default: mod.Canvas })), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
    </div>
  ),
})

/**
 * Pick the best anchor on a shape for a connector endpoint.
 * Uses the connector's OTHER endpoint as reference and picks the nearest anchor.
 * Returns null for self-loop connectors (both ends on same shape) — keep existing anchor.
 */
function pickBestAnchor(
  connector: BoardObject,
  endpoint: 'start' | 'end',
  anchors: AnchorPoint[],
  otherEndpoint?: { x: number; y: number }
): { x: number; y: number; anchorId: string } | null {
  if (anchors.length === 0) return null
  // Self-loop guard: don't re-select if both ends connect to the same shape
  if (connector.connect_start_id && connector.connect_start_id === connector.connect_end_id) return null
  // Reference = the OTHER endpoint (use provided coords if available to avoid stale reads)
  const refX = otherEndpoint?.x ?? (endpoint === 'start' ? (connector.x2 ?? connector.x + connector.width) : connector.x)
  const refY = otherEndpoint?.y ?? (endpoint === 'start' ? (connector.y2 ?? connector.y + connector.height) : connector.y)
  // Find nearest anchor with no distance limit
  const best = findNearestAnchor(anchors, refX, refY, Infinity)
  if (!best) return null
  return { x: best.x, y: best.y, anchorId: best.id }
}

interface BoardClientProps {
  userId: string
  boardId: string
  boardName: string
  userRole: BoardRole
  displayName: string
  initialGridSize?: number
  initialGridSubdivisions?: number
  initialGridVisible?: boolean
  initialSnapToGrid?: boolean
  initialGridStyle?: string
  initialCanvasColor?: string
  initialGridColor?: string
  initialSubdivisionColor?: string
}

export function BoardClient({ userId, boardId, boardName, userRole, displayName, initialGridSize = 40, initialGridSubdivisions = 1, initialGridVisible = true, initialSnapToGrid = false, initialGridStyle = 'lines', initialCanvasColor = '#e8ecf1', initialGridColor = '#b4becd', initialSubdivisionColor = '#b4becd' }: BoardClientProps) {
  const channel = useRealtimeChannel(boardId)
  const { onlineUsers, trackPresence, updatePresence } = usePresence(channel, userId, userRole, displayName)
  const userCount = onlineUsers.length + 1 // include self
  const { sendCursor, onCursorUpdate } = useCursors(channel, userId, userCount)
  const lastActivityRef = useRef(Date.now())
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Mark activity for idle detection — resets timer and sets presence to active
  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    updatePresence('active')
  }, [updatePresence])

  // Wrap sendCursor to mark presence as active and reset idle timer
  const sendCursorWithActivity = useCallback(
    (x: number, y: number) => {
      sendCursor(x, y)
      markActivity()
    },
    [sendCursor, markActivity]
  )

  // Idle check: set presence to 'idle' after 30s of no cursor activity
  useEffect(() => {
    if (!updatePresence) return
    idleCheckRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 30_000) {
        updatePresence('idle')
      }
    }, 10_000)
    return () => {
      if (idleCheckRef.current) clearInterval(idleCheckRef.current)
    }
  }, [updatePresence])

  const {
    objects, selectedIds, activeGroupId, sortedObjects,
    addObject, updateObject, deleteSelected, duplicateSelected,
    selectObject, selectObjects, clearSelection,
    enterGroup, exitGroup,
    bringToFront, sendToBack, bringForward, sendBackward,
    groupSelected, ungroupSelected,
    moveGroupChildren, updateObjectDrag, updateObjectDragEnd,
    checkFrameContainment,
    getChildren, getDescendants,
    remoteSelections,
    reconcileOnReconnect,
    deleteObject, getZOrderSet, addObjectWithId, duplicateObject,
    isObjectLocked, lockObject, unlockObject,
  } = useBoardState(userId, boardId, userRole, channel, onlineUsers)
  const [shareOpen, setShareOpen] = useState(false)
  const [isEditingText, setIsEditingText] = useState(false)
  const [activeTool, setActiveTool] = useState<BoardObjectType | null>(null)
  const [activePreset, setActivePreset] = useState<ShapePreset | null>(null)
  const [vertexEditId, setVertexEditId] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null)
  const [shapePalette, setShapePalette] = useState<{ lineId: string; canvasX: number; canvasY: number; screenX: number; screenY: number } | null>(null)

  // Grid settings — initialized from server props, persisted on change
  const [gridSize, setGridSize] = useState(initialGridSize)
  const [gridSubdivisions, setGridSubdivisions] = useState(initialGridSubdivisions)
  const [gridVisible, setGridVisible] = useState(initialGridVisible)
  const [snapToGrid, setSnapToGrid] = useState(initialSnapToGrid)
  const [gridStyle, setGridStyle] = useState(initialGridStyle)
  const [canvasColor, setCanvasColor] = useState(initialCanvasColor)
  const [gridColor, setGridColor] = useState(initialGridColor)
  const [subdivisionColor, setSubdivisionColor] = useState(initialSubdivisionColor)
  const [uiDarkMode, setUiDarkMode] = useDarkMode()

  const supabaseRef = useRef(createClient())

  const updateBoardSettings = useCallback((updates: { grid_size?: number; grid_subdivisions?: number; grid_visible?: boolean; snap_to_grid?: boolean; grid_style?: string; canvas_color?: string; grid_color?: string; subdivision_color?: string }) => {
    if (updates.grid_size !== undefined) setGridSize(updates.grid_size)
    if (updates.grid_subdivisions !== undefined) setGridSubdivisions(updates.grid_subdivisions)
    if (updates.grid_visible !== undefined) setGridVisible(updates.grid_visible)
    if (updates.snap_to_grid !== undefined) setSnapToGrid(updates.snap_to_grid)
    if (updates.grid_style !== undefined) setGridStyle(updates.grid_style)
    if (updates.canvas_color !== undefined) setCanvasColor(updates.canvas_color)
    if (updates.grid_color !== undefined) setGridColor(updates.grid_color)
    if (updates.subdivision_color !== undefined) setSubdivisionColor(updates.subdivision_color)
    // Persist to DB (fire-and-forget)
    supabaseRef.current.from('boards').update(updates).eq('id', boardId).then()
  }, [boardId])

  const toggleGridVisible = useCallback(() => {
    updateBoardSettings({ grid_visible: !gridVisible })
  }, [gridVisible, updateBoardSettings])

  const toggleSnapToGrid = useCallback(() => {
    updateBoardSettings({ snap_to_grid: !snapToGrid })
  }, [snapToGrid, updateBoardSettings])

  const undoStack = useUndoStack()
  const MAX_RECENT_COLORS = 6
  const [recentColors, setRecentColors] = useState<string[]>(() => EXPANDED_PALETTE.slice(0, MAX_RECENT_COLORS))
  const pushRecentColor = useCallback((color: string) => {
    setRecentColors(prev => {
      const next = [color, ...prev.filter(c => c !== color)]
      return next.length > MAX_RECENT_COLORS ? next.slice(0, MAX_RECENT_COLORS) : next
    })
  }, [])
  const preDragRef = useRef<Map<string, { x: number; y: number; x2?: number | null; y2?: number | null; parent_id: string | null; waypoints?: string | null; connect_start_id?: string | null; connect_end_id?: string | null; connect_start_anchor?: string | null; connect_end_anchor?: string | null }>>(new Map())
  // Clear stale preDragRef if drag is interrupted (e.g. window blur mid-drag)
  useEffect(() => {
    const handleBlur = () => { preDragRef.current = new Map() }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])
  // Auto-route points ref: populated by Canvas during render, used by handleWaypointInsert
  const autoRoutePointsRef = useRef<Map<string, number[]>>(new Map())

  // Subscribe LAST — after all hooks have registered their .on() listeners.
  const hasConnectedRef = useRef(false)
  useEffect(() => {
    if (!channel) return
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        trackPresence()
        if (hasConnectedRef.current) {
          reconcileOnReconnect()
        } else {
          hasConnectedRef.current = true
        }
      }
    })
  }, [channel, boardId, trackPresence, reconcileOnReconnect])

  const canEdit = userRole !== 'viewer'

  // --- Undo/Redo execution ---
  const executeUndo = useCallback((entry: UndoEntry): UndoEntry | null => {
    switch (entry.type) {
      case 'add': {
        const snapshots: BoardObject[] = []
        for (const id of entry.ids) {
          const obj = objects.get(id)
          if (obj) {
            snapshots.push({ ...obj })
            deleteObject(id)
          }
        }
        return snapshots.length > 0 ? { type: 'delete', objects: snapshots } : null
      }
      case 'delete': {
        for (const obj of entry.objects) {
          addObjectWithId(obj)
        }
        return { type: 'add', ids: entry.objects.map(o => o.id) }
      }
      case 'update': {
        const inversePatches: { id: string; before: Partial<BoardObject> }[] = []
        for (const patch of entry.patches) {
          const current = objects.get(patch.id)
          if (!current) continue
          const inverseBefore: Partial<BoardObject> = {}
          for (const key of Object.keys(patch.before)) {
            (inverseBefore as unknown as Record<string, unknown>)[key] = (current as unknown as Record<string, unknown>)[key]
          }
          inversePatches.push({ id: patch.id, before: inverseBefore })
          updateObject(patch.id, patch.before)
        }
        return { type: 'update', patches: inversePatches }
      }
      case 'move': {
        const inversePatches: typeof entry.patches = []
        for (const patch of entry.patches) {
          const current = objects.get(patch.id)
          if (!current) continue
          inversePatches.push({ id: patch.id, before: { x: current.x, y: current.y, x2: current.x2, y2: current.y2, parent_id: current.parent_id, waypoints: current.waypoints, connect_start_id: current.connect_start_id, connect_end_id: current.connect_end_id, connect_start_anchor: current.connect_start_anchor, connect_end_anchor: current.connect_end_anchor } })
          const updates: Partial<BoardObject> = { x: patch.before.x, y: patch.before.y, parent_id: patch.before.parent_id }
          if (patch.before.x2 !== undefined) updates.x2 = patch.before.x2
          if (patch.before.y2 !== undefined) updates.y2 = patch.before.y2
          if (patch.before.waypoints !== undefined) updates.waypoints = patch.before.waypoints
          if (patch.before.connect_start_id !== undefined) updates.connect_start_id = patch.before.connect_start_id
          if (patch.before.connect_end_id !== undefined) updates.connect_end_id = patch.before.connect_end_id
          if (patch.before.connect_start_anchor !== undefined) updates.connect_start_anchor = patch.before.connect_start_anchor
          if (patch.before.connect_end_anchor !== undefined) updates.connect_end_anchor = patch.before.connect_end_anchor
          updateObject(patch.id, updates)
        }
        return { type: 'move', patches: inversePatches }
      }
      case 'duplicate': {
        const snapshots: BoardObject[] = []
        for (const id of entry.ids) {
          const obj = objects.get(id)
          if (obj) {
            snapshots.push({ ...obj })
            const descendants = getDescendants(id)
            for (const d of descendants) {
              snapshots.push({ ...d })
            }
            deleteObject(id)
          }
        }
        return snapshots.length > 0 ? { type: 'delete', objects: snapshots } : null
      }
      case 'group': {
        const groupSnapshot = objects.get(entry.groupId)
        if (!groupSnapshot) return null
        for (const childId of entry.childIds) {
          const prevParent = entry.previousParentIds.get(childId) ?? null
          updateObject(childId, { parent_id: prevParent })
        }
        deleteObject(entry.groupId)
        return { type: 'ungroup', groupSnapshot, childIds: entry.childIds }
      }
      case 'ungroup': {
        addObjectWithId(entry.groupSnapshot)
        for (const childId of entry.childIds) {
          updateObject(childId, { parent_id: entry.groupSnapshot.id })
        }
        const previousParentIds = new Map<string, string | null>()
        for (const childId of entry.childIds) {
          const child = objects.get(childId)
          previousParentIds.set(childId, child?.parent_id ?? null)
        }
        return { type: 'group', groupId: entry.groupSnapshot.id, childIds: entry.childIds, previousParentIds }
      }
    }
  }, [objects, deleteObject, addObjectWithId, updateObject, getDescendants])

  const performUndo = useCallback(() => {
    const entry = undoStack.popUndo()
    if (!entry) return
    const inverse = executeUndo(entry)
    if (inverse) undoStack.pushRedo(inverse)
  }, [undoStack, executeUndo])

  const performRedo = useCallback(() => {
    const entry = undoStack.popRedo()
    if (!entry) return
    const inverse = executeUndo(entry)
    if (inverse) undoStack.pushUndo(inverse)
  }, [undoStack, executeUndo])

  // --- Handlers with undo capture ---
  const handlePresetSelect = useCallback((preset: ShapePreset) => {
    if (!canEdit) return
    setShapePalette(null)
    markActivity()
    setActivePreset(prev => {
      const toggling = prev?.id === preset.id
      if (toggling) {
        setActiveTool(null)
        return null
      }
      setActiveTool(preset.dbType)
      return preset
    })
    clearSelection()
  }, [canEdit, clearSelection, markActivity])

  const handleCancelTool = useCallback(() => {
    setActiveTool(null)
    setActivePreset(null)
  }, [])

  const handleDrawShape = useCallback((type: BoardObjectType, x: number, y: number, width: number, height: number) => {
    if (!canEdit) return
    markActivity()
    const overrides: Partial<BoardObject> = {}
    // Merge preset overrides first
    if (activePreset) {
      Object.assign(overrides, activePreset.overrides)
      // Use preset default size when no draw size
      if (!(width > 0 && height > 0)) {
        overrides.width = activePreset.defaultWidth
        overrides.height = activePreset.defaultHeight
      }
    }
    if (width > 0 && height > 0) {
      overrides.width = width
      overrides.height = height
      // Scale custom_points for draw-to-create
      if (activePreset?.scalablePoints) {
        const scaled = scaleCustomPoints(activePreset, width, height)
        if (scaled) overrides.custom_points = scaled
      }
    }
    if (type === 'line' || type === 'arrow') {
      overrides.x2 = x + (width || 120)
      overrides.y2 = y + (height || 40)
    }
    const shouldAutoEdit = activePreset?.autoEdit
    const obj = addObject(type, x, y, overrides)
    if (obj) {
      undoStack.push({ type: 'add', ids: [obj.id] })
      if (shouldAutoEdit) {
        selectObject(obj.id)
        setPendingEditId(obj.id)
      }
    }
    setActiveTool(null)
    setActivePreset(null)
  }, [canEdit, addObject, undoStack, activePreset, markActivity, selectObject])

  // --- Connection index: maps shapeId → connectors attached to it ---
  // Ref-based: only rebuilds when connection fields actually change, not on every position update.
  const connectionIndexRef = useRef<Map<string, Array<{ connectorId: string; endpoint: 'start' | 'end' }>>>(new Map())
  const connectionSigRef = useRef('')
  const connectionIndex = useMemo(() => {
    // Build a signature from connector IDs + their connection fields
    const sigParts: string[] = []
    for (const [id, obj] of objects) {
      if (!isVectorType(obj.type)) continue
      if (obj.connect_start_id || obj.connect_end_id) {
        sigParts.push(`${id}:${obj.connect_start_id ?? ''}:${obj.connect_end_id ?? ''}`)
      }
    }
    const sig = sigParts.join('|')
    if (sig === connectionSigRef.current) return connectionIndexRef.current

    const index = new Map<string, Array<{ connectorId: string; endpoint: 'start' | 'end' }>>()
    for (const [id, obj] of objects) {
      if (!isVectorType(obj.type)) continue
      if (obj.connect_start_id) {
        const list = index.get(obj.connect_start_id) ?? []
        list.push({ connectorId: id, endpoint: 'start' })
        index.set(obj.connect_start_id, list)
      }
      if (obj.connect_end_id) {
        const list = index.get(obj.connect_end_id) ?? []
        list.push({ connectorId: id, endpoint: 'end' })
        index.set(obj.connect_end_id, list)
      }
    }
    connectionIndexRef.current = index
    connectionSigRef.current = sig
    return index
  }, [objects])

  const handleDragStart = useCallback((id: string) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    // Merge into existing map — multi-select drag fires handleDragStart per shape
    const map = preDragRef.current
    map.set(id, { x: obj.x, y: obj.y, x2: obj.x2, y2: obj.y2, parent_id: obj.parent_id, waypoints: obj.waypoints })
    if (obj.type === 'frame') {
      for (const d of getDescendants(id)) {
        map.set(d.id, { x: d.x, y: d.y, x2: d.x2, y2: d.y2, parent_id: d.parent_id, waypoints: d.waypoints })
      }
    }
    // Also capture connected connectors so their waypoints can be restored on undo
    if (!isVectorType(obj.type)) {
      const connections = connectionIndex.get(id)
      if (connections) {
        for (const { connectorId } of connections) {
          if (map.has(connectorId)) continue
          const conn = objects.get(connectorId)
          if (!conn) continue
          map.set(connectorId, { x: conn.x, y: conn.y, x2: conn.x2, y2: conn.y2, parent_id: conn.parent_id, waypoints: conn.waypoints, connect_start_id: conn.connect_start_id, connect_end_id: conn.connect_end_id, connect_start_anchor: conn.connect_start_anchor, connect_end_anchor: conn.connect_end_anchor })
        }
      }
    }
  }, [canEdit, objects, getDescendants, connectionIndex, markActivity])

  // Helper: update all connectors attached to a shape after it moves/transforms.
  // commitAnchor=true writes connect_*_anchor on the "best" path (for dragEnd/transformEnd).
  const followConnectors = useCallback((
    shapeId: string,
    anchors: AnchorPoint[],
    updateFn: (id: string, updates: Partial<BoardObject>) => void,
    commitAnchor: boolean
  ) => {
    const anchorMap = new Map(anchors.map(a => [a.id, a]))
    const connections = connectionIndex.get(shapeId)
    if (!connections) return
    for (const { connectorId, endpoint } of connections) {
      const connector = objects.get(connectorId)
      if (!connector) continue
      // Self-loop connectors: both ends on same shape — update both endpoints using existing anchors
      if (connector.connect_start_id && connector.connect_start_id === connector.connect_end_id) {
        const updates: Partial<BoardObject> = { waypoints: null }
        const startAnchorId = connector.connect_start_anchor
        const endAnchorId = connector.connect_end_anchor
        if (startAnchorId) {
          const a = anchorMap.get(startAnchorId)
          if (a) { updates.x = a.x; updates.y = a.y }
        }
        if (endAnchorId) {
          const a = anchorMap.get(endAnchorId)
          if (a) { updates.x2 = a.x; updates.y2 = a.y }
        }
        updateFn(connectorId, updates)
        continue
      }
      const otherEnd = endpoint === 'start'
        ? { x: connector.x2 ?? connector.x + connector.width, y: connector.y2 ?? connector.y + connector.height }
        : { x: connector.x, y: connector.y }
      const best = pickBestAnchor(connector, endpoint, anchors, otherEnd)
      if (!best) {
        // Fallback to existing anchor
        const anchorId = endpoint === 'start' ? connector.connect_start_anchor : connector.connect_end_anchor
        if (!anchorId) continue
        const anchor = anchorMap.get(anchorId)
        if (!anchor) continue
        if (endpoint === 'start') {
          updateFn(connectorId, { x: anchor.x, y: anchor.y, waypoints: null })
        } else {
          updateFn(connectorId, { x2: anchor.x, y2: anchor.y, waypoints: null })
        }
      } else if (endpoint === 'start') {
        const extra: Partial<BoardObject> = commitAnchor ? { connect_start_anchor: best.anchorId } : {}
        updateFn(connectorId, { x: best.x, y: best.y, waypoints: null, ...extra })
      } else {
        const extra: Partial<BoardObject> = commitAnchor ? { connect_end_anchor: best.anchorId } : {}
        updateFn(connectorId, { x2: best.x, y2: best.y, waypoints: null, ...extra })
      }
    }
  }, [objects, connectionIndex])

  const handleDragMove = useCallback((id: string, x: number, y: number) => {
    if (!canEdit) return
    markActivity()
    updateObjectDrag(id, { x, y })
    const obj = objects.get(id)
    if (obj && !isVectorType(obj.type)) {
      const anchors = getShapeAnchors({ ...obj, x, y })
      followConnectors(id, anchors, updateObjectDrag, false)
    }
  }, [canEdit, updateObjectDrag, objects, followConnectors, markActivity])

  const handleDragEnd = useCallback((id: string, x: number, y: number) => {
    if (!canEdit) return
    markActivity()
    updateObjectDragEnd(id, { x, y })
    const obj = objects.get(id)
    if (obj && !isVectorType(obj.type)) {
      const anchors = getShapeAnchors({ ...obj, x, y })
      followConnectors(id, anchors, updateObjectDragEnd, true)
    }

    if (preDragRef.current.size > 0) {
      const patches = Array.from(preDragRef.current.entries()).map(([pid, before]) => ({ id: pid, before }))
      undoStack.push({ type: 'move', patches })
      preDragRef.current = new Map()
    }
  }, [canEdit, updateObjectDragEnd, undoStack, objects, followConnectors, markActivity])

  // Compute all anchor points for snap-to-anchor (excludes given connector id)
  const computeAllAnchors = useCallback((excludeId: string): { anchors: AnchorPoint[]; shapeMap: Map<string, { anchors: AnchorPoint[]; obj: BoardObject }> } => {
    const allAnchors: AnchorPoint[] = []
    const shapeMap = new Map<string, { anchors: AnchorPoint[]; obj: BoardObject }>()
    for (const [objId, obj] of objects) {
      if (objId === excludeId) continue
      if (isVectorType(obj.type) || obj.type === 'group') continue
      if (obj.deleted_at) continue
      const anchors = getShapeAnchors(obj)
      if (anchors.length > 0) {
        allAnchors.push(...anchors)
        shapeMap.set(objId, { anchors, obj })
      }
    }
    return { anchors: allAnchors, shapeMap }
  }, [objects])

  const SNAP_DISTANCE = 20

  const handleEndpointDragMove = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    markActivity()

    const { anchors } = computeAllAnchors(id)
    // Determine which endpoint(s) moved
    const hasStart = updates.x !== undefined && updates.y !== undefined
    const hasEnd = updates.x2 != null && updates.y2 != null
    const isWholeDrag = hasStart && hasEnd
    let snap: AnchorPoint | null = null

    if (hasStart && !isWholeDrag) {
      // Single start endpoint drag — snap start only
      snap = findNearestAnchor(anchors, updates.x!, updates.y!, SNAP_DISTANCE)
      if (snap) {
        updates = { ...updates, x: snap.x, y: snap.y }
      }
    } else if (hasEnd && !isWholeDrag) {
      // Single end endpoint drag — snap end only
      snap = findNearestAnchor(anchors, updates.x2!, updates.y2!, SNAP_DISTANCE)
      if (snap) {
        updates = { ...updates, x2: snap.x, y2: snap.y }
      }
    }
    // Whole-connector drag: no snapping during move (both endpoints move together)

    setSnapIndicator(snap ? { x: snap.x, y: snap.y } : null)
    updateObjectDrag(id, updates)
  }, [canEdit, updateObjectDrag, computeAllAnchors, markActivity])

  // Helper to resolve snap for a single endpoint and find the owning shape
  const resolveSnap = useCallback((
    anchors: AnchorPoint[],
    shapeMap: Map<string, { anchors: AnchorPoint[]; obj: BoardObject }>,
    px: number, py: number
  ): { snap: AnchorPoint | null; shapeId: string | null } => {
    const snap = findNearestAnchor(anchors, px, py, SNAP_DISTANCE)
    if (!snap) return { snap: null, shapeId: null }
    for (const [shapeId, entry] of shapeMap) {
      if (entry.anchors.some(a => a.id === snap.id && a.x === snap.x && a.y === snap.y)) {
        return { snap, shapeId }
      }
    }
    return { snap, shapeId: null }
  }, [])

  const handleDrawLineFromAnchor = useCallback((type: BoardObjectType, startShapeId: string, startAnchor: string, startX: number, startY: number, endX: number, endY: number, screenEndX?: number, screenEndY?: number) => {
    if (!canEdit) return
    markActivity()

    const overrides: Partial<BoardObject> = {
      x2: endX,
      y2: endY,
      connect_start_id: startShapeId,
      connect_start_anchor: startAnchor,
    }

    // Check if end snaps to another shape's anchor
    const { anchors: allAnchors, shapeMap } = computeAllAnchors('__new__')
    const endSnap = findNearestAnchor(allAnchors, endX, endY, SNAP_DISTANCE)
    if (endSnap) {
      overrides.x2 = endSnap.x
      overrides.y2 = endSnap.y
      for (const [shapeId, entry] of shapeMap) {
        if (entry.anchors.some(a => a.id === endSnap.id && a.x === endSnap.x && a.y === endSnap.y)) {
          overrides.connect_end_id = shapeId
          overrides.connect_end_anchor = endSnap.id
          break
        }
      }
    }

    if (type === 'arrow') {
      overrides.marker_end = 'arrow'
    }

    const obj = addObject(type, startX, startY, overrides)
    if (obj) {
      undoStack.push({ type: 'add', ids: [obj.id] })
      if (!overrides.connect_end_id) {
        setShapePalette({
          lineId: obj.id,
          canvasX: overrides.x2 as number,
          canvasY: overrides.y2 as number,
          screenX: screenEndX ?? 0,
          screenY: screenEndY ?? 0,
        })
      }
    }

    setActiveTool(null)
    setActivePreset(null)
  }, [canEdit, addObject, undoStack, computeAllAnchors, markActivity])

  const handlePaletteShapeSelect = useCallback((type: BoardObjectType) => {
    if (!shapePalette || !canEdit) return
    markActivity()
    const { lineId, canvasX, canvasY } = shapePalette
    const defaultW = type === 'sticky_note' ? 200 : 120
    const defaultH = type === 'sticky_note' ? 200 : 120
    const shapeX = canvasX - defaultW / 2
    const shapeY = canvasY - defaultH / 2
    const shapeObj = addObject(type, shapeX, shapeY, { width: defaultW, height: defaultH })
    if (shapeObj) {
      const anchors = getShapeAnchors(shapeObj)
      const nearest = findNearestAnchor(anchors, canvasX, canvasY, Infinity)
      if (nearest) {
        // Capture line's before-state for undo before mutating
        const lineObj = objects.get(lineId)
        if (lineObj) {
          undoStack.push({ type: 'update', patches: [{ id: lineId, before: { x2: lineObj.x2, y2: lineObj.y2, connect_end_id: lineObj.connect_end_id, connect_end_anchor: lineObj.connect_end_anchor } }] })
        }
        updateObject(lineId, {
          x2: nearest.x,
          y2: nearest.y,
          connect_end_id: shapeObj.id,
          connect_end_anchor: nearest.id,
        })
      }
      // Push shape add entry after the line update entry so undo pops in reverse:
      // first undoes the shape add (deletes it), then undoes the line endpoint update
      undoStack.push({ type: 'add', ids: [shapeObj.id] })
    }
    setShapePalette(null)
  }, [shapePalette, canEdit, addObject, updateObject, undoStack, markActivity, objects])

  const handleEndpointDragEnd = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    markActivity()

    // Capture pre-mutation state for undo (endpoint circles don't fire onDragStart)
    if (preDragRef.current.size === 0) {
      const obj = objects.get(id)
      if (obj) {
        preDragRef.current.set(id, { x: obj.x, y: obj.y, x2: obj.x2, y2: obj.y2, parent_id: obj.parent_id, waypoints: obj.waypoints, connect_start_id: obj.connect_start_id, connect_end_id: obj.connect_end_id, connect_start_anchor: obj.connect_start_anchor, connect_end_anchor: obj.connect_end_anchor })
      }
    }

    const { anchors, shapeMap } = computeAllAnchors(id)
    const hasStart = updates.x !== undefined && updates.y !== undefined
    const hasEnd = updates.x2 != null && updates.y2 != null
    const isWholeDrag = hasStart && hasEnd
    const connUpdates: Partial<BoardObject> = {}

    if (isWholeDrag) {
      // Whole-connector drag: clear both connections (connector was repositioned)
      connUpdates.connect_start_id = null
      connUpdates.connect_start_anchor = null
      connUpdates.connect_end_id = null
      connUpdates.connect_end_anchor = null
    } else if (hasStart) {
      // Single start endpoint drag
      const { snap, shapeId } = resolveSnap(anchors, shapeMap, updates.x!, updates.y!)
      if (snap) {
        updates = { ...updates, x: snap.x, y: snap.y }
        connUpdates.connect_start_id = shapeId
        connUpdates.connect_start_anchor = snap.id
      } else {
        connUpdates.connect_start_id = null
        connUpdates.connect_start_anchor = null
      }
    } else if (hasEnd) {
      // Single end endpoint drag
      const { snap, shapeId } = resolveSnap(anchors, shapeMap, updates.x2!, updates.y2!)
      if (snap) {
        updates = { ...updates, x2: snap.x, y2: snap.y }
        connUpdates.connect_end_id = shapeId
        connUpdates.connect_end_anchor = snap.id
      } else {
        connUpdates.connect_end_id = null
        connUpdates.connect_end_anchor = null
      }
    }

    setSnapIndicator(null)
    updateObjectDragEnd(id, { ...updates, ...connUpdates })

    if (preDragRef.current.size > 0) {
      const patches = Array.from(preDragRef.current.entries()).map(([pid, before]) => ({ id: pid, before }))
      undoStack.push({ type: 'move' as const, patches })
      preDragRef.current = new Map()
    }

    // Deferred to next tick so React commits the position update first —
    // checkFrameContainment reads final coordinates from the objects Map.
    setTimeout(() => checkFrameContainment(id), 0)
  }, [canEdit, objects, updateObjectDragEnd, undoStack, checkFrameContainment, computeAllAnchors, resolveSnap, markActivity])

  const handleUpdateText = useCallback((id: string, text: string) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    // Enforce character limits: sticky notes 10,000 (matches DB), other shapes 256
    const max = obj.type === 'sticky_note' ? 10000 : 256
    const limited = text.slice(0, max)
    updateObject(id, { text: limited })
  }, [canEdit, objects, updateObject, markActivity])

  const handleUpdateTitle = useCallback((id: string, title: string) => {
    if (!canEdit) return
    markActivity()
    updateObject(id, { title: title.slice(0, 256) })
  }, [canEdit, updateObject, markActivity])

  const handleTransformMove = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    markActivity()
    updateObjectDrag(id, updates)
  }, [canEdit, updateObjectDrag, markActivity])

  const handleTransformEnd = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (obj) {
      const before: Partial<BoardObject> = {}
      for (const key of Object.keys(updates)) {
        (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
      }
      undoStack.push({ type: 'update', patches: [{ id, before }] })
    }
    updateObject(id, updates)
    // Auto-follow connectors after transform
    if (!isVectorType(obj?.type ?? '')) {
      const anchors = getShapeAnchors({ ...obj!, ...updates })
      followConnectors(id, anchors, updateObject, true)
    }
  }, [canEdit, objects, updateObject, undoStack, followConnectors, markActivity])

  // --- Waypoint CRUD handlers ---

  const handleWaypointDragEnd = useCallback((id: string, waypointIndex: number, x: number, y: number) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const waypoints = parseWaypoints(obj.waypoints)
    if (waypointIndex * 2 + 1 >= waypoints.length) return
    const before: Partial<BoardObject> = { waypoints: obj.waypoints }
    const newWaypoints = [...waypoints]
    newWaypoints[waypointIndex * 2] = x
    newWaypoints[waypointIndex * 2 + 1] = y
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { waypoints: JSON.stringify(newWaypoints) })
  }, [canEdit, objects, updateObject, undoStack, markActivity])

  const handleWaypointInsert = useCallback((id: string, afterSegmentIndex: number) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const waypoints = parseWaypoints(obj.waypoints)
    const before: Partial<BoardObject> = { waypoints: obj.waypoints }
    // Build list of all points: start, intermediate, end
    const x2 = obj.x2 ?? obj.x + obj.width
    const y2 = obj.y2 ?? obj.y + obj.height
    // Use auto-route points when no manual waypoints exist (fall back to live computation for culled connectors)
    const intermediate = waypoints.length > 0 ? waypoints : (autoRoutePointsRef.current.get(id) ?? computeAutoRoute(obj, objects) ?? [])
    const allPts: number[] = [obj.x, obj.y, ...intermediate, x2, y2]
    // afterSegmentIndex is the segment index (0 = start→first, etc.)
    // Insert midpoint of segment at allPts[segIdx*2] → allPts[(segIdx+1)*2]
    const i = afterSegmentIndex * 2
    if (i + 3 >= allPts.length) return // guard against out-of-bounds
    const midX = (allPts[i] + allPts[i + 2]) / 2
    const midY = (allPts[i + 1] + allPts[i + 3]) / 2
    // When inserting on an auto-routed connector, materialize all auto-route points as manual waypoints
    const baseWaypoints = waypoints.length > 0 ? [...waypoints] : [...intermediate]
    baseWaypoints.splice(afterSegmentIndex * 2, 0, midX, midY)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { waypoints: JSON.stringify(baseWaypoints) })
  }, [canEdit, objects, updateObject, undoStack, markActivity])

  const handleWaypointDelete = useCallback((id: string, waypointIndex: number) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const waypoints = parseWaypoints(obj.waypoints)
    if (waypointIndex * 2 + 1 >= waypoints.length) return
    const before: Partial<BoardObject> = { waypoints: obj.waypoints }
    const newWaypoints = [...waypoints]
    newWaypoints.splice(waypointIndex * 2, 2)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { waypoints: newWaypoints.length > 0 ? JSON.stringify(newWaypoints) : null })
  }, [canEdit, objects, updateObject, undoStack, markActivity])

  const handleDelete = useCallback(() => {
    if (!canEdit) return
    markActivity()
    const snapshots: BoardObject[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      snapshots.push({ ...obj })
      for (const d of getDescendants(id)) {
        snapshots.push({ ...d })
      }
    }
    if (snapshots.length > 0) {
      undoStack.push({ type: 'delete', objects: snapshots })
    }
    deleteSelected()
  }, [canEdit, selectedIds, objects, getDescendants, deleteSelected, undoStack, markActivity])

  const handleDuplicate = useCallback(() => {
    if (!canEdit) return
    markActivity()
    const newIds = duplicateSelected()
    if (newIds.length > 0) {
      undoStack.push({ type: 'duplicate', ids: newIds })
    }
  }, [canEdit, duplicateSelected, undoStack, markActivity])

  // Copy/paste clipboard (stores IDs of copied objects)
  const clipboardRef = useRef<string[]>([])

  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) return
    markActivity()
    clipboardRef.current = Array.from(selectedIds)
  }, [selectedIds, markActivity])

  const handlePaste = useCallback(() => {
    if (!canEdit || clipboardRef.current.length === 0) return
    markActivity()
    const newIds: string[] = []
    for (const id of clipboardRef.current) {
      const newObj = duplicateObject(id)
      if (newObj) newIds.push(newObj.id)
    }
    if (newIds.length > 0) {
      undoStack.push({ type: 'duplicate', ids: newIds })
    }
  }, [canEdit, duplicateObject, undoStack, markActivity])

  /**
   * Check if objects become invisible after a style change and auto-delete them.
   * Takes the pending updates so it checks the *intended* result, not stale state.
   * Returns the original snapshots of deleted objects (for consolidated undo).
   */
  const checkAndDeleteInvisible = useCallback((pendingChanges: Map<string, Partial<BoardObject>>): BoardObject[] => {
    const deleted: BoardObject[] = []
    for (const [id, changes] of pendingChanges) {
      const obj = objects.get(id)
      if (!obj || obj.type === 'group') continue
      // Overlay pending changes to get the effective state
      const fill = changes.color ?? obj.color
      const stroke = changes.stroke_color !== undefined ? changes.stroke_color : obj.stroke_color
      const isTransparent = !fill || fill === 'transparent' || fill === 'rgba(0,0,0,0)'
      const hasStroke = !!stroke
      const hasText = !!(obj.text?.trim()) || !!(obj.title?.trim())
      if (isTransparent && !hasStroke && !hasText) {
        deleted.push({ ...obj })
        deleteObject(id)
      }
    }
    return deleted
  }, [objects, deleteObject])

  const handleColorChange = useCallback((color: string) => {
    if (!canEdit) return
    pushRecentColor(color)
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    const pendingChanges = new Map<string, Partial<BoardObject>>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'group') {
        for (const child of getDescendants(id)) {
          if (child.type !== 'group') {
            patches.push({ id: child.id, before: { color: child.color } })
            updateObject(child.id, { color })
            pendingChanges.set(child.id, { color })
          }
        }
      } else if (obj) {
        patches.push({ id, before: { color: obj.color } })
        updateObject(id, { color })
        pendingChanges.set(id, { color })
      }
    }
    // Check for invisible objects and delete them — single consolidated undo
    const deleted = checkAndDeleteInvisible(pendingChanges)
    if (deleted.length > 0) {
      // Undo restores the deleted objects with their pre-change state (captured in snapshots)
      undoStack.push({ type: 'delete', objects: deleted })
    } else if (patches.length > 0) {
      undoStack.push({ type: 'update', patches })
    }
  }, [canEdit, selectedIds, objects, getDescendants, updateObject, undoStack, pushRecentColor, checkAndDeleteInvisible])

  const handleFontChange = useCallback((updates: { font_family?: string; font_size?: number; font_style?: 'normal' | 'bold' | 'italic' | 'bold italic' }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      // Apply to any shape that has text or is a sticky note
      if (obj.type === 'sticky_note' || obj.text) {
        const before: Partial<BoardObject> = {}
        for (const key of Object.keys(updates)) {
          (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
        }
        patches.push({ id, before })
        updateObject(id, updates)
      }
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  // --- Style handlers ---

  const handleStrokeStyleChange = useCallback((updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    const pendingChanges = new Map<string, Partial<BoardObject>>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      const before: Partial<BoardObject> = {}
      for (const key of Object.keys(updates)) {
        (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
      }
      patches.push({ id, before })
      updateObject(id, updates as Partial<BoardObject>)
      pendingChanges.set(id, updates as Partial<BoardObject>)
    }
    const deleted = checkAndDeleteInvisible(pendingChanges)
    if (deleted.length > 0) {
      undoStack.push({ type: 'delete', objects: deleted })
    } else if (patches.length > 0) {
      undoStack.push({ type: 'update', patches })
    }
  }, [canEdit, selectedIds, objects, updateObject, undoStack, checkAndDeleteInvisible])

  const handleBorderColorChange = useCallback((color: string | null) => {
    handleStrokeStyleChange({ stroke_color: color })
  }, [handleStrokeStyleChange])

  const handleOpacityChange = useCallback((opacity: number) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      patches.push({ id, before: { opacity: obj.opacity ?? 1 } })
      updateObject(id, { opacity })
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleShadowChange = useCallback((updates: { shadow_blur?: number; shadow_color?: string; shadow_offset_x?: number; shadow_offset_y?: number }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      const before: Partial<BoardObject> = {}
      for (const key of Object.keys(updates)) {
        (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
      }
      patches.push({ id, before })
      updateObject(id, updates as Partial<BoardObject>)
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleMarkerChange = useCallback((updates: { marker_start?: string; marker_end?: string }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      const before: Partial<BoardObject> = {}
      if (updates.marker_start !== undefined) before.marker_start = obj.marker_start ?? 'none'
      if (updates.marker_end !== undefined) before.marker_end = obj.marker_end ?? 'none'
      patches.push({ id, before })
      updateObject(id, updates as Partial<BoardObject>)
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleCornerRadiusChange = useCallback((corner_radius: number) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj || obj.type !== 'rectangle') continue
      patches.push({ id, before: { corner_radius: obj.corner_radius ?? 6 } })
      updateObject(id, { corner_radius })
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleTextStyleChange = useCallback((updates: { text_align?: string; text_vertical_align?: string; text_color?: string }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      const before: Partial<BoardObject> = {}
      for (const key of Object.keys(updates)) {
        (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
      }
      patches.push({ id, before })
      updateObject(id, updates as Partial<BoardObject>)
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  // Z-order wrappers with undo capture
  const handleBringToFront = useCallback((id: string) => {
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const patches = set.map(o => ({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> }))
    undoStack.push({ type: 'update', patches })
    bringToFront(id)
  }, [getZOrderSet, bringToFront, undoStack])

  const handleSendToBack = useCallback((id: string) => {
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const patches = set.map(o => ({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> }))
    undoStack.push({ type: 'update', patches })
    sendToBack(id)
  }, [getZOrderSet, sendToBack, undoStack])

  const handleBringForward = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const allObjects = Array.from(objects.values())
    const setIds = new Set(set.map(o => o.id))
    const maxInSet = Math.max(...set.map(o => o.z_index))
    const sorted = allObjects.filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id).sort((a, b) => a.z_index - b.z_index)
    const nextHigher = sorted.find(o => o.z_index > maxInSet)
    const patches = set.map(o => ({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> }))
    if (nextHigher) {
      const nextSet = getZOrderSet(nextHigher.id)
      for (const o of nextSet) {
        patches.push({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> })
      }
    }
    undoStack.push({ type: 'update', patches })
    bringForward(id)
  }, [objects, getZOrderSet, bringForward, undoStack])

  const handleSendBackward = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const allObjects = Array.from(objects.values())
    const setIds = new Set(set.map(o => o.id))
    const minInSet = Math.min(...set.map(o => o.z_index))
    const sorted = allObjects.filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id).sort((a, b) => b.z_index - a.z_index)
    const nextLower = sorted.find(o => o.z_index < minInSet)
    const patches = set.map(o => ({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> }))
    if (nextLower) {
      const nextSet = getZOrderSet(nextLower.id)
      for (const o of nextSet) {
        patches.push({ id: o.id, before: { z_index: o.z_index } as Partial<BoardObject> })
      }
    }
    undoStack.push({ type: 'update', patches })
    sendBackward(id)
  }, [objects, getZOrderSet, sendBackward, undoStack])

  // Group/ungroup wrappers with undo capture
  const handleGroup = useCallback(async () => {
    if (!canEdit || selectedIds.size < 2) return
    markActivity()
    const previousParentIds = new Map<string, string | null>()
    const childIds = Array.from(selectedIds)
    for (const id of childIds) {
      const obj = objects.get(id)
      previousParentIds.set(id, obj?.parent_id ?? null)
    }
    const groupObj = await groupSelected()
    if (groupObj) {
      undoStack.push({ type: 'group', groupId: groupObj.id, childIds, previousParentIds })
    }
  }, [canEdit, selectedIds, objects, groupSelected, undoStack, markActivity])

  const handleUngroup = useCallback(() => {
    if (!canEdit) return
    markActivity()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj || obj.type !== 'group') continue
      const childIds = getChildren(id).map(c => c.id)
      undoStack.push({ type: 'ungroup', groupSnapshot: { ...obj }, childIds })
    }
    ungroupSelected()
  }, [canEdit, selectedIds, objects, getChildren, ungroupSelected, undoStack, markActivity])

  // Determine if group/ungroup are available
  const canGroup = selectedIds.size > 1
  const canUngroup = useMemo(() => {
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'group') return true
    }
    return false
  }, [selectedIds, objects])

  // --- Lock/unlock permission checks ---
  const canLockObject = useCallback((id: string): boolean => {
    const obj = objects.get(id)
    if (!obj) return false
    if (userRole === 'owner') return true
    if (userRole === 'manager') return true
    return false
  }, [objects, userRole])

  const canUnlockObject = useCallback((id: string): boolean => {
    const obj = objects.get(id)
    if (!obj) return false
    if (userRole === 'owner') return true
    if (userRole === 'manager') return obj.locked_by === userId
    return false
  }, [objects, userRole, userId])

  const handleLockSelected = useCallback(() => {
    for (const id of selectedIds) {
      if (canLockObject(id) && !isObjectLocked(id)) {
        lockObject(id)
      }
    }
  }, [selectedIds, canLockObject, isObjectLocked, lockObject])

  const handleUnlockSelected = useCallback(() => {
    for (const id of selectedIds) {
      if (canUnlockObject(id) && isObjectLocked(id)) {
        unlockObject(id)
      }
    }
  }, [selectedIds, canUnlockObject, isObjectLocked, unlockObject])

  const anySelectedLocked = useMemo(() => {
    for (const id of selectedIds) {
      if (isObjectLocked(id)) return true
    }
    return false
  }, [selectedIds, isObjectLocked])

  const selectedCanLock = useMemo(() => {
    for (const id of selectedIds) {
      if (canLockObject(id) && !isObjectLocked(id)) return true
    }
    return false
  }, [selectedIds, canLockObject, isObjectLocked])

  const selectedCanUnlock = useMemo(() => {
    for (const id of selectedIds) {
      if (canUnlockObject(id) && isObjectLocked(id)) return true
    }
    return false
  }, [selectedIds, canUnlockObject, isObjectLocked])

  // --- Vertex editing ---
  const handleEditVertices = useCallback(() => {
    if (!canEdit) return
    // Use first selected registry shape
    const id = Array.from(selectedIds).find(sid => {
      const obj = objects.get(sid)
      return obj && shapeRegistry.has(obj.type)
    })
    if (!id) return
    const obj = objects.get(id)
    if (!obj) return
    // If shape doesn't have custom_points yet, compute and persist them
    if (!obj.custom_points) {
      const pts = getInitialVertexPoints(obj)
      if (pts.length > 0) {
        updateObject(id, { custom_points: JSON.stringify(pts) })
      }
    }
    setVertexEditId(id)
  }, [canEdit, selectedIds, objects, updateObject])

  const handleVertexDragEnd = useCallback((id: string, index: number, x: number, y: number) => {
    const obj = objects.get(id)
    if (!obj?.custom_points) return
    try {
      const pts: number[] = JSON.parse(obj.custom_points)
      const before = obj.custom_points
      pts[index * 2] = x
      pts[index * 2 + 1] = y
      const after = JSON.stringify(pts)
      undoStack.push({ type: 'update', patches: [{ id, before: { custom_points: before } }] })
      updateObject(id, { custom_points: after })
    } catch { /* ignore */ }
  }, [objects, updateObject, undoStack])

  const handleVertexInsert = useCallback((id: string, afterIndex: number) => {
    const obj = objects.get(id)
    if (!obj?.custom_points) return
    try {
      const pts: number[] = JSON.parse(obj.custom_points)
      const numVerts = pts.length / 2
      const nextIndex = (afterIndex + 1) % numVerts
      // Insert midpoint between afterIndex and nextIndex
      const mx = (pts[afterIndex * 2] + pts[nextIndex * 2]) / 2
      const my = (pts[afterIndex * 2 + 1] + pts[nextIndex * 2 + 1]) / 2
      // Splice the new point after afterIndex
      const insertPos = (afterIndex + 1) * 2
      pts.splice(insertPos, 0, mx, my)
      const before = obj.custom_points
      const after = JSON.stringify(pts)
      undoStack.push({ type: 'update', patches: [{ id, before: { custom_points: before } }] })
      updateObject(id, { custom_points: after })
    } catch { /* ignore */ }
  }, [objects, updateObject, undoStack])

  const handleExitVertexEdit = useCallback(() => {
    setVertexEditId(null)
  }, [])

  // Dismiss floating shape palette when tool or selection changes
  useEffect(() => {
    if (shapePalette && (activeTool || selectedIds.size > 0)) {
      setShapePalette(null)
    }
  }, [shapePalette, activeTool, selectedIds])

  // Exit vertex edit when selection changes
  useEffect(() => {
    if (vertexEditId && !selectedIds.has(vertexEditId)) {
      setVertexEditId(null)
    }
  }, [selectedIds, vertexEditId])

  // Check if vertex editing is available for the current selection
  const canEditVertices = useMemo(() => {
    if (selectedIds.size !== 1) return false
    const id = selectedIds.values().next().value
    if (!id) return false
    const obj = objects.get(id)
    return !!obj && shapeRegistry.has(obj.type)
  }, [selectedIds, objects])

  const selectedColor = useMemo(() => {
    const firstId = selectedIds.values().next().value
    if (!firstId) return undefined
    return objects.get(firstId)?.color
  }, [selectedIds, objects])

  // Determine if any text-capable shape is selected
  const TEXT_TYPES = new Set(['sticky_note', 'rectangle', 'circle', 'triangle', 'chevron', 'parallelogram', 'ngon', 'frame'])

  const hasTextShapeSelected = useMemo(() => {
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj && TEXT_TYPES.has(obj.type)) return true
    }
    return false

  }, [selectedIds, objects])

  const selectedFontInfo = useMemo(() => {
    const firstTextId = [...selectedIds].find((id) => {
      const obj = objects.get(id)
      return obj && TEXT_TYPES.has(obj.type)
    })
    if (!firstTextId) return {}
    const obj = objects.get(firstTextId)
    return {
      fontFamily: obj?.font_family,
      fontSize: obj?.font_size,
      fontStyle: obj?.font_style,
      textAlign: obj?.text_align ?? 'center',
      textVerticalAlign: obj?.text_vertical_align ?? 'middle',
      textColor: obj?.text_color ?? '#000000',
    }

  }, [selectedIds, objects])

  // Style info for the first selected object
  const selectedStyleInfo = useMemo(() => {
    const firstId = selectedIds.values().next().value
    if (!firstId) return {}
    const obj = objects.get(firstId)
    if (!obj) return {}
    return {
      strokeColor: obj.stroke_color,
      strokeWidth: obj.stroke_width,
      strokeDash: obj.stroke_dash,
      opacity: obj.opacity ?? 1,
      shadowBlur: obj.shadow_blur ?? 6,
      cornerRadius: obj.corner_radius ?? (obj.type === 'rectangle' ? 6 : 0),
      isRectangle: obj.type === 'rectangle',
      isLine: obj.type === 'line' || obj.type === 'arrow',
      markerStart: obj.marker_start ?? 'none',
      markerEnd: obj.marker_end ?? (obj.type === 'arrow' ? 'arrow' : 'none'),
    }
  }, [selectedIds, objects])

  return (
    <div className="relative flex h-screen flex-col">
      <BoardTopBar
        boardId={boardId}
        boardName={boardName}
        userRole={userRole}
        onShareClick={() => setShareOpen(true)}
        onlineUsers={onlineUsers}
        gridSize={gridSize}
        gridSubdivisions={gridSubdivisions}
        gridVisible={gridVisible}
        snapToGrid={snapToGrid}
        gridStyle={gridStyle}
        canvasColor={canvasColor}
        gridColor={gridColor}
        subdivisionColor={subdivisionColor}
        onUpdateBoardSettings={updateBoardSettings}
        uiDarkMode={uiDarkMode}
        onToggleDarkMode={() => setUiDarkMode(!uiDarkMode)}
      />
      {activeGroupId && (
        <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2">
          <GroupBreadcrumb activeGroupId={activeGroupId} onExit={exitGroup} />
        </div>
      )}
      <div className="relative flex flex-1">
        <LeftToolbar
          userRole={userRole}
          activeTool={activeTool}
          hasSelection={selectedIds.size > 0}
          isEditingText={isEditingText}
          selectedColor={selectedColor}
          selectedFontFamily={selectedFontInfo.fontFamily}
          selectedFontSize={selectedFontInfo.fontSize}
          selectedFontStyle={selectedFontInfo.fontStyle}
          selectedTextAlign={selectedFontInfo.textAlign}
          selectedTextVerticalAlign={selectedFontInfo.textVerticalAlign}
          selectedTextColor={selectedFontInfo.textColor}
          onColorChange={handleColorChange}
          onFontChange={handleFontChange}
          onTextStyleChange={handleTextStyleChange}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          canGroup={canGroup}
          canUngroup={canUngroup}
          selectedStrokeColor={selectedStyleInfo.strokeColor}
          selectedStrokeWidth={selectedStyleInfo.strokeWidth}
          selectedStrokeDash={selectedStyleInfo.strokeDash}
          selectedOpacity={selectedStyleInfo.opacity}
          selectedShadowBlur={selectedStyleInfo.shadowBlur}
          selectedCornerRadius={selectedStyleInfo.cornerRadius}
          showCornerRadius={selectedStyleInfo.isRectangle}
          onStrokeColorChange={handleBorderColorChange}
          onStrokeStyleChange={handleStrokeStyleChange}
          onOpacityChange={handleOpacityChange}
          onShadowChange={handleShadowChange}
          onCornerRadiusChange={handleCornerRadiusChange}
          anySelectedLocked={anySelectedLocked}
          activePreset={activePreset}
          onPresetSelect={handlePresetSelect}
          uiDarkMode={uiDarkMode}
        />
        <div className="relative flex-1 overflow-hidden">
          <CanvasErrorBoundary>
            <Canvas
              objects={objects}
              sortedObjects={sortedObjects}
              selectedIds={selectedIds}
              activeGroupId={activeGroupId}
              activeTool={activeTool}
              onDrawShape={handleDrawShape}
              onCancelTool={handleCancelTool}
              onSelect={selectObject}
              onSelectObjects={selectObjects}
              onClearSelection={clearSelection}
              onEnterGroup={enterGroup}
              onExitGroup={exitGroup}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragMove={handleDragMove}
              onUpdateText={handleUpdateText}
              onUpdateTitle={handleUpdateTitle}
              onTransformEnd={handleTransformEnd}
              onTransformMove={handleTransformMove}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onCopy={handleCopy}
              onPaste={handlePaste}
              onColorChange={handleColorChange}
              onBringToFront={handleBringToFront}
              onBringForward={handleBringForward}
              onSendBackward={handleSendBackward}
              onSendToBack={handleSendToBack}
              onGroup={handleGroup}
              onUngroup={handleUngroup}
              canGroup={canGroup}
              canUngroup={canUngroup}
              onStrokeStyleChange={handleStrokeStyleChange}
              onOpacityChange={handleOpacityChange}
              onMarkerChange={handleMarkerChange}
              selectedMarkerStart={selectedStyleInfo.markerStart}
              selectedMarkerEnd={selectedStyleInfo.markerEnd}
              onEndpointDragMove={handleEndpointDragMove}
              onEndpointDragEnd={handleEndpointDragEnd}
              onUndo={performUndo}
              onRedo={performRedo}
              onCheckFrameContainment={checkFrameContainment}
              onMoveGroupChildren={moveGroupChildren}
              getChildren={getChildren}
              getDescendants={getDescendants}
              recentColors={recentColors}
              colors={EXPANDED_PALETTE}
              selectedColor={selectedColor}
              userRole={userRole}
              onlineUsers={onlineUsers}
              onCursorMove={sendCursorWithActivity}
              onCursorUpdate={onCursorUpdate}
              onActivity={markActivity}
              remoteSelections={remoteSelections}
              onEditingChange={setIsEditingText}
              isObjectLocked={isObjectLocked}
              anySelectedLocked={anySelectedLocked}
              onLock={handleLockSelected}
              onUnlock={handleUnlockSelected}
              canLock={selectedCanLock}
              canUnlock={selectedCanUnlock}
              vertexEditId={vertexEditId}
              onEditVertices={handleEditVertices}
              onExitVertexEdit={handleExitVertexEdit}
              onVertexDragEnd={handleVertexDragEnd}
              onVertexInsert={handleVertexInsert}
              canEditVertices={canEditVertices}
              snapIndicator={snapIndicator}
              pendingEditId={pendingEditId}
              onPendingEditConsumed={() => setPendingEditId(null)}
              gridSize={gridSize}
              gridSubdivisions={gridSubdivisions}
              gridVisible={gridVisible}
              snapToGrid={snapToGrid}
              gridStyle={gridStyle}
              canvasColor={canvasColor}
              gridColor={gridColor}
              subdivisionColor={subdivisionColor}
              onUpdateBoardSettings={updateBoardSettings}
              uiDarkMode={uiDarkMode}
              onWaypointDragEnd={handleWaypointDragEnd}
              onWaypointInsert={handleWaypointInsert}
              onWaypointDelete={handleWaypointDelete}
              autoRoutePointsRef={autoRoutePointsRef}
              onDrawLineFromAnchor={handleDrawLineFromAnchor}
            />
          </CanvasErrorBoundary>
        </div>
      </div>
      {shareOpen && (
        <ShareDialog
          boardId={boardId}
          userRole={userRole}
          onClose={() => setShareOpen(false)}
        />
      )}
      {shapePalette && (
        <FloatingShapePalette
          x={shapePalette.screenX || window.innerWidth / 2}
          y={shapePalette.screenY || window.innerHeight / 2}
          onSelectShape={handlePaletteShapeSelect}
          onDismiss={() => setShapePalette(null)}
        />
      )}
    </div>
  )
}
