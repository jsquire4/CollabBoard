import { Line } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd } from './shapeUtils'

export function HexagonShape({
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
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => onSelect(object.id)

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  // Regular flat-top hexagon: symmetric in x and y
  const w = object.width
  const h = object.height
  const points = [0, h / 2, w / 4, 0, (3 * w) / 4, 0, w, h / 2, (3 * w) / 4, h, w / 4, h]

  return (
    <Line
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      points={points}
      fill={object.color}
      closed={true}
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
      stroke={isSelected ? '#0EA5E9' : undefined}
      strokeWidth={isSelected ? 2 : 0}
    />
  )
}
