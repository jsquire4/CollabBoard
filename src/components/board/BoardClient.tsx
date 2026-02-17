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
import { Toolbar } from './Toolbar'
import { ShareDialog } from './ShareDialog'

// Konva is client-only — must disable SSR
const Canvas = dynamic(() => import('./Canvas').then(mod => ({ default: mod.Canvas })), {
  ssr: false,
  loading: () => <div style={{ width: '100vw', height: '100vh', background: '#f5f5f5' }} />,
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
    moveGroupChildren, checkFrameContainment,
    getChildren, getDescendants,
    remoteSelections,
    COLOR_PALETTE,
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
      }
    })
  }, [channel, boardId, trackPresence])

  const canEdit = userRole !== 'viewer'

  const handleAddStickyNote = () => {
    if (!canEdit) return
    const center = getViewportCenter()
    addObject('sticky_note', center.x - 75, center.y - 75)
  }

  const handleAddRectangle = () => {
    if (!canEdit) return
    const center = getViewportCenter()
    addObject('rectangle', center.x - 100, center.y - 70)
  }

  const handleAddCircle = () => {
    if (!canEdit) return
    const center = getViewportCenter()
    addObject('circle', center.x - 60, center.y - 60)
  }

  const handleAddFrame = () => {
    if (!canEdit) return
    const center = getViewportCenter()
    addObject('frame', center.x - 200, center.y - 150)
  }

  const handleDragEnd = (id: string, x: number, y: number) => {
    if (!canEdit) return
    updateObject(id, { x, y })
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
        // Apply color to all children of the group
        for (const child of getDescendants(id)) {
          if (child.type !== 'group') updateObject(child.id, { color })
        }
      } else {
        updateObject(id, { color })
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

  // Get selected color (first selected object's color)
  const selectedColor = useMemo(() => {
    const firstId = selectedIds.values().next().value
    if (!firstId) return undefined
    return objects.get(firstId)?.color
  }, [selectedIds, objects])

  return (
    <>
      <Toolbar
        boardId={boardId}
        boardName={boardName}
        userRole={userRole}
        onAddStickyNote={handleAddStickyNote}
        onAddRectangle={handleAddRectangle}
        onAddCircle={handleAddCircle}
        onAddFrame={handleAddFrame}
        hasSelection={selectedIds.size > 0}
        multiSelected={selectedIds.size > 1}
        selectedColor={selectedColor}
        colors={COLOR_PALETTE}
        onColorChange={handleColorChange}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onGroup={groupSelected}
        onUngroup={ungroupSelected}
        canGroup={canGroup}
        canUngroup={canUngroup}
        onShareClick={() => setShareOpen(true)}
        onlineUsers={onlineUsers}
      />
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
        onCheckFrameContainment={checkFrameContainment}
        onMoveGroupChildren={moveGroupChildren}
        getChildren={getChildren}
        getDescendants={getDescendants}
        colors={COLOR_PALETTE}
        selectedColor={selectedColor}
        userRole={userRole}
        onlineUsers={onlineUsers}
        onCursorMove={sendCursor}
        onCursorUpdate={onCursorUpdate}
        remoteSelections={remoteSelections}
      />
      {shareOpen && (
        <ShareDialog
          boardId={boardId}
          userRole={userRole}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  )
}
