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

  describe('checkAndDeleteInvisible', () => {
    it('deletes objects with transparent fill, no stroke, no text', () => {
      const rect = makeRectangle({ id: 'r1', color: 'transparent', stroke_color: null, text: '' })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useStyleActions(deps))

      const pending = new Map([['r1', { color: 'transparent' }]])
      let deleted: unknown[]
      act(() => { deleted = result.current.checkAndDeleteInvisible(pending) })
      expect(deleted!.length).toBe(1)
      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
    })

    it('preserves objects with text', () => {
      const rect = makeRectangle({ id: 'r1', color: 'transparent', stroke_color: null, text: 'hello' })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useStyleActions(deps))

      const pending = new Map([['r1', { color: 'transparent' }]])
      let deleted: unknown[]
      act(() => { deleted = result.current.checkAndDeleteInvisible(pending) })
      expect(deleted!.length).toBe(0)
    })

    it('preserves objects with stroke', () => {
      const rect = makeRectangle({ id: 'r1', color: 'transparent', stroke_color: '#000' })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useStyleActions(deps))

      const pending = new Map([['r1', { color: 'transparent' }]])
      let deleted: unknown[]
      act(() => { deleted = result.current.checkAndDeleteInvisible(pending) })
      expect(deleted!.length).toBe(0)
    })

    it('uses pending changes to detect stroke removal', () => {
      const rect = makeRectangle({ id: 'r1', color: 'transparent', stroke_color: '#000', text: '' })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useStyleActions(deps))

      // Pending change removes stroke
      const pending = new Map([['r1', { stroke_color: null as string | null }]])
      let deleted: unknown[]
      act(() => { deleted = result.current.checkAndDeleteInvisible(pending) })
      expect(deleted!.length).toBe(1)
    })

    it('skips group objects', () => {
      const group = makeObject({ id: 'g1', type: 'group', color: 'transparent', text: '' })
      const deps = makeDeps({ objects: objectsMap(group) })
      const { result } = renderHook(() => useStyleActions(deps))

      const pending = new Map([['g1', { color: 'transparent' }]])
      let deleted: unknown[]
      act(() => { deleted = result.current.checkAndDeleteInvisible(pending) })
      expect(deleted!.length).toBe(0)
    })
  })

  describe('handleColorChange', () => {
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
  })
})
