import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoExecution } from './useUndoExecution'
import {
  makeRectangle,
  makeGroup,
  objectsMap,
  resetFactory,
} from '@/test/boardObjectFactory'
import { UndoEntry, useUndoStack } from '@/hooks/useUndoStack'

// ---- helpers ----------------------------------------------------------------

function makeUndoStack(): ReturnType<typeof useUndoStack> {
  return {
    push: vi.fn(),
    popUndo: vi.fn(),
    popRedo: vi.fn(),
    pushRedo: vi.fn(),
    pushUndo: vi.fn(),
  }
}

function makeDeps(overrides?: Partial<Parameters<typeof useUndoExecution>[0]>) {
  return {
    objects: new Map() as Parameters<typeof useUndoExecution>[0]['objects'],
    deleteObject: vi.fn(),
    addObjectWithId: vi.fn(),
    updateObject: vi.fn(),
    getDescendants: vi.fn(() => []),
    undoStack: makeUndoStack(),
    ...overrides,
  }
}

/** Helper: cast through unknown to work around TS narrowing inside act() callbacks. */
function asEntry<T extends UndoEntry>(v: unknown): T {
  return v as T
}

// ---- tests ------------------------------------------------------------------

describe('useUndoExecution', () => {
  beforeEach(() => resetFactory())

  // ==========================================================================
  // executeUndo — 'add' entry
  // ==========================================================================
  describe("executeUndo — 'add'", () => {
    it('deletes every id listed in the entry and returns a delete entry', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const r2 = makeRectangle({ id: 'r2' })
      const deps = makeDeps({ objects: objectsMap(r1, r2) })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = { type: 'add', ids: ['r1', 'r2'] }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
      expect(deps.deleteObject).toHaveBeenCalledWith('r2')
      expect(inverse).toMatchObject({ type: 'delete' })
      expect(asEntry<Extract<UndoEntry, { type: 'delete' }>>(inverse).objects).toHaveLength(2)
    })

    it('returns null when none of the ids exist in objects', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = { type: 'add', ids: ['missing'] }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.deleteObject).not.toHaveBeenCalled()
      expect(inverse).toBeNull()
    })

    it('only deletes ids that are present, skipping missing ones', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const deps = makeDeps({ objects: objectsMap(r1) })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = { type: 'add', ids: ['r1', 'missing'] }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.deleteObject).toHaveBeenCalledTimes(1)
      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
      expect(asEntry<Extract<UndoEntry, { type: 'delete' }>>(inverse).objects).toHaveLength(1)
    })
  })

  // ==========================================================================
  // executeUndo — 'delete' entry
  // ==========================================================================
  describe("executeUndo — 'delete'", () => {
    it('re-adds all objects and returns an add entry with their ids', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const r2 = makeRectangle({ id: 'r2' })
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = { type: 'delete', objects: [r1, r2] }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.addObjectWithId).toHaveBeenCalledWith(r1)
      expect(deps.addObjectWithId).toHaveBeenCalledWith(r2)
      expect(inverse).toMatchObject({ type: 'add', ids: ['r1', 'r2'] })
    })

    it('returns an add entry even for an empty objects list', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = { type: 'delete', objects: [] }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(inverse).toMatchObject({ type: 'add', ids: [] })
    })
  })

  // ==========================================================================
  // executeUndo — 'update' entry
  // ==========================================================================
  describe("executeUndo — 'update'", () => {
    it('applies the before-values and returns the inverse patch set', () => {
      const r1 = makeRectangle({ id: 'r1', color: '#newcolor' })
      const deps = makeDeps({ objects: objectsMap(r1) })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'update',
        patches: [{ id: 'r1', before: { color: '#oldcolor' } }],
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.updateObject).toHaveBeenCalledWith('r1', { color: '#oldcolor' })

      const inv = asEntry<Extract<UndoEntry, { type: 'update' }>>(inverse)
      expect(inv.type).toBe('update')
      expect(inv.patches).toHaveLength(1)
      expect(inv.patches[0]).toMatchObject({ id: 'r1', before: { color: '#newcolor' } })
    })

    it('skips patches for objects that no longer exist', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'update',
        patches: [{ id: 'gone', before: { color: '#x' } }],
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.updateObject).not.toHaveBeenCalled()
      const inv = asEntry<Extract<UndoEntry, { type: 'update' }>>(inverse)
      expect(inv.patches).toHaveLength(0)
    })

    it('captures ALL keys present in the before patch as inverse before-values', () => {
      const r1 = makeRectangle({ id: 'r1', color: '#c', font_size: 20 })
      const deps = makeDeps({ objects: objectsMap(r1) })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'update',
        patches: [{ id: 'r1', before: { color: '#old', font_size: 14 } }],
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      const inv = asEntry<Extract<UndoEntry, { type: 'update' }>>(inverse)
      expect(inv.patches[0].before).toMatchObject({ color: '#c', font_size: 20 })
    })
  })

  // ==========================================================================
  // executeUndo — 'move' entry
  // ==========================================================================
  describe("executeUndo — 'move'", () => {
    it('restores x/y positions and returns the inverse move patches', () => {
      const r1 = makeRectangle({ id: 'r1', x: 200, y: 300 })
      const deps = makeDeps({ objects: objectsMap(r1) })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'move',
        patches: [{ id: 'r1', before: { x: 100, y: 150, parent_id: null } }],
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.updateObject).toHaveBeenCalledWith('r1', expect.objectContaining({ x: 100, y: 150 }))

      const inv = asEntry<Extract<UndoEntry, { type: 'move' }>>(inverse)
      expect(inv.type).toBe('move')
      expect(inv.patches[0]).toMatchObject({ id: 'r1', before: { x: 200, y: 300 } })
    })

    it('includes x2/y2 in the inverse when present', () => {
      const line = makeRectangle({ id: 'l1', x: 50, y: 60, x2: 200, y2: 300 })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'move',
        patches: [{ id: 'l1', before: { x: 10, y: 20, x2: 100, y2: 200, parent_id: null } }],
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      const inv = asEntry<Extract<UndoEntry, { type: 'move' }>>(inverse)
      expect(inv.patches[0].before).toMatchObject({ x: 50, y: 60, x2: 200, y2: 300 })
    })

    it('skips patches for objects that no longer exist', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'move',
        patches: [{ id: 'gone', before: { x: 0, y: 0, parent_id: null } }],
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.updateObject).not.toHaveBeenCalled()
      const inv = asEntry<Extract<UndoEntry, { type: 'move' }>>(inverse)
      expect(inv.patches).toHaveLength(0)
    })
  })

  // ==========================================================================
  // executeUndo — 'duplicate' entry
  // ==========================================================================
  describe("executeUndo — 'duplicate'", () => {
    it('deletes the duplicate ids and their descendants, returns a delete entry', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const child = makeRectangle({ id: 'c1', parent_id: 'r1' })
      const getDescendants = vi.fn((id: string) => id === 'r1' ? [child] : [])
      const deps = makeDeps({ objects: objectsMap(r1, child), getDescendants })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = { type: 'duplicate', ids: ['r1'] }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
      // deleteObject must also be called for descendants, not just top-level ids
      expect(deps.deleteObject).toHaveBeenCalledWith('c1')
      const inv = asEntry<Extract<UndoEntry, { type: 'delete' }>>(inverse)
      expect(inv.type).toBe('delete')
      // Should include r1 itself AND its descendant c1
      const ids = inv.objects.map(o => o.id)
      expect(ids).toContain('r1')
      expect(ids).toContain('c1')
    })

    it('returns null when none of the duplicate ids exist', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = { type: 'duplicate', ids: ['missing'] }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(inverse).toBeNull()
    })

    it('handles duplicates with no descendants', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const getDescendants = vi.fn(() => [])
      const deps = makeDeps({ objects: objectsMap(r1), getDescendants })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = { type: 'duplicate', ids: ['r1'] }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
      const inv = asEntry<Extract<UndoEntry, { type: 'delete' }>>(inverse)
      expect(inv.objects).toHaveLength(1)
    })
  })

  // ==========================================================================
  // executeUndo — 'group' entry
  // ==========================================================================
  describe("executeUndo — 'group'", () => {
    it('restores previous parent_ids for children, deletes the group, returns ungroup entry', () => {
      const group = makeGroup({ id: 'g1' })
      const c1 = makeRectangle({ id: 'c1', parent_id: 'g1' })
      const c2 = makeRectangle({ id: 'c2', parent_id: 'g1' })
      const previousParentIds = new Map<string, string | null>([
        ['c1', null],
        ['c2', 'frame-1'],
      ])
      const deps = makeDeps({ objects: objectsMap(group, c1, c2) })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'group',
        groupId: 'g1',
        childIds: ['c1', 'c2'],
        previousParentIds,
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.updateObject).toHaveBeenCalledWith('c1', { parent_id: null })
      expect(deps.updateObject).toHaveBeenCalledWith('c2', { parent_id: 'frame-1' })
      expect(deps.deleteObject).toHaveBeenCalledWith('g1')

      const inv = asEntry<Extract<UndoEntry, { type: 'ungroup' }>>(inverse)
      expect(inv.type).toBe('ungroup')
      expect(inv.groupSnapshot).toMatchObject({ id: 'g1', type: 'group' })
      expect(inv.childIds).toEqual(['c1', 'c2'])
    })

    it('returns null when the group object no longer exists', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'group',
        groupId: 'g1',
        childIds: ['c1'],
        previousParentIds: new Map([['c1', null]]),
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(inverse).toBeNull()
    })
  })

  // ==========================================================================
  // executeUndo — 'ungroup' entry
  // ==========================================================================
  describe("executeUndo — 'ungroup'", () => {
    it('re-adds the group, sets parent_ids on children, returns group entry', () => {
      const group = makeGroup({ id: 'g1' })
      const c1 = makeRectangle({ id: 'c1', parent_id: null })
      const c2 = makeRectangle({ id: 'c2', parent_id: 'other-frame' })
      const deps = makeDeps({ objects: objectsMap(c1, c2) })
      const { result } = renderHook(() => useUndoExecution(deps))

      const entry: UndoEntry = {
        type: 'ungroup',
        groupSnapshot: group,
        childIds: ['c1', 'c2'],
      }
      let inverse: unknown = null
      act(() => { inverse = result.current.executeUndo(entry) })

      expect(deps.addObjectWithId).toHaveBeenCalledWith(group)
      expect(deps.updateObject).toHaveBeenCalledWith('c1', { parent_id: 'g1' })
      expect(deps.updateObject).toHaveBeenCalledWith('c2', { parent_id: 'g1' })

      const inv = asEntry<Extract<UndoEntry, { type: 'group' }>>(inverse)
      expect(inv.type).toBe('group')
      expect(inv.groupId).toBe('g1')
      expect(inv.childIds).toEqual(['c1', 'c2'])
      // previousParentIds should capture the state BEFORE the parent_id update
      expect(inv.previousParentIds.get('c1')).toBeNull()
      expect(inv.previousParentIds.get('c2')).toBe('other-frame')
    })
  })

  // ==========================================================================
  // performUndo
  // ==========================================================================
  describe('performUndo', () => {
    it('pops from the undo stack, executes the entry, and pushes inverse to redo', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const undoStack = makeUndoStack()
      const addEntry: UndoEntry = { type: 'add', ids: ['r1'] }
      ;(undoStack.popUndo as ReturnType<typeof vi.fn>).mockReturnValueOnce(addEntry)

      const deps = makeDeps({ objects: objectsMap(r1), undoStack })
      const { result } = renderHook(() => useUndoExecution(deps))

      act(() => { result.current.performUndo() })

      expect(undoStack.popUndo).toHaveBeenCalled()
      expect(deps.deleteObject).toHaveBeenCalledWith('r1')
      expect(undoStack.pushRedo).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'delete' })
      )
    })

    it('does nothing when the undo stack is empty', () => {
      const undoStack = makeUndoStack()
      ;(undoStack.popUndo as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined)

      const deps = makeDeps({ undoStack })
      const { result } = renderHook(() => useUndoExecution(deps))

      act(() => { result.current.performUndo() })

      expect(deps.deleteObject).not.toHaveBeenCalled()
      expect(undoStack.pushRedo).not.toHaveBeenCalled()
    })

    it('does not push to redo when executeUndo returns null', () => {
      const undoStack = makeUndoStack()
      // 'add' entry with a missing id → executeUndo returns null
      const addEntry: UndoEntry = { type: 'add', ids: ['missing'] }
      ;(undoStack.popUndo as ReturnType<typeof vi.fn>).mockReturnValueOnce(addEntry)

      const deps = makeDeps({ objects: new Map(), undoStack })
      const { result } = renderHook(() => useUndoExecution(deps))

      act(() => { result.current.performUndo() })

      expect(undoStack.pushRedo).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // performRedo
  // ==========================================================================
  describe('performRedo', () => {
    it('pops from the redo stack, executes the entry, and pushes inverse to undo', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const undoStack = makeUndoStack()
      // redo stack holds a 'delete' entry (re-add the deleted object)
      const deleteEntry: UndoEntry = { type: 'delete', objects: [r1] }
      ;(undoStack.popRedo as ReturnType<typeof vi.fn>).mockReturnValueOnce(deleteEntry)

      const deps = makeDeps({ objects: new Map(), undoStack })
      const { result } = renderHook(() => useUndoExecution(deps))

      act(() => { result.current.performRedo() })

      expect(undoStack.popRedo).toHaveBeenCalled()
      expect(deps.addObjectWithId).toHaveBeenCalledWith(r1)
      expect(undoStack.pushUndo).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'add', ids: ['r1'] })
      )
    })

    it('does nothing when the redo stack is empty', () => {
      const undoStack = makeUndoStack()
      ;(undoStack.popRedo as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined)

      const deps = makeDeps({ undoStack })
      const { result } = renderHook(() => useUndoExecution(deps))

      act(() => { result.current.performRedo() })

      expect(deps.addObjectWithId).not.toHaveBeenCalled()
      expect(undoStack.pushUndo).not.toHaveBeenCalled()
    })

    it('does not push to undo when executeUndo returns null', () => {
      const undoStack = makeUndoStack()
      const addEntry: UndoEntry = { type: 'add', ids: ['missing'] }
      ;(undoStack.popRedo as ReturnType<typeof vi.fn>).mockReturnValueOnce(addEntry)

      const deps = makeDeps({ objects: new Map(), undoStack })
      const { result } = renderHook(() => useUndoExecution(deps))

      act(() => { result.current.performRedo() })

      expect(undoStack.pushUndo).not.toHaveBeenCalled()
    })
  })

  describe('stress', () => {
    it('undo 100 deletes restores all 100 objects via addObjectWithId', () => {
      const N = 100
      const deleteEntries: UndoEntry[] = []
      for (let i = 0; i < N; i++) {
        const id = `obj-${i}`
        const obj = makeRectangle({ id, board_id: 'board-1', x: i * 10, y: i * 10 })
        deleteEntries.push({ type: 'delete', objects: [obj] })
      }

      const undoStack = makeUndoStack()
      let callIndex = 0
      ;(undoStack.popUndo as ReturnType<typeof vi.fn>).mockImplementation(() => {
        if (callIndex < N) return deleteEntries[callIndex++]
        return undefined
      })

      const addObjectWithId = vi.fn()
      const deps = makeDeps({ objects: new Map(), undoStack, addObjectWithId })
      const { result } = renderHook(() => useUndoExecution(deps))

      for (let i = 0; i < N; i++) {
        act(() => { result.current.performUndo() })
      }

      expect(addObjectWithId).toHaveBeenCalledTimes(N)
      const restoredIds = new Set(addObjectWithId.mock.calls.map((c) => c[0].id))
      for (let i = 0; i < N; i++) {
        expect(restoredIds.has(`obj-${i}`)).toBe(true)
      }
    })
  })
})
