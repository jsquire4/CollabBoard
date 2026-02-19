import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useZOrderActions } from './useZOrderActions'
import { makeRectangle, objectsMap, resetFactory } from '@/test/boardObjectFactory'

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    objects: new Map() as Map<string, ReturnType<typeof makeRectangle>>,
    getZOrderSet: vi.fn(() => []),
    bringToFront: vi.fn(),
    sendToBack: vi.fn(),
    bringForward: vi.fn(),
    sendBackward: vi.fn(),
    undoStack: { push: vi.fn() },
    ...overrides,
  }
}

describe('useZOrderActions', () => {
  beforeEach(() => resetFactory())

  describe('handleBringToFront', () => {
    it('captures z_index snapshot and calls bringToFront', () => {
      const r1 = makeRectangle({ id: 'r1', z_index: 1 })
      const getZOrderSet = vi.fn(() => [r1])
      const deps = makeDeps({ objects: objectsMap(r1), getZOrderSet })
      const { result } = renderHook(() => useZOrderActions(deps))

      act(() => result.current.handleBringToFront('r1'))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { z_index: 1 } }],
      })
      expect(deps.bringToFront).toHaveBeenCalledWith('r1')
    })

    it('does nothing when z-order set is empty', () => {
      const deps = makeDeps({ getZOrderSet: vi.fn(() => []) })
      const { result } = renderHook(() => useZOrderActions(deps))
      act(() => result.current.handleBringToFront('r1'))
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleSendToBack', () => {
    it('captures z_index snapshot and calls sendToBack', () => {
      const r1 = makeRectangle({ id: 'r1', z_index: 5 })
      const getZOrderSet = vi.fn(() => [r1])
      const deps = makeDeps({ objects: objectsMap(r1), getZOrderSet })
      const { result } = renderHook(() => useZOrderActions(deps))

      act(() => result.current.handleSendToBack('r1'))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'r1', before: { z_index: 5 } }],
      })
      expect(deps.sendToBack).toHaveBeenCalledWith('r1')
    })
  })

  describe('handleBringForward', () => {
    it('captures patches for target and next-higher sibling', () => {
      const r1 = makeRectangle({ id: 'r1', z_index: 1, parent_id: null })
      const r2 = makeRectangle({ id: 'r2', z_index: 3, parent_id: null })
      const getZOrderSet = vi.fn((id: string) => {
        if (id === 'r1') return [r1]
        if (id === 'r2') return [r2]
        return []
      })
      const deps = makeDeps({
        objects: objectsMap(r1, r2),
        getZOrderSet,
      })
      const { result } = renderHook(() => useZOrderActions(deps))

      act(() => result.current.handleBringForward('r1'))

      const pushCall = deps.undoStack.push.mock.calls[0][0]
      expect(pushCall.type).toBe('update')
      // Should include patches for both r1 and r2
      const ids = pushCall.patches.map((p: { id: string }) => p.id)
      expect(ids).toContain('r1')
      expect(ids).toContain('r2')
      expect(deps.bringForward).toHaveBeenCalledWith('r1')
    })

    it('does nothing for nonexistent object', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useZOrderActions(deps))
      act(() => result.current.handleBringForward('nonexistent'))
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('returns early when getZOrderSet returns empty', () => {
      const r1 = makeRectangle({ id: 'r1', z_index: 1 })
      const deps = makeDeps({
        objects: objectsMap(r1),
        getZOrderSet: vi.fn(() => []),
      })
      const { result } = renderHook(() => useZOrderActions(deps))
      act(() => result.current.handleBringForward('r1'))
      expect(deps.undoStack.push).not.toHaveBeenCalled()
      expect(deps.bringForward).not.toHaveBeenCalled()
    })

    it('still calls bringForward when shape is already at top (no higher sibling)', () => {
      const r1 = makeRectangle({ id: 'r1', z_index: 10, parent_id: null })
      const getZOrderSet = vi.fn(() => [r1])
      const deps = makeDeps({
        objects: objectsMap(r1),
        getZOrderSet,
      })
      const { result } = renderHook(() => useZOrderActions(deps))
      act(() => result.current.handleBringForward('r1'))
      // Undo patches only contain r1 (no next-higher sibling)
      const pushCall = deps.undoStack.push.mock.calls[0][0]
      expect(pushCall.patches).toHaveLength(1)
      expect(pushCall.patches[0].id).toBe('r1')
      expect(deps.bringForward).toHaveBeenCalledWith('r1')
    })
  })

  describe('handleSendBackward', () => {
    it('captures patches for target and next-lower sibling', () => {
      const r1 = makeRectangle({ id: 'r1', z_index: 1, parent_id: null })
      const r2 = makeRectangle({ id: 'r2', z_index: 5, parent_id: null })
      const getZOrderSet = vi.fn((id: string) => {
        if (id === 'r1') return [r1]
        if (id === 'r2') return [r2]
        return []
      })
      const deps = makeDeps({
        objects: objectsMap(r1, r2),
        getZOrderSet,
      })
      const { result } = renderHook(() => useZOrderActions(deps))

      act(() => result.current.handleSendBackward('r2'))

      const pushCall = deps.undoStack.push.mock.calls[0][0]
      expect(pushCall.type).toBe('update')
      const ids = pushCall.patches.map((p: { id: string }) => p.id)
      expect(ids).toContain('r2')
      expect(ids).toContain('r1')
      expect(deps.sendBackward).toHaveBeenCalledWith('r2')
    })

    it('returns early when getZOrderSet returns empty', () => {
      const r1 = makeRectangle({ id: 'r1', z_index: 1 })
      const deps = makeDeps({
        objects: objectsMap(r1),
        getZOrderSet: vi.fn(() => []),
      })
      const { result } = renderHook(() => useZOrderActions(deps))
      act(() => result.current.handleSendBackward('r1'))
      expect(deps.undoStack.push).not.toHaveBeenCalled()
      expect(deps.sendBackward).not.toHaveBeenCalled()
    })

    it('still calls sendBackward when shape is already at bottom (no lower sibling)', () => {
      const r1 = makeRectangle({ id: 'r1', z_index: 1, parent_id: null })
      const getZOrderSet = vi.fn(() => [r1])
      const deps = makeDeps({
        objects: objectsMap(r1),
        getZOrderSet,
      })
      const { result } = renderHook(() => useZOrderActions(deps))
      act(() => result.current.handleSendBackward('r1'))
      // Undo patches only contain r1 (no next-lower sibling)
      const pushCall = deps.undoStack.push.mock.calls[0][0]
      expect(pushCall.patches).toHaveLength(1)
      expect(pushCall.patches[0].id).toBe('r1')
      expect(deps.sendBackward).toHaveBeenCalledWith('r1')
    })
  })
})
