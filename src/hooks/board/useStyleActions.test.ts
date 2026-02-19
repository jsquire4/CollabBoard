import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStyleActions } from './useStyleActions'
import { makeRectangle, makeObject, objectsMap, resetFactory } from '@/test/boardObjectFactory'

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    objects: new Map() as Map<string, ReturnType<typeof makeRectangle>>,
    selectedIds: new Set<string>(),
    canEdit: true,
    updateObject: vi.fn(),
    deleteObject: vi.fn(),
    getDescendants: vi.fn(() => []),
    undoStack: { push: vi.fn() },
    pushRecentColor: vi.fn(),
    ...overrides,
  }
}

describe('useStyleActions', () => {
  beforeEach(() => resetFactory())

  describe('invisible object cleanup (via handleColorChange)', () => {
    it('deletes objects with transparent fill, no stroke, no text', () => {
      const rect = makeRectangle({ id: 'r1', color: '#visible', stroke_color: null, text: '' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('transparent'))

      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
      expect(deps.undoStack.push).toHaveBeenCalledWith(expect.objectContaining({ type: 'delete' }))
    })

    it('preserves objects with text when color set to transparent', () => {
      const rect = makeRectangle({ id: 'r1', color: '#visible', stroke_color: null, text: 'hello' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('transparent'))

      expect(deps.deleteObject).not.toHaveBeenCalled()
    })

    it('preserves objects with stroke when color set to transparent', () => {
      const rect = makeRectangle({ id: 'r1', color: '#visible', stroke_color: '#000' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('transparent'))

      expect(deps.deleteObject).not.toHaveBeenCalled()
    })

    it('skips group objects for invisible check', () => {
      const group = makeObject({ id: 'g1', type: 'group', color: '#visible', text: '' })
      const deps = makeDeps({
        objects: objectsMap(group),
        selectedIds: new Set(['g1']),
        getDescendants: vi.fn(() => []),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('transparent'))

      expect(deps.deleteObject).not.toHaveBeenCalled()
    })
  })

  describe('invisible object cleanup (via handleStrokeStyleChange)', () => {
    it('deletes when stroke removal makes object invisible', () => {
      const rect = makeRectangle({ id: 'r1', color: 'transparent', stroke_color: '#000', text: '' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleStrokeStyleChange({ stroke_color: null }))

      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
      expect(deps.undoStack.push).toHaveBeenCalledWith(expect.objectContaining({ type: 'delete' }))
    })
  })

  describe('handleColorChange', () => {
    it('does not call updateObject when selectedIds is empty', () => {
      const deps = makeDeps({
        objects: new Map(),
        selectedIds: new Set<string>(),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('#blue'))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
      expect(deps.pushRecentColor).toHaveBeenCalledWith('#blue')
    })

    it('updates color on selected objects with undo capture', () => {
      const rect = makeRectangle({ id: 'r1', color: '#red' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('#blue'))

      expect(deps.updateObject).toHaveBeenCalledWith('r1', { color: '#blue' })
      expect(deps.pushRecentColor).toHaveBeenCalledWith('#blue')
      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { color: '#red' } }],
      })
    })

    it('does nothing when canEdit is false', () => {
      const rect = makeRectangle({ id: 'r1' })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('#blue'))
      expect(deps.updateObject).not.toHaveBeenCalled()
    })

    it('expands group to descendants for color change', () => {
      const group = makeObject({ id: 'g1', type: 'group' })
      const child = makeRectangle({ id: 'c1', parent_id: 'g1', color: '#old' })
      const getDescendants = vi.fn(() => [child])
      const deps = makeDeps({
        objects: objectsMap(group, child),
        selectedIds: new Set(['g1']),
        getDescendants,
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('#new'))

      expect(deps.updateObject).toHaveBeenCalledWith('c1', { color: '#new' })
    })

    it('pushes delete undo when color makes object invisible', () => {
      const rect = makeRectangle({ id: 'r1', color: '#visible', stroke_color: null, text: '' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleColorChange('transparent'))

      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
      expect(deps.undoStack.push).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'delete' })
      )
    })
  })

  describe('handleOpacityChange', () => {
    it('updates opacity with undo capture', () => {
      const rect = makeRectangle({ id: 'r1', opacity: 1 })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleOpacityChange(0.5))

      expect(deps.updateObject).toHaveBeenCalledWith('r1', { opacity: 0.5 })
      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { opacity: 1 } }],
      })
    })
  })

  describe('handleMarkerChange', () => {
    it('defaults marker_start to none when undefined', () => {
      const line = makeObject({ id: 'l1', type: 'line', marker_start: undefined })
      const deps = makeDeps({
        objects: objectsMap(line),
        selectedIds: new Set(['l1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleMarkerChange({ marker_start: 'arrow' }))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'l1', before: { marker_start: 'none' } }],
      })
    })
  })

  describe('handleCornerRadiusChange', () => {
    it('only applies to rectangles', () => {
      const circle = makeObject({ id: 'c1', type: 'circle' })
      const rect = makeRectangle({ id: 'r1', corner_radius: 6 })
      const deps = makeDeps({
        objects: objectsMap(circle, rect),
        selectedIds: new Set(['c1', 'r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleCornerRadiusChange(12))

      // Only rectangle should be updated
      expect(deps.updateObject).toHaveBeenCalledTimes(1)
      expect(deps.updateObject).toHaveBeenCalledWith('r1', { corner_radius: 12 })
    })
  })

  describe('handleFontChange', () => {
    it('applies to sticky_notes', () => {
      const note = makeObject({ id: 's1', type: 'sticky_note', font_family: 'sans-serif' })
      const deps = makeDeps({
        objects: objectsMap(note),
        selectedIds: new Set(['s1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleFontChange({ font_family: 'monospace' }))

      expect(deps.updateObject).toHaveBeenCalledWith('s1', { font_family: 'monospace' })
    })

    it('applies to shapes with text', () => {
      const rect = makeRectangle({ id: 'r1', text: 'hello', font_size: 14 })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleFontChange({ font_size: 18 }))

      expect(deps.updateObject).toHaveBeenCalledWith('r1', { font_size: 18 })
    })

    it('skips shapes without text (except sticky_note)', () => {
      const rect = makeRectangle({ id: 'r1', text: '' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleFontChange({ font_size: 18 }))

      expect(deps.updateObject).not.toHaveBeenCalled()
    })
  })

  describe('handleStrokeStyleChange', () => {
    it('updates stroke properties with undo', () => {
      const rect = makeRectangle({ id: 'r1', stroke_color: '#000', stroke_width: 2 })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleStrokeStyleChange({ stroke_color: '#f00', stroke_width: 4 }))

      expect(deps.updateObject).toHaveBeenCalledWith('r1', { stroke_color: '#f00', stroke_width: 4 })
    })
  })

  describe('handleTextStyleChange', () => {
    it('updates text_align on selected objects and pushes undo entry', () => {
      const rect = makeRectangle({ id: 'r1', text_align: 'left' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleTextStyleChange({ text_align: 'center' }))

      expect(deps.updateObject).toHaveBeenCalledWith('r1', { text_align: 'center' })
      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { text_align: 'left' } }],
      })
    })

    it('returns early when canEdit is false', () => {
      const rect = makeRectangle({ id: 'r1', text_align: 'left' })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleTextStyleChange({ text_align: 'center' }))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('updates text_color on selected objects', () => {
      const rect = makeRectangle({ id: 'r1', text_color: '#000000' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleTextStyleChange({ text_color: '#ff0000' }))

      expect(deps.updateObject).toHaveBeenCalledWith('r1', { text_color: '#ff0000' })
      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { text_color: '#000000' } }],
      })
    })
  })

  describe('handleShadowChange', () => {
    it('updates shadow properties with undo', () => {
      const rect = makeRectangle({ id: 'r1', shadow_blur: 6 })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleShadowChange({ shadow_blur: 12 }))

      expect(deps.updateObject).toHaveBeenCalledWith('r1', { shadow_blur: 12 })
    })

    it('does nothing when canEdit is false', () => {
      const rect = makeRectangle({ id: 'r1', shadow_blur: 6 })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleShadowChange({ shadow_blur: 12 }))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('pushes correct undo entry with before-state', () => {
      const rect = makeRectangle({ id: 'r1', shadow_blur: 4, shadow_color: '#000', shadow_offset_x: 2, shadow_offset_y: 3 })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleShadowChange({ shadow_blur: 10, shadow_color: '#fff' }))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { shadow_blur: 4, shadow_color: '#000' } }],
      })
    })
  })

  describe('handleStrokeStyleChange (canEdit & undo)', () => {
    it('does nothing when canEdit is false', () => {
      const rect = makeRectangle({ id: 'r1', stroke_color: '#000' })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleStrokeStyleChange({ stroke_color: '#f00' }))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('pushes correct undo entry with before-state', () => {
      const rect = makeRectangle({ id: 'r1', stroke_color: '#000', stroke_width: 2 })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleStrokeStyleChange({ stroke_color: '#f00', stroke_width: 4 }))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { stroke_color: '#000', stroke_width: 2 } }],
      })
    })
  })

  describe('handleOpacityChange (canEdit)', () => {
    it('does nothing when canEdit is false', () => {
      const rect = makeRectangle({ id: 'r1', opacity: 1 })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleOpacityChange(0.5))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleMarkerChange (canEdit)', () => {
    it('does nothing when canEdit is false', () => {
      const line = makeObject({ id: 'l1', type: 'line' })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(line),
        selectedIds: new Set(['l1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleMarkerChange({ marker_start: 'arrow' }))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleCornerRadiusChange (canEdit)', () => {
    it('does nothing when canEdit is false', () => {
      const rect = makeRectangle({ id: 'r1', corner_radius: 6 })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleCornerRadiusChange(12))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleFontChange (canEdit & undo)', () => {
    it('does nothing when canEdit is false', () => {
      const note = makeObject({ id: 's1', type: 'sticky_note', font_family: 'sans-serif' })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(note),
        selectedIds: new Set(['s1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleFontChange({ font_family: 'monospace' }))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('pushes correct undo entry with before-state', () => {
      const note = makeObject({ id: 's1', type: 'sticky_note', font_family: 'sans-serif', font_size: 14 })
      const deps = makeDeps({
        objects: objectsMap(note),
        selectedIds: new Set(['s1']),
      })
      const { result } = renderHook(() => useStyleActions(deps))
      act(() => result.current.handleFontChange({ font_family: 'monospace', font_size: 20 }))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 's1', before: { font_family: 'sans-serif', font_size: 14 } }],
      })
    })
  })
})
