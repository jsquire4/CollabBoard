import {
  type TableCell,
  type TableColumn,
  type TableRow,
  type TableData,
  MIN_COL_WIDTH,
  MIN_ROW_HEIGHT,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_HEADER_HEIGHT,
  TABLE_CELL_CHAR_LIMIT,
} from './tableTypes'

/**
 * Factory: create a TableData with `cols` columns and `rows` rows, all with
 * default widths/heights and empty cells.
 */
export function createDefaultTableData(cols: number, rows: number): TableData {
  const columns: TableColumn[] = Array.from({ length: cols }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Column ${i + 1}`,
    width: DEFAULT_COL_WIDTH,
  }))

  const tableRows: TableRow[] = Array.from({ length: rows }, () => {
    const cells: Record<string, TableCell> = {}
    for (const col of columns) {
      cells[col.id] = { text: '' }
    }
    return {
      id: crypto.randomUUID(),
      height: DEFAULT_ROW_HEIGHT,
      cells,
    }
  })

  return { columns, rows: tableRows }
}

/**
 * Insert a new column after `afterIndex`. If afterIndex is undefined, append.
 * Adds an empty cell for the new column in every existing row.
 */
export function addColumn(data: TableData, afterIndex?: number): TableData {
  const insertAt =
    afterIndex === undefined ? data.columns.length : afterIndex + 1

  const newCol: TableColumn = {
    id: crypto.randomUUID(),
    name: `Column ${data.columns.length + 1}`,
    width: DEFAULT_COL_WIDTH,
  }

  const columns = [
    ...data.columns.slice(0, insertAt),
    newCol,
    ...data.columns.slice(insertAt),
  ]

  const rows = data.rows.map((row) => ({
    ...row,
    cells: { ...row.cells, [newCol.id]: { text: '' } },
  }))

  return { ...data, columns, rows }
}

/**
 * Remove the column at `colIndex` and its cells from every row.
 * Guard: returns unchanged data when only 1 column exists.
 */
export function deleteColumn(data: TableData, colIndex: number): TableData {
  if (colIndex < 0 || colIndex >= data.columns.length) return data
  if (data.columns.length <= 1) return data

  const colId = data.columns[colIndex].id
  const columns = data.columns.filter((_, i) => i !== colIndex)

  const rows = data.rows.map((row) => {
    const cells = { ...row.cells }
    delete cells[colId]
    return { ...row, cells }
  })

  return { ...data, columns, rows }
}

/**
 * Insert a new row after `afterIndex`. If afterIndex is undefined, append.
 * Creates empty cells for all current columns.
 */
export function addRow(data: TableData, afterIndex?: number): TableData {
  const cells: Record<string, TableCell> = {}
  for (const col of data.columns) {
    cells[col.id] = { text: '' }
  }

  const newRow: TableRow = {
    id: crypto.randomUUID(),
    height: DEFAULT_ROW_HEIGHT,
    cells,
  }

  const insertAt =
    afterIndex === undefined ? data.rows.length : afterIndex + 1

  const rows = [
    ...data.rows.slice(0, insertAt),
    newRow,
    ...data.rows.slice(insertAt),
  ]

  return { ...data, rows }
}

/**
 * Remove the row at `rowIndex`.
 * Guard: returns unchanged data when only 1 row exists.
 */
export function deleteRow(data: TableData, rowIndex: number): TableData {
  if (rowIndex < 0 || rowIndex >= data.rows.length) return data
  if (data.rows.length <= 1) return data

  const rows = data.rows.filter((_, i) => i !== rowIndex)
  return { ...data, rows }
}

/**
 * Set the width of column `colIndex`, clamped to MIN_COL_WIDTH.
 */
export function resizeColumn(
  data: TableData,
  colIndex: number,
  width: number
): TableData {
  const clampedWidth = Math.max(MIN_COL_WIDTH, Number.isFinite(width) ? width : MIN_COL_WIDTH)
  const columns = data.columns.map((col, i) =>
    i === colIndex ? { ...col, width: clampedWidth } : col
  )
  return { ...data, columns }
}

/**
 * Set the height of row `rowIndex`, clamped to MIN_ROW_HEIGHT.
 */
export function resizeRow(
  data: TableData,
  rowIndex: number,
  height: number
): TableData {
  const clampedHeight = Math.max(MIN_ROW_HEIGHT, Number.isFinite(height) ? height : MIN_ROW_HEIGHT)
  const rows = data.rows.map((row, i) =>
    i === rowIndex ? { ...row, height: clampedHeight } : row
  )
  return { ...data, rows }
}

/**
 * Set the text of a specific cell, truncated to TABLE_CELL_CHAR_LIMIT.
 * Creates the cell if it does not already exist.
 */
export function setCellText(
  data: TableData,
  rowIndex: number,
  colId: string,
  text: string
): TableData {
  const truncated = text.slice(0, TABLE_CELL_CHAR_LIMIT)
  const rows = data.rows.map((row, i) => {
    if (i !== rowIndex) return row
    const existing = row.cells[colId] ?? { text: '' }
    return {
      ...row,
      cells: { ...row.cells, [colId]: { ...existing, text: truncated } },
    }
  })
  return { ...data, rows }
}

/**
 * Merge a partial style (bg_color, text_color, font_style) into a cell.
 * Creates the cell with empty text if it does not already exist.
 */
export function setCellStyle(
  data: TableData,
  rowIndex: number,
  colId: string,
  style: Partial<Omit<TableCell, 'text'>>
): TableData {
  const rows = data.rows.map((row, i) => {
    if (i !== rowIndex) return row
    const existing = row.cells[colId] ?? { text: '' }
    return {
      ...row,
      cells: { ...row.cells, [colId]: { ...existing, ...style } },
    }
  })
  return { ...data, rows }
}

/**
 * Update the header name for the column at `colIndex`.
 */
export function setHeaderName(
  data: TableData,
  colIndex: number,
  name: string
): TableData {
  const columns = data.columns.map((col, i) =>
    i === colIndex ? { ...col, name } : col
  )
  return { ...data, columns }
}

/**
 * Sum of all column widths.
 */
export function getTableWidth(data: TableData): number {
  return data.columns.reduce((sum, col) => sum + col.width, 0)
}

/**
 * DEFAULT_HEADER_HEIGHT plus sum of all row heights.
 */
export function getTableHeight(data: TableData): number {
  return (
    DEFAULT_HEADER_HEIGHT +
    data.rows.reduce((sum, row) => sum + row.height, 0)
  )
}

/**
 * Returns an array of cumulative x positions for each column's left edge.
 * The first value is always 0.
 */
export function getColumnXOffsets(data: TableData): number[] {
  const offsets: number[] = []
  let x = 0
  for (const col of data.columns) {
    offsets.push(x)
    x += col.width
  }
  return offsets
}

/**
 * Returns an array of cumulative y positions for each row's top edge.
 * The first value is DEFAULT_HEADER_HEIGHT (rows start below the header).
 */
export function getRowYOffsets(data: TableData): number[] {
  const offsets: number[] = []
  let y = DEFAULT_HEADER_HEIGHT
  for (const row of data.rows) {
    offsets.push(y)
    y += row.height
  }
  return offsets
}

/**
 * Proportionally resize all column widths and row heights by the given scale
 * factors, clamp each to the respective minimum, and round to integer.
 */
export function distributeScale(
  data: TableData,
  scaleX: number,
  scaleY: number
): TableData {
  const columns = data.columns.map((col) => ({
    ...col,
    width: Math.max(MIN_COL_WIDTH, Math.round(col.width * scaleX)),
  }))

  const rows = data.rows.map((row) => ({
    ...row,
    height: Math.max(MIN_ROW_HEIGHT, Math.round(row.height * scaleY)),
  }))

  return { ...data, columns, rows }
}

/**
 * Parse a JSON string or plain object into a TableData.
 * Returns null for any invalid, null, or undefined input.
 */
export function parseTableData(json: unknown): TableData | null {
  if (json === null || json === undefined) return null

  let obj: unknown
  if (typeof json === 'string') {
    try {
      obj = JSON.parse(json)
    } catch {
      return null
    }
  } else {
    obj = json
  }

  if (typeof obj !== 'object' || obj === null) return null

  const record = obj as Record<string, unknown>

  if (!Array.isArray(record.columns) || !Array.isArray(record.rows)) {
    return null
  }

  // Validate columns
  for (const col of record.columns) {
    if (
      typeof col !== 'object' ||
      col === null ||
      typeof (col as Record<string, unknown>).id !== 'string' ||
      typeof (col as Record<string, unknown>).name !== 'string' ||
      typeof (col as Record<string, unknown>).width !== 'number'
    ) {
      return null
    }
  }

  // Validate rows
  for (const row of record.rows) {
    if (
      typeof row !== 'object' ||
      row === null ||
      typeof (row as Record<string, unknown>).id !== 'string' ||
      typeof (row as Record<string, unknown>).height !== 'number' ||
      typeof (row as Record<string, unknown>).cells !== 'object' ||
      (row as Record<string, unknown>).cells === null
    ) {
      return null
    }
  }

  return obj as TableData
}

/**
 * Rename the column at `colIndex`.
 */
export function setColumnName(data: TableData, colIndex: number, name: string): TableData {
  if (colIndex < 0 || colIndex >= data.columns.length) return data
  const columns = data.columns.map((c, i) => i === colIndex ? { ...c, name } : c)
  return { ...data, columns }
}

/**
 * Serialize a TableData to a JSON string.
 */
export function serializeTableData(data: TableData): string {
  return JSON.stringify(data)
}

/**
 * Navigate to the next cell in the given direction with wrapping behaviour:
 * - right: end of row wraps to first col of next row
 * - left: start of row wraps to last col of prev row
 * - down: returns null at last row
 * - up: returns null at first row
 */
export function nextCell(
  data: TableData,
  rowIndex: number,
  colIndex: number,
  direction: 'right' | 'left' | 'down' | 'up'
): { row: number; col: number } | null {
  const lastRow = data.rows.length - 1
  const lastCol = data.columns.length - 1

  switch (direction) {
    case 'right': {
      if (colIndex < lastCol) {
        return { row: rowIndex, col: colIndex + 1 }
      }
      // wrap to first col of next row
      if (rowIndex < lastRow) {
        return { row: rowIndex + 1, col: 0 }
      }
      return null
    }
    case 'left': {
      if (colIndex > 0) {
        return { row: rowIndex, col: colIndex - 1 }
      }
      // wrap to last col of prev row
      if (rowIndex > 0) {
        return { row: rowIndex - 1, col: lastCol }
      }
      return null
    }
    case 'down': {
      if (rowIndex < lastRow) {
        return { row: rowIndex + 1, col: colIndex }
      }
      return null
    }
    case 'up': {
      if (rowIndex > 0) {
        return { row: rowIndex - 1, col: colIndex }
      }
      return null
    }
  }
}
