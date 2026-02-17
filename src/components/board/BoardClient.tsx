'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useBoardState } from '@/hooks/useBoardState'
import { useCanvas } from '@/hooks/useCanvas'
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel'
import { usePresence } from '@/hooks/usePresence'
import { useCursors } from '@/hooks/useCursors'
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
  } = useBoardState(userId, boardId, userRole, channel, onlineUsers)
  const { getViewportCenter } = useCanvas()
  const [shareOpen, setShareOpen] = useState(false)

  // Subscribe LAST — after all hooks have registered their .on() listeners.
  // React runs useEffect hooks in definition order, so this must come after
  // usePresence, useCursors, and useBoardState have set up their handlers.
  useEffect(() => {
    if (!channel) return
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Realtime channel subscribed for board ${boardId}`)
        trackPresence()
        // CRDT Phase 3: reconcile local state against DB on reconnect
        reconcileOnReconnect()
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

  const handleAddShape = (
    type: Parameters<typeof addObject>[0],
    overrides?: Partial<{ stroke_width: number; stroke_dash: string; color: string }>
  ) => {
    if (!canEdit) return
    const center = getViewportCenter()
    const { dx, dy } = shapeOffsets[type] ?? { dx: 75, dy: 75 }
    addObject(type, center.x - dx, center.y - dy, overrides)
  }

  const handleDragMove = (id: string, x: number, y: number) => {
    if (!canEdit) return
    updateObjectDrag(id, { x, y })
  }

  const handleDragEnd = (id: string, x: number, y: number) => {
    if (!canEdit) return
    updateObjectDragEnd(id, { x, y })
  }

  const handleUpdateText = (id: string, text: string) => {
    if (!canEdit) return
    updateObject(id, { text })
  }

  const handleTransformEnd = (id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    updateObject(id, updates)
  }

  const handleDelete = () => {
    if (!canEdit) return
    deleteSelected()
  }

  const handleDuplicate = () => {
    if (!canEdit) return
    duplicateSelected()
  }

  const handleColorChange = (color: string) => {
    if (!canEdit) return
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'group') {
        for (const child of getDescendants(id)) {
          if (child.type !== 'group') updateObject(child.id, { color })
        }
      } else {
        updateObject(id, { color })
      }
    }
  }

  const handleFontChange = (updates: { font_family?: string; font_size?: number; font_style?: 'normal' | 'bold' | 'italic' | 'bold italic' }) => {
    if (!canEdit) return
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'sticky_note') {
        updateObject(id, updates)
      }
    }
  }

  const handleStrokeChange = (updates: { stroke_width?: number; stroke_dash?: string }) => {
    if (!canEdit) return
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'line' || obj?.type === 'arrow') {
        updateObject(id, updates)
      }
    }
  }

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
          onGroup={groupSelected}
          onUngroup={ungroupSelected}
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
              onDragEnd={handleDragEnd}
              onDragMove={handleDragMove}
              onUpdateText={handleUpdateText}
              onTransformEnd={handleTransformEnd}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onColorChange={handleColorChange}
              onBringToFront={bringToFront}
              onBringForward={bringForward}
              onSendBackward={sendBackward}
              onSendToBack={sendToBack}
              onGroup={groupSelected}
              onUngroup={ungroupSelected}
              canGroup={canGroup}
              canUngroup={canUngroup}
              onStrokeChange={handleStrokeChange}
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
