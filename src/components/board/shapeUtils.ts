import Konva from 'konva'
import { BoardObject, BoardObjectType } from '@/types/board'
import { shapeRegistry } from './shapeRegistry'
import { parseTableData, serializeTableData, distributeScale, getTableWidth, getTableHeight } from '@/lib/table/tableUtils'

/** Default grid size in canvas units. */
export const GRID_SIZE = 40

/** Snap a value to the nearest grid step. */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE, subdivisions: number = 1): number {
  const step = gridSize / subdivisions
  return Math.round(value / step) * step
}

/** Returns true for shape types that use endpoint-based (vector) rendering instead of width/height. */
export function isVectorType(type: BoardObjectType | string): boolean {
  return type === 'line' || type === 'arrow'
}

/** Common props shared by all shape components. */
export interface ShapeProps {
  object: BoardObject
  onDragEnd: (id: string, x: number, y: number) => void
  isSelected: boolean
  onSelect: (id: string) => void
  shapeRef: (id: string, node: Konva.Node | null) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
  onContextMenu: (id: string, clientX: number, clientY: number) => void
  onDragMove?: (id: string, x: number, y: number) => void
  onDragStart?: (id: string) => void
  onDoubleClick?: (id: string) => void
  editable?: boolean
  dragBoundFunc?: (pos: { x: number; y: number }) => { x: number; y: number }
  onEndpointDragMove?: (id: string, updates: Partial<BoardObject>) => void
  onEndpointDragEnd?: (id: string, updates: Partial<BoardObject>) => void
}

/** Try to parse a JSON string; return undefined on failure. */
function tryParseJson(s: string): number[] | undefined {
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Returns Konva-compatible outline/stroke props. Selection stroke overrides user stroke. */
export function getOutlineProps(obj: BoardObject, isSelected: boolean) {
  if (isSelected) {
    return {
      stroke: '#0EA5E9',
      strokeWidth: 2,
      dash: undefined as number[] | undefined,
    }
  }
  if (obj.stroke_color) {
    return {
      stroke: obj.stroke_color,
      strokeWidth: obj.stroke_width ?? 2,
      dash: obj.stroke_dash ? tryParseJson(obj.stroke_dash) : undefined,
    }
  }
  return {
    stroke: undefined as string | undefined,
    strokeWidth: 0,
    dash: undefined as number[] | undefined,
  }
}

/** Returns Konva-compatible shadow props from object fields. */
export function getShadowProps(obj: BoardObject) {
  return {
    shadowColor: obj.shadow_color ?? 'rgba(0,0,0,0.12)',
    shadowBlur: obj.shadow_blur ?? 6,
    shadowOffsetX: obj.shadow_offset_x ?? 0,
    shadowOffsetY: obj.shadow_offset_y ?? 2,
  }
}

/**
 * React.memo comparator for shape components.
 * Compares only the props that affect visual output — skips callback props
 * (they may change identity but are functionally equivalent).
 */
export function areShapePropsEqual(
  prev: { object: BoardObject; isSelected: boolean; editable?: boolean; isEditing?: boolean; editingField?: string; editingCellCoords?: { row: number; col: number } | null },
  next: { object: BoardObject; isSelected: boolean; editable?: boolean; isEditing?: boolean; editingField?: string; editingCellCoords?: { row: number; col: number } | null },
): boolean {
  const prevCoords = prev.editingCellCoords
  const nextCoords = next.editingCellCoords
  const coordsEqual =
    prevCoords === nextCoords ||
    (prevCoords != null && nextCoords != null && prevCoords.row === nextCoords.row && prevCoords.col === nextCoords.col)
  return (
    prev.object === next.object &&
    prev.isSelected === next.isSelected &&
    prev.editable === next.editable &&
    prev.isEditing === next.isEditing &&
    prev.editingField === next.editingField &&
    coordsEqual
  )
}

/**
 * Creates a standard transform-end handler that resets scale and
 * reports the final dimensions back via the callback.
 */
export function handleShapeTransformEnd(
  e: Konva.KonvaEventObject<Event>,
  object: BoardObject,
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
) {
  const node = e.target
  const scaleX = node.scaleX()
  const scaleY = node.scaleY()
  node.scaleX(1)
  node.scaleY(1)
  const updates: Partial<BoardObject> = {
    x: node.x(),
    y: node.y(),
    width: Math.max(5, object.width * scaleX),
    height: Math.max(5, object.height * scaleY),
    rotation: node.rotation(),
  }
  // Scale custom_points proportionally when shape is resized
  if (object.custom_points && (scaleX !== 1 || scaleY !== 1)) {
    try {
      const pts: number[] = JSON.parse(object.custom_points)
      const scaled: number[] = []
      for (let i = 0; i < pts.length; i += 2) {
        scaled.push(pts[i] * scaleX, pts[i + 1] * scaleY)
      }
      updates.custom_points = JSON.stringify(scaled)
    } catch { /* keep existing */ }
  }
  // Table: distribute scale to columns/rows and recompute dimensions
  if (object.type === 'table' && object.table_data && (scaleX !== 1 || scaleY !== 1)) {
    const data = parseTableData(object.table_data)
    if (data) {
      const scaled = distributeScale(data, scaleX, scaleY)
      updates.table_data = serializeTableData(scaled)
      updates.width = getTableWidth(scaled)
      updates.height = getTableHeight(scaled)
    }
  }
  onTransformEnd(object.id, updates)
}

/**
 * Compute initial vertex points for a shape entering vertex edit mode.
 * Returns flat [x1,y1,x2,y2,...] relative to the shape's (0,0) origin.
 */
export function getInitialVertexPoints(obj: BoardObject): number[] {
  // If already has custom points, parse them
  if (obj.custom_points) {
    try { return JSON.parse(obj.custom_points) } catch { /* fall through */ }
  }

  const w = obj.width
  const h = obj.height
  const def = shapeRegistry.get(obj.type)

  // Polygon shapes: use registry getPoints
  if (def?.strategy === 'polygon' && def.getPoints) {
    return def.getPoints(w, h, obj)
  }

  // Rectangle: 4 corners
  if (def?.strategy === 'rect') {
    return [0, 0, w, 0, w, h, 0, h]
  }

  // Circle: 24-point approximation on the ellipse
  if (def?.strategy === 'circle') {
    const n = 24
    const pts: number[] = []
    const cx = w / 2
    const cy = h / 2
    const rx = w / 2
    const ry = h / 2
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2
      pts.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle))
    }
    return pts
  }

  return []
}
