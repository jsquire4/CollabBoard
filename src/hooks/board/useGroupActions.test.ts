import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroupActions } from './useGroupActions'
import { makeRectangle, makeObject, objectsMap, resetFactory } from '@/test/boardObjectFactory'

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    objects: new Map() as Map<string, ReturnType<typeof makeRectangle>>,
    selectedIds: new Set<string>(),
    canEdit: true,
    groupSelected: vi.fn(async () => null),
    ungroupSelected: vi.fn(),
    getChildren: vi.fn(() => []),
    undoStack: { push: vi.fn() },
    markActivity: vi.fn(),
    ...overrides,
  }
}

describe('useGroupActions', () => {
  beforeEach(() => resetFactory())

  describe('handleGroup', () => {
    it('does nothing with fewer than 2 selected', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useGroupActions(deps))
      act(() => { result.current.handleGroup() })
      expect(deps.groupSelected).not.toHaveBeenCalled()
    })

    it('does nothing when canEdit is false', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const r2 = makeRectangle({ id: 'r2' })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(r1, r2),
        selectedIds: new Set(['r1', 'r2']),
      })
      const { result } = renderHook(() => useGroupActions(deps))
      act(() => { result.current.handleGroup() })
      expect(deps.groupSelected).not.toHaveBeenCalled()
    })

    it('groups selected and pushes undo entry', async () => {
      const r1 = makeRectangle({ id: 'r1', parent_id: null })
      const r2 = makeRectangle({ id: 'r2', parent_id: 'frame-1' })
      const groupObj = makeObject({ id: 'g1', type: 'group' })
      const groupSelected = vi.fn(async () => groupObj)
      const deps = makeDeps({
        objects: objectsMap(r1, r2),
        selectedIds: new Set(['r1', 'r2']),
        groupSelected,
      })
      const { result } = renderHook(() => useGroupActions(deps))
      await act(async () => { await result.current.handleGroup() })

      expect(deps.markActivity).toHaveBeenCalled()
      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'group',
        groupId: 'g1',
        childIds: expect.arrayContaining(['r1', 'r2']),
        previousParentIds: expect.any(Map),
      })
      const entry = deps.undoStack.push.mock.calls[0][0]
      expect(entry.previousParentIds.get('r1')).toBe(null)
      expect(entry.previousParentIds.get('r2')).toBe('frame-1')
    })
  })

  describe('handleUngroup', () => {
    it('does nothing when canEdit is false', () => {
      const deps = makeDeps({ canEdit: false, selectedIds: new Set(['g1']) })
      const { result } = renderHook(() => useGroupActions(deps))
      act(() => result.current.handleUngroup())
      expect(deps.ungroupSelected).not.toHaveBeenCalled()
    })

    it('skips non-group objects', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useGroupActions(deps))
      act(() => result.current.handleUngroup())
      expect(deps.undoStack.push).not.toHaveBeenCalled()
      expect(deps.ungroupSelected).toHaveBeenCalled()
    })

    it('pushes ungroup undo entry with group snapshot and child ids', () => {
      const group = makeObject({ id: 'g1', type: 'group', color: '#aaa' })
      const c1 = makeRectangle({ id: 'c1', parent_id: 'g1' })
      const c2 = makeRectangle({ id: 'c2', parent_id: 'g1' })
      const getChildren = vi.fn(() => [c1, c2])
      const deps = makeDeps({
        objects: objectsMap(group, c1, c2),
        selectedIds: new Set(['g1']),
        getChildren,
      })
      const { result } = renderHook(() => useGroupActions(deps))
      act(() => result.current.handleUngroup())

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'ungroup',
        groupSnapshot: expect.objectContaining({ id: 'g1', type: 'group' }),
        childIds: ['c1', 'c2'],
      })
      expect(deps.ungroupSelected).toHaveBeenCalled()
    })
  })

  describe('canGroup', () => {
    it('is true when 2+ selected', () => {
      const deps = makeDeps({ selectedIds: new Set(['r1', 'r2']) })
      const { result } = renderHook(() => useGroupActions(deps))
      expect(result.current.canGroup).toBe(true)
    })

    it('is false when <2 selected', () => {
      const deps = makeDeps({ selectedIds: new Set(['r1']) })
      const { result } = renderHook(() => useGroupActions(deps))
      expect(result.current.canGroup).toBe(false)
    })
  })

  describe('canUngroup', () => {
    it('is true when selection contains a group', () => {
      const group = makeObject({ id: 'g1', type: 'group' })
      const deps = makeDeps({
        objects: objectsMap(group),
        selectedIds: new Set(['g1']),
      })
      const { result } = renderHook(() => useGroupActions(deps))
      expect(result.current.canUngroup).toBe(true)
    })

    it('is false when no groups selected', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
      })
      const { result } = renderHook(() => useGroupActions(deps))
      expect(result.current.canUngroup).toBe(false)
    })
  })
})
