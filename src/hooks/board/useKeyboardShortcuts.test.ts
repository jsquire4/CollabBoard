import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { resolveKeyboardAction, useKeyboardShortcuts } from './useKeyboardShortcuts'

function makeEvent(overrides: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }>) {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }
}

function makeState(overrides?: Partial<{
  editingId: string | null
  canEdit: boolean
  hasSelection: boolean
  activeGroupId: string | null
  activeTool: string | null
  vertexEditId: string | null
  anySelectedLocked: boolean
}>) {
  return {
    editingId: null,
    canEdit: true,
    hasSelection: true,
    activeGroupId: null,
    activeTool: null,
    vertexEditId: null,
    anySelectedLocked: false,
    ...overrides,
  }
}

describe('resolveKeyboardAction (pure function)', () => {
  describe('editing guard', () => {
    it('returns null when editingId is set', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Delete' }),
        makeState({ editingId: 'some-id' })
      )).toBeNull()
    })
  })

  describe('Delete/Backspace', () => {
    it('returns delete for Delete key', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Delete' }),
        makeState()
      )).toBe('delete')
    })

    it('returns delete for Backspace key', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Backspace' }),
        makeState()
      )).toBe('delete')
    })

    it('returns null when no selection', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Delete' }),
        makeState({ hasSelection: false })
      )).toBeNull()
    })

    it('returns null when canEdit is false', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Delete' }),
        makeState({ canEdit: false })
      )).toBeNull()
    })

    it('returns null when selection is locked', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Delete' }),
        makeState({ anySelectedLocked: true })
      )).toBeNull()
    })
  })

  describe('Ctrl+D (duplicate)', () => {
    it('returns duplicate', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'd', ctrlKey: true }),
        makeState()
      )).toBe('duplicate')
    })

    it('works with metaKey', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'd', metaKey: true }),
        makeState()
      )).toBe('duplicate')
    })
  })

  describe('Ctrl+C (copy)', () => {
    it('returns copy', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'c', ctrlKey: true }),
        makeState()
      )).toBe('copy')
    })

    it('returns null without selection', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'c', ctrlKey: true }),
        makeState({ hasSelection: false })
      )).toBeNull()
    })
  })

  describe('Ctrl+V (paste)', () => {
    it('returns paste', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'v', ctrlKey: true }),
        makeState()
      )).toBe('paste')
    })

    it('returns null when canEdit is false', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'v', ctrlKey: true }),
        makeState({ canEdit: false })
      )).toBeNull()
    })
  })

  describe('Ctrl+G / Ctrl+Shift+G', () => {
    it('Ctrl+Shift+G returns ungroup', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'g', ctrlKey: true, shiftKey: true }),
        makeState()
      )).toBe('ungroup')
    })

    it('Ctrl+G returns group', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'g', ctrlKey: true }),
        makeState()
      )).toBe('group')
    })
  })

  describe('Ctrl+Z / Ctrl+Shift+Z (undo/redo)', () => {
    it('Ctrl+Shift+Z returns redo', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'z', ctrlKey: true, shiftKey: true }),
        makeState()
      )).toBe('redo')
    })

    it('Ctrl+Z returns undo', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'z', ctrlKey: true }),
        makeState()
      )).toBe('undo')
    })
  })

  describe('Escape priority chain', () => {
    it('exits vertex edit first', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Escape' }),
        makeState({ vertexEditId: 'v1', activeTool: 'rectangle', activeGroupId: 'g1' })
      )).toBe('exitVertexEdit')
    })

    it('cancels tool second', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Escape' }),
        makeState({ activeTool: 'rectangle', activeGroupId: 'g1' })
      )).toBe('cancelTool')
    })

    it('exits group third', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Escape' }),
        makeState({ activeGroupId: 'g1' })
      )).toBe('exitGroup')
    })

    it('clears selection last', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Escape' }),
        makeState()
      )).toBe('clearSelection')
    })
  })

  describe('z-order shortcuts', () => {
    it('Ctrl+Shift+] returns bringToFront', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: ']', ctrlKey: true, shiftKey: true }),
        makeState()
      )).toBe('bringToFront')
    })

    it('Ctrl+] returns bringForward', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: ']', ctrlKey: true }),
        makeState()
      )).toBe('bringForward')
    })

    it('Ctrl+Shift+[ returns sendToBack', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: '[', ctrlKey: true, shiftKey: true }),
        makeState()
      )).toBe('sendToBack')
    })

    it('Ctrl+[ returns sendBackward', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: '[', ctrlKey: true }),
        makeState()
      )).toBe('sendBackward')
    })
  })

  describe('canEdit=false blocks', () => {
    it('blocks group shortcut (Ctrl+G)', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'g', ctrlKey: true }),
        makeState({ canEdit: false })
      )).toBeNull()
    })

    it('blocks ungroup shortcut (Ctrl+Shift+G)', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'g', ctrlKey: true, shiftKey: true }),
        makeState({ canEdit: false })
      )).toBeNull()
    })

    it('blocks undo (Ctrl+Z)', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'z', ctrlKey: true }),
        makeState({ canEdit: false })
      )).toBeNull()
    })

    it('blocks redo (Ctrl+Shift+Z)', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'z', ctrlKey: true, shiftKey: true }),
        makeState({ canEdit: false })
      )).toBeNull()
    })
  })

  describe('anySelectedLocked blocks', () => {
    it('blocks duplicate (Ctrl+D)', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'd', ctrlKey: true }),
        makeState({ anySelectedLocked: true })
      )).toBeNull()
    })

    it('blocks z-order shortcut (Ctrl+])', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: ']', ctrlKey: true }),
        makeState({ anySelectedLocked: true })
      )).toBeNull()
    })
  })

  describe('hasSelection=false blocks', () => {
    it('blocks z-order shortcuts', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: ']', ctrlKey: true }),
        makeState({ hasSelection: false })
      )).toBeNull()
    })
  })

  describe('Escape with no selection', () => {
    it('returns clearSelection even when hasSelection is false', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'Escape' }),
        makeState({ hasSelection: false })
      )).toBe('clearSelection')
    })
  })

  describe('unrecognized keys', () => {
    it('returns null for random keys', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'a' }),
        makeState()
      )).toBeNull()
    })
  })
})

describe('useKeyboardShortcuts (hook integration)', () => {
  function makeDeps(overrides?: Partial<{
    editingId: string | null
    canEdit: boolean
    selectedIds: Set<string>
    activeGroupId: string | null
    activeTool: string | null
    vertexEditId: string | null
    anySelectedLocked: boolean
  }>) {
    return {
      editingId: null as string | null,
      canEdit: true,
      selectedIds: new Set<string>(['r1']),
      activeGroupId: null as string | null,
      activeTool: null as string | null,
      vertexEditId: null as string | null,
      anySelectedLocked: false,
      onDelete: vi.fn(),
      onDuplicate: vi.fn(),
      onCopy: vi.fn(),
      onPaste: vi.fn(),
      onGroup: vi.fn(),
      onUngroup: vi.fn(),
      onClearSelection: vi.fn(),
      onExitGroup: vi.fn(),
      onCancelTool: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onExitVertexEdit: vi.fn(),
      onBringToFront: vi.fn(),
      onBringForward: vi.fn(),
      onSendBackward: vi.fn(),
      onSendToBack: vi.fn(),
      onCancelDraw: vi.fn(),
      onEscapeContextMenu: vi.fn(),
      ...overrides,
    }
  }

  function dispatchKeyDown(options: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) {
    const event = new KeyboardEvent('keydown', {
      key: options.key,
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      shiftKey: options.shiftKey ?? false,
      bubbles: true,
    })
    window.dispatchEvent(event)
    return event
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Delete/Backspace', () => {
    it('calls onDelete when Delete is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).toHaveBeenCalledTimes(1)
    })

    it('calls onDelete when Backspace is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Backspace' })
      expect(deps.onDelete).toHaveBeenCalledTimes(1)
    })

    it('does not call onDelete when editingId is set', () => {
      const deps = makeDeps({ editingId: 'editing-1' })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).not.toHaveBeenCalled()
    })

    it('does not call onDelete when canEdit is false', () => {
      const deps = makeDeps({ canEdit: false })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).not.toHaveBeenCalled()
    })

    it('does not call onDelete when selection is locked', () => {
      const deps = makeDeps({ anySelectedLocked: true })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).not.toHaveBeenCalled()
    })
  })

  describe('Ctrl+D / Ctrl+V / Ctrl+C', () => {
    it('calls onDuplicate when Ctrl+D is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'd', ctrlKey: true })
      expect(deps.onDuplicate).toHaveBeenCalledTimes(1)
    })

    it('calls onPaste when Ctrl+V is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'v', ctrlKey: true })
      expect(deps.onPaste).toHaveBeenCalledTimes(1)
    })

    it('calls onCopy when Ctrl+C is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'c', ctrlKey: true })
      expect(deps.onCopy).toHaveBeenCalledTimes(1)
    })

    it('works with metaKey (Mac)', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'd', metaKey: true })
      expect(deps.onDuplicate).toHaveBeenCalledTimes(1)
    })
  })

  describe('Ctrl+G / Ctrl+Shift+G', () => {
    it('calls onGroup when Ctrl+G is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'g', ctrlKey: true })
      expect(deps.onGroup).toHaveBeenCalledTimes(1)
    })

    it('calls onUngroup when Ctrl+Shift+G is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'g', ctrlKey: true, shiftKey: true })
      expect(deps.onUngroup).toHaveBeenCalledTimes(1)
    })
  })

  describe('Ctrl+Z / Ctrl+Shift+Z', () => {
    it('calls onUndo when Ctrl+Z is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'z', ctrlKey: true })
      expect(deps.onUndo).toHaveBeenCalledTimes(1)
    })

    it('calls onRedo when Ctrl+Shift+Z is pressed', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'z', ctrlKey: true, shiftKey: true })
      expect(deps.onRedo).toHaveBeenCalledTimes(1)
    })
  })

  describe('z-order shortcuts', () => {
    it('calls onBringToFront for each selected id when Ctrl+Shift+] is pressed', () => {
      const deps = makeDeps({ selectedIds: new Set(['r1', 'r2']) })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: ']', ctrlKey: true, shiftKey: true })
      expect(deps.onBringToFront).toHaveBeenCalledWith('r1')
      expect(deps.onBringToFront).toHaveBeenCalledWith('r2')
    })

    it('calls onBringForward for each selected id when Ctrl+] is pressed', () => {
      const deps = makeDeps({ selectedIds: new Set(['r1']) })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: ']', ctrlKey: true })
      expect(deps.onBringForward).toHaveBeenCalledWith('r1')
    })

    it('calls onSendToBack for each selected id when Ctrl+Shift+[ is pressed', () => {
      const deps = makeDeps({ selectedIds: new Set(['r1']) })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: '[', ctrlKey: true, shiftKey: true })
      expect(deps.onSendToBack).toHaveBeenCalledWith('r1')
    })

    it('calls onSendBackward for each selected id when Ctrl+[ is pressed', () => {
      const deps = makeDeps({ selectedIds: new Set(['r1']) })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: '[', ctrlKey: true })
      expect(deps.onSendBackward).toHaveBeenCalledWith('r1')
    })
  })

  describe('Escape', () => {
    it('calls onExitVertexEdit and onEscapeContextMenu when vertexEditId is set', () => {
      const deps = makeDeps({ vertexEditId: 'v1' })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Escape' })
      expect(deps.onExitVertexEdit).toHaveBeenCalledTimes(1)
      expect(deps.onEscapeContextMenu).toHaveBeenCalledTimes(1)
      expect(deps.onCancelTool).not.toHaveBeenCalled()
      expect(deps.onExitGroup).not.toHaveBeenCalled()
      expect(deps.onClearSelection).not.toHaveBeenCalled()
    })

    it('calls onCancelTool, onCancelDraw, and onEscapeContextMenu when activeTool is set', () => {
      const deps = makeDeps({ activeTool: 'rectangle' })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Escape' })
      expect(deps.onCancelTool).toHaveBeenCalledTimes(1)
      expect(deps.onCancelDraw).toHaveBeenCalledTimes(1)
      expect(deps.onEscapeContextMenu).toHaveBeenCalledTimes(1)
      expect(deps.onExitGroup).not.toHaveBeenCalled()
      expect(deps.onClearSelection).not.toHaveBeenCalled()
    })

    it('calls onExitGroup and onEscapeContextMenu when activeGroupId is set', () => {
      const deps = makeDeps({ activeGroupId: 'g1' })
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Escape' })
      expect(deps.onExitGroup).toHaveBeenCalledTimes(1)
      expect(deps.onEscapeContextMenu).toHaveBeenCalledTimes(1)
      expect(deps.onClearSelection).not.toHaveBeenCalled()
    })

    it('calls onClearSelection and onEscapeContextMenu when idle', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'Escape' })
      expect(deps.onClearSelection).toHaveBeenCalledTimes(1)
      expect(deps.onEscapeContextMenu).toHaveBeenCalledTimes(1)
    })
  })

  describe('unrecognized keys', () => {
    it('does not call any handler for random keys', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))
      dispatchKeyDown({ key: 'a' })
      expect(deps.onDelete).not.toHaveBeenCalled()
      expect(deps.onDuplicate).not.toHaveBeenCalled()
      expect(deps.onCopy).not.toHaveBeenCalled()
      expect(deps.onPaste).not.toHaveBeenCalled()
      expect(deps.onClearSelection).not.toHaveBeenCalled()
    })
  })

  describe('DOM text input guard', () => {
    it('does not fire Delete when focus is in a textarea (e.g., agent chat)', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      textarea.focus()

      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).not.toHaveBeenCalled()

      dispatchKeyDown({ key: 'Backspace' })
      expect(deps.onDelete).not.toHaveBeenCalled()

      document.body.removeChild(textarea)
    })

    it('does not fire Delete when focus is in an input element', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))

      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()

      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).not.toHaveBeenCalled()

      document.body.removeChild(input)
    })

    it('does not fire Ctrl+D when focus is in a textarea', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      textarea.focus()

      dispatchKeyDown({ key: 'd', ctrlKey: true })
      expect(deps.onDuplicate).not.toHaveBeenCalled()

      document.body.removeChild(textarea)
    })

    it('does not fire Ctrl+Z when focus is in an input', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))

      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()

      dispatchKeyDown({ key: 'z', ctrlKey: true })
      expect(deps.onUndo).not.toHaveBeenCalled()

      document.body.removeChild(input)
    })

    it('does not fire shortcuts when focus is in a contenteditable element', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))

      const div = document.createElement('div')
      div.setAttribute('contenteditable', 'true')
      document.body.appendChild(div)
      div.focus()

      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).not.toHaveBeenCalled()

      dispatchKeyDown({ key: 'd', ctrlKey: true })
      expect(deps.onDuplicate).not.toHaveBeenCalled()

      document.body.removeChild(div)
    })

    it('fires shortcuts normally when focus is on body (canvas)', () => {
      const deps = makeDeps()
      renderHook(() => useKeyboardShortcuts(deps))

      // Ensure focus is not on a text input
      ;(document.activeElement as HTMLElement)?.blur?.()

      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).toHaveBeenCalledTimes(1)
    })
  })

  describe('cleanup', () => {
    it('removes listener on unmount', () => {
      const deps = makeDeps()
      const { unmount } = renderHook(() => useKeyboardShortcuts(deps))
      unmount()
      dispatchKeyDown({ key: 'Delete' })
      expect(deps.onDelete).not.toHaveBeenCalled()
    })
  })
})
