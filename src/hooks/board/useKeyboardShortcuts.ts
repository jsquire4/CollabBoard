import { useEffect } from 'react'

interface UseKeyboardShortcutsDeps {
  editingId: string | null
  canEdit: boolean
  selectedIds: Set<string>
  activeGroupId: string | null
  activeTool: string | null
  vertexEditId: string | null
  anySelectedLocked: boolean
  onDelete: () => void
  onDuplicate: () => void
  onCopy?: () => void
  onPaste?: () => void
  onGroup: () => void
  onUngroup: () => void
  onClearSelection: () => void
  onExitGroup: () => void
  onCancelTool?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onExitVertexEdit?: () => void
  onBringToFront: (id: string) => void
  onBringForward: (id: string) => void
  onSendBackward: (id: string) => void
  onSendToBack: (id: string) => void
  /** Called when Escape cancels a draw-in-progress */
  onCancelDraw?: () => void
  onEscapeContextMenu?: () => void
}

/**
 * Determines the action to take for a given keyboard event.
 * Pure function — no side effects. Returns the action name or null.
 */
export function resolveKeyboardAction(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  state: {
    editingId: string | null
    canEdit: boolean
    hasSelection: boolean
    activeGroupId: string | null
    activeTool: string | null
    vertexEditId: string | null
    anySelectedLocked: boolean
  }
): string | null {
  if (state.editingId) return null

  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()

  if (state.canEdit && (e.key === 'Delete' || e.key === 'Backspace') && state.hasSelection && !state.anySelectedLocked) {
    return 'delete'
  }
  if (state.canEdit && mod && key === 'd' && state.hasSelection && !state.anySelectedLocked) {
    return 'duplicate'
  }
  if (mod && key === 'c' && state.hasSelection) {
    return 'copy'
  }
  if (state.canEdit && mod && key === 'v') {
    return 'paste'
  }
  if (state.canEdit && mod && e.shiftKey && key === 'g') {
    return 'ungroup'
  }
  if (state.canEdit && mod && key === 'g') {
    return 'group'
  }
  if (state.canEdit && mod && e.shiftKey && key === 'z') {
    return 'redo'
  }
  if (state.canEdit && mod && key === 'z') {
    return 'undo'
  }
  if (state.canEdit && mod && e.shiftKey && e.key === ']' && state.hasSelection && !state.anySelectedLocked) {
    return 'bringToFront'
  }
  if (state.canEdit && mod && e.key === ']' && state.hasSelection && !state.anySelectedLocked) {
    return 'bringForward'
  }
  if (state.canEdit && mod && e.shiftKey && e.key === '[' && state.hasSelection && !state.anySelectedLocked) {
    return 'sendToBack'
  }
  if (state.canEdit && mod && e.key === '[' && state.hasSelection && !state.anySelectedLocked) {
    return 'sendBackward'
  }
  if (e.key === 'Escape') {
    if (state.vertexEditId) return 'exitVertexEdit'
    if (state.activeTool) return 'cancelTool'
    if (state.activeGroupId) return 'exitGroup'
    return 'clearSelection'
  }

  return null
}

export function useKeyboardShortcuts(deps: UseKeyboardShortcutsDeps) {
  const {
    editingId, canEdit, selectedIds, activeGroupId, activeTool,
    vertexEditId, anySelectedLocked,
    onDelete, onDuplicate, onCopy, onPaste, onGroup, onUngroup,
    onClearSelection, onExitGroup, onCancelTool, onUndo, onRedo,
    onExitVertexEdit, onBringToFront, onBringForward, onSendBackward, onSendToBack,
    onCancelDraw, onEscapeContextMenu,
  } = deps

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keys when the user is typing in a DOM text input
      // (chat textarea, search box, etc.). editingId only covers Konva text editing.
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active?.getAttribute('contenteditable') === 'true'
      ) return

      const action = resolveKeyboardAction(e, {
        editingId,
        canEdit,
        hasSelection: selectedIds.size > 0,
        activeGroupId,
        activeTool,
        vertexEditId,
        anySelectedLocked,
      })

      if (!action) return
      e.preventDefault()

      switch (action) {
        case 'delete': onDelete(); break
        case 'duplicate': onDuplicate(); break
        case 'copy': onCopy?.(); break
        case 'paste': onPaste?.(); break
        case 'group': onGroup(); break
        case 'ungroup': onUngroup(); break
        case 'undo': onUndo?.(); break
        case 'redo': onRedo?.(); break
        case 'bringToFront': selectedIds.forEach(id => onBringToFront(id)); break
        case 'bringForward': selectedIds.forEach(id => onBringForward(id)); break
        case 'sendToBack': selectedIds.forEach(id => onSendToBack(id)); break
        case 'sendBackward': selectedIds.forEach(id => onSendBackward(id)); break
        case 'exitVertexEdit': onExitVertexEdit?.(); onEscapeContextMenu?.(); break
        case 'cancelTool':
          onCancelTool?.()
          onCancelDraw?.()
          onEscapeContextMenu?.()
          break
        case 'exitGroup': onExitGroup(); onEscapeContextMenu?.(); break
        case 'clearSelection':
          onClearSelection()
          onEscapeContextMenu?.()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingId, selectedIds, activeGroupId, activeTool, onDelete, onDuplicate, onCopy, onPaste, onGroup, onUngroup, onClearSelection, onExitGroup, onCancelTool, canEdit, onUndo, onRedo, anySelectedLocked, vertexEditId, onExitVertexEdit, onBringToFront, onBringForward, onSendBackward, onSendToBack, onCancelDraw, onEscapeContextMenu])
}
