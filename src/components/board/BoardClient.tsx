'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useBoardState } from '@/hooks/useBoardState'
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel'
import { usePresence } from '@/hooks/usePresence'
import { useCursors } from '@/hooks/useCursors'
import { useUndoStack, UndoEntry } from '@/hooks/useUndoStack'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useVertexActions } from '@/hooks/board/useVertexActions'
import { useLockActions } from '@/hooks/board/useLockActions'
import { useStyleActions } from '@/hooks/board/useStyleActions'
import { useZOrderActions } from '@/hooks/board/useZOrderActions'
import { useGroupActions } from '@/hooks/board/useGroupActions'
import { useClipboardActions } from '@/hooks/board/useClipboardActions'
import { useTableActions } from '@/hooks/board/useTableActions'
import { parseTableData } from '@/lib/table/tableUtils'
import { useConnectorActions } from '@/hooks/board/useConnectorActions'
import { createClient } from '@/lib/supabase/client'
import { fireAndRetry } from '@/lib/retryWithRollback'
import { logger } from '@/lib/logger'
import { toast } from 'sonner'
import { BoardObject, BoardObjectType } from '@/types/board'
import { RICH_TEXT_ENABLED, extractPlainText } from '@/lib/richText'
import type { TipTapDoc } from '@/types/board'
import type { Editor } from '@tiptap/react'
import { BoardRole } from '@/types/sharing'
import { BoardTopBar } from './BoardTopBar'
import { LeftToolbar } from './LeftToolbar'
import { EXPANDED_PALETTE } from './ColorPicker'
import { ShareDialog } from './ShareDialog'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'
import { GroupBreadcrumb } from './GroupBreadcrumb'
import { isVectorType } from './shapeUtils'
import { FloatingShapePalette } from './FloatingShapePalette'
import { shapeRegistry } from './shapeRegistry'
import { getShapeAnchors } from './anchorPoints'
import type { ShapePreset } from './shapePresets'
import { scaleCustomPoints } from './shapePresets'
import { BoardProvider, BoardContextValue } from '@/contexts/BoardContext'
import { ConnectionBanner, ConnectionStatus } from '@/components/ui/ConnectionBanner'
import { ChatPanel } from './ChatPanel'

// Konva is client-only — must disable SSR
const Canvas = dynamic(() => import('./Canvas').then(mod => ({ default: mod.Canvas })), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
    </div>
  ),
})

const TEXT_TYPES = new Set(['sticky_note', 'rectangle', 'circle', 'triangle', 'chevron', 'parallelogram', 'ngon', 'frame'])

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
    waitForPersist,
  } = useBoardState(userId, boardId, userRole, channel, onlineUsers)
  const [shareOpen, setShareOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [isEditingText, setIsEditingText] = useState(false)
  const [activeTool, setActiveTool] = useState<BoardObjectType | null>(null)
  const [activePreset, setActivePreset] = useState<ShapePreset | null>(null)
  const [vertexEditId, setVertexEditId] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null)
  const [shapePalette, setShapePalette] = useState<{ lineId: string; canvasX: number; canvasY: number; screenX?: number; screenY?: number } | null>(null)

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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected')

  const notify = useCallback((msg: string) => toast.error(msg), [])

  const updateBoardSettings = useCallback((updates: { grid_size?: number; grid_subdivisions?: number; grid_visible?: boolean; snap_to_grid?: boolean; grid_style?: string; canvas_color?: string; grid_color?: string; subdivision_color?: string }) => {
    if (updates.grid_size !== undefined) setGridSize(updates.grid_size)
    if (updates.grid_subdivisions !== undefined) setGridSubdivisions(updates.grid_subdivisions)
    if (updates.grid_visible !== undefined) setGridVisible(updates.grid_visible)
    if (updates.snap_to_grid !== undefined) setSnapToGrid(updates.snap_to_grid)
    if (updates.grid_style !== undefined) setGridStyle(updates.grid_style)
    if (updates.canvas_color !== undefined) setCanvasColor(updates.canvas_color)
    if (updates.grid_color !== undefined) setGridColor(updates.grid_color)
    if (updates.subdivision_color !== undefined) setSubdivisionColor(updates.subdivision_color)
    // Persist to DB (fire-and-forget with retry)
    fireAndRetry({
      operation: () => supabaseRef.current.from('boards').update(updates).eq('id', boardId),
      logError: (err) => logger.error({ message: 'Failed to save board settings', operation: 'updateBoardSettings', boardId, error: err }),
      onError: (msg) => notify(msg),
    })
  }, [boardId, notify])

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
    const handleBlur = () => { preDragRef.current.clear() }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])
  // Auto-route points ref: populated by Canvas during render, used by handleWaypointInsert
  const autoRoutePointsRef = useRef<Map<string, number[]>>(new Map())

  // Subscribe LAST — after all hooks have registered their .on() listeners.
  const hasConnectedRef = useRef(false)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 5

  useEffect(() => {
    if (!channel) return

    const attemptReconnect = () => {
      // Bug 3 fix: increment first, then guard — so all MAX_RECONNECT_ATTEMPTS fire
      reconnectAttemptRef.current += 1
      if (reconnectAttemptRef.current > MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus('disconnected')
        return
      }
      // Clear any pending timer to avoid duplicate reconnects
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      setConnectionStatus('reconnecting')
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 16000)
      reconnectTimerRef.current = setTimeout(() => {
        // Bug 1 fix: unsubscribe first to transition 'errored' → 'closed' before re-subscribing
        channel.unsubscribe()
        channel.subscribe()
      }, delay)
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        reconnectAttemptRef.current = 0
        setConnectionStatus('connected')
        trackPresence()
        if (hasConnectedRef.current) {
          reconcileOnReconnect()
        } else {
          hasConnectedRef.current = true
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Bug 4 fix: go straight to reconnecting — skip the transient 'disconnected' state
        // 'disconnected' is only set inside attemptReconnect when all attempts are exhausted
        attemptReconnect()
      }
    })

    return () => {
      // Bug 2 fix: unsubscribe the channel to prevent stacked callbacks on effect re-runs
      channel.unsubscribe()
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      reconnectAttemptRef.current = 0
    }
  }, [channel, trackPresence, reconcileOnReconnect])

  // Auth expiry detection
  useEffect(() => {
    const { data: { subscription } } = supabaseRef.current.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setConnectionStatus('auth_expired')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const canEdit = userRole !== 'viewer'

  // --- Extracted domain hooks ---
  const {
    handleEditVertices,
    handleVertexDragEnd,
    handleVertexInsert,
    handleExitVertexEdit,
  } = useVertexActions({ objects, selectedIds, canEdit, updateObject, undoStack, setVertexEditId })

  const {
    anySelectedLocked,
    selectedCanLock,
    selectedCanUnlock,
    handleLockSelected,
    handleUnlockSelected,
  } = useLockActions({ objects, selectedIds, isObjectLocked, lockObject, unlockObject, userRole, userId })

  const {
    handleColorChange,
    handleStrokeStyleChange,
    handleOpacityChange,
    handleShadowChange,
    handleMarkerChange,
    handleCornerRadiusChange,
    handleTextStyleChange,
    handleFontChange,
  } = useStyleActions({ objects, selectedIds, canEdit, updateObject, deleteObject, getDescendants, undoStack, pushRecentColor })

  const {
    handleBringToFront,
    handleSendToBack,
    handleBringForward,
    handleSendBackward,
  } = useZOrderActions({ objects, getZOrderSet, bringToFront, sendToBack, bringForward, sendBackward, undoStack })

  const {
    handleGroup,
    handleUngroup,
    canGroup,
    canUngroup,
  } = useGroupActions({ objects, selectedIds, canEdit, groupSelected, ungroupSelected, getChildren, undoStack, markActivity })

  const {
    handleDelete,
    handleDuplicate,
    handleCopy,
    handlePaste,
  } = useClipboardActions({ objects, selectedIds, canEdit, deleteSelected, duplicateSelected, duplicateObject, getDescendants, undoStack, markActivity })

  const {
    handleAddRow,
    handleDeleteRow,
    handleAddColumn,
    handleDeleteColumn,
    handleAddRowAt,
    handleDeleteRowAt,
    handleAddColumnAt,
    handleDeleteColumnAt,
    handleTableDataChange,
    handleCellTextUpdate,
    handleTableHeaderStyleChange,
  } = useTableActions({ objects, selectedIds, canEdit, updateObject, undoStack })

  const {
    connectionIndex,
    followConnectors,
    handleEndpointDragMove,
    handleEndpointDragEnd: connectorEndpointDragEnd,
    handleDrawLineFromAnchor: connectorDrawLineFromAnchor,
    handlePaletteShapeSelect,
    handleWaypointDragEnd,
    handleWaypointInsert,
    handleWaypointDelete,
  } = useConnectorActions({ objects, canEdit, updateObject, updateObjectDrag, updateObjectDragEnd, addObject, checkFrameContainment, undoStack, markActivity, setSnapIndicator, setShapePalette, shapePalette, autoRoutePointsRef, waitForPersist })

  // Wrap connectorEndpointDragEnd to inject preDragRef
  const handleEndpointDragEnd = useCallback((id: string, updates: Partial<BoardObject>) => {
    connectorEndpointDragEnd(id, updates, preDragRef)
  }, [connectorEndpointDragEnd])

  // Wrap handleDrawLineFromAnchor to also clear tool state
  const handleDrawLineFromAnchor = useCallback((type: BoardObjectType, startShapeId: string, startAnchor: string, startX: number, startY: number, endX: number, endY: number, screenEndX?: number, screenEndY?: number) => {
    if (!canEdit) return
    connectorDrawLineFromAnchor(type, startShapeId, startAnchor, startX, startY, endX, endY, screenEndX, screenEndY)
    setActiveTool(null)
    setActivePreset(null)
  }, [canEdit, connectorDrawLineFromAnchor])

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
        // Capture current parent_ids BEFORE mutating, to avoid stale closure reads
        const previousParentIds = new Map<string, string | null>()
        for (const childId of entry.childIds) {
          const child = objects.get(childId)
          previousParentIds.set(childId, child?.parent_id ?? null)
        }
        addObjectWithId(entry.groupSnapshot)
        for (const childId of entry.childIds) {
          updateObject(childId, { parent_id: entry.groupSnapshot.id })
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
    if (activePreset) {
      Object.assign(overrides, activePreset.overrides)
      if (!(width > 0 && height > 0)) {
        overrides.width = activePreset.defaultWidth
        overrides.height = activePreset.defaultHeight
      }
    }
    if (width > 0 && height > 0) {
      overrides.width = width
      overrides.height = height
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

  const handleDragStart = useCallback((id: string) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const map = preDragRef.current
    map.set(id, { x: obj.x, y: obj.y, x2: obj.x2, y2: obj.y2, parent_id: obj.parent_id, waypoints: obj.waypoints, connect_start_id: obj.connect_start_id, connect_end_id: obj.connect_end_id, connect_start_anchor: obj.connect_start_anchor, connect_end_anchor: obj.connect_end_anchor })
    if (obj.type === 'frame') {
      for (const d of getDescendants(id)) {
        map.set(d.id, { x: d.x, y: d.y, x2: d.x2, y2: d.y2, parent_id: d.parent_id, waypoints: d.waypoints })
      }
    }
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
      preDragRef.current.clear()
    }
  }, [canEdit, updateObjectDragEnd, undoStack, objects, followConnectors, markActivity])

  const handleUpdateText = useCallback((id: string, text: string) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const max = obj.type === 'sticky_note' ? 10000 : 256
    const limited = text.slice(0, max)
    updateObject(id, { text: limited })
  }, [canEdit, objects, updateObject, markActivity])

  const handleUpdateTitle = useCallback((id: string, title: string) => {
    if (!canEdit) return
    markActivity()
    updateObject(id, { title: title.slice(0, 256) })
  }, [canEdit, updateObject, markActivity])

  const [richTextEditor, setRichTextEditor] = useState<Editor | null>(null)

  const handleUpdateRichText = useCallback((id: string, json: string, before: { text: string; rich_text: string | null }) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    // Use the before state captured at edit start (not current obj, which was mutated by live broadcasts)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    // Extract plain text for fallback display and collaboration
    let plain = obj.text
    try {
      const doc = JSON.parse(json) as TipTapDoc
      plain = extractPlainText(doc)
    } catch { /* keep existing text */ }
    updateObject(id, { rich_text: json, text: plain })
  }, [canEdit, objects, updateObject, undoStack, markActivity])

  const handleTransformEnd = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const before: Partial<BoardObject> = {}
    for (const key of Object.keys(updates)) {
      (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
    }
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, updates)
    if (!isVectorType(obj.type)) {
      const anchors = getShapeAnchors({ ...obj, ...updates })
      followConnectors(id, anchors, updateObject, true)
    }
  }, [canEdit, objects, updateObject, undoStack, followConnectors, markActivity])

  const handleBorderColorChange = useCallback((color: string | null) => {
    handleStrokeStyleChange({ stroke_color: color })
  }, [handleStrokeStyleChange])

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
    }
  }, [selectedIds, objects])

  const selectedTableHeaderInfo = useMemo(() => {
    if (selectedIds.size !== 1) return null
    const [id] = selectedIds
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return null
    const data = parseTableData(obj.table_data)
    if (!data) return null
    return {
      headerBg: data.header_bg ?? '#F3F4F6',
      headerTextColor: data.header_text_color ?? '#374151',
    }
  }, [selectedIds, objects])

  // ── Board context (read-only shared state for child components) ──
  const boardContextValue: BoardContextValue = useMemo(() => ({
    objects, selectedIds, activeGroupId, sortedObjects, remoteSelections,
    getChildren, getDescendants,
    userId, userRole, canEdit,
    activeTool,
    onlineUsers,
    isObjectLocked,
    gridSize, gridSubdivisions, gridVisible, snapToGrid, gridStyle,
    canvasColor, gridColor, subdivisionColor, uiDarkMode,
  }), [
    objects, selectedIds, activeGroupId, sortedObjects, remoteSelections,
    getChildren, getDescendants,
    userId, userRole, canEdit,
    activeTool,
    onlineUsers,
    isObjectLocked,
    gridSize, gridSubdivisions, gridVisible, snapToGrid, gridStyle,
    canvasColor, gridColor, subdivisionColor, uiDarkMode,
  ])

  return (
    <BoardProvider value={boardContextValue}>
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
      <ConnectionBanner status={connectionStatus} />
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
          richTextEditor={RICH_TEXT_ENABLED ? richTextEditor : undefined}
          selectedTableHeaderBg={selectedTableHeaderInfo?.headerBg}
          selectedTableHeaderTextColor={selectedTableHeaderInfo?.headerTextColor}
          onTableHeaderStyleChange={handleTableHeaderStyleChange}
        />
        <div className="relative flex-1 overflow-hidden">
          <CanvasErrorBoundary>
            <Canvas
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
              onUpdateRichText={RICH_TEXT_ENABLED ? handleUpdateRichText : undefined}
              onEditorReady={RICH_TEXT_ENABLED ? setRichTextEditor : undefined}
              onTransformEnd={handleTransformEnd}
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
              onEndpointDragMove={handleEndpointDragMove}
              onEndpointDragEnd={handleEndpointDragEnd}
              onUndo={performUndo}
              onRedo={performRedo}
              onCheckFrameContainment={checkFrameContainment}
              onMoveGroupChildren={moveGroupChildren}
              recentColors={recentColors}
              colors={EXPANDED_PALETTE}
              selectedColor={selectedColor}
              onCursorMove={sendCursorWithActivity}
              onCursorUpdate={onCursorUpdate}
              onActivity={markActivity}
              onEditingChange={setIsEditingText}
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
              onUpdateBoardSettings={updateBoardSettings}
              onWaypointDragEnd={handleWaypointDragEnd}
              onWaypointInsert={handleWaypointInsert}
              onWaypointDelete={handleWaypointDelete}
              autoRoutePointsRef={autoRoutePointsRef}
              onDrawLineFromAnchor={handleDrawLineFromAnchor}
              onUpdateTableCell={handleCellTextUpdate}
              onTableDataChange={handleTableDataChange}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              onAddColumn={handleAddColumn}
              onDeleteColumn={handleDeleteColumn}
              onAddRowAt={handleAddRowAt}
              onDeleteRowAt={handleDeleteRowAt}
              onAddColumnAt={handleAddColumnAt}
              onDeleteColumnAt={handleDeleteColumnAt}
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
          x={shapePalette.screenX ?? window.innerWidth / 2}
          y={shapePalette.screenY ?? window.innerHeight / 2}
          onSelectShape={handlePaletteShapeSelect}
          onDismiss={() => setShapePalette(null)}
        />
      )}
      {/* AI Chat toggle button */}
      <button
        onClick={() => setChatOpen(prev => !prev)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700"
        aria-label="Toggle AI chat"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>
      <ChatPanel boardId={boardId} isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
    </BoardProvider>
  )
}
