import { describe, it, expect } from 'vitest'
import { resolveKeyboardAction } from './useKeyboardShortcuts'

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

  describe('unrecognized keys', () => {
    it('returns null for random keys', () => {
      expect(resolveKeyboardAction(
        makeEvent({ key: 'a' }),
        makeState()
      )).toBeNull()
    })
  })
})
