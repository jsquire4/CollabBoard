import { memo, useMemo, useRef, useCallback, useState } from 'react'
import { Group, Rect, Text, Line } from 'react-konva'
import Konva from 'konva'
import { TableObject } from '@/types/board'
import { useBoardContext } from '@/contexts/BoardContext'
import { ShapeProps, handleShapeTransformEnd, getOutlineProps, getShadowProps, areShapePropsEqual } from './shapeUtils'
import { parseTableData, getColumnXOffsets, getRowYOffsets, getTableWidth, getTableHeight, resizeColumn, resizeRow, serializeTableData } from '@/lib/table/tableUtils'
import { DEFAULT_HEADER_HEIGHT, MIN_COL_WIDTH, MIN_ROW_HEIGHT, TableData } from '@/lib/table/tableTypes'

interface TableShapeProps extends Omit<ShapeProps, 'object'> {
  object: TableObject
  onStartCellEdit?: (id: string, textNode: Konva.Text, row: number, col: number) => void
  isEditing?: boolean
  editingCellCoords?: { row: number; col: number } | null
  onTableDataChange?: (id: string, tableData: string) => void
  onAddRowAt?: (id: string, beforeIndex: number) => void
  onDeleteRowAt?: (id: string, rowIndex: number) => void
  onAddColumnAt?: (id: string, beforeIndex: number) => void
  onDeleteColumnAt?: (id: string, colIndex: number) => void
}

const CELL_PAD = 4
const RESIZE_HANDLE_WIDTH = 6
const HEADER_BG = '#F3F4F6'
const HEADER_TEXT_COLOR = '#374151'
const GRID_COLOR = '#E5E7EB'
const CELL_FONT_SIZE = 13
const HEADER_FONT_SIZE = 13
const BOUNDARY_ZONE = 18 // px radius around row/col boundaries that triggers button panel

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
  onAddRowAt,
  onDeleteRowAt,
  onAddColumnAt,
  onDeleteColumnAt,
}: TableShapeProps) {
  const { uiDarkMode } = useBoardContext()

  // Button panel colors
  const btnBg = uiDarkMode ? '#1e293b' : '#f8fafc'
  const btnBorder = uiDarkMode ? '#475569' : '#e2e8f0'
  const btnSep = uiDarkMode ? '#64748b' : '#cbd5e1'
  const btnHover = uiDarkMode ? '#334155' : '#e2e8f0'

  const data = useMemo(() => parseTableData(object.table_data), [object.table_data])

  const colXOffsets = useMemo(() => data ? getColumnXOffsets(data) : [], [data])
  const rowYOffsets = useMemo(() => data ? getRowYOffsets(data) : [], [data])
  const tableWidth = useMemo(() => data ? getTableWidth(data) : object.width, [data, object.width])
  const tableHeight = useMemo(() => data ? getTableHeight(data) : object.height, [data, object.height])

  // Refs for stable access inside callbacks
  const dataRef = useRef<TableData | null>(null)
  dataRef.current = data
  const colXOffsetsRef = useRef<number[]>([])
  colXOffsetsRef.current = colXOffsets
  const rowYOffsetsRef = useRef<number[]>([])
  rowYOffsetsRef.current = rowYOffsets

  const groupRef = useRef<Konva.Group | null>(null)

  // Boundary-based hover state (k = index of the boundary = top of row k / left of col k)
  const [hoveredRowBoundary, setHoveredRowBoundary] = useState<number | null>(null)
  const [hoveredColBoundary, setHoveredColBoundary] = useState<number | null>(null)
  // Which sub-button is hovered ('row-add' | 'row-del' | 'col-add' | 'col-del' | null)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)

  // Resize guide refs — updated imperatively, no state
  const colGuideRef = useRef<Konva.Line | null>(null)
  const rowGuideRef = useRef<Konva.Line | null>(null)

  const isDraggingRef = useRef(false)

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true
    setHoveredRowBoundary(null)
    setHoveredColBoundary(null)
    setHoveredBtn(null)
    groupRef.current?.cache()
    onDragStart?.(object.id)
  }, [onDragStart, object.id])

  const handleDragEnd = useCallback((_e: Konva.KonvaEventObject<DragEvent>) => {
    isDraggingRef.current = false
    groupRef.current?.clearCache()
    onDragEnd(object.id, groupRef.current?.x() ?? 0, groupRef.current?.y() ?? 0)
  }, [onDragEnd, object.id])

  // Read Konva's actual drag position and forward it to onDragMove so that
  // connected arrows/lines follow the table in real time. Reading from groupRef
  // (not object.x/y) ensures the value we push into React state exactly matches
  // what Konva already has, preventing any position-conflict jitter. The
  // group.cache() called on dragStart keeps the visual frozen as a bitmap so
  // child re-renders during drag are invisible.
  const handleDragMove = useCallback((_e: Konva.KonvaEventObject<DragEvent>) => {
    const x = groupRef.current?.x() ?? 0
    const y = groupRef.current?.y() ?? 0
    onDragMove?.(object.id, x, y)
  }, [onDragMove, object.id])

  const handleClick = () => onSelect(object.id)
  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  // ── Double-click: cell or header editing ─────────────────────────────────────
  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!onStartCellEdit || !data) return
    const target = e.target
    const name = target.name?.() || ''

    if (name.startsWith('cell:')) {
      const parts = name.split(':')
      const row = parseInt(parts[1], 10)
      const col = parseInt(parts[2], 10)
      if (!isNaN(row) && !isNaN(col) && target instanceof Konva.Text) {
        onStartCellEdit(object.id, target, row, col)
        return
      }
    }

    if (name.startsWith('header:')) {
      const parts = name.split(':')
      const colIdx = parseInt(parts[1], 10)
      if (!isNaN(colIdx) && target instanceof Konva.Text) {
        // row = -1 signals header editing
        onStartCellEdit(object.id, target, -1, colIdx)
      }
      return
    }

    if (name.startsWith('cellbg:')) {
      const parts = name.split(':')
      const row = parseInt(parts[1], 10)
      const col = parseInt(parts[2], 10)
      if (!isNaN(row) && !isNaN(col)) {
        const grp = target.findAncestor('Group') || target.parent
        if (grp && 'find' in grp) {
          const found = ((grp as Konva.Group).find('Text') as Konva.Text[]).find(
            (n) => n.name() === `cell:${row}:${col}`
          )
          if (found) onStartCellEdit(object.id, found, row, col)
        }
      }
    }
  }

  // ── Column resize (cancelBubble prevents parent table from dragging) ─────────
  const handleColResizeDragMove = useCallback((colIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    e.target.y(0)
    const currentData = dataRef.current
    if (!currentData || !colGuideRef.current) return
    const minX = colXOffsetsRef.current[colIndex] + MIN_COL_WIDTH
    const rawX = e.target.x() + RESIZE_HANDLE_WIDTH / 2
    const guideX = Math.max(minX, rawX)
    const th = getTableHeight(currentData)
    colGuideRef.current.points([guideX, 0, guideX, th])
    colGuideRef.current.opacity(1)
    colGuideRef.current.getLayer()?.batchDraw()
  }, [])

  const handleColResizeDragEnd = useCallback((colIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    colGuideRef.current?.opacity(0)
    const currentData = dataRef.current
    if (!currentData || !onTableDataChange) return
    const node = e.target
    const dx = node.x() - (colXOffsetsRef.current[colIndex] + currentData.columns[colIndex].width - RESIZE_HANDLE_WIDTH / 2)
    const newWidth = Math.max(MIN_COL_WIDTH, currentData.columns[colIndex].width + dx)
    const newData = resizeColumn(currentData, colIndex, newWidth)
    onTableDataChange(object.id, serializeTableData(newData))
    node.x(colXOffsetsRef.current[colIndex] + newData.columns[colIndex].width - RESIZE_HANDLE_WIDTH / 2)
    node.y(0)
    colGuideRef.current?.getLayer()?.batchDraw()
  }, [onTableDataChange, object.id])

  // ── Row resize ───────────────────────────────────────────────────────────────
  const handleRowResizeDragMove = useCallback((rowIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    e.target.x(0)
    const currentData = dataRef.current
    if (!currentData || !rowGuideRef.current) return
    const minY = rowYOffsetsRef.current[rowIndex] + MIN_ROW_HEIGHT
    const rawY = e.target.y() + RESIZE_HANDLE_WIDTH / 2
    const guideY = Math.max(minY, rawY)
    const tw = getTableWidth(currentData)
    rowGuideRef.current.points([0, guideY, tw, guideY])
    rowGuideRef.current.opacity(1)
    rowGuideRef.current.getLayer()?.batchDraw()
  }, [])

  const handleRowResizeDragEnd = useCallback((rowIndex: number, e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    rowGuideRef.current?.opacity(0)
    const currentData = dataRef.current
    if (!currentData || !onTableDataChange) return
    const node = e.target
    const dy = node.y() - (rowYOffsetsRef.current[rowIndex] + currentData.rows[rowIndex].height - RESIZE_HANDLE_WIDTH / 2)
    const newHeight = Math.max(MIN_ROW_HEIGHT, currentData.rows[rowIndex].height + dy)
    const newData = resizeRow(currentData, rowIndex, newHeight)
    onTableDataChange(object.id, serializeTableData(newData))
    node.x(0)
    node.y(rowYOffsetsRef.current[rowIndex] + newData.rows[rowIndex].height - RESIZE_HANDLE_WIDTH / 2)
    rowGuideRef.current?.getLayer()?.batchDraw()
  }, [onTableDataChange, object.id])

  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)

  if (!data) {
    return (
      <Group
        ref={(node) => { groupRef.current = node; shapeRef(object.id, node) }}
        x={object.x} y={object.y} rotation={object.rotation}
        draggable={editable} dragBoundFunc={dragBoundFunc}
        onClick={handleClick} onTap={handleClick}
        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragMove={handleDragMove}
        onTransformEnd={handleTransformEnd}
        onContextMenu={(e) => { e.evt.preventDefault(); onContextMenu(object.id, e.evt.clientX, e.evt.clientY) }}
        opacity={object.opacity ?? 1}
      >
        <Rect width={object.width} height={object.height} fill="#F9FAFB" stroke="#D1D5DB" strokeWidth={1} cornerRadius={4} />
        <Text x={CELL_PAD} y={CELL_PAD} width={object.width - CELL_PAD * 2} height={object.height - CELL_PAD * 2}
          text="Empty table" fontSize={CELL_FONT_SIZE} fill="#9CA3AF" align="center" verticalAlign="middle" listening={false} />
      </Group>
    )
  }

  const isEditingCell = (row: number, col: number) =>
    isEditing && editingCellCoords?.row === row && editingCellCoords?.col === col

  // ── Hover detection: boundary-based ─────────────────────────────────────────
  // Buttons appear when cursor is within BOUNDARY_ZONE px of a row top-edge or
  // col left-edge. This lets the cursor straddle the boundary without the buttons
  // flickering or disappearing when moving between the two adjacent rows/cols.
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!editable || isEditing || isDraggingRef.current) return
    const currentData = dataRef.current
    if (!currentData) return
    const group = e.currentTarget as Konva.Group
    const pos = group.getRelativePointerPosition()
    if (!pos) return
    const { x, y } = pos

    // Check row boundaries first (top edge of each data row)
    let newRowBoundary: number | null = null
    for (let k = 0; k < currentData.rows.length; k++) {
      if (Math.abs(y - rowYOffsetsRef.current[k]) < BOUNDARY_ZONE) {
        newRowBoundary = k
        break
      }
    }

    // Check col boundaries only when in/near header row and no row boundary found
    let newColBoundary: number | null = null
    if (newRowBoundary === null && y >= -BOUNDARY_ZONE && y < DEFAULT_HEADER_HEIGHT + BOUNDARY_ZONE) {
      for (let k = 0; k < currentData.columns.length; k++) {
        if (Math.abs(x - colXOffsetsRef.current[k]) < BOUNDARY_ZONE) {
          newColBoundary = k
          break
        }
      }
    }

    setHoveredRowBoundary(newRowBoundary)
    setHoveredColBoundary(newColBoundary)
    if (newRowBoundary === null && newColBoundary === null) setHoveredBtn(null)
  }, [editable, isEditing])

  const handleMouseLeave = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = (e.target as Konva.Node).getStage()
    if (stage) stage.container().style.cursor = 'default'
    setHoveredRowBoundary(null)
    setHoveredColBoundary(null)
    setHoveredBtn(null)
  }, [])

  // ── Shared button sub-components (inline for perf) ───────────────────────────
  const setCursor = (stage: Konva.Stage | null, cursor: string) => {
    if (stage) stage.container().style.cursor = cursor
  }

  return (
    <Group
      ref={(node) => { groupRef.current = node; shapeRef(object.id, node) }}
      x={object.x} y={object.y} rotation={object.rotation}
      draggable={editable} dragBoundFunc={dragBoundFunc}
      onClick={handleClick} onTap={handleClick}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragMove={handleDragMove}
      onDblClick={handleDblClick} onDblTap={handleDblClick}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => { e.evt.preventDefault(); onContextMenu(object.id, e.evt.clientX, e.evt.clientY) }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={() => groupRef.current?.moveToTop()}
      opacity={object.opacity ?? 1}
    >
      {/* Background */}
      <Rect width={tableWidth} height={tableHeight} fill={object.color || '#FFFFFF'} cornerRadius={4}
        {...shadow} stroke={outline.stroke} strokeWidth={outline.strokeWidth} dash={outline.dash} listening={false} />

      {/* Header row background */}
      <Rect y={0} width={tableWidth} height={DEFAULT_HEADER_HEIGHT}
        fill={data.header_bg || HEADER_BG} cornerRadius={[4, 4, 0, 0]} listening={false} />

      {/* Header cells — hidden when editing that column's name */}
      {data.columns.map((col, colIdx) => (
        !isEditingCell(-1, colIdx) && (
          <Text
            key={`header-${col.id}`}
            name={`header:${colIdx}`}
            x={colXOffsets[colIdx] + CELL_PAD} y={CELL_PAD}
            width={col.width - CELL_PAD * 2} height={DEFAULT_HEADER_HEIGHT - CELL_PAD * 2}
            text={col.name} fontSize={HEADER_FONT_SIZE} fontStyle="bold"
            fill={data.header_text_color || HEADER_TEXT_COLOR}
            align="left" verticalAlign="middle" wrap="none" ellipsis={true}
            listening={true} perfectDrawEnabled={false} transformsEnabled="position"
          />
        )
      ))}

      {/* Body cells */}
      {data.rows.map((row, rowIdx) =>
        data.columns.map((col, colIdx) => {
          const cell = row.cells[col.id]
          const cx = colXOffsets[colIdx]
          const cy = rowYOffsets[rowIdx]
          const editing = isEditingCell(rowIdx, colIdx)
          return (
            <Group key={`cell-${row.id}-${col.id}`}>
              <Rect name={`cellbg:${rowIdx}:${colIdx}`} x={cx} y={cy}
                width={col.width} height={row.height} fill={cell?.bg_color || 'transparent'} listening={true} />
              {!editing && (
                <Text name={`cell:${rowIdx}:${colIdx}`}
                  x={cx + CELL_PAD} y={cy + CELL_PAD}
                  width={col.width - CELL_PAD * 2} height={row.height - CELL_PAD * 2}
                  text={cell?.text || ''} fontSize={CELL_FONT_SIZE}
                  fontStyle={cell?.font_style || 'normal'} fill={cell?.text_color || '#000000'}
                  align="left" verticalAlign="middle" wrap="none" ellipsis={true}
                  perfectDrawEnabled={false} transformsEnabled="position" listening={true} />
              )}
            </Group>
          )
        })
      )}

      {/* Grid lines */}
      <Line points={[0, 0, tableWidth, 0]} stroke={GRID_COLOR} strokeWidth={1} listening={false} />
      <Line points={[0, DEFAULT_HEADER_HEIGHT, tableWidth, DEFAULT_HEADER_HEIGHT]} stroke={GRID_COLOR} strokeWidth={1} listening={false} />
      {rowYOffsets.map((y, i) => i > 0 ? (
        <Line key={`hline-${i}`} points={[0, y, tableWidth, y]} stroke={GRID_COLOR} strokeWidth={1} listening={false} />
      ) : null)}
      <Line points={[0, tableHeight, tableWidth, tableHeight]} stroke={GRID_COLOR} strokeWidth={1} listening={false} />
      <Line points={[0, 0, 0, tableHeight]} stroke={GRID_COLOR} strokeWidth={1} listening={false} />
      {colXOffsets.map((x, i) => i > 0 ? (
        <Line key={`vline-${i}`} points={[x, 0, x, tableHeight]} stroke={GRID_COLOR} strokeWidth={1} listening={false} />
      ) : null)}
      <Line points={[tableWidth, 0, tableWidth, tableHeight]} stroke={GRID_COLOR} strokeWidth={1} listening={false} />

      {/* Resize guide lines — hidden by default, updated imperatively during drag */}
      <Line ref={(n) => { colGuideRef.current = n }} points={[0, 0, 0, 0]}
        stroke="#6366f1" strokeWidth={2} dash={[5, 3]} opacity={0} listening={false} />
      <Line ref={(n) => { rowGuideRef.current = n }} points={[0, 0, 0, 0]}
        stroke="#6366f1" strokeWidth={2} dash={[5, 3]} opacity={0} listening={false} />

      {/* Column resize handles */}
      {editable && data.columns.map((col, colIdx) => (
        <Rect key={`colresize-${col.id}`}
          x={colXOffsets[colIdx] + col.width - RESIZE_HANDLE_WIDTH / 2} y={0}
          width={RESIZE_HANDLE_WIDTH} height={tableHeight}
          fill="transparent" draggable={true}
          onDragStart={(e) => { e.cancelBubble = true }}
          onDragMove={(e) => handleColResizeDragMove(colIdx, e)}
          onDragEnd={(e) => handleColResizeDragEnd(colIdx, e)}
          hitStrokeWidth={8}
          onMouseEnter={(e) => setCursor(e.target.getStage(), 'col-resize')}
          onMouseLeave={(e) => setCursor(e.target.getStage(), 'default')}
        />
      ))}

      {/* Row resize handles */}
      {editable && data.rows.map((row, rowIdx) => (
        <Rect key={`rowresize-${row.id}`}
          x={0} y={rowYOffsets[rowIdx] + row.height - RESIZE_HANDLE_WIDTH / 2}
          width={tableWidth} height={RESIZE_HANDLE_WIDTH}
          fill="transparent" draggable={true}
          onDragStart={(e) => { e.cancelBubble = true }}
          onDragMove={(e) => handleRowResizeDragMove(rowIdx, e)}
          onDragEnd={(e) => handleRowResizeDragEnd(rowIdx, e)}
          hitStrokeWidth={8}
          onMouseEnter={(e) => setCursor(e.target.getStage(), 'row-resize')}
          onMouseLeave={(e) => setCursor(e.target.getStage(), 'default')}
        />
      ))}

      {/* ── Row +/− panel ──────────────────────────────────────────────────────
          Appears at the top border of the hovered row (boundary between row k-1
          and row k). Diagonal layout: + is upper-left, − is lower-right.
          Panel is centred on (0, rowYOffsets[k]) — the left table edge.
          + adds a row before k; − deletes row k. */}
      {editable && !isEditing && hoveredRowBoundary !== null && data.rows[hoveredRowBoundary] && (() => {
        const k = hoveredRowBoundary
        const panelY = rowYOffsets[k]
        return (
          <Group key={`row-btn-${k}`} x={0} y={panelY} listening={true}>
            {/* shared background */}
            <Rect x={-28} y={-28} width={56} height={56} cornerRadius={10}
              fill={btnBg} stroke={btnBorder} strokeWidth={1} listening={false} />
            {/* diagonal separator: from upper-right to lower-left between the two buttons */}
            <Line points={[10, -12, -10, 12]} stroke={btnSep} strokeWidth={1.5} listening={false} />

            {/* + button — upper-left quadrant */}
            <Group
              onMouseEnter={(e) => { setHoveredBtn('row-add'); setCursor(e.target.getStage(), 'pointer') }}
              onMouseLeave={(e) => { setHoveredBtn(null); setCursor(e.target.getStage(), 'default') }}
              onClick={(e) => { e.cancelBubble = true; onAddRowAt?.(object.id, k) }}
              listening={true}
            >
              <Rect x={-26} y={-26} width={26} height={26} cornerRadius={6}
                fill={hoveredBtn === 'row-add' ? btnHover : 'transparent'} listening={true} />
              <Line points={[-19, -13, -7, -13]} stroke="#22c55e" strokeWidth={3} lineCap="round" listening={false} />
              <Line points={[-13, -19, -13, -7]} stroke="#22c55e" strokeWidth={3} lineCap="round" listening={false} />
            </Group>

            {/* − button — lower-right quadrant */}
            <Group
              onMouseEnter={(e) => { setHoveredBtn('row-del'); setCursor(e.target.getStage(), 'pointer') }}
              onMouseLeave={(e) => { setHoveredBtn(null); setCursor(e.target.getStage(), 'default') }}
              onClick={(e) => { e.cancelBubble = true; onDeleteRowAt?.(object.id, k) }}
              listening={true}
            >
              <Rect x={0} y={0} width={26} height={26} cornerRadius={6}
                fill={hoveredBtn === 'row-del' ? btnHover : 'transparent'} listening={true} />
              <Line points={[7, 13, 19, 13]} stroke="#ef4444" strokeWidth={3} lineCap="round" listening={false} />
            </Group>
          </Group>
        )
      })()}

      {/* ── Column +/− panel ───────────────────────────────────────────────────
          Appears at the left border of the hovered column (in the header row).
          Horizontal layout: + is left, − is right, separated by |.
          Panel is centred on (colXOffsets[k], 0) — the column's left edge. */}
      {editable && !isEditing && hoveredColBoundary !== null && data.columns[hoveredColBoundary] && (() => {
        const k = hoveredColBoundary
        const panelX = colXOffsets[k]
        return (
          <Group key={`col-btn-${k}`} x={panelX} y={0} listening={true}>
            {/* shared background */}
            <Rect x={-30} y={-18} width={60} height={36} cornerRadius={8}
              fill={btnBg} stroke={btnBorder} strokeWidth={1} listening={false} />
            {/* vertical | separator */}
            <Line points={[0, -10, 0, 10]} stroke={btnSep} strokeWidth={1.5} listening={false} />

            {/* + button — left half */}
            <Group
              onMouseEnter={(e) => { setHoveredBtn('col-add'); setCursor(e.target.getStage(), 'pointer') }}
              onMouseLeave={(e) => { setHoveredBtn(null); setCursor(e.target.getStage(), 'default') }}
              onClick={(e) => { e.cancelBubble = true; onAddColumnAt?.(object.id, k) }}
              listening={true}
            >
              <Rect x={-30} y={-16} width={28} height={32} cornerRadius={6}
                fill={hoveredBtn === 'col-add' ? btnHover : 'transparent'} listening={true} />
              <Line points={[-22, 0, -10, 0]} stroke="#22c55e" strokeWidth={3} lineCap="round" listening={false} />
              <Line points={[-16, -6, -16, 6]} stroke="#22c55e" strokeWidth={3} lineCap="round" listening={false} />
            </Group>

            {/* − button — right half */}
            <Group
              onMouseEnter={(e) => { setHoveredBtn('col-del'); setCursor(e.target.getStage(), 'pointer') }}
              onMouseLeave={(e) => { setHoveredBtn(null); setCursor(e.target.getStage(), 'default') }}
              onClick={(e) => { e.cancelBubble = true; onDeleteColumnAt?.(object.id, k) }}
              listening={true}
            >
              <Rect x={2} y={-16} width={28} height={32} cornerRadius={6}
                fill={hoveredBtn === 'col-del' ? btnHover : 'transparent'} listening={true} />
              <Line points={[10, 0, 22, 0]} stroke="#ef4444" strokeWidth={3} lineCap="round" listening={false} />
            </Group>
          </Group>
        )
      })()}
    </Group>
  )
}, areShapePropsEqual)
