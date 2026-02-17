import { Arrow } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd } from './shapeUtils'

export function ArrowShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  onDoubleClick,
  editable = true,
}: ShapeProps) {
  const strokeWidth = object.stroke_width ?? 2

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => onSelect(object.id)

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  const w = Math.max(object.width, 40)
  const h = object.height ?? 0

  return (
    <Arrow
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      points={[0, 0, w, h]}
      stroke={object.color}
      strokeWidth={strokeWidth}
      fill={object.color}
      pointerLength={12}
      pointerWidth={12}
      lineCap="round"
      lineJoin="round"
      draggable={editable}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      onDblClick={() => onDoubleClick?.(object.id)}
      onDblTap={() => onDoubleClick?.(object.id)}
      shadowColor="rgba(0,0,0,0.12)"
      shadowBlur={6}
      shadowOffsetY={2}
      hitStrokeWidth={40}
    />
  )
}
