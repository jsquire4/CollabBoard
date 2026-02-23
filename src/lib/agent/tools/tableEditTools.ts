/**
 * Tool executors for reading and editing table data.
 */

import {
  parseTableData,
  serializeTableData,
  addRow,
  deleteRow,
  addColumn,
  deleteColumn,
  setCellText,
  setColumnName,
  setTableName,
  getTableWidth,
  getTableHeight,
} from '@/lib/table/tableUtils'
import { plainTextToTipTap } from '@/lib/richText'
import { broadcastChanges } from '@/lib/agent/boardState'
import { advanceClock, updateFields, makeToolDef, getConnectedObjectIds } from './helpers'
import { stampFields } from '@/lib/crdt/merge'
import {
  getTableDataSchema,
  updateTableCellSchema,
  updateTableHeaderSchema,
  addTableRowSchema,
  deleteTableRowSchema,
  addTableColumnSchema,
  deleteTableColumnSchema,
  renameTableSchema,
} from './schemas'
import type { ToolDef } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toHumanReadableTable(data: ReturnType<typeof parseTableData>) {
  if (!data) return null
  const columns = data.columns.map((col, i) => ({ id: col.id, name: col.name, index: i }))
  const rows = data.rows.map((row, rowIndex) => ({
    rowIndex,
    cells: columns.map((col, colIndex) => ({
      colIndex,
      text: row.cells[col.id]?.text ?? '',
    })),
  }))
  return {
    name: data.name ?? undefined,
    columns,
    rows,
  }
}

// ── Tool definitions ───────────────────────────────────────────────────────────

export const tableEditTools: ToolDef[] = [

  makeToolDef(
    'getTableData',
    'Return table columns, rows, and cell text.',
    getTableDataSchema,
    async (ctx, { objectId }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }

      const obj = ctx.state.objects.get(objectId)
      if (!obj) return { error: `Object ${objectId} not found` }
      if (obj.type !== 'table') return { error: `Object ${objectId} is not a table` }

      const data = parseTableData(obj.table_data)
      const readable = toHumanReadableTable(data)
      if (!readable) return { error: 'Invalid table data' }

      return readable
    },
  ),

  makeToolDef(
    'updateTableCell',
    'Update cell text. rowIndex, colIndex 0-based.',
    updateTableCellSchema,
    async (ctx, { objectId, rowIndex, colIndex, text }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }

      const obj = ctx.state.objects.get(objectId)
      if (!obj || obj.type !== 'table') return { error: `Table ${objectId} not found` }

      const data = parseTableData(obj.table_data)
      if (!data) return { error: 'Invalid table data' }
      if (rowIndex < 0 || rowIndex >= data.rows.length) return { error: `Row ${rowIndex} out of range` }
      if (colIndex < 0 || colIndex >= data.columns.length) return { error: `Column ${colIndex} out of range` }

      const colId = data.columns[colIndex].id
      const newData = setCellText(data, rowIndex, colId, text)
      const newTableData = serializeTableData(newData)

      const clock = advanceClock(ctx)
      const clocks = stampFields(['table_data', 'width', 'height'], clock)
      const updates = {
        table_data: newTableData,
        width: getTableWidth(newData),
        height: getTableHeight(newData),
      }
      const result = await updateFields(objectId, ctx.boardId, updates, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id: objectId, ...updates } }])
      return { objectId, rowIndex, colIndex, text }
    },
  ),

  makeToolDef(
    'updateTableHeader',
    'Rename column header. colIndex 0-based.',
    updateTableHeaderSchema,
    async (ctx, { objectId, colIndex, name }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }

      const obj = ctx.state.objects.get(objectId)
      if (!obj || obj.type !== 'table') return { error: `Table ${objectId} not found` }

      const data = parseTableData(obj.table_data)
      if (!data) return { error: 'Invalid table data' }
      if (colIndex < 0 || colIndex >= data.columns.length) return { error: `Column ${colIndex} out of range` }

      const newData = setColumnName(data, colIndex, name)
      const newTableData = serializeTableData(newData)

      const clock = advanceClock(ctx)
      const clocks = stampFields(['table_data'], clock)
      const result = await updateFields(objectId, ctx.boardId, { table_data: newTableData }, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id: objectId, table_data: newTableData } }])
      return { objectId, colIndex, name }
    },
  ),

  makeToolDef(
    'addTableRow',
    'Add row. afterIndex 0-based; omit to append.',
    addTableRowSchema,
    async (ctx, { objectId, afterIndex }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }

      const obj = ctx.state.objects.get(objectId)
      if (!obj || obj.type !== 'table') return { error: `Table ${objectId} not found` }

      const data = parseTableData(obj.table_data)
      if (!data) return { error: 'Invalid table data' }

      const newData = addRow(data, afterIndex)
      const newTableData = serializeTableData(newData)

      const clock = advanceClock(ctx)
      const clocks = stampFields(['table_data', 'width', 'height'], clock)
      const updates = {
        table_data: newTableData,
        width: getTableWidth(newData),
        height: getTableHeight(newData),
      }
      const result = await updateFields(objectId, ctx.boardId, updates, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id: objectId, ...updates } }])
      return { objectId, addedRow: true, newRowCount: newData.rows.length }
    },
  ),

  makeToolDef(
    'deleteTableRow',
    'Delete row. rowIndex 0-based. Min 1 row required.',
    deleteTableRowSchema,
    async (ctx, { objectId, rowIndex }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }

      const obj = ctx.state.objects.get(objectId)
      if (!obj || obj.type !== 'table') return { error: `Table ${objectId} not found` }

      const data = parseTableData(obj.table_data)
      if (!data) return { error: 'Invalid table data' }

      const newData = deleteRow(data, rowIndex)
      if (newData === data) return { error: 'Cannot delete row: table must have at least 1 row' }

      const newTableData = serializeTableData(newData)
      const clock = advanceClock(ctx)
      const clocks = stampFields(['table_data', 'width', 'height'], clock)
      const updates = {
        table_data: newTableData,
        width: getTableWidth(newData),
        height: getTableHeight(newData),
      }
      const result = await updateFields(objectId, ctx.boardId, updates, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id: objectId, ...updates } }])
      return { objectId, deletedRow: rowIndex, newRowCount: newData.rows.length }
    },
  ),

  makeToolDef(
    'addTableColumn',
    'Add column. afterIndex 0-based; omit to append.',
    addTableColumnSchema,
    async (ctx, { objectId, afterIndex }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }

      const obj = ctx.state.objects.get(objectId)
      if (!obj || obj.type !== 'table') return { error: `Table ${objectId} not found` }

      const data = parseTableData(obj.table_data)
      if (!data) return { error: 'Invalid table data' }

      const newData = addColumn(data, afterIndex)
      const newTableData = serializeTableData(newData)

      const clock = advanceClock(ctx)
      const clocks = stampFields(['table_data', 'width', 'height'], clock)
      const updates = {
        table_data: newTableData,
        width: getTableWidth(newData),
        height: getTableHeight(newData),
      }
      const result = await updateFields(objectId, ctx.boardId, updates, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id: objectId, ...updates } }])
      return { objectId, addedColumn: true, newColumnCount: newData.columns.length }
    },
  ),

  makeToolDef(
    'deleteTableColumn',
    'Delete column. colIndex 0-based. Min 1 column required.',
    deleteTableColumnSchema,
    async (ctx, { objectId, colIndex }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }

      const obj = ctx.state.objects.get(objectId)
      if (!obj || obj.type !== 'table') return { error: `Table ${objectId} not found` }

      const data = parseTableData(obj.table_data)
      if (!data) return { error: 'Invalid table data' }

      const newData = deleteColumn(data, colIndex)
      if (newData === data) return { error: 'Cannot delete column: table must have at least 1 column' }

      const newTableData = serializeTableData(newData)
      const clock = advanceClock(ctx)
      const clocks = stampFields(['table_data', 'width', 'height'], clock)
      const updates = {
        table_data: newTableData,
        width: getTableWidth(newData),
        height: getTableHeight(newData),
      }
      const result = await updateFields(objectId, ctx.boardId, updates, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id: objectId, ...updates } }])
      return { objectId, deletedColumn: colIndex, newColumnCount: newData.columns.length }
    },
  ),

  makeToolDef(
    'renameTable',
    'Set or update the display name/title of a table.',
    renameTableSchema,
    async (ctx, { objectId, name }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }

      const obj = ctx.state.objects.get(objectId)
      if (!obj || obj.type !== 'table') return { error: `Table ${objectId} not found` }

      const data = parseTableData(obj.table_data)
      if (!data) return { error: 'Invalid table data' }

      const newData = setTableName(data, name)
      const newTableData = serializeTableData(newData)
      const richText = JSON.stringify(plainTextToTipTap(name))

      const clock = advanceClock(ctx)
      const clocks = stampFields(['table_data', 'rich_text', 'text', 'width', 'height'], clock)
      const updates = {
        table_data: newTableData,
        rich_text: richText,
        text: name,
        width: getTableWidth(newData),
        height: getTableHeight(newData),
      }
      const result = await updateFields(objectId, ctx.boardId, updates, clocks, ctx)
      if (!result.success) return { error: result.error }

      broadcastChanges(ctx.boardId, [{ action: 'update', object: { id: objectId, ...updates } }])
      return { objectId, name }
    },
  ),
]
