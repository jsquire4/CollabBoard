'use client'

import { useCallback } from 'react'
import { BoardObject } from '@/types/board'
import {
  parseTableData,
  serializeTableData,
  addRow,
  deleteRow,
  addColumn,
  deleteColumn,
  setCellText,
  getTableWidth,
  getTableHeight,
} from '@/lib/table/tableUtils'

interface UseTableActionsDeps {
  objects: Map<string, BoardObject>
  selectedIds: Set<string>
  canEdit: boolean
  updateObject: (id: string, updates: Partial<BoardObject>) => void
  undoStack: {
    push: (entry: { type: 'update'; patches: { id: string; before: Partial<BoardObject> }[] }) => void
  }
}

export function useTableActions({
  objects,
  selectedIds,
  canEdit,
  updateObject,
  undoStack,
}: UseTableActionsDeps) {

  /** Get the selected table object (first selected that is type 'table') */
  const getSelectedTable = useCallback((): BoardObject | null => {
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'table') return obj
    }
    return null
  }, [objects, selectedIds])

  const handleAddRow = useCallback(() => {
    if (!canEdit) return
    const obj = getSelectedTable()
    if (!obj) return
    const data = parseTableData(obj.table_data)
    if (!data) return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const newData = addRow(data)
    const newTableData = serializeTableData(newData)
    undoStack.push({ type: 'update', patches: [{ id: obj.id, before }] })
    updateObject(obj.id, { table_data: newTableData, width: getTableWidth(newData), height: getTableHeight(newData) })
  }, [canEdit, getSelectedTable, updateObject, undoStack])

  const handleDeleteRow = useCallback(() => {
    if (!canEdit) return
    const obj = getSelectedTable()
    if (!obj) return
    const data = parseTableData(obj.table_data)
    if (!data) return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const newData = deleteRow(data, data.rows.length - 1)
    if (newData === data) return // min 1 guard triggered
    const newTableData = serializeTableData(newData)
    undoStack.push({ type: 'update', patches: [{ id: obj.id, before }] })
    updateObject(obj.id, { table_data: newTableData, width: getTableWidth(newData), height: getTableHeight(newData) })
  }, [canEdit, getSelectedTable, updateObject, undoStack])

  const handleAddColumn = useCallback(() => {
    if (!canEdit) return
    const obj = getSelectedTable()
    if (!obj) return
    const data = parseTableData(obj.table_data)
    if (!data) return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const newData = addColumn(data)
    const newTableData = serializeTableData(newData)
    undoStack.push({ type: 'update', patches: [{ id: obj.id, before }] })
    updateObject(obj.id, { table_data: newTableData, width: getTableWidth(newData), height: getTableHeight(newData) })
  }, [canEdit, getSelectedTable, updateObject, undoStack])

  const handleDeleteColumn = useCallback(() => {
    if (!canEdit) return
    const obj = getSelectedTable()
    if (!obj) return
    const data = parseTableData(obj.table_data)
    if (!data) return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const newData = deleteColumn(data, data.columns.length - 1)
    if (newData === data) return // min 1 guard triggered
    const newTableData = serializeTableData(newData)
    undoStack.push({ type: 'update', patches: [{ id: obj.id, before }] })
    updateObject(obj.id, { table_data: newTableData, width: getTableWidth(newData), height: getTableHeight(newData) })
  }, [canEdit, getSelectedTable, updateObject, undoStack])

  /** Direct table data update (used by TableShape for resize operations) */
  const handleTableDataChange = useCallback((id: string, tableData: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const data = parseTableData(tableData)
    if (!data) return
    updateObject(id, { table_data: tableData, width: getTableWidth(data), height: getTableHeight(data) })
    undoStack.push({ type: 'update', patches: [{ id, before }] })
  }, [canEdit, objects, updateObject, undoStack])

  /** Update a single cell's text (used by cell editing) */
  const handleCellTextUpdate = useCallback((id: string, rowIndex: number, colIndex: number, text: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return

    const data = parseTableData(obj.table_data)
    if (!data) return

    if (rowIndex < 0 || rowIndex >= data.rows.length) return

    const colId = data.columns[colIndex]?.id
    if (!colId) return

    const before: Partial<BoardObject> = { table_data: obj.table_data }
    const newData = setCellText(data, rowIndex, colId, text)
    updateObject(id, { table_data: serializeTableData(newData) })
    undoStack.push({ type: 'update', patches: [{ id, before }] })
  }, [canEdit, objects, updateObject, undoStack])

  return {
    handleAddRow,
    handleDeleteRow,
    handleAddColumn,
    handleDeleteColumn,
    handleTableDataChange,
    handleCellTextUpdate,
  }
}
