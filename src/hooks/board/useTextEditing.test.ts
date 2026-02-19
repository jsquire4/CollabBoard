import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTextEditing, UseTextEditingDeps, getTextCharLimit, STICKY_TITLE_CHAR_LIMIT } from './useTextEditing'
import { BoardObject } from '@/types/board'

function makeDeps(overrides?: Partial<UseTextEditingDeps>): UseTextEditingDeps {
  return {
    objects: new Map(),
    stageScale: 1,
    canEdit: true,
    stageRef: { current: null },
    shapeRefs: { current: new Map() },
    onUpdateText: vi.fn(),
    onUpdateTitle: vi.fn(),
    tryEnterGroup: () => false,
    ...overrides,
  }
}

describe('getTextCharLimit', () => {
  it('returns 10000 for sticky_note', () => {
    expect(getTextCharLimit('sticky_note')).toBe(10000)
  })

  it('returns 256 for frame', () => {
    expect(getTextCharLimit('frame')).toBe(256)
  })

  it('returns 256 for rectangle', () => {
    expect(getTextCharLimit('rectangle')).toBe(256)
  })

  it('returns 256 for other types', () => {
    expect(getTextCharLimit('circle')).toBe(256)
    expect(getTextCharLimit('triangle')).toBe(256)
  })
})

describe('STICKY_TITLE_CHAR_LIMIT', () => {
  it('is 256', () => {
    expect(STICKY_TITLE_CHAR_LIMIT).toBe(256)
  })
})

describe('useTextEditing', () => {
  describe('initial state', () => {
    it('returns editingId as null', () => {
      const { result } = renderHook(() => useTextEditing(makeDeps()))
      expect(result.current.editingId).toBeNull()
    })

    it('returns editingField as text', () => {
      const { result } = renderHook(() => useTextEditing(makeDeps()))
      expect(result.current.editingField).toBe('text')
    })

    it('returns empty editText', () => {
      const { result } = renderHook(() => useTextEditing(makeDeps()))
      expect(result.current.editText).toBe('')
    })

    it('returns empty textareaStyle', () => {
      const { result } = renderHook(() => useTextEditing(makeDeps()))
      expect(result.current.textareaStyle).toEqual({})
    })

    it('returns null lastDblClickRef', () => {
      const { result } = renderHook(() => useTextEditing(makeDeps()))
      expect(result.current.lastDblClickRef.current).toBeNull()
    })
  })

  describe('handler types', () => {
    it('returns all expected handler functions', () => {
      const { result } = renderHook(() => useTextEditing(makeDeps()))
      expect(typeof result.current.handleStartEdit).toBe('function')
      expect(typeof result.current.handleFinishEdit).toBe('function')
      expect(typeof result.current.handleShapeDoubleClick).toBe('function')
      expect(typeof result.current.startGeometricTextEdit).toBe('function')
      expect(typeof result.current.setEditText).toBe('function')
    })
  })

  describe('handleFinishEdit', () => {
    it('does nothing when editingId is null', () => {
      const onUpdateText = vi.fn()
      const onUpdateTitle = vi.fn()
      const { result } = renderHook(() => useTextEditing(makeDeps({ onUpdateText, onUpdateTitle })))
      act(() => result.current.handleFinishEdit())
      expect(onUpdateText).not.toHaveBeenCalled()
      expect(onUpdateTitle).not.toHaveBeenCalled()
    })
  })

  describe('handleShapeDoubleClick', () => {
    it('calls tryEnterGroup first', () => {
      const tryEnterGroup = vi.fn().mockReturnValue(true)
      const { result } = renderHook(() => useTextEditing(makeDeps({ tryEnterGroup })))
      act(() => result.current.handleShapeDoubleClick('shape-1'))
      expect(tryEnterGroup).toHaveBeenCalledWith('shape-1')
    })

    it('records for triple-click when tryEnterGroup returns false', () => {
      const tryEnterGroup = vi.fn().mockReturnValue(false)
      const { result } = renderHook(() => useTextEditing(makeDeps({ tryEnterGroup })))
      act(() => result.current.handleShapeDoubleClick('shape-1'))
      expect(result.current.lastDblClickRef.current).not.toBeNull()
      expect(result.current.lastDblClickRef.current?.id).toBe('shape-1')
    })
  })

  describe('onEditingChange', () => {
    it('fires with false when no editing', () => {
      const onEditingChange = vi.fn()
      renderHook(() => useTextEditing(makeDeps({ onEditingChange })))
      expect(onEditingChange).toHaveBeenCalledWith(false)
    })
  })

  describe('startGeometricTextEdit', () => {
    it('does nothing when object not found', () => {
      const onUpdateText = vi.fn()
      const { result } = renderHook(() => useTextEditing(makeDeps({ onUpdateText })))
      act(() => result.current.startGeometricTextEdit('nonexistent'))
      expect(onUpdateText).not.toHaveBeenCalled()
    })

    it('does nothing when canEdit is false', () => {
      const objects = new Map([['obj-1', { id: 'obj-1', type: 'rectangle' } as BoardObject]])
      const onUpdateText = vi.fn()
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, canEdit: false, onUpdateText })))
      act(() => result.current.startGeometricTextEdit('obj-1'))
      expect(onUpdateText).not.toHaveBeenCalled()
    })
  })
})
