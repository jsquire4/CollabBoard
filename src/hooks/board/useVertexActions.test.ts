import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVertexActions } from './useVertexActions'
import { makeRectangle, makeObject, objectsMap, resetFactory } from '@/test/boardObjectFactory'

// Mock shapeRegistry — rectangle is registered, sticky_note is not
vi.mock('@/components/board/shapeRegistry', () => ({
  shapeRegistry: {
    has: (type: string) => ['rectangle', 'circle', 'triangle', 'chevron', 'parallelogram', 'ngon'].includes(type),
  },
}))

vi.mock('@/components/board/shapeUtils', () => ({
  getInitialVertexPoints: (obj: { width: number; height: number }) => [0, 0, obj.width, 0, obj.width, obj.height, 0, obj.height],
}))

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    objects: new Map() as Map<string, ReturnType<typeof makeRectangle>>,
    selectedIds: new Set<string>(),
    canEdit: true,
    updateObject: vi.fn(),
    undoStack: { push: vi.fn() },
    setVertexEditId: vi.fn(),
    ...overrides,
  }
}

describe('useVertexActions', () => {
  beforeEach(() => resetFactory())

  describe('handleEditVertices', () => {
    it('does nothing when canEdit is false', () => {
      const rect = makeRectangle({ id: 'r1' })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useVertexActions(deps))
      act(() => result.current.handleEditVertices())
      expect(deps.setVertexEditId).not.toHaveBeenCalled()
    })

    it('sets vertexEditId for a registry shape', () => {
      const rect = makeRectangle({ id: 'r1', custom_points: '[0,0,120,0,120,80,0,80]' })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useVertexActions(deps))
      act(() => result.current.handleEditVertices())
      expect(deps.setVertexEditId).toHaveBeenCalledWith('r1')
    })

    it('initializes custom_points if shape has none', () => {
      const rect = makeRectangle({ id: 'r1', custom_points: undefined })
      const deps = makeDeps({
        objects: objectsMap(rect),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useVertexActions(deps))
      act(() => result.current.handleEditVertices())
      expect(deps.updateObject).toHaveBeenCalledWith('r1', {
        custom_points: JSON.stringify([0, 0, 120, 0, 120, 80, 0, 80]),
      })
      expect(deps.setVertexEditId).toHaveBeenCalledWith('r1')
    })

    it('skips non-registry shapes (sticky_note)', () => {
      const note = makeObject({ id: 's1', type: 'sticky_note' })
      const deps = makeDeps({
        objects: objectsMap(note),
        selectedIds: new Set(['s1']),
      })
      const { result } = renderHook(() => useVertexActions(deps))
      act(() => result.current.handleEditVertices())
      expect(deps.setVertexEditId).not.toHaveBeenCalled()
    })
  })

  describe('handleVertexDragEnd', () => {
    it('updates the point at the given index and pushes undo', () => {
      const pts = [0, 0, 100, 0, 100, 80, 0, 80]
      const rect = makeRectangle({ id: 'r1', custom_points: JSON.stringify(pts) })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useVertexActions(deps))

      act(() => result.current.handleVertexDragEnd('r1', 1, 110, 10))

      expect(deps.updateObject).toHaveBeenCalledWith('r1', {
        custom_points: JSON.stringify([0, 0, 110, 10, 100, 80, 0, 80]),
      })
      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { custom_points: JSON.stringify(pts) } }],
      })
    })

    it('does nothing when object has no custom_points', () => {
      const rect = makeRectangle({ id: 'r1' })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useVertexActions(deps))
      act(() => result.current.handleVertexDragEnd('r1', 0, 50, 50))
      expect(deps.updateObject).not.toHaveBeenCalled()
    })
  })

  describe('handleVertexInsert', () => {
    it('inserts a midpoint between two vertices', () => {
      const pts = [0, 0, 100, 0, 100, 100, 0, 100]
      const rect = makeRectangle({ id: 'r1', custom_points: JSON.stringify(pts) })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useVertexActions(deps))

      act(() => result.current.handleVertexInsert('r1', 0))

      // Midpoint between (0,0) and (100,0) = (50,0)
      expect(deps.updateObject).toHaveBeenCalledWith('r1', {
        custom_points: JSON.stringify([0, 0, 50, 0, 100, 0, 100, 100, 0, 100]),
      })
    })

    it('wraps around for last vertex to first', () => {
      const pts = [0, 0, 100, 0, 100, 100]
      const rect = makeRectangle({ id: 'r1', custom_points: JSON.stringify(pts) })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useVertexActions(deps))

      act(() => result.current.handleVertexInsert('r1', 2))

      // Midpoint between (100,100) and (0,0) = (50,50)
      expect(deps.updateObject).toHaveBeenCalledWith('r1', {
        custom_points: JSON.stringify([0, 0, 100, 0, 100, 100, 50, 50]),
      })
    })
  })

  describe('handleExitVertexEdit', () => {
    it('sets vertexEditId to null', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useVertexActions(deps))
      act(() => result.current.handleExitVertexEdit())
      expect(deps.setVertexEditId).toHaveBeenCalledWith(null)
    })
  })
})
