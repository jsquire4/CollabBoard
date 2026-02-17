import { Rect } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd } from './shapeUtils'

export function RectangleShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  onDragMove,
  onDragStart,
  onDoubleClick,
  editable = true,
}: ShapeProps) {
  const handleDragStart = () => onDragStart?.(object.id)

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => {
    onSelect(object.id)
  }

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  return (
    <Rect
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      width={object.width}
      height={object.height}
      fill={object.color}
      draggable={editable}
      onClick={handleClick}
      onTap={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      cornerRadius={6}
      shadowColor="rgba(0,0,0,0.12)"
      shadowBlur={6}
      shadowOffsetY={2}
      stroke={isSelected ? '#0EA5E9' : undefined}
      strokeWidth={isSelected ? 2 : 0}
      onDblClick={() => onDoubleClick?.(object.id)}
      onDblTap={() => onDoubleClick?.(object.id)}
    />
  )
}
