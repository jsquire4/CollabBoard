import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_COL_WIDTH,
  DEFAULT_HEADER_HEIGHT,
  DEFAULT_ROW_HEIGHT,
  MIN_COL_WIDTH,
  MIN_ROW_HEIGHT,
  TABLE_CELL_CHAR_LIMIT,
} from './tableTypes'
import {
  addColumn,
  addRow,
  createDefaultTableData,
  deleteColumn,
  deleteRow,
  distributeScale,
  getColumnXOffsets,
  getRowYOffsets,
  getTableHeight,
  getTableWidth,
  nextCell,
  parseTableData,
  resizeColumn,
  resizeRow,
  serializeTableData,
  setCellStyle,
  setCellText,
  setHeaderName,
} from './tableUtils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uuidCounter = 0

function mockUUID() {
  uuidCounter = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => `uuid-${++uuidCounter}` as ReturnType<typeof crypto.randomUUID>
  )
}

function restoreUUID() {
  vi.restoreAllMocks()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tableUtils', () => {
  describe('createDefaultTableData', () => {
    beforeEach(mockUUID)
    afterEach(restoreUUID)

    it('creates the correct number of columns and rows', () => {
      const data = createDefaultTableData(3, 2)
      expect(data.columns).toHaveLength(3)
      expect(data.rows).toHaveLength(2)
    })

    it('generates unique IDs for columns and rows', () => {
      const data = createDefaultTableData(2, 2)
      const colIds = data.columns.map((c) => c.id)
      const rowIds = data.rows.map((r) => r.id)
      const allIds = [...colIds, ...rowIds]
      const unique = new Set(allIds)
      expect(unique.size).toBe(allIds.length)
    })

    it('each row has a cell for every column', () => {
      const data = createDefaultTableData(3, 2)
      for (const row of data.rows) {
        for (const col of data.columns) {
          expect(row.cells[col.id]).toBeDefined()
          expect(row.cells[col.id].text).toBe('')
        }
      }
    })

    it('uses default widths and heights', () => {
      const data = createDefaultTableData(2, 2)
      for (const col of data.columns) {
        expect(col.width).toBe(DEFAULT_COL_WIDTH)
      }
      for (const row of data.rows) {
        expect(row.height).toBe(DEFAULT_ROW_HEIGHT)
      }
    })
  })

  // -------------------------------------------------------------------------

  describe('addColumn', () => {
    it('appends a column when afterIndex is undefined', () => {
      const data = createDefaultTableData(2, 1)
      const next = addColumn(data)
      expect(next.columns).toHaveLength(3)
      expect(next.columns[2].width).toBe(DEFAULT_COL_WIDTH)
    })

    it('inserts a column after the given index', () => {
      const data = createDefaultTableData(3, 1)
      const originalSecondId = data.columns[1].id
      const next = addColumn(data, 0)
      // New column is now at index 1; original second is at index 2
      expect(next.columns[2].id).toBe(originalSecondId)
    })

    it('adds an empty cell for the new column in all rows', () => {
      const data = createDefaultTableData(2, 3)
      const next = addColumn(data)
      const newColId = next.columns[2].id
      for (const row of next.rows) {
        expect(row.cells[newColId]).toEqual({ text: '' })
      }
    })

    it('preserves existing cells when inserting', () => {
      const data = createDefaultTableData(2, 1)
      const colId = data.columns[0].id
      const populated = setCellText(data, 0, colId, 'hello')
      const next = addColumn(populated, 0)
      expect(next.rows[0].cells[colId].text).toBe('hello')
    })
  })

  // -------------------------------------------------------------------------

  describe('deleteColumn', () => {
    it('removes the column and its cells from all rows', () => {
      const data = createDefaultTableData(3, 2)
      const removedId = data.columns[1].id
      const next = deleteColumn(data, 1)
      expect(next.columns).toHaveLength(2)
      expect(next.columns.find((c) => c.id === removedId)).toBeUndefined()
      for (const row of next.rows) {
        expect(row.cells[removedId]).toBeUndefined()
      }
    })

    it('returns unchanged data when only 1 column exists', () => {
      const data = createDefaultTableData(1, 2)
      const next = deleteColumn(data, 0)
      expect(next).toBe(data)
    })

    it('maintains column order after deletion', () => {
      const data = createDefaultTableData(3, 1)
      const [first, , third] = data.columns.map((c) => c.id)
      const next = deleteColumn(data, 1)
      expect(next.columns[0].id).toBe(first)
      expect(next.columns[1].id).toBe(third)
    })
  })

  // -------------------------------------------------------------------------

  describe('addRow', () => {
    it('appends a row when afterIndex is undefined', () => {
      const data = createDefaultTableData(2, 2)
      const next = addRow(data)
      expect(next.rows).toHaveLength(3)
    })

    it('inserts a row after the given index', () => {
      const data = createDefaultTableData(2, 3)
      const originalSecondId = data.rows[1].id
      const next = addRow(data, 0)
      expect(next.rows[2].id).toBe(originalSecondId)
    })

    it('new row has cells for all current columns', () => {
      const data = createDefaultTableData(3, 1)
      const next = addRow(data)
      const newRow = next.rows[1]
      for (const col of data.columns) {
        expect(newRow.cells[col.id]).toEqual({ text: '' })
      }
    })
  })

  // -------------------------------------------------------------------------

  describe('deleteRow', () => {
    it('removes the row at the given index', () => {
      const data = createDefaultTableData(2, 3)
      const removedId = data.rows[1].id
      const next = deleteRow(data, 1)
      expect(next.rows).toHaveLength(2)
      expect(next.rows.find((r) => r.id === removedId)).toBeUndefined()
    })

    it('returns unchanged data when only 1 row exists', () => {
      const data = createDefaultTableData(2, 1)
      const next = deleteRow(data, 0)
      expect(next).toBe(data)
    })
  })

  // -------------------------------------------------------------------------

  describe('resizeColumn', () => {
    it('sets the column width to the provided value', () => {
      const data = createDefaultTableData(2, 1)
      const next = resizeColumn(data, 0, 200)
      expect(next.columns[0].width).toBe(200)
    })

    it('clamps width to MIN_COL_WIDTH', () => {
      const data = createDefaultTableData(2, 1)
      const next = resizeColumn(data, 0, 5)
      expect(next.columns[0].width).toBe(MIN_COL_WIDTH)
    })
  })

  // -------------------------------------------------------------------------

  describe('resizeRow', () => {
    it('sets the row height to the provided value', () => {
      const data = createDefaultTableData(2, 2)
      const next = resizeRow(data, 0, 80)
      expect(next.rows[0].height).toBe(80)
    })

    it('clamps height to MIN_ROW_HEIGHT', () => {
      const data = createDefaultTableData(2, 2)
      const next = resizeRow(data, 0, 4)
      expect(next.rows[0].height).toBe(MIN_ROW_HEIGHT)
    })
  })

  // -------------------------------------------------------------------------

  describe('setCellText', () => {
    it('sets text on an existing cell', () => {
      const data = createDefaultTableData(2, 2)
      const colId = data.columns[0].id
      const next = setCellText(data, 0, colId, 'hello')
      expect(next.rows[0].cells[colId].text).toBe('hello')
    })

    it('truncates text to TABLE_CELL_CHAR_LIMIT', () => {
      const data = createDefaultTableData(1, 1)
      const colId = data.columns[0].id
      const longText = 'a'.repeat(TABLE_CELL_CHAR_LIMIT + 50)
      const next = setCellText(data, 0, colId, longText)
      expect(next.rows[0].cells[colId].text).toHaveLength(TABLE_CELL_CHAR_LIMIT)
    })

    it('creates the cell if it is missing', () => {
      const data = createDefaultTableData(1, 1)
      // Delete the cell manually by creating a row without it
      const colId = data.columns[0].id
      const stripped = {
        ...data,
        rows: [{ ...data.rows[0], cells: {} }],
      }
      const next = setCellText(stripped, 0, colId, 'new')
      expect(next.rows[0].cells[colId]).toEqual({ text: 'new' })
    })
  })

  // -------------------------------------------------------------------------

  describe('setCellStyle', () => {
    it('merges bg_color into an existing cell without losing other properties', () => {
      const data = createDefaultTableData(2, 1)
      const colId = data.columns[0].id
      const withText = setCellText(data, 0, colId, 'content')
      const next = setCellStyle(withText, 0, colId, { bg_color: '#ff0000' })
      expect(next.rows[0].cells[colId].bg_color).toBe('#ff0000')
      expect(next.rows[0].cells[colId].text).toBe('content')
    })
  })

  // -------------------------------------------------------------------------

  describe('setHeaderName', () => {
    it('updates the name of the specified column', () => {
      const data = createDefaultTableData(3, 1)
      const next = setHeaderName(data, 1, 'Status')
      expect(next.columns[1].name).toBe('Status')
    })

    it('only changes the targeted column', () => {
      const data = createDefaultTableData(3, 1)
      const originalFirst = data.columns[0].name
      const next = setHeaderName(data, 2, 'Updated')
      expect(next.columns[0].name).toBe(originalFirst)
    })
  })

  // -------------------------------------------------------------------------

  describe('getTableWidth / getTableHeight', () => {
    it('sums all column widths', () => {
      const data = createDefaultTableData(3, 1)
      // Resize columns to known values
      let d = resizeColumn(data, 0, 100)
      d = resizeColumn(d, 1, 150)
      d = resizeColumn(d, 2, 200)
      expect(getTableWidth(d)).toBe(450)
    })

    it('returns DEFAULT_HEADER_HEIGHT plus sum of row heights', () => {
      const data = createDefaultTableData(1, 2)
      let d = resizeRow(data, 0, 40)
      d = resizeRow(d, 1, 60)
      expect(getTableHeight(d)).toBe(DEFAULT_HEADER_HEIGHT + 40 + 60)
    })
  })

  // -------------------------------------------------------------------------

  describe('getColumnXOffsets / getRowYOffsets', () => {
    it('returns cumulative x offsets starting at 0', () => {
      const data = createDefaultTableData(3, 1)
      let d = resizeColumn(data, 0, 100)
      d = resizeColumn(d, 1, 150)
      d = resizeColumn(d, 2, 200)
      expect(getColumnXOffsets(d)).toEqual([0, 100, 250])
    })

    it('returns cumulative y offsets starting at DEFAULT_HEADER_HEIGHT', () => {
      const data = createDefaultTableData(1, 3)
      let d = resizeRow(data, 0, 40)
      d = resizeRow(d, 1, 60)
      d = resizeRow(d, 2, 80)
      expect(getRowYOffsets(d)).toEqual([
        DEFAULT_HEADER_HEIGHT,
        DEFAULT_HEADER_HEIGHT + 40,
        DEFAULT_HEADER_HEIGHT + 40 + 60,
      ])
    })
  })

  // -------------------------------------------------------------------------

  describe('distributeScale', () => {
    it('scales column widths and row heights proportionally', () => {
      const data = createDefaultTableData(2, 2)
      // columns are 120 each, rows are 32 each
      const next = distributeScale(data, 2, 3)
      for (const col of next.columns) {
        expect(col.width).toBe(240)
      }
      for (const row of next.rows) {
        expect(row.height).toBe(96)
      }
    })

    it('clamps scaled values to their minimums', () => {
      const data = createDefaultTableData(2, 2)
      const next = distributeScale(data, 0.01, 0.01)
      for (const col of next.columns) {
        expect(col.width).toBe(MIN_COL_WIDTH)
      }
      for (const row of next.rows) {
        expect(row.height).toBe(MIN_ROW_HEIGHT)
      }
    })

    it('rounds scaled values to integers', () => {
      const data = createDefaultTableData(1, 1)
      // 120 * 1.5 = 180 (exact), but use a scale that produces a fraction
      // 120 * 1.333 = 159.96 → rounds to 160
      const next = distributeScale(data, 1.333, 1.333)
      expect(Number.isInteger(next.columns[0].width)).toBe(true)
      expect(Number.isInteger(next.rows[0].height)).toBe(true)
    })
  })

  // -------------------------------------------------------------------------

  describe('parseTableData / serializeTableData', () => {
    it('round-trips data through serialize and parse', () => {
      const data = createDefaultTableData(2, 2)
      const json = serializeTableData(data)
      const parsed = parseTableData(json)
      expect(parsed).toEqual(data)
    })

    it('returns null for invalid JSON strings', () => {
      expect(parseTableData('not valid json{')).toBeNull()
    })

    it('returns null for null or undefined input', () => {
      expect(parseTableData(null)).toBeNull()
      expect(parseTableData(undefined)).toBeNull()
    })
  })

  // -------------------------------------------------------------------------

  describe('nextCell', () => {
    it('moves right and wraps to the first col of the next row at end of row', () => {
      const data = createDefaultTableData(3, 3)
      // At last column of row 0 → should go to row 1, col 0
      expect(nextCell(data, 0, 2, 'right')).toEqual({ row: 1, col: 0 })
    })

    it('moves left and wraps to the last col of the previous row at start of row', () => {
      const data = createDefaultTableData(3, 3)
      // At first column of row 1 → should go to row 0, last col
      expect(nextCell(data, 1, 0, 'left')).toEqual({ row: 0, col: 2 })
    })

    it('moves down normally within bounds', () => {
      const data = createDefaultTableData(3, 3)
      expect(nextCell(data, 0, 1, 'down')).toEqual({ row: 1, col: 1 })
    })

    it('moves up normally within bounds', () => {
      const data = createDefaultTableData(3, 3)
      expect(nextCell(data, 2, 1, 'up')).toEqual({ row: 1, col: 1 })
    })

    it('returns null at the boundary in the navigation direction', () => {
      const data = createDefaultTableData(3, 3)
      // Down at last row
      expect(nextCell(data, 2, 0, 'down')).toBeNull()
      // Up at first row
      expect(nextCell(data, 0, 0, 'up')).toBeNull()
      // Right at last col of last row
      expect(nextCell(data, 2, 2, 'right')).toBeNull()
      // Left at first col of first row
      expect(nextCell(data, 0, 0, 'left')).toBeNull()
    })
  })
})
