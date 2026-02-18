import Konva from 'konva'
import { BoardObject, BoardObjectType } from '@/types/board'

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
  onTransformEnd(object.id, {
    x: node.x(),
    y: node.y(),
    width: Math.max(5, object.width * scaleX),
    height: Math.max(5, object.height * scaleY),
    rotation: node.rotation(),
  })
}
