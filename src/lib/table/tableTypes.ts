/** A single cell in the table */
export interface TableCell {
  text: string
  bg_color?: string
  text_color?: string
  font_style?: 'normal' | 'bold' | 'italic' | 'bold italic'
}

/** A column definition */
export interface TableColumn {
  id: string
  name: string
  width: number
}

/** A row with cells keyed by column ID */
export interface TableRow {
  id: string
  height: number
  cells: Record<string, TableCell>
}

/** The full table data structure stored in board_objects.table_data as JSONB */
export interface TableData {
  columns: TableColumn[]
  rows: TableRow[]
  header_bg?: string
  header_text_color?: string
}

// Constants
export const MIN_COL_WIDTH = 40
export const MIN_ROW_HEIGHT = 24
export const DEFAULT_COL_WIDTH = 120
export const DEFAULT_ROW_HEIGHT = 32
export const DEFAULT_HEADER_HEIGHT = 32
export const TABLE_CELL_CHAR_LIMIT = 256
