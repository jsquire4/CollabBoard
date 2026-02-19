import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStyleActions } from './useStyleActions'
import { useTableActions } from './useTableActions'
import { makeTable, objectsMap, resetFactory } from '@/test/boardObjectFactory'
import { parseTableData } from '@/lib/table/tableUtils'
import { handleShapeTransformEnd } from '@/components/board/shapeUtils'

describe('useTableIntegration', () => {
  beforeEach(() => resetFactory())

  it('table object snapshot preserves table_data for undo', () => {
    const table = makeTable({ id: 'tbl-1' })
    // Verify the factory creates proper table_data
    expect(table.table_data).toBeDefined()
    expect(table.type).toBe('table')
    const parsed = JSON.parse(table.table_data!)
    expect(parsed.columns).toHaveLength(3)
    expect(parsed.rows).toHaveLength(3)
  })

  it('table object spread preserves table_data for duplication', () => {
    const table = makeTable({ id: 'tbl-1' })
    const duplicate = { ...table, id: 'tbl-2', x: table.x + 20, y: table.y + 20 }
    expect(duplicate.table_data).toBe(table.table_data)
    expect(duplicate.id).not.toBe(table.id)
  })

  it('useStyleActions.handleColorChange works on table objects', () => {
    const table = makeTable({ id: 'tbl-1', color: '#FFFFFF' })
    const objects = objectsMap(table)
    const selectedIds = new Set(['tbl-1'])
    const updateObject = vi.fn()
    const undoStack = { push: vi.fn() }

    const { result } = renderHook(() => useStyleActions({
      objects, selectedIds, canEdit: true, updateObject,
      deleteObject: vi.fn(), getDescendants: vi.fn(() => []),
      undoStack, pushRecentColor: vi.fn(),
    }))

    act(() => result.current.handleColorChange('#FF0000'))

    expect(updateObject).toHaveBeenCalledWith('tbl-1', { color: '#FF0000' })
    expect(undoStack.push).toHaveBeenCalledWith({
      type: 'update',
      patches: [{ id: 'tbl-1', before: { color: '#FFFFFF' } }],
    })
  })

  it('useStyleActions.handleOpacityChange works on table objects', () => {
    const table = makeTable({ id: 'tbl-1' })
    const objects = objectsMap(table)
    const selectedIds = new Set(['tbl-1'])
    const updateObject = vi.fn()
    const undoStack = { push: vi.fn() }

    const { result } = renderHook(() => useStyleActions({
      objects, selectedIds, canEdit: true, updateObject,
      deleteObject: vi.fn(), getDescendants: vi.fn(() => []),
      undoStack, pushRecentColor: vi.fn(),
    }))

    act(() => result.current.handleOpacityChange(0.5))

    expect(updateObject).toHaveBeenCalledWith('tbl-1', { opacity: 0.5 })
  })

  it('handleShapeTransformEnd distributes scale to table columns and rows', () => {
    const tableData = JSON.stringify({
      columns: [
        { id: 'c1', name: 'A', width: 120 },
        { id: 'c2', name: 'B', width: 120 },
      ],
      rows: [
        { id: 'r1', height: 32, cells: { c1: { text: '' }, c2: { text: '' } } },
      ],
    })
    const table = makeTable({ id: 'tbl-1', width: 240, height: 64, table_data: tableData })
    const onTransformEnd = vi.fn()

    const scaleX = vi.fn((v?: number) => (v === undefined ? 1.5 : undefined))
    const scaleY = vi.fn((v?: number) => (v === undefined ? 2 : undefined))
    const mockNode = {
      scaleX,
      scaleY,
      x: vi.fn(() => 100),
      y: vi.fn(() => 200),
      rotation: vi.fn(() => 0),
    }
    const e = { target: mockNode } as unknown as Parameters<typeof handleShapeTransformEnd>[0]
    handleShapeTransformEnd(e, table, onTransformEnd)

    const updates = onTransformEnd.mock.calls[0][1]
    expect(updates.table_data).toBeDefined()
    const scaled = JSON.parse(updates.table_data as string)
    // 120 * 1.5 = 180
    expect(scaled.columns[0].width).toBe(180)
    // 32 * 2 = 64
    expect(scaled.rows[0].height).toBe(64)
  })

  it('add then delete row returns to original row count', () => {
    const table = makeTable({ id: 'tbl-1' })
    const objects = objectsMap(table)
    const selectedIds = new Set(['tbl-1'])
    const updateObject = vi.fn()
    const undoStack = { push: vi.fn() }

    const { result } = renderHook(() => useTableActions({
      objects, selectedIds, canEdit: true, updateObject, undoStack,
    }))

    // Add row
    act(() => result.current.handleAddRow())
    expect(updateObject).toHaveBeenCalledTimes(1)
    const addCall = updateObject.mock.calls[0][1]
    const afterAdd = parseTableData(addCall.table_data)
    expect(afterAdd!.rows).toHaveLength(4) // was 3, now 4

    // Update objects map with the new state
    const updatedTable = { ...table, ...addCall }
    const updatedObjects = objectsMap(updatedTable)

    // Re-render with updated objects
    const updateObject2 = vi.fn()
    const { result: result2 } = renderHook(() => useTableActions({
      objects: updatedObjects, selectedIds, canEdit: true, updateObject: updateObject2, undoStack,
    }))

    act(() => result2.current.handleDeleteRow())
    // It should delete the last row, going back to 3
    expect(updateObject2).toHaveBeenCalledTimes(1)
    const deleteCall = updateObject2.mock.calls[0][1]
    const afterDelete = parseTableData(deleteCall.table_data)
    expect(afterDelete!.rows).toHaveLength(3)
  })
})
