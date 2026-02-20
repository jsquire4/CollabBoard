import {
  parseTableData,
  distributeScale,
  serializeTableData,
  getTableWidth,
  getTableHeight,
} from './tableUtils'

export interface TableTransformResult {
  table_data: string
  width: number
  height: number
}

/**
 * Apply a Konva scale transform to table column widths and row heights.
 *
 * Parses `tableData`, distributes the scale factors across all columns
 * (scaleX) and rows (scaleY), then returns the serialized result together
 * with the new total width and height.
 *
 * Returns null when `tableData` cannot be parsed.
 */
export function applyTableTransformScale(
  tableData: string,
  scaleX: number,
  scaleY: number
): TableTransformResult | null {
  const data = parseTableData(tableData)
  if (!data) return null
  const scaled = distributeScale(data, scaleX, scaleY)
  return {
    table_data: serializeTableData(scaled),
    width: getTableWidth(scaled),
    height: getTableHeight(scaled),
  }
}
