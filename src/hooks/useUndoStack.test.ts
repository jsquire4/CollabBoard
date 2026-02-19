import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoStack } from './useUndoStack'
import { makeRectangle, resetFactory } from '@/test/boardObjectFactory'

describe('useUndoStack', () => {
  beforeEach(() => resetFactory())

  it('push adds entry and clears redo', () => {
    const { result } = renderHook(() => useUndoStack())

    act(() => {
      result.current.push({ type: 'add', ids: ['a'] })
    })

    const undo = result.current.popUndo()
    expect(undo).toEqual({ type: 'add', ids: ['a'] })

    const empty = result.current.popUndo()
    expect(empty).toBeUndefined()
  })

  it('popUndo returns undefined when empty', () => {
    const { result } = renderHook(() => useUndoStack())
    expect(result.current.popUndo()).toBeUndefined()
  })

  it('popRedo returns undefined when empty', () => {
    const { result } = renderHook(() => useUndoStack())
    expect(result.current.popRedo()).toBeUndefined()
  })

  it('pushRedo adds to redo stack', () => {
    const { result } = renderHook(() => useUndoStack())

    act(() => {
      result.current.pushRedo({ type: 'delete', objects: [makeRectangle({ id: 'r1' })] })
    })

    const redo = result.current.popRedo()
    expect(redo).toEqual({ type: 'delete', objects: expect.any(Array) })
    expect((redo as { objects: unknown[] }).objects[0]).toMatchObject({ id: 'r1' })
  })

  it('pushUndo adds without clearing redo', () => {
    const { result } = renderHook(() => useUndoStack())

    act(() => {
      result.current.push({ type: 'add', ids: ['a'] })
    })
    act(() => {
      result.current.popUndo()
    })
    act(() => {
      result.current.pushRedo({ type: 'add', ids: ['a'] })
    })
    act(() => {
      result.current.pushUndo({ type: 'delete', objects: [] })
    })

    expect(result.current.popRedo()).toEqual({ type: 'add', ids: ['a'] })
    expect(result.current.popUndo()).toEqual({ type: 'delete', objects: [] })
  })

  it('push clears redo stack', () => {
    const { result } = renderHook(() => useUndoStack())

    act(() => {
      result.current.push({ type: 'add', ids: ['a'] })
    })
    act(() => {
      result.current.popUndo()
    })
    act(() => {
      result.current.pushRedo({ type: 'add', ids: ['a'] })
    })
    act(() => {
      result.current.push({ type: 'add', ids: ['b'] })
    })

    expect(result.current.popRedo()).toBeUndefined()
    expect(result.current.popUndo()).toEqual({ type: 'add', ids: ['b'] })
  })

  it('caps undo stack at MAX_STACK_SIZE (50)', () => {
    const { result } = renderHook(() => useUndoStack())

    for (let i = 0; i < 55; i++) {
      act(() => {
        result.current.push({ type: 'add', ids: [`id-${i}`] })
      })
    }

    const entries: unknown[] = []
    let entry
    while ((entry = result.current.popUndo())) {
      entries.push(entry)
    }
    expect(entries).toHaveLength(50)
    // LIFO: first pop is last pushed (id-54), last pop is first kept (id-5)
    expect((entries[0] as { ids: string[] }).ids[0]).toBe('id-54')
    expect((entries[49] as { ids: string[] }).ids[0]).toBe('id-5')
  })

  it('caps redo stack at MAX_STACK_SIZE', () => {
    const { result } = renderHook(() => useUndoStack())

    act(() => {
      result.current.push({ type: 'add', ids: ['a'] })
    })
    act(() => {
      result.current.popUndo()
    })

    for (let i = 0; i < 55; i++) {
      act(() => {
        result.current.pushRedo({ type: 'add', ids: [`id-${i}`] })
      })
    }

    const entries: unknown[] = []
    let entry
    while ((entry = result.current.popRedo())) {
      entries.push(entry)
    }
    expect(entries).toHaveLength(50)
  })

  it('supports all entry types', () => {
    const { result } = renderHook(() => useUndoStack())
    const rect = makeRectangle({ id: 'r1', x: 10, y: 20 })

    act(() => {
      result.current.push({ type: 'add', ids: ['a'] })
    })
    act(() => {
      result.current.push({ type: 'delete', objects: [rect] })
    })
    act(() => {
      result.current.push({
        type: 'update',
        patches: [{ id: 'a', before: { x: 5 } }],
      })
    })
    act(() => {
      result.current.push({
        type: 'move',
        patches: [{ id: 'a', before: { x: 10, y: 20, parent_id: null } }],
      })
    })
    act(() => {
      result.current.push({
        type: 'group',
        groupId: 'g1',
        childIds: ['a', 'b'],
        previousParentIds: new Map([['a', null], ['b', null]]),
      })
    })
    act(() => {
      result.current.push({
        type: 'ungroup',
        groupSnapshot: rect,
        childIds: ['a', 'b'],
      })
    })
    act(() => {
      result.current.push({ type: 'duplicate', ids: ['a', 'a-copy'] })
    })

    expect(result.current.popUndo()).toEqual({ type: 'duplicate', ids: ['a', 'a-copy'] })
    expect(result.current.popUndo()?.type).toBe('ungroup')
    expect(result.current.popUndo()?.type).toBe('group')
    expect(result.current.popUndo()?.type).toBe('move')
    expect(result.current.popUndo()?.type).toBe('update')
    expect(result.current.popUndo()).toEqual({ type: 'delete', objects: [rect] })
    expect(result.current.popUndo()).toEqual({ type: 'add', ids: ['a'] })
  })
})
