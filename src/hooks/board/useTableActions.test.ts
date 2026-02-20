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

  describe('handleAddRowAt', () => {
    it('inserts a row before the given index', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRowAt('t1', 1))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.rows).toHaveLength(4)
      // Original row 1 should now be at index 2
      expect(newData?.rows[1].id).not.toBe(tableData.rows[1].id)
      expect(newData?.rows[2].id).toBe(tableData.rows[1].id)
    })

    it('prepends when beforeIndex is 0', () => {
      const tableData = createDefaultTableData(3, 2)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRowAt('t1', 0))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.rows).toHaveLength(3)
      // Original row 0 should now be at index 1
      expect(newData?.rows[1].id).toBe(tableData.rows[0].id)
    })

    it('pushes an undo entry', () => {
      const tableData = createDefaultTableData(3, 2)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRowAt('t1', 1))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 't1', before: { table_data: serialized, width: table.width, height: table.height } }],
      })
    })

    it('appends when beforeIndex equals row count', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRowAt('t1', 3))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.rows).toHaveLength(4)
      // Original rows 0-2 are undisturbed
      expect(newData?.rows[0].id).toBe(tableData.rows[0].id)
      expect(newData?.rows[2].id).toBe(tableData.rows[2].id)
    })

    it('updates width and height in updateObject call', () => {
      const tableData = createDefaultTableData(3, 2)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRowAt('t1', 1))

      const [, updates] = deps.updateObject.mock.calls[0]
      const expectedWidth = 3 * DEFAULT_COL_WIDTH
      const expectedHeight = DEFAULT_HEADER_HEIGHT + 3 * DEFAULT_ROW_HEIGHT
      expect(updates.width).toBe(expectedWidth)
      expect(updates.height).toBe(expectedHeight)
    })

    it('is a no-op when canEdit is false', () => {
      const table = makeTable({ id: 't1' })
      const deps = makeDeps({ canEdit: false, objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRowAt('t1', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
    })

    it('is a no-op when the id is not found in objects', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddRowAt('nonexistent', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })
  })

  describe('handleDeleteRowAt', () => {
    it('removes the row at the given index', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRowAt('t1', 1))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.rows).toHaveLength(2)
      expect(newData?.rows.some(r => r.id === tableData.rows[1].id)).toBe(false)
    })

    it('is a no-op when only 1 row exists (min guard)', () => {
      const tableData = createDefaultTableData(3, 1)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRowAt('t1', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('removes the last row', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRowAt('t1', 2))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.rows).toHaveLength(2)
      expect(newData?.rows.some(r => r.id === tableData.rows[2].id)).toBe(false)
      expect(updates.height).toBe(DEFAULT_HEADER_HEIGHT + 2 * DEFAULT_ROW_HEIGHT)
    })

    it('updates width and height in updateObject call', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRowAt('t1', 0))

      const [, updates] = deps.updateObject.mock.calls[0]
      expect(updates.width).toBe(3 * DEFAULT_COL_WIDTH)
      expect(updates.height).toBe(DEFAULT_HEADER_HEIGHT + 2 * DEFAULT_ROW_HEIGHT)
    })

    it('is a no-op when canEdit is false', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ canEdit: false, objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRowAt('t1', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
    })

    it('is a no-op when the id is not found in objects', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRowAt('nonexistent', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('pushes an undo entry', () => {
      const tableData = createDefaultTableData(3, 2)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteRowAt('t1', 0))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 't1', before: { table_data: serialized, width: table.width, height: table.height } }],
      })
    })
  })

  describe('handleAddColumnAt', () => {
    it('inserts a column before the given index', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumnAt('t1', 1))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.columns).toHaveLength(4)
      // Original col 1 should now be at index 2
      expect(newData?.columns[2].id).toBe(tableData.columns[1].id)
    })

    it('prepends when beforeIndex is 0', () => {
      const tableData = createDefaultTableData(2, 2)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumnAt('t1', 0))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.columns).toHaveLength(3)
      expect(newData?.columns[1].id).toBe(tableData.columns[0].id)
    })

    it('appends when beforeIndex equals column count', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumnAt('t1', 3))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.columns).toHaveLength(4)
      expect(newData?.columns[0].id).toBe(tableData.columns[0].id)
      expect(newData?.columns[2].id).toBe(tableData.columns[2].id)
    })

    it('updates width and height in updateObject call', () => {
      const tableData = createDefaultTableData(2, 2)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumnAt('t1', 1))

      const [, updates] = deps.updateObject.mock.calls[0]
      expect(updates.width).toBe(3 * DEFAULT_COL_WIDTH)
      expect(updates.height).toBe(DEFAULT_HEADER_HEIGHT + 2 * DEFAULT_ROW_HEIGHT)
    })

    it('is a no-op when canEdit is false', () => {
      const table = makeTable({ id: 't1' })
      const deps = makeDeps({ canEdit: false, objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumnAt('t1', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
    })

    it('is a no-op when the id is not found in objects', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumnAt('nonexistent', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('pushes an undo entry', () => {
      const tableData = createDefaultTableData(2, 2)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleAddColumnAt('t1', 0))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 't1', before: { table_data: serialized, width: table.width, height: table.height } }],
      })
    })
  })

  describe('handleDeleteColumnAt', () => {
    it('removes the column at the given index', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumnAt('t1', 0))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.columns).toHaveLength(2)
      expect(newData?.columns.some(c => c.id === tableData.columns[0].id)).toBe(false)
    })

    it('is a no-op when only 1 column exists (min guard)', () => {
      const tableData = createDefaultTableData(1, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumnAt('t1', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('removes the last column', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumnAt('t1', 2))

      const [, updates] = deps.updateObject.mock.calls[0]
      const newData = parseTableData(updates.table_data)
      expect(newData?.columns).toHaveLength(2)
      expect(newData?.columns.some(c => c.id === tableData.columns[2].id)).toBe(false)
      expect(updates.width).toBe(2 * DEFAULT_COL_WIDTH)
    })

    it('updates width and height in updateObject call', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumnAt('t1', 1))

      const [, updates] = deps.updateObject.mock.calls[0]
      expect(updates.width).toBe(2 * DEFAULT_COL_WIDTH)
      expect(updates.height).toBe(DEFAULT_HEADER_HEIGHT + 3 * DEFAULT_ROW_HEIGHT)
    })

    it('is a no-op when canEdit is false', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ canEdit: false, objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumnAt('t1', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
    })

    it('is a no-op when the id is not found in objects', () => {
      const deps = makeDeps({ objects: new Map() })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumnAt('nonexistent', 0))
      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('pushes an undo entry', () => {
      const tableData = createDefaultTableData(2, 2)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({ objects: objectsMap(table) })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleDeleteColumnAt('t1', 1))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 't1', before: { table_data: serialized, width: table.width, height: table.height } }],
      })
    })
  })

  describe('handleTableDataChange', () => {
    it('calls updateObject with the new table_data and computed width/height, and pushes undo entry', () => {
      const originalTableData = createDefaultTableData(3, 3)
      const originalSerialized = serializeTableData(originalTableData)
      const table = makeTable({ id: 't1', table_data: originalSerialized })
      const deps = makeDeps({
        objects: objectsMap(table),
        selectedIds: new Set(['t1']),
      })
      const { result } = renderHook(() => useTableActions(deps))

      // Build new table data with an extra row to pass in as the updated state
      const newTableData = createDefaultTableData(3, 4)
      const newSerialized = serializeTableData(newTableData)
      act(() => result.current.handleTableDataChange('t1', newSerialized))

      expect(deps.updateObject).toHaveBeenCalledTimes(1)
      const [calledId, updates] = deps.updateObject.mock.calls[0]
      expect(calledId).toBe('t1')
      expect(updates.table_data).toBe(newSerialized)

      const expectedWidth = 3 * DEFAULT_COL_WIDTH
      const expectedHeight = DEFAULT_HEADER_HEIGHT + 4 * DEFAULT_ROW_HEIGHT
      expect(updates.width).toBe(expectedWidth)
      expect(updates.height).toBe(expectedHeight)

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 't1', before: { table_data: originalSerialized, width: table.width, height: table.height } }],
      })
    })

    it('is a no-op when canEdit is false', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const table = makeTable({ id: 't1', table_data: serialized })
      const deps = makeDeps({
        canEdit: false,
        objects: objectsMap(table),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleTableDataChange('t1', serialized))

      expect(deps.updateObject).not.toHaveBeenCalled()
      expect(deps.undoStack.push).not.toHaveBeenCalled()
    })

    it('is a no-op when the id is not found in objects', () => {
      const tableData = createDefaultTableData(3, 3)
      const serialized = serializeTableData(tableData)
      const deps = makeDeps({
        objects: new Map(),
        selectedIds: new Set(),
      })
      const { result } = renderHook(() => useTableActions(deps))
      act(() => result.current.handleTableDataChange('nonexistent', serialized))

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
