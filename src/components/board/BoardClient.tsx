'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useBoardState } from '@/hooks/useBoardState'
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel'
import { usePresence } from '@/hooks/usePresence'
import { useCursors } from '@/hooks/useCursors'
import { useUndoStack, UndoEntry } from '@/hooks/useUndoStack'
import { BoardObject, BoardObjectType } from '@/types/board'
import { BoardRole } from '@/types/sharing'
import { BoardTopBar } from './BoardTopBar'
import { LeftToolbar } from './LeftToolbar'
import { EXPANDED_PALETTE } from './ColorPicker'
import { ShareDialog } from './ShareDialog'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'
import { GroupBreadcrumb } from './GroupBreadcrumb'

// Konva is client-only — must disable SSR
const Canvas = dynamic(() => import('./Canvas').then(mod => ({ default: mod.Canvas })), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
    </div>
  ),
})

interface BoardClientProps {
  userId: string
  boardId: string
  boardName: string
  userRole: BoardRole
  displayName: string
}

export function BoardClient({ userId, boardId, boardName, userRole, displayName }: BoardClientProps) {
  const channel = useRealtimeChannel(boardId)
  const { onlineUsers, trackPresence } = usePresence(channel, userId, userRole, displayName)
  const userCount = onlineUsers.length + 1 // include self
  const { sendCursor, onCursorUpdate } = useCursors(channel, userId, userCount)

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
  const undoStack = useUndoStack()
  const MAX_RECENT_COLORS = 6
  const [recentColors, setRecentColors] = useState<string[]>(() => EXPANDED_PALETTE.slice(0, MAX_RECENT_COLORS))
  const pushRecentColor = useCallback((color: string) => {
    setRecentColors(prev => {
      const next = [color, ...prev.filter(c => c !== color)]
      return next.length > MAX_RECENT_COLORS ? next.slice(0, MAX_RECENT_COLORS) : next
    })
  }, [])
  const preDragRef = useRef<Map<string, { x: number; y: number; x2?: number | null; y2?: number | null; parent_id: string | null }>>(new Map())

  // Subscribe LAST — after all hooks have registered their .on() listeners.
  const hasConnectedRef = useRef(false)
  useEffect(() => {
    if (!channel) return
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Realtime channel subscribed for board ${boardId}`)
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
        const inversePatches: { id: string; before: { x: number; y: number; x2?: number | null; y2?: number | null; parent_id: string | null } }[] = []
        for (const patch of entry.patches) {
          const current = objects.get(patch.id)
          if (!current) continue
          inversePatches.push({ id: patch.id, before: { x: current.x, y: current.y, x2: current.x2, y2: current.y2, parent_id: current.parent_id } })
          const updates: Partial<BoardObject> = { x: patch.before.x, y: patch.before.y, parent_id: patch.before.parent_id }
          if (patch.before.x2 !== undefined) updates.x2 = patch.before.x2
          if (patch.before.y2 !== undefined) updates.y2 = patch.before.y2
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
        for (const childId of entry.childIds) {
          const prevParent = entry.previousParentIds.get(childId) ?? null
          updateObject(childId, { parent_id: prevParent })
        }
        deleteObject(entry.groupId)
        return { type: 'ungroup', groupSnapshot: objects.get(entry.groupId)!, childIds: entry.childIds }
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
  const handleToolSelect = useCallback((type: BoardObjectType) => {
    if (!canEdit) return
    setActiveTool(prev => prev === type ? null : type)
    clearSelection()
  }, [canEdit, clearSelection])

  const handleCancelTool = useCallback(() => {
    setActiveTool(null)
  }, [])

  const handleDrawShape = useCallback((type: BoardObjectType, x: number, y: number, width: number, height: number) => {
    if (!canEdit) return
    const overrides: Partial<BoardObject> = {}
    if (width > 0 && height > 0) {
      overrides.width = width
      overrides.height = height
    }
    if (type === 'line' || type === 'arrow') {
      overrides.x2 = x + (width || 120)
      overrides.y2 = y + (height || 40)
    }
    const obj = addObject(type, x, y, overrides)
    if (obj) undoStack.push({ type: 'add', ids: [obj.id] })
    setActiveTool(null)
  }, [canEdit, addObject, undoStack])

  const handleDragStart = useCallback((id: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const map = new Map<string, { x: number; y: number; x2?: number | null; y2?: number | null; parent_id: string | null }>()
    map.set(id, { x: obj.x, y: obj.y, x2: obj.x2, y2: obj.y2, parent_id: obj.parent_id })
    if (obj.type === 'frame') {
      for (const d of getDescendants(id)) {
        map.set(d.id, { x: d.x, y: d.y, x2: d.x2, y2: d.y2, parent_id: d.parent_id })
      }
    }
    preDragRef.current = map
  }, [canEdit, objects, getDescendants])

  const handleDragMove = (id: string, x: number, y: number) => {
    if (!canEdit) return
    updateObjectDrag(id, { x, y })
  }

  const handleDragEnd = useCallback((id: string, x: number, y: number) => {
    if (!canEdit) return
    updateObjectDragEnd(id, { x, y })

    if (preDragRef.current.size > 0) {
      const patches = Array.from(preDragRef.current.entries()).map(([pid, before]) => ({ id: pid, before }))
      undoStack.push({ type: 'move', patches })
      preDragRef.current = new Map()
    }
  }, [canEdit, updateObjectDragEnd, undoStack])

  const handleEndpointDragMove = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    updateObjectDrag(id, updates)
  }, [canEdit, updateObjectDrag])

  const handleEndpointDragEnd = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    updateObjectDragEnd(id, updates)

    if (preDragRef.current.size > 0) {
      const patches = Array.from(preDragRef.current.entries()).map(([pid, before]) => ({ id: pid, before }))
      undoStack.push({ type: 'move' as const, patches })
      preDragRef.current = new Map()
    }

    // Check frame containment for lines/arrows after drag
    setTimeout(() => checkFrameContainment(id), 0)
  }, [canEdit, updateObjectDragEnd, undoStack, checkFrameContainment])

  const handleUpdateText = useCallback((id: string, text: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    // Enforce character limits: sticky notes unlimited, all other shapes 256
    const UNLIMITED = new Set(['sticky_note'])
    let limited = text
    if (!UNLIMITED.has(obj.type)) {
      const max = 256
      limited = text.slice(0, max)
    }
    updateObject(id, { text: limited })
  }, [canEdit, objects, updateObject])

  const handleUpdateTitle = useCallback((id: string, title: string) => {
    if (!canEdit) return
    updateObject(id, { title: title.slice(0, 256) })
  }, [canEdit, updateObject])

  const handleTransformMove = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    updateObjectDrag(id, updates)
  }, [canEdit, updateObjectDrag])

  const handleTransformEnd = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (obj) {
      const before: Partial<BoardObject> = {}
      for (const key of Object.keys(updates)) {
        (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
      }
      undoStack.push({ type: 'update', patches: [{ id, before }] })
    }
    updateObject(id, updates)
  }, [canEdit, objects, updateObject, undoStack])

  const handleDelete = useCallback(() => {
    if (!canEdit) return
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
  }, [canEdit, selectedIds, objects, getDescendants, deleteSelected, undoStack])

  const handleDuplicate = useCallback(() => {
    if (!canEdit) return
    const newIds = duplicateSelected()
    if (newIds.length > 0) {
      undoStack.push({ type: 'duplicate', ids: newIds })
    }
  }, [canEdit, duplicateSelected, undoStack])

  // Copy/paste clipboard (stores IDs of copied objects)
  const clipboardRef = useRef<string[]>([])

  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) return
    clipboardRef.current = Array.from(selectedIds)
  }, [selectedIds])

  const handlePaste = useCallback(() => {
    if (!canEdit || clipboardRef.current.length === 0) return
    const newIds: string[] = []
    for (const id of clipboardRef.current) {
      const newObj = duplicateObject(id)
      if (newObj) newIds.push(newObj.id)
    }
    if (newIds.length > 0) {
      undoStack.push({ type: 'duplicate', ids: newIds })
    }
  }, [canEdit, duplicateObject, undoStack])

  const handleColorChange = useCallback((color: string) => {
    if (!canEdit) return
    pushRecentColor(color)
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'group') {
        for (const child of getDescendants(id)) {
          if (child.type !== 'group') {
            patches.push({ id: child.id, before: { color: child.color } })
            updateObject(child.id, { color })
          }
        }
      } else if (obj) {
        patches.push({ id, before: { color: obj.color } })
        updateObject(id, { color })
      }
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, getDescendants, updateObject, undoStack, pushRecentColor])

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
  }, [canEdit, selectedIds, objects, groupSelected, undoStack])

  const handleUngroup = useCallback(() => {
    if (!canEdit) return
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj || obj.type !== 'group') continue
      const childIds = getChildren(id).map(c => c.id)
      undoStack.push({ type: 'ungroup', groupSnapshot: { ...obj }, childIds })
    }
    ungroupSelected()
  }, [canEdit, selectedIds, objects, getChildren, ungroupSelected, undoStack])

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

  const selectedColor = useMemo(() => {
    const firstId = selectedIds.values().next().value
    if (!firstId) return undefined
    return objects.get(firstId)?.color
  }, [selectedIds, objects])

  // Determine if any text-capable shape is selected
  const TEXT_TYPES = new Set(['sticky_note', 'rectangle', 'circle', 'triangle', 'chevron', 'parallelogram', 'frame'])

  const hasTextShapeSelected = useMemo(() => {
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj && TEXT_TYPES.has(obj.type)) return true
    }
    return false
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          onToolSelect={handleToolSelect}
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
          onStrokeColorChange={handleBorderColorChange}
          anySelectedLocked={anySelectedLocked}
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
              onCursorMove={sendCursor}
              onCursorUpdate={onCursorUpdate}
              remoteSelections={remoteSelections}
              onEditingChange={setIsEditingText}
              isObjectLocked={isObjectLocked}
              anySelectedLocked={anySelectedLocked}
              onLock={handleLockSelected}
              onUnlock={handleUnlockSelected}
              canLock={selectedCanLock}
              canUnlock={selectedCanUnlock}
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
    </div>
  )
}
