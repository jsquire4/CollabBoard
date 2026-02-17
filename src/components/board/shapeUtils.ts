import Konva from 'konva'
import { BoardObject } from '@/types/board'

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
  onDoubleClick?: (id: string) => void
  editable?: boolean
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
