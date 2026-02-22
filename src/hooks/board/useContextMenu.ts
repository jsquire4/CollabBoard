import { useState, useCallback, useMemo } from 'react'
import Konva from 'konva'
import { useBoardContext } from '@/contexts/BoardContext'
import { useModifierKeys } from '@/hooks/useModifierKeys'

export interface ContextMenuState {
  x: number
  y: number
  objectId: string
}

interface UseContextMenuDeps {
  onSelect: (id: string, opts?: { shift?: boolean; ctrl?: boolean }) => void
  onBringToFront: (id: string) => void
  onBringForward: (id: string) => void
  onSendBackward: (id: string) => void
  onSendToBack: (id: string) => void
  didPanRef: React.RefObject<boolean>
  onActivity?: () => void
  shapeRefs: React.RefObject<Map<string, Konva.Node>>
  stageRef: React.RefObject<Konva.Stage | null>
}

export function useContextMenu({
  onSelect, onBringToFront, onBringForward, onSendBackward, onSendToBack,
  didPanRef, onActivity, shapeRefs, stageRef,
}: UseContextMenuDeps) {
  const { canEdit, objects, activeGroupId } = useBoardContext()
  const { shiftHeld, ctrlHeld } = useModifierKeys()

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const handleContextMenu = useCallback((id: string, clientX: number, clientY: number) => {
    if (!canEdit) return
    onActivity?.()
    onSelect(id, { shift: shiftHeld, ctrl: ctrlHeld })

    // Position the menu at the right edge of the shape (aligned to the shape, not the cursor)
    let menuX = clientX
    let menuY = clientY
    const node = shapeRefs.current?.get(id)
    const stage = stageRef.current
    if (node && stage) {
      const nodeRect = node.getClientRect()
      const containerRect = stage.container().getBoundingClientRect()
      menuX = containerRect.left + nodeRect.x + nodeRect.width + 8
      menuY = containerRect.top + nodeRect.y
    }

    setContextMenu({ x: menuX, y: menuY, objectId: id })
  }, [onSelect, canEdit, shiftHeld, ctrlHeld, onActivity, shapeRefs, stageRef])

  const handleStageContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault()
    // Suppress context menu if user panned (moved mouse while right-clicking)
    if (didPanRef.current) return
  }, [])

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

  return {
    contextMenu, setContextMenu,
    handleContextMenu, handleStageContextMenu,
    contextTargetId,
    handleCtxBringToFront, handleCtxBringForward, handleCtxSendBackward, handleCtxSendToBack,
  }
}
