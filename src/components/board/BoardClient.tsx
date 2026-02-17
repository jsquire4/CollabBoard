'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useBoardState } from '@/hooks/useBoardState'
import { useCanvas } from '@/hooks/useCanvas'
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel'
import { usePresence } from '@/hooks/usePresence'
import { useCursors } from '@/hooks/useCursors'
import { useUndoStack, UndoEntry } from '@/hooks/useUndoStack'
import { BoardObject } from '@/types/board'
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
  const { sendCursor, onCursorUpdate } = useCursors(channel, userId)

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
    deleteObject, getZOrderSet, addObjectWithId,
  } = useBoardState(userId, boardId, userRole, channel, onlineUsers)
  const { getViewportCenter } = useCanvas()
  const [shareOpen, setShareOpen] = useState(false)
  const undoStack = useUndoStack()
  const preDragRef = useRef<Map<string, { x: number; y: number; parent_id: string | null }>>(new Map())

  // Subscribe LAST — after all hooks have registered their .on() listeners.
  // React runs useEffect hooks in definition order, so this must come after
  // usePresence, useCursors, and useBoardState have set up their handlers.
  const hasConnectedRef = useRef(false)
  useEffect(() => {
    if (!channel) return
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Realtime channel subscribed for board ${boardId}`)
        trackPresence()
        // CRDT Phase 3: reconcile local state against DB on reconnect
        // Skip reconcile on the very first subscribe — initial data was just loaded.
        if (hasConnectedRef.current) {
          reconcileOnReconnect()
        } else {
          hasConnectedRef.current = true
        }
      }
    })
  }, [channel, boardId, trackPresence, reconcileOnReconnect])

  const canEdit = userRole !== 'viewer'

  const shapeOffsets: Record<string, { dx: number; dy: number }> = {
    sticky_note: { dx: 75, dy: 75 },
    rectangle: { dx: 100, dy: 70 },
    circle: { dx: 60, dy: 60 },
    frame: { dx: 200, dy: 150 },
    line: { dx: 60, dy: 1 },
    triangle: { dx: 50, dy: 45 },
    chevron: { dx: 50, dy: 43 },
    arrow: { dx: 60, dy: 20 },
    parallelogram: { dx: 70, dy: 40 },
  }

  // --- Undo/Redo execution ---
  const executeUndo = useCallback((entry: UndoEntry): UndoEntry | null => {
    switch (entry.type) {
      case 'add': {
        // Undo add = delete the added objects
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
        // Undo delete = re-insert objects (parents first — array is already ordered)
        for (const obj of entry.objects) {
          addObjectWithId(obj)
        }
        return { type: 'add', ids: entry.objects.map(o => o.id) }
      }
      case 'update': {
        // Undo update = apply before-patches, capture current as inverse
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
        // Undo move = restore pre-drag positions + parent_ids
        const inversePatches: { id: string; before: { x: number; y: number; parent_id: string | null } }[] = []
        for (const patch of entry.patches) {
          const current = objects.get(patch.id)
          if (!current) continue
          inversePatches.push({ id: patch.id, before: { x: current.x, y: current.y, parent_id: current.parent_id } })
          updateObject(patch.id, { x: patch.before.x, y: patch.before.y, parent_id: patch.before.parent_id })
        }
        return { type: 'move', patches: inversePatches }
      }
      case 'duplicate': {
        // Undo duplicate = delete the duplicated objects
        const snapshots: BoardObject[] = []
        for (const id of entry.ids) {
          const obj = objects.get(id)
          if (obj) {
            snapshots.push({ ...obj })
            // Also capture descendants for groups/frames
            const descendants = getDescendants(id)
            for (const d of descendants) {
              snapshots.push({ ...d })
            }
            deleteObject(id)
          }
        }
        // Inverse: re-insert (treat as 'delete' entry so redo re-deletes)
        return snapshots.length > 0 ? { type: 'delete', objects: snapshots } : null
      }
      case 'group': {
        // Undo group = restore children's parent_ids then delete the group
        for (const childId of entry.childIds) {
          const prevParent = entry.previousParentIds.get(childId) ?? null
          updateObject(childId, { parent_id: prevParent })
        }
        deleteObject(entry.groupId)
        return { type: 'ungroup', groupSnapshot: objects.get(entry.groupId)!, childIds: entry.childIds }
      }
      case 'ungroup': {
        // Undo ungroup = re-create the group, then re-parent children
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
  const handleAddShape = (
    type: Parameters<typeof addObject>[0],
    overrides?: Partial<{ stroke_width: number; stroke_dash: string; color: string }>
  ) => {
    if (!canEdit) return
    const center = getViewportCenter()
    const { dx, dy } = shapeOffsets[type] ?? { dx: 75, dy: 75 }
    const obj = addObject(type, center.x - dx, center.y - dy, overrides)
    if (obj) undoStack.push({ type: 'add', ids: [obj.id] })
  }

  const handleDragStart = useCallback((id: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const map = new Map<string, { x: number; y: number; parent_id: string | null }>()
    map.set(id, { x: obj.x, y: obj.y, parent_id: obj.parent_id })
    // For frames, also capture all descendants
    if (obj.type === 'frame') {
      for (const d of getDescendants(id)) {
        map.set(d.id, { x: d.x, y: d.y, parent_id: d.parent_id })
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

    // Push undo entry from pre-drag snapshot
    if (preDragRef.current.size > 0) {
      const patches = Array.from(preDragRef.current.entries()).map(([pid, before]) => ({ id: pid, before }))
      undoStack.push({ type: 'move', patches })
      preDragRef.current = new Map()
    }
  }, [canEdit, updateObjectDragEnd, undoStack])

  const handleUpdateText = (id: string, text: string) => {
    if (!canEdit) return
    updateObject(id, { text })
  }

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
    // Snapshot all selected objects + descendants before deleting
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

  const handleColorChange = useCallback((color: string) => {
    if (!canEdit) return
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
  }, [canEdit, selectedIds, objects, getDescendants, updateObject, undoStack])

  const handleFontChange = useCallback((updates: { font_family?: string; font_size?: number; font_style?: 'normal' | 'bold' | 'italic' | 'bold italic' }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'sticky_note') {
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

  const handleStrokeChange = useCallback((updates: { stroke_width?: number; stroke_dash?: string }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'line' || obj?.type === 'arrow') {
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
    // Capture both the object's set and the next-higher set
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

  const selectedColor = useMemo(() => {
    const firstId = selectedIds.values().next().value
    if (!firstId) return undefined
    return objects.get(firstId)?.color
  }, [selectedIds, objects])

  const hasStickyNoteSelected = useMemo(() => {
    for (const id of selectedIds) {
      if (objects.get(id)?.type === 'sticky_note') return true
    }
    return false
  }, [selectedIds, objects])

  const selectedFontInfo = useMemo(() => {
    const firstStickyId = [...selectedIds].find((id) => objects.get(id)?.type === 'sticky_note')
    if (!firstStickyId) return {}
    const obj = objects.get(firstStickyId)
    return {
      fontFamily: obj?.font_family,
      fontSize: obj?.font_size,
      fontStyle: obj?.font_style,
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
      <div className="relative flex flex-1 overflow-hidden">
        <LeftToolbar
          userRole={userRole}
          onAddShape={handleAddShape}
          hasSelection={selectedIds.size > 0}
          hasStickyNoteSelected={hasStickyNoteSelected}
          selectedColor={selectedColor}
          selectedFontFamily={selectedFontInfo.fontFamily}
          selectedFontSize={selectedFontInfo.fontSize}
          selectedFontStyle={selectedFontInfo.fontStyle}
          onColorChange={handleColorChange}
          onFontChange={handleFontChange}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          canGroup={canGroup}
          canUngroup={canUngroup}
        />
        <div className="relative flex-1">
          <CanvasErrorBoundary>
            <Canvas
              objects={objects}
              sortedObjects={sortedObjects}
              selectedIds={selectedIds}
              activeGroupId={activeGroupId}
              onSelect={selectObject}
              onSelectObjects={selectObjects}
              onClearSelection={clearSelection}
              onEnterGroup={enterGroup}
              onExitGroup={exitGroup}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragMove={handleDragMove}
              onUpdateText={handleUpdateText}
              onTransformEnd={handleTransformEnd}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onColorChange={handleColorChange}
              onBringToFront={handleBringToFront}
              onBringForward={handleBringForward}
              onSendBackward={handleSendBackward}
              onSendToBack={handleSendToBack}
              onGroup={handleGroup}
              onUngroup={handleUngroup}
              canGroup={canGroup}
              canUngroup={canUngroup}
              onStrokeChange={handleStrokeChange}
              onUndo={performUndo}
              onRedo={performRedo}
              onCheckFrameContainment={checkFrameContainment}
              onMoveGroupChildren={moveGroupChildren}
              getChildren={getChildren}
              getDescendants={getDescendants}
              colors={EXPANDED_PALETTE}
              selectedColor={selectedColor}
              userRole={userRole}
              onlineUsers={onlineUsers}
              onCursorMove={sendCursor}
              onCursorUpdate={onCursorUpdate}
              remoteSelections={remoteSelections}
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
