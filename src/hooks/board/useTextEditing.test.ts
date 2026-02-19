import React from 'react'
import Konva from 'konva'
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTextEditing, UseTextEditingDeps, getTextCharLimit, STICKY_TITLE_CHAR_LIMIT } from './useTextEditing'
import { BoardObject } from '@/types/board'
import { createMockStage } from '@/test/mocks/konva'

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

    it('calls onUpdateText when finishing text edit', () => {
      const sticky = { id: 's1', type: 'sticky_note' as const, text: 'Hello', font_size: 14 } as BoardObject
      const objects = new Map([['s1', sticky]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const onUpdateText = vi.fn()
      const deps = makeDeps({
        objects,
        stageRef,
        onUpdateText,
        tryEnterGroup: () => false,
      })
      const { result } = renderHook(() => useTextEditing(deps))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartEdit('s1', mockTextNode as never, 'text'))
      expect(result.current.editingId).toBe('s1')

      act(() => result.current.setEditText('Updated text'))
      act(() => result.current.handleFinishEdit())

      expect(onUpdateText).toHaveBeenCalledWith('s1', 'Updated text')
      expect(result.current.editingId).toBeNull()
    })

    it('calls onUpdateTitle when finishing title edit and respects char limit', () => {
      const frame = { id: 'f1', type: 'frame' as const, title: 'Frame', font_size: 14 } as BoardObject
      const objects = new Map([['f1', frame]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const onUpdateTitle = vi.fn()
      const deps = makeDeps({
        objects,
        stageRef,
        onUpdateTitle,
        tryEnterGroup: () => false,
      })
      const { result } = renderHook(() => useTextEditing(deps))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 20 }) }
      act(() => result.current.handleStartEdit('f1', mockTextNode as never, 'title'))
      const longTitle = 'a'.repeat(300)
      act(() => result.current.setEditText(longTitle))
      act(() => result.current.handleFinishEdit())

      expect(onUpdateTitle).toHaveBeenCalledWith('f1', longTitle.slice(0, STICKY_TITLE_CHAR_LIMIT))
    })

    it('handleStartEdit exits early when tryEnterGroup returns true', () => {
      const obj = { id: 'c1', type: 'rectangle' as const, text: 'Hi', font_size: 14 } as BoardObject
      const objects = new Map([['c1', obj]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const onUpdateText = vi.fn()
      const tryEnterGroup = vi.fn().mockReturnValue(true)
      const deps = makeDeps({
        objects,
        stageRef,
        onUpdateText,
        tryEnterGroup,
      })
      const { result } = renderHook(() => useTextEditing(deps))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartEdit('c1', mockTextNode as never))
      expect(tryEnterGroup).toHaveBeenCalledWith('c1')
      expect(result.current.editingId).toBeNull()
      expect(onUpdateText).not.toHaveBeenCalled()
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

  describe('cell editing', () => {
    function makeTableObj() {
      const tableData = JSON.stringify({
        columns: [
          { id: 'c1', name: 'Col 1', width: 120 },
          { id: 'c2', name: 'Col 2', width: 120 },
        ],
        rows: [
          { id: 'r1', height: 32, cells: { c1: { text: 'A' }, c2: { text: 'B' } } },
          { id: 'r2', height: 32, cells: { c1: { text: 'C' }, c2: { text: 'D' } } },
        ],
      })
      return { id: 'tbl-1', type: 'table' as const, table_data: tableData, font_size: 14 } as BoardObject
    }

    it('handleStartCellEdit sets editingId and editingCellCoords', () => {
      const tbl = makeTableObj()
      const objects = new Map([['tbl-1', tbl]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, stageRef })))

      const mockTextNode = { getClientRect: () => ({ x: 10, y: 20, width: 120, height: 32 }) }
      act(() => result.current.handleStartCellEdit('tbl-1', mockTextNode as never, 0, 1))

      expect(result.current.editingId).toBe('tbl-1')
      expect(result.current.editingCellCoords).toEqual({ row: 0, col: 1 })
      expect(result.current.editText).toBe('B')
    })

    it('handleStartCellEdit is no-op when canEdit is false', () => {
      const tbl = makeTableObj()
      const objects = new Map([['tbl-1', tbl]])
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, canEdit: false })))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartCellEdit('tbl-1', mockTextNode as never, 0, 0))

      expect(result.current.editingId).toBeNull()
      expect(result.current.editingCellCoords).toBeNull()
    })

    it('handleFinishEdit calls onUpdateTableCell when editingCellCoords is set', () => {
      const tbl = makeTableObj()
      const objects = new Map([['tbl-1', tbl]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const onUpdateTableCell = vi.fn()
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, stageRef, onUpdateTableCell })))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartCellEdit('tbl-1', mockTextNode as never, 1, 0))
      act(() => result.current.setEditText('Updated'))
      act(() => result.current.handleFinishEdit())

      expect(onUpdateTableCell).toHaveBeenCalledWith('tbl-1', 1, 0, 'Updated')
      expect(result.current.editingId).toBeNull()
      expect(result.current.editingCellCoords).toBeNull()
    })

    it('handleFinishEdit clears editingCellCoords', () => {
      const tbl = makeTableObj()
      const objects = new Map([['tbl-1', tbl]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, stageRef })))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartCellEdit('tbl-1', mockTextNode as never, 0, 0))
      expect(result.current.editingCellCoords).not.toBeNull()

      act(() => result.current.handleFinishEdit())
      expect(result.current.editingCellCoords).toBeNull()
    })

    it('handleCellKeyDown with Tab navigates right', () => {
      const tbl = makeTableObj()
      const objects = new Map([['tbl-1', tbl]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const onUpdateTableCell = vi.fn()
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, stageRef, onUpdateTableCell })))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartCellEdit('tbl-1', mockTextNode as never, 0, 0))
      expect(result.current.editingCellCoords).toEqual({ row: 0, col: 0 })

      const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      act(() => result.current.handleCellKeyDown(event))

      expect(onUpdateTableCell).toHaveBeenCalledWith('tbl-1', 0, 0, 'A')
      expect(result.current.editingCellCoords).toEqual({ row: 0, col: 1 })
      expect(result.current.editText).toBe('B')
    })

    it('handleCellKeyDown with Shift+Tab navigates left', () => {
      const tbl = makeTableObj()
      const objects = new Map([['tbl-1', tbl]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const onUpdateTableCell = vi.fn()
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, stageRef, onUpdateTableCell })))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartCellEdit('tbl-1', mockTextNode as never, 0, 1))

      const event = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      act(() => result.current.handleCellKeyDown(event))

      expect(result.current.editingCellCoords).toEqual({ row: 0, col: 0 })
      expect(result.current.editText).toBe('A')
    })

    it('handleCellKeyDown with Enter navigates down', () => {
      const tbl = makeTableObj()
      const objects = new Map([['tbl-1', tbl]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const onUpdateTableCell = vi.fn()
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, stageRef, onUpdateTableCell })))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartCellEdit('tbl-1', mockTextNode as never, 0, 0))

      const event = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      act(() => result.current.handleCellKeyDown(event))

      expect(result.current.editingCellCoords).toEqual({ row: 1, col: 0 })
      expect(result.current.editText).toBe('C')
    })

    it('handleCellKeyDown with Escape finishes editing', () => {
      const tbl = makeTableObj()
      const objects = new Map([['tbl-1', tbl]])
      const stageRef = { current: createMockStage() } as unknown as React.RefObject<Konva.Stage | null>
      const onUpdateTableCell = vi.fn()
      const { result } = renderHook(() => useTextEditing(makeDeps({ objects, stageRef, onUpdateTableCell })))

      const mockTextNode = { getClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }) }
      act(() => result.current.handleStartCellEdit('tbl-1', mockTextNode as never, 0, 0))

      const event = { key: 'Escape', shiftKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      act(() => result.current.handleCellKeyDown(event))

      expect(result.current.editingId).toBeNull()
      expect(result.current.editingCellCoords).toBeNull()
    })
  })
})
