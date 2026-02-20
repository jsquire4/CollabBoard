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
  setColumnName,
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

  const handleAddRowAt = useCallback((id: string, beforeIndex: number) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return
    const data = parseTableData(obj.table_data)
    if (!data) return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const newData = addRow(data, beforeIndex - 1)
    const newTableData = serializeTableData(newData)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { table_data: newTableData, width: getTableWidth(newData), height: getTableHeight(newData) })
  }, [canEdit, objects, updateObject, undoStack])

  const handleDeleteRowAt = useCallback((id: string, rowIndex: number) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return
    const data = parseTableData(obj.table_data)
    if (!data) return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const newData = deleteRow(data, rowIndex)
    if (newData === data) return // min 1 guard triggered
    const newTableData = serializeTableData(newData)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { table_data: newTableData, width: getTableWidth(newData), height: getTableHeight(newData) })
  }, [canEdit, objects, updateObject, undoStack])

  const handleAddColumnAt = useCallback((id: string, beforeIndex: number) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return
    const data = parseTableData(obj.table_data)
    if (!data) return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const newData = addColumn(data, beforeIndex - 1)
    const newTableData = serializeTableData(newData)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { table_data: newTableData, width: getTableWidth(newData), height: getTableHeight(newData) })
  }, [canEdit, objects, updateObject, undoStack])

  const handleDeleteColumnAt = useCallback((id: string, colIndex: number) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return
    const data = parseTableData(obj.table_data)
    if (!data) return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const newData = deleteColumn(data, colIndex)
    if (newData === data) return // min 1 guard triggered
    const newTableData = serializeTableData(newData)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { table_data: newTableData, width: getTableWidth(newData), height: getTableHeight(newData) })
  }, [canEdit, objects, updateObject, undoStack])

  /** Direct table data update (used by TableShape for resize operations) */
  const handleTableDataChange = useCallback((id: string, tableData: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return

    const before: Partial<BoardObject> = { table_data: obj.table_data, width: obj.width, height: obj.height }
    const data = parseTableData(tableData)
    if (!data) return
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { table_data: tableData, width: getTableWidth(data), height: getTableHeight(data) })
  }, [canEdit, objects, updateObject, undoStack])

  /** Update header background and/or text color for the selected table */
  const handleTableHeaderStyleChange = useCallback((updates: { header_bg?: string; header_text_color?: string }) => {
    if (!canEdit) return
    const obj = getSelectedTable()
    if (!obj) return
    const data = parseTableData(obj.table_data)
    if (!data) return
    const before: Partial<BoardObject> = { table_data: obj.table_data }
    const newData = { ...data, ...updates }
    undoStack.push({ type: 'update', patches: [{ id: obj.id, before }] })
    updateObject(obj.id, { table_data: serializeTableData(newData) })
  }, [canEdit, getSelectedTable, updateObject, undoStack])

  /** Update a single cell's text (used by cell editing). rowIndex === -1 means header column name. */
  const handleCellTextUpdate = useCallback((id: string, rowIndex: number, colIndex: number, text: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj || obj.type !== 'table') return

    const data = parseTableData(obj.table_data)
    if (!data) return

    if (rowIndex === -1) {
      // Editing a column header name
      if (colIndex < 0 || colIndex >= data.columns.length) return
      const before: Partial<BoardObject> = { table_data: obj.table_data }
      const newData = setColumnName(data, colIndex, text)
      undoStack.push({ type: 'update', patches: [{ id, before }] })
      updateObject(id, { table_data: serializeTableData(newData) })
      return
    }

    if (rowIndex < 0 || rowIndex >= data.rows.length) return

    const colId = data.columns[colIndex]?.id
    if (!colId) return

    const before: Partial<BoardObject> = { table_data: obj.table_data }
    const newData = setCellText(data, rowIndex, colId, text)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { table_data: serializeTableData(newData) })
  }, [canEdit, objects, updateObject, undoStack])

  return {
    handleAddRow,
    handleDeleteRow,
    handleAddColumn,
    handleDeleteColumn,
    handleAddRowAt,
    handleDeleteRowAt,
    handleAddColumnAt,
    handleDeleteColumnAt,
    handleTableDataChange,
    handleCellTextUpdate,
    handleTableHeaderStyleChange,
  }
}
