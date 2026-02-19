import { memo, useMemo } from 'react'
import { Group, Rect, Text, Line } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd, getOutlineProps, getShadowProps, areShapePropsEqual } from './shapeUtils'
import { parseTableData, getColumnXOffsets, getRowYOffsets, getTableWidth, getTableHeight, resizeColumn, resizeRow, serializeTableData } from '@/lib/table/tableUtils'
import { DEFAULT_HEADER_HEIGHT } from '@/lib/table/tableTypes'

interface TableShapeProps extends ShapeProps {
  onStartCellEdit?: (id: string, textNode: Konva.Text, row: number, col: number) => void
  isEditing?: boolean
  editingCellCoords?: { row: number; col: number } | null
  onTableDataChange?: (id: string, tableData: string) => void
}

const CELL_PAD = 4
const RESIZE_HANDLE_WIDTH = 6
const HEADER_BG = '#F3F4F6'
const HEADER_TEXT_COLOR = '#374151'
const GRID_COLOR = '#E5E7EB'
const CELL_FONT_SIZE = 13
const HEADER_FONT_SIZE = 13

export const TableShape = memo(function TableShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  onDragMove,
  onDragStart,
  editable = true,
  dragBoundFunc,
  isEditing = false,
  editingCellCoords,
  onStartCellEdit,
  onTableDataChange,
}: TableShapeProps) {
  const data = useMemo(() => parseTableData(object.table_data), [object.table_data])

  const colXOffsets = useMemo(() => data ? getColumnXOffsets(data) : [], [data])
  const rowYOffsets = useMemo(() => data ? getRowYOffsets(data) : [], [data])
  const tableWidth = useMemo(() => data ? getTableWidth(data) : object.width, [data, object.width])
  const tableHeight = useMemo(() => data ? getTableHeight(data) : object.height, [data, object.height])

  const handleDragStart = () => onDragStart?.(object.id)
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }
  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(object.id, e.target.x(), e.target.y())
  }
  const handleClick = () => onSelect(object.id)
  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  // Double-click: find which cell was clicked via name-based lookup
  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!onStartCellEdit || !data) return
    const target = e.target
    const name = target.name?.() || ''

    // Cell text nodes are named "cell:row:col"
    if (name.startsWith('cell:')) {
      const parts = name.split(':')
      const row = parseInt(parts[1], 10)
      const col = parseInt(parts[2], 10)
      if (!isNaN(row) && !isNaN(col) && target instanceof Konva.Text) {
        onStartCellEdit(object.id, target, row, col)
        return
      }
    }

    // Header text nodes are named "header:col"
    if (name.startsWith('header:')) {
      // Headers aren't editable via textarea in v1
      return
    }

    // Clicked on a cell background rect named "cellbg:row:col"
    if (name.startsWith('cellbg:')) {
      const parts = name.split(':')
      const row = parseInt(parts[1], 10)
      const col = parseInt(parts[2], 10)
      if (!isNaN(row) && !isNaN(col)) {
        // Find the corresponding text node
        const group = (target.findAncestor('Group') || target.parent) as Konva.Group
        if (group) {
          const textNode = group.findOne(`Text.cell\\:${row}\\:${col}`) as Konva.Text | undefined
          // Fallback: search by name attribute
          const found = textNode || (group.find('Text') as Konva.Text[]).find(
            (n: Konva.Text) => n.name() === `cell:${row}:${col}`
          )
          if (found) {
            onStartCellEdit(object.id, found, row, col)
          }
        }
      }
    }
  }

  // Column resize handlers
  const handleColResizeDragMove = (colIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    // Constrain vertical movement
    e.target.y(0)
  }

  const handleColResizeDragEnd = (colIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    if (!data || !onTableDataChange) return
    const node = e.target
    const dx = node.x() - (colXOffsets[colIndex] + data.columns[colIndex].width - RESIZE_HANDLE_WIDTH / 2)
    const newWidth = data.columns[colIndex].width + dx
    const newData = resizeColumn(data, colIndex, newWidth)
    onTableDataChange(object.id, serializeTableData(newData))
    // Reset handle position
    node.x(colXOffsets[colIndex] + newData.columns[colIndex].width - RESIZE_HANDLE_WIDTH / 2)
    node.y(0)
  }

  // Row resize handlers
  const handleRowResizeDragMove = (rowIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    // Constrain horizontal movement
    e.target.x(0)
  }

  const handleRowResizeDragEnd = (rowIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    if (!data || !onTableDataChange) return
    const node = e.target
    const dy = node.y() - (rowYOffsets[rowIndex] + data.rows[rowIndex].height - RESIZE_HANDLE_WIDTH / 2)
    const newHeight = data.rows[rowIndex].height + dy
    const newData = resizeRow(data, rowIndex, newHeight)
    onTableDataChange(object.id, serializeTableData(newData))
    // Reset handle position
    node.x(0)
    node.y(rowYOffsets[rowIndex] + newData.rows[rowIndex].height - RESIZE_HANDLE_WIDTH / 2)
  }

  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)

  if (!data) {
    // Fallback: render a simple rect if table_data is invalid
    return (
      <Group
        ref={(node) => shapeRef(object.id, node)}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        draggable={editable}
        onClick={handleClick}
        onTap={handleClick}
        opacity={object.opacity ?? 1}
      >
        <Rect
          width={object.width}
          height={object.height}
          fill="#F9FAFB"
          stroke="#D1D5DB"
          strokeWidth={1}
          cornerRadius={4}
        />
        <Text
          x={CELL_PAD}
          y={CELL_PAD}
          width={object.width - CELL_PAD * 2}
          height={object.height - CELL_PAD * 2}
          text="Empty table"
          fontSize={13}
          fill="#9CA3AF"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    )
  }

  const isEditingCell = (row: number, col: number) =>
    isEditing && editingCellCoords?.row === row && editingCellCoords?.col === col

  return (
    <Group
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      rotation={object.rotation}
      draggable={editable}
      dragBoundFunc={dragBoundFunc}
      onClick={handleClick}
      onTap={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      opacity={object.opacity ?? 1}
    >
      {/* Background */}
      <Rect
        width={tableWidth}
        height={tableHeight}
        fill={object.color || '#FFFFFF'}
        cornerRadius={4}
        {...shadow}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
        listening={false}
      />

      {/* Header row background */}
      <Rect
        y={0}
        width={tableWidth}
        height={DEFAULT_HEADER_HEIGHT}
        fill={data.header_bg || HEADER_BG}
        cornerRadius={[4, 4, 0, 0]}
        listening={false}
      />

      {/* Header cells */}
      {data.columns.map((col, colIdx) => (
        <Text
          key={`header-${col.id}`}
          name={`header:${colIdx}`}
          x={colXOffsets[colIdx] + CELL_PAD}
          y={CELL_PAD}
          width={col.width - CELL_PAD * 2}
          height={DEFAULT_HEADER_HEIGHT - CELL_PAD * 2}
          text={col.name}
          fontSize={HEADER_FONT_SIZE}
          fontStyle="bold"
          fill={data.header_text_color || HEADER_TEXT_COLOR}
          align="left"
          verticalAlign="middle"
          wrap="none"
          ellipsis={true}
          listening={true}
          perfectDrawEnabled={false}
          transformsEnabled="position"
        />
      ))}

      {/* Body cells */}
      {data.rows.map((row, rowIdx) =>
        data.columns.map((col, colIdx) => {
          const cell = row.cells[col.id]
          const x = colXOffsets[colIdx]
          const y = rowYOffsets[rowIdx]
          const editing = isEditingCell(rowIdx, colIdx)

          return (
            <Group key={`cell-${row.id}-${col.id}`}>
              {/* Cell background */}
              {cell?.bg_color && (
                <Rect
                  name={`cellbg:${rowIdx}:${colIdx}`}
                  x={x}
                  y={y}
                  width={col.width}
                  height={row.height}
                  fill={cell.bg_color}
                  listening={true}
                />
              )}
              {/* Invisible click target for cells without bg */}
              {!cell?.bg_color && (
                <Rect
                  name={`cellbg:${rowIdx}:${colIdx}`}
                  x={x}
                  y={y}
                  width={col.width}
                  height={row.height}
                  fill="transparent"
                  listening={true}
                />
              )}
              {/* Cell text — hidden when being edited */}
              {!editing && (
                <Text
                  name={`cell:${rowIdx}:${colIdx}`}
                  x={x + CELL_PAD}
                  y={y + CELL_PAD}
                  width={col.width - CELL_PAD * 2}
                  height={row.height - CELL_PAD * 2}
                  text={cell?.text || ''}
                  fontSize={CELL_FONT_SIZE}
                  fontStyle={cell?.font_style || 'normal'}
                  fill={cell?.text_color || '#000000'}
                  align="left"
                  verticalAlign="middle"
                  wrap="none"
                  ellipsis={true}
                  perfectDrawEnabled={false}
                  transformsEnabled="position"
                  listening={true}
                />
              )}
            </Group>
          )
        })
      )}

      {/* Horizontal grid lines (row boundaries) */}
      {/* Header bottom line */}
      <Line
        points={[0, DEFAULT_HEADER_HEIGHT, tableWidth, DEFAULT_HEADER_HEIGHT]}
        stroke={GRID_COLOR}
        strokeWidth={1}
        listening={false}
      />
      {rowYOffsets.map((y, i) => (
        i > 0 ? (
          <Line
            key={`hline-${i}`}
            points={[0, y, tableWidth, y]}
            stroke={GRID_COLOR}
            strokeWidth={1}
            listening={false}
          />
        ) : null
      ))}
      {/* Bottom line */}
      <Line
        points={[0, tableHeight, tableWidth, tableHeight]}
        stroke={GRID_COLOR}
        strokeWidth={1}
        listening={false}
      />

      {/* Vertical grid lines (column boundaries) */}
      {colXOffsets.map((x, i) => (
        i > 0 ? (
          <Line
            key={`vline-${i}`}
            points={[x, 0, x, tableHeight]}
            stroke={GRID_COLOR}
            strokeWidth={1}
            listening={false}
          />
        ) : null
      ))}
      {/* Right edge line */}
      <Line
        points={[tableWidth, 0, tableWidth, tableHeight]}
        stroke={GRID_COLOR}
        strokeWidth={1}
        listening={false}
      />

      {/* Column resize handles — invisible draggable rects */}
      {editable && data.columns.map((col, colIdx) => (
        <Rect
          key={`colresize-${col.id}`}
          x={colXOffsets[colIdx] + col.width - RESIZE_HANDLE_WIDTH / 2}
          y={0}
          width={RESIZE_HANDLE_WIDTH}
          height={tableHeight}
          fill="transparent"
          draggable={true}
          onDragMove={(e) => handleColResizeDragMove(colIdx, e)}
          onDragEnd={(e) => handleColResizeDragEnd(colIdx, e)}
          hitStrokeWidth={8}
          onMouseEnter={(e) => {
            const stage = e.target.getStage()
            if (stage) stage.container().style.cursor = 'col-resize'
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage()
            if (stage) stage.container().style.cursor = 'default'
          }}
        />
      ))}

      {/* Row resize handles — invisible draggable rects */}
      {editable && data.rows.map((row, rowIdx) => (
        <Rect
          key={`rowresize-${row.id}`}
          x={0}
          y={rowYOffsets[rowIdx] + row.height - RESIZE_HANDLE_WIDTH / 2}
          width={tableWidth}
          height={RESIZE_HANDLE_WIDTH}
          fill="transparent"
          draggable={true}
          onDragMove={(e) => handleRowResizeDragMove(rowIdx, e)}
          onDragEnd={(e) => handleRowResizeDragEnd(rowIdx, e)}
          hitStrokeWidth={8}
          onMouseEnter={(e) => {
            const stage = e.target.getStage()
            if (stage) stage.container().style.cursor = 'row-resize'
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage()
            if (stage) stage.container().style.cursor = 'default'
          }}
        />
      ))}
    </Group>
  )
}, areShapePropsEqual)
