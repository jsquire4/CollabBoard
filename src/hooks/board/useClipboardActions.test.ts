import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClipboardActions } from './useClipboardActions'
import { makeRectangle, objectsMap, resetFactory } from '@/test/boardObjectFactory'

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    objects: new Map() as Map<string, ReturnType<typeof makeRectangle>>,
    selectedIds: new Set<string>(),
    canEdit: true,
    deleteSelected: vi.fn(),
    duplicateSelected: vi.fn(() => []),
    duplicateObject: vi.fn(() => null),
    getDescendants: vi.fn(() => []),
    undoStack: { push: vi.fn() },
    markActivity: vi.fn(),
    ...overrides,
  }
}

describe('useClipboardActions', () => {
  beforeEach(() => resetFactory())

  describe('handleDelete', () => {
    it('does nothing when canEdit is false', () => {
      const deps = makeDeps({ canEdit: false, selectedIds: new Set(['r1']) })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handleDelete())
      expect(deps.deleteSelected).not.toHaveBeenCalled()
    })

    it('snapshots objects and descendants before deleting', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const child = makeRectangle({ id: 'c1', parent_id: 'r1' })
      const getDescendants = vi.fn(() => [child])
      const deps = makeDeps({
        objects: objectsMap(r1, child),
        selectedIds: new Set(['r1']),
        getDescendants,
      })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handleDelete())

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'delete',
        objects: expect.arrayContaining([
          expect.objectContaining({ id: 'r1' }),
          expect.objectContaining({ id: 'c1' }),
        ]),
      })
      expect(deps.deleteSelected).toHaveBeenCalled()
      expect(deps.markActivity).toHaveBeenCalled()
    })

    it('skips undo push when no objects found', () => {
      const deps = makeDeps({
        selectedIds: new Set(['nonexistent']),
      })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handleDelete())
      expect(deps.undoStack.push).not.toHaveBeenCalled()
      expect(deps.deleteSelected).toHaveBeenCalled()
    })

    it('calls deleteSelected but skips undo push when selectedIds is empty', () => {
      const deps = makeDeps({
        selectedIds: new Set<string>(),
      })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handleDelete())
      expect(deps.undoStack.push).not.toHaveBeenCalled()
      expect(deps.deleteSelected).toHaveBeenCalled()
    })
  })

  describe('handleDuplicate', () => {
    it('does nothing when canEdit is false', () => {
      const deps = makeDeps({ canEdit: false })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handleDuplicate())
      expect(deps.duplicateSelected).not.toHaveBeenCalled()
    })

    it('pushes duplicate undo entry with new IDs', () => {
      const duplicateSelected = vi.fn(() => ['new-1', 'new-2'])
      const deps = makeDeps({ duplicateSelected })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handleDuplicate())

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'duplicate',
        ids: ['new-1', 'new-2'],
      })
    })

    it('skips undo when no duplicates created', () => {
      const deps = makeDeps({ duplicateSelected: vi.fn(() => []) })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handleDuplicate())
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleCopy', () => {
    it('does nothing with empty selection', () => {
      const deps = makeDeps({ selectedIds: new Set() })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handleCopy())
      expect(deps.markActivity).not.toHaveBeenCalled()
    })

    it('stores selected IDs for paste', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const duplicateObject = vi.fn(() => makeRectangle({ id: 'dup-1' }))
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
        duplicateObject,
      })
      const { result } = renderHook(() => useClipboardActions(deps))

      // Copy, then paste
      act(() => result.current.handleCopy())
      act(() => result.current.handlePaste())

      expect(duplicateObject).toHaveBeenCalledWith('r1')
    })
  })

  describe('handlePaste', () => {
    it('does nothing when canEdit is false', () => {
      const deps = makeDeps({ canEdit: false })
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handlePaste())
      expect(deps.duplicateObject).not.toHaveBeenCalled()
    })

    it('does nothing with empty clipboard', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useClipboardActions(deps))
      act(() => result.current.handlePaste())
      expect(deps.duplicateObject).not.toHaveBeenCalled()
    })

    it('skips undo push when all duplicateObject calls return null', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const duplicateObject = vi.fn(() => null)
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
        duplicateObject,
      })
      const { result } = renderHook(() => useClipboardActions(deps))

      act(() => result.current.handleCopy())
      act(() => result.current.handlePaste())

      expect(duplicateObject).toHaveBeenCalledWith('r1')
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('duplicates each clipboard item and pushes undo', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const r2 = makeRectangle({ id: 'r2' })
      let dupCount = 0
      const duplicateObject = vi.fn(() => {
        dupCount++
        return makeRectangle({ id: `dup-${dupCount}` })
      })
      const deps = makeDeps({
        objects: objectsMap(r1, r2),
        selectedIds: new Set(['r1', 'r2']),
        duplicateObject,
      })
      const { result } = renderHook(() => useClipboardActions(deps))

      act(() => result.current.handleCopy())
      act(() => result.current.handlePaste())

      expect(duplicateObject).toHaveBeenCalledTimes(2)
      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'duplicate',
        ids: ['dup-1', 'dup-2'],
      })
    })
  })
})
