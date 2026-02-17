import { Circle } from 'react-konva'
import Konva from 'konva'
import { KonvaEventObject } from 'konva/lib/Node'
import { ShapeProps } from './shapeUtils'

export function CircleShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  onDragMove,
  onDoubleClick,
  editable = true,
}: ShapeProps) {
  const radius = Math.min(object.width, object.height) / 2
  const centerX = object.x + object.width / 2
  const centerY = object.y + object.height / 2

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const newX = e.target.x() - object.width / 2
    const newY = e.target.y() - object.height / 2
    onDragEnd(object.id, newX, newY)
  }

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    onDragMove?.(object.id, e.target.x() - object.width / 2, e.target.y() - object.height / 2)
  }

  const handleClick = () => {
    onSelect(object.id)
  }

  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
    const node = e.target as Konva.Circle
    const scaleX = node.scaleX()
    node.scaleX(1)
    node.scaleY(1)
    const newRadius = Math.max(5, node.radius() * scaleX)
    const newWidth = newRadius * 2
    const newHeight = newRadius * 2
    onTransformEnd(object.id, {
      x: node.x() - newRadius,
      y: node.y() - newRadius,
      width: newWidth,
      height: newHeight,
      rotation: node.rotation(),
    })
  }

  return (
    <Circle
      ref={(node) => shapeRef(object.id, node)}
      x={centerX}
      y={centerY}
      radius={radius}
      fill={object.color}
      draggable={editable}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      shadowColor="rgba(0,0,0,0.12)"
      shadowBlur={6}
      shadowOffsetY={2}
      stroke={isSelected ? '#0EA5E9' : undefined}
      strokeWidth={isSelected ? 2 : undefined}
      onDblClick={() => onDoubleClick?.(object.id)}
      onDblTap={() => onDoubleClick?.(object.id)}
    />
  )
}
