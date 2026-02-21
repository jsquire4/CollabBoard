'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useBoardState } from '@/hooks/useBoardState'
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel'
import { usePresence } from '@/hooks/usePresence'
import { useCursors } from '@/hooks/useCursors'
import { useUndoStack } from '@/hooks/useUndoStack'
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
import { useConnectionManager } from '@/hooks/board/useConnectionManager'
import { useGridSettings } from '@/hooks/board/useGridSettings'
import { useUndoExecution } from '@/hooks/board/useUndoExecution'
import { createClient } from '@/lib/supabase/client'
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
import { BoardMutationsProvider, BoardMutationsContextValue } from '@/contexts/BoardMutationsContext'
import { BoardToolProvider, BoardToolContextValue } from '@/contexts/BoardToolContext'
import { ConnectionBanner } from '@/components/ui/ConnectionBanner'
import { AgentChatPanel } from './AgentChatPanel'
import { GlobalAgentPanel } from './GlobalAgentPanel'
import { useFileUpload } from '@/hooks/useFileUpload'
import { FileLibraryPanel } from './FileLibraryPanel'
import { FilmstripPanel } from './FilmstripPanel'
import { CommentThread } from './CommentThread'
import { FileDropZone } from './FileDropZone'

// Konva is client-only — must disable SSR
const Canvas = dynamic(() => import('./Canvas').then(mod => ({ default: mod.Canvas })), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-parchment">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-parchment-border border-t-navy" />
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
  initialGridStyle?: 'lines' | 'dots' | 'both'
  initialCanvasColor?: string
  initialGridColor?: string
  initialSubdivisionColor?: string
}

export function BoardClient({ userId, boardId, boardName, userRole, displayName, initialGridSize = 40, initialGridSubdivisions = 1, initialGridVisible = true, initialSnapToGrid = false, initialGridStyle = 'lines', initialCanvasColor = '#FAF8F4', initialGridColor = '#E8E3DA', initialSubdivisionColor = '#E8E3DA' }: BoardClientProps) {
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
  // Expose object count for E2E performance tests (no cleanup — survives hot-reload)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__boardObjectCount = objects.size
  }, [objects.size])

  const [shareOpen, setShareOpen] = useState(false)
  const [agentChatPanel, setAgentChatPanel] = useState<{ objectId: string; position: { x: number; y: number } } | null>(null)
  const [globalAgentOpen, setGlobalAgentOpen] = useState(false)
  const [fileLibraryOpen, setFileLibraryOpen] = useState(false)
  const [filmstripOpen, setFilmstripOpen] = useState(false)
  const [commentThread, setCommentThread] = useState<{ objectId: string; position: { x: number; y: number } } | null>(null)
  const [slideThumbnails, setSlideThumbnails] = useState<Record<string, string>>({})
  const [isEditingText, setIsEditingText] = useState(false)
  const [activeTool, setActiveTool] = useState<BoardObjectType | null>(null)
  const [activePreset, setActivePreset] = useState<ShapePreset | null>(null)
  const [vertexEditId, setVertexEditId] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const clearPendingEditId = useCallback(() => setPendingEditId(null), [])
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null)
  const [shapePalette, setShapePalette] = useState<{ lineId: string; canvasX: number; canvasY: number; screenX?: number; screenY?: number } | null>(null)

  // Grid settings — initialized from server props, persisted on change
  const { gridSize, gridSubdivisions, gridVisible, snapToGrid, gridStyle, canvasColor, gridColor, subdivisionColor, updateBoardSettings } = useGridSettings({
    boardId,
    initialGridSize, initialGridSubdivisions, initialGridVisible, initialSnapToGrid,
    initialGridStyle, initialCanvasColor, initialGridColor, initialSubdivisionColor,
  })
  const [uiDarkMode, setUiDarkMode] = useDarkMode()

  const supabaseRef = useRef(createClient())

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

  // Cmd+G — toggle global board assistant
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault()
        setGlobalAgentOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Subscribe LAST — after all hooks have registered their .on() listeners.
  const { connectionStatus } = useConnectionManager({ channel, trackPresence, reconcileOnReconnect, supabaseRef })

  const canEdit = userRole !== 'viewer'

  // File drag-and-drop upload
  const { uploadFile } = useFileUpload({
    boardId,
    canEdit,
    supabase: supabaseRef.current,
    addObject: addObject as (type: 'file', x: number, y: number, overrides?: Partial<BoardObject>) => BoardObject | null,
    removeObject: deleteObject,
  })

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
    handleMarkerChange,
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
  const { performUndo, performRedo } = useUndoExecution({
    objects, deleteObject, addObjectWithId, updateObject, getDescendants, undoStack,
  })

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
    if (type === 'line' || type === 'arrow' || type === 'data_connector') {
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

  // Slide frames — sorted by slide_index, used by FilmstripPanel
  const slideFrames = useMemo(() =>
    [...objects.values()]
      .filter(o => o.type === 'frame' && o.is_slide)
      .sort((a, b) => (a.slide_index ?? 0) - (b.slide_index ?? 0))
  , [objects])

  // ── Board context (read-only shared state for child components) ──
  const boardContextValue: BoardContextValue = useMemo(() => ({
    objects, selectedIds, activeGroupId, sortedObjects, remoteSelections,
    getChildren, getDescendants,
    boardId,
    userId, userRole, canEdit,
    activeTool,
    onlineUsers,
    isObjectLocked,
    gridSize, gridSubdivisions, gridVisible, snapToGrid, gridStyle,
    canvasColor, gridColor, subdivisionColor, uiDarkMode,
  }), [
    objects, selectedIds, activeGroupId, sortedObjects, remoteSelections,
    getChildren, getDescendants,
    boardId, userId, userRole, canEdit,
    activeTool,
    onlineUsers,
    isObjectLocked,
    gridSize, gridSubdivisions, gridVisible, snapToGrid, gridStyle,
    canvasColor, gridColor, subdivisionColor, uiDarkMode,
  ])

  // ── Mutations context (all callbacks for Canvas + child components) ──
  const handleAgentClick = useCallback((id: string) => {
    setAgentChatPanel({ objectId: id, position: { x: 20, y: 80 } })
  }, [])

  const handleApiConfigChange = useCallback((id: string, formula: string) => {
    if (!canEdit) return
    updateObject(id, { formula })
  }, [canEdit, updateObject])

  const handleCommentOpen = useCallback((id: string) => {
    setCommentThread({ objectId: id, position: { x: window.innerWidth - 320, y: 80 } })
  }, [])

  const handleSlideReorder = useCallback((newOrder: string[]) => {
    if (!canEdit) return
    newOrder.forEach((frameId, index) => {
      updateObject(frameId, { slide_index: index })
    })
  }, [canEdit, updateObject])

  const handleSlideSelect = useCallback((frameId: string) => {
    selectObject(frameId)
  }, [selectObject])

  const handleFilmstripOpen = useCallback(() => {
    setFilmstripOpen(true)
    // Thumbnails would require access to the Konva stage — set empty for now,
    // the filmstrip will show numbered fallbacks.
    setSlideThumbnails({})
  }, [])

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!canEdit) return

    // Handle collabboard file library drags only.
    // Native file drops are handled by FileDropZone — the getData guard below
    // ensures we only act on library drags (native drops have no collabboard data).
    const data = e.dataTransfer.getData('application/collabboard-file')
    if (data) {
      try {
        const { fileId, fileName, mimeType } = JSON.parse(data)
        addObject('context_object', 200, 200, { file_id: fileId, file_name: fileName, mime_type: mimeType })
      } catch { /* ignore malformed drag data */ }
    }
  }, [addObject, canEdit])

  const mutationsValue: BoardMutationsContextValue = useMemo(() => ({
    onDrawShape: handleDrawShape,
    onCancelTool: handleCancelTool,
    onSelect: selectObject,
    onSelectObjects: selectObjects,
    onClearSelection: clearSelection,
    onEnterGroup: enterGroup,
    onExitGroup: exitGroup,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragMove: handleDragMove,
    onUpdateText: handleUpdateText,
    onUpdateTitle: handleUpdateTitle,
    onUpdateRichText: RICH_TEXT_ENABLED ? handleUpdateRichText : undefined,
    onEditorReady: RICH_TEXT_ENABLED ? setRichTextEditor : undefined,
    onTransformEnd: handleTransformEnd,
    onDelete: handleDelete,
    onDuplicate: handleDuplicate,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onColorChange: handleColorChange,
    onBringToFront: handleBringToFront,
    onBringForward: handleBringForward,
    onSendBackward: handleSendBackward,
    onSendToBack: handleSendToBack,
    onGroup: handleGroup,
    onUngroup: handleUngroup,
    canGroup,
    canUngroup,
    onStrokeStyleChange: handleStrokeStyleChange,
    onOpacityChange: handleOpacityChange,
    onMarkerChange: handleMarkerChange,
    onUndo: performUndo,
    onRedo: performRedo,
    onCheckFrameContainment: checkFrameContainment,
    onMoveGroupChildren: moveGroupChildren,
    recentColors,
    colors: EXPANDED_PALETTE,
    selectedColor,
    onEndpointDragMove: handleEndpointDragMove,
    onEndpointDragEnd: handleEndpointDragEnd,
    onCursorMove: sendCursorWithActivity,
    onCursorUpdate,
    onEditingChange: setIsEditingText,
    anySelectedLocked,
    onLock: handleLockSelected,
    onUnlock: handleUnlockSelected,
    canLock: selectedCanLock,
    canUnlock: selectedCanUnlock,
    vertexEditId,
    onEditVertices: handleEditVertices,
    onExitVertexEdit: handleExitVertexEdit,
    onVertexDragEnd: handleVertexDragEnd,
    onVertexInsert: handleVertexInsert,
    canEditVertices,
    snapIndicator,
    onActivity: markActivity,
    pendingEditId,
    onPendingEditConsumed: clearPendingEditId,
    onWaypointDragEnd: handleWaypointDragEnd,
    onWaypointInsert: handleWaypointInsert,
    onWaypointDelete: handleWaypointDelete,
    autoRoutePointsRef,
    onDrawLineFromAnchor: handleDrawLineFromAnchor,
    onUpdateTableCell: handleCellTextUpdate,
    onTableDataChange: handleTableDataChange,
    onAddRow: handleAddRow,
    onDeleteRow: handleDeleteRow,
    onAddColumn: handleAddColumn,
    onDeleteColumn: handleDeleteColumn,
    onAddRowAt: handleAddRowAt,
    onDeleteRowAt: handleDeleteRowAt,
    onAddColumnAt: handleAddColumnAt,
    onDeleteColumnAt: handleDeleteColumnAt,
    onAgentClick: handleAgentClick,
    onApiConfigChange: handleApiConfigChange,
    onCommentOpen: handleCommentOpen,
  }), [
    handleDrawShape, handleCancelTool,
    selectObject, selectObjects, clearSelection, enterGroup, exitGroup,
    handleDragStart, handleDragEnd, handleDragMove,
    handleUpdateText, handleUpdateTitle, handleUpdateRichText, setRichTextEditor,
    handleTransformEnd,
    handleDelete, handleDuplicate, handleCopy, handlePaste,
    handleColorChange, handleBringToFront, handleBringForward, handleSendBackward, handleSendToBack,
    handleGroup, handleUngroup, canGroup, canUngroup,
    handleStrokeStyleChange, handleOpacityChange, handleMarkerChange,
    performUndo, performRedo,
    checkFrameContainment, moveGroupChildren,
    recentColors, selectedColor,
    handleEndpointDragMove, handleEndpointDragEnd,
    sendCursorWithActivity, onCursorUpdate,
    anySelectedLocked,
    handleLockSelected, handleUnlockSelected, selectedCanLock, selectedCanUnlock,
    vertexEditId, handleEditVertices, handleExitVertexEdit, handleVertexDragEnd, handleVertexInsert,
    canEditVertices, snapIndicator,
    markActivity, pendingEditId, clearPendingEditId,
    handleWaypointDragEnd, handleWaypointInsert, handleWaypointDelete,
    autoRoutePointsRef, handleDrawLineFromAnchor,
    handleCellTextUpdate, handleTableDataChange,
    handleAddRow, handleDeleteRow, handleAddColumn, handleDeleteColumn,
    handleAddRowAt, handleDeleteRowAt, handleAddColumnAt, handleDeleteColumnAt,
    handleAgentClick, handleApiConfigChange, handleCommentOpen,
  ])

  // ── Tool context ──
  const toolValue: BoardToolContextValue = useMemo(() => ({
    activePreset,
    setActiveTool,
    setActivePreset,
  }), [activePreset])

  return (
    <BoardProvider value={boardContextValue}>
    <BoardMutationsProvider value={mutationsValue}>
    <BoardToolProvider value={toolValue}>
    <div className={`relative flex h-screen flex-col ${uiDarkMode ? 'dark' : ''}`}>
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
          isEditingText={isEditingText}
          selectedFontFamily={selectedFontInfo.fontFamily}
          selectedFontSize={selectedFontInfo.fontSize}
          selectedFontStyle={selectedFontInfo.fontStyle}
          selectedTextAlign={selectedFontInfo.textAlign}
          selectedTextVerticalAlign={selectedFontInfo.textVerticalAlign}
          selectedTextColor={selectedFontInfo.textColor}
          onFontChange={handleFontChange}
          onTextStyleChange={handleTextStyleChange}
          activePreset={activePreset}
          onPresetSelect={handlePresetSelect}
          uiDarkMode={uiDarkMode}
          richTextEditor={RICH_TEXT_ENABLED ? richTextEditor : undefined}
        />
        <FileDropZone
          onDrop={(files) => {
            if (!canEdit) return
            for (const file of Array.from(files)) {
              void uploadFile(file, 200, 200)
            }
          }}
          disabled={!canEdit}
        >
          <div
            className="relative flex-1 overflow-hidden"
            onDragOver={e => e.preventDefault()}
            onDrop={handleCanvasDrop}
          >
            <CanvasErrorBoundary>
              <Canvas />
            </CanvasErrorBoundary>
          </div>
        </FileDropZone>
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
      {/* Global Agent toggle button */}
      <button
        onClick={() => setGlobalAgentOpen(prev => !prev)}
        className="fixed bottom-16 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-navy text-parchment shadow-lg hover:bg-navy/80 border border-transparent dark:border-white/10"
        aria-label="Toggle global board assistant (Cmd+G)"
        title="Board Assistant (⌘G)"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </button>
      {/* Filmstrip toggle button */}
      <button
        onClick={() => setFilmstripOpen(prev => !prev)}
        className="fixed bottom-52 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal text-parchment shadow-lg hover:bg-charcoal/80 border border-transparent dark:border-white/10"
        aria-label="Toggle slide filmstrip"
        title="Slide Filmstrip"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
      </button>
      {/* File Library toggle button */}
      <button
        onClick={() => setFileLibraryOpen(prev => !prev)}
        className="fixed bottom-40 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal text-parchment shadow-lg hover:bg-charcoal/80 border border-transparent dark:border-white/10"
        aria-label="Toggle file library"
        title="File Library"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>
      {/* Slide deck / Filmstrip toggle button */}
      <button
        onClick={handleFilmstripOpen}
        className="fixed bottom-52 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700"
        aria-label="Toggle slide deck"
        title="Slide Deck"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
      </button>
      {agentChatPanel && (
        <AgentChatPanel
          agentObjectId={agentChatPanel.objectId}
          boardId={boardId}
          position={agentChatPanel.position}
          isOpen={true}
          onClose={() => setAgentChatPanel(null)}
          agentState={objects.get(agentChatPanel.objectId)?.agent_state ?? 'idle'}
          agentName={objects.get(agentChatPanel.objectId)?.text || 'Board Agent'}
        />
      )}
      <GlobalAgentPanel
        boardId={boardId}
        isOpen={globalAgentOpen}
        onClose={() => setGlobalAgentOpen(false)}
      />
      <FileLibraryPanel
        boardId={boardId}
        isOpen={fileLibraryOpen}
        onClose={() => setFileLibraryOpen(false)}
      />
      <FilmstripPanel
        boardId={boardId}
        isOpen={filmstripOpen}
        onClose={() => setFilmstripOpen(false)}
        frames={slideFrames}
        currentFrameId={selectedIds.size === 1 ? (selectedIds.values().next().value ?? null) : null}
        onSelectSlide={handleSlideSelect}
        onReorder={handleSlideReorder}
        onExport={() => { /* TODO: export PDF */ }}
        thumbnails={slideThumbnails}
      />
      {commentThread && (
        <CommentThread
          boardId={boardId}
          objectId={commentThread.objectId}
          position={commentThread.position}
          isOpen={true}
          onClose={() => setCommentThread(null)}
        />
      )}
    </div>
    </BoardToolProvider>
    </BoardMutationsProvider>
    </BoardProvider>
  )
}
