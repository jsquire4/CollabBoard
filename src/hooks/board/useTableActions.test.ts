import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTableActions } from './useTableActions'
import { makeTable, objectsMap, resetFactory } from '@/test/boardObjectFactory'
import { createDefaultTableData, serializeTableData, parseTableData } from '@/lib/table/tableUtils'
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, DEFAULT_HEADER_HEIGHT } from '@/lib/table/tableTypes'

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    objects: new Map(),
    selectedIds: new Set<string>(),
    canEdit: true,
    updateObject: vi.fn(),
    undoStack: { push: vi.fn() },
    ...overrides,
  }
}

describe('useTableActions', () => {
  beforeEach(() => resetFactory())

  describe('handleAddRow', () => {
    it('adds a row and calls updateObject with new table_data and updated dimensions', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRow())

      expect(deps.updateObject).toHaveBeenCalledTimes(1)
      const [calledId, updates] = deps.updateObject.mock.calls[0]
      expect(calledId).toBe('t1')

      const newData = parseTableData(updates.table_data)
      expect(newData?.rows).toHaveLength(4)

      const expectedWidth = 3 * DEFAULT_COL_WIDTH
      const expectedHeight = DEFAULT_HEADER_HEIGHT + 4 * DEFAULT_ROW_HEIGHT
      expect(updates.width).toBe(expectedWidth)
      expect(updates.height).toBe(expectedHeight)
    })

    it('pushes an undo entry with the before state', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRow())

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 't1', before: { table_data: serialized, width: table.width, height: table.height } }],
      })
    })

    it('is a no-op when canEdit is false', () => {
      const table = makeTable({ id: 't1' })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRow())

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('is a no-op when no table is selected', () => {
      const deps = makeDeps({
        objects: new Map(),
        selectedIds: new Set(),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRow())

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleDeleteRow', () => {
    it('removes the last row and calls updateObject with updated table_data and dimensions', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRow())

      expect(deps.updateObject).toHaveBeenCalledTimes(1)
      const [calledId, updates] = deps.updateObject.mock.calls[0]
      expect(calledId).toBe('t1')

      const newData = parseTableData(updates.table_data)
      expect(newData?.rows).toHaveLength(2)

      const expectedHeight = DEFAULT_HEADER_HEIGHT + 2 * DEFAULT_ROW_HEIGHT
      expect(updates.height).toBe(expectedHeight)
    })

    it('is a no-op when only 1 row exists (min guard)', () => {
      const tableData = createDefaultTableData(3, 1)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRow())

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleAddColumn', () => {
    it('adds a column and calls updateObject with updated width', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumn())

      expect(deps.updateObject).toHaveBeenCalledTimes(1)
      const [calledId, updates] = deps.updateObject.mock.calls[0]
      expect(calledId).toBe('t1')

      const newData = parseTableData(updates.table_data)
      expect(newData?.columns).toHaveLength(4)

      const expectedWidth = 4 * DEFAULT_COL_WIDTH
      expect(updates.width).toBe(expectedWidth)
    })

    it('pushes an undo entry with the before state', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumn())

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 't1', before: { table_data: serialized, width: table.width, height: table.height } }],
      })
    })
  })

  describe('handleDeleteColumn', () => {
    it('removes the last column and calls updateObject with updated table_data', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumn())

      expect(deps.updateObject).toHaveBeenCalledTimes(1)
      const [calledId, updates] = deps.updateObject.mock.calls[0]
      expect(calledId).toBe('t1')

      const newData = parseTableData(updates.table_data)
      expect(newData?.columns).toHaveLength(2)

      const expectedWidth = 2 * DEFAULT_COL_WIDTH
      expect(updates.width).toBe(expectedWidth)
    })

    it('is a no-op when only 1 column exists (min guard)', () => {
      const tableData = createDefaultTableData(1, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumn())

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleCellTextUpdate', () => {
    it('updates cell text and calls updateObject with new table_data', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleCellTextUpdate('t1', 0, 0, 'hello'))

      expect(deps.updateObject).toHaveBeenCalledTimes(1)
      const [calledId, updates] = deps.updateObject.mock.calls[0]
      expect(calledId).toBe('t1')

      const newData = parseTableData(updates.table_data)
      const col0Id = tableData.columns[0].id
      expect(newData?.rows[0].cells[col0Id].text).toBe('hello')
    })

    it('pushes an undo entry with the before table_data', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleCellTextUpdate('t1', 1, 2, 'world'))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 't1', before: { table_data: serialized } }],
      })
    })
  })
})
