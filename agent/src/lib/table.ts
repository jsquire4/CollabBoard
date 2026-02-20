/**
 * Table utilities — inlined from src/lib/table/tableUtils.ts.
 * Only the subset needed by the agent (create + serialize).
 */

import { randomUUID } from 'crypto'
import type { TableData, TableColumn, TableRow, TableCell } from '../types.js'

const DEFAULT_COL_WIDTH = 120
const DEFAULT_ROW_HEIGHT = 32

export function createDefaultTableData(cols: number, rows: number): TableData {
  const columns: TableColumn[] = Array.from({ length: cols }, (_, i) => ({
    id: randomUUID(),
    name: `Column ${i + 1}`,
    width: DEFAULT_COL_WIDTH,
  }))

  const tableRows: TableRow[] = Array.from({ length: rows }, () => {
    const cells: Record<string, TableCell> = {}
    for (const col of columns) {
      cells[col.id] = { text: '' }
    }
    return {
      id: randomUUID(),
      height: DEFAULT_ROW_HEIGHT,
      cells,
    }
  })

  return { columns, rows: tableRows }
}

export function serializeTableData(data: TableData): string {
  return JSON.stringify(data)
}
