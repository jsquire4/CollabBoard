import { Circle } from 'react-konva'
import { BoardObject } from '@/types/board'
import Konva from 'konva'
import { KonvaEventObject } from 'konva/lib/Node'

interface CircleShapeProps {
  object: BoardObject
  onDragEnd: (id: string, x: number, y: number) => void
  isSelected: boolean
  onSelect: (id: string) => void
  shapeRef: (id: string, node: Konva.Node | null) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
  onContextMenu: (id: string, clientX: number, clientY: number) => void
}

export function CircleShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
  onContextMenu,
}: CircleShapeProps) {
  const radius = Math.min(object.width, object.height) / 2
  const centerX = object.x + object.width / 2
  const centerY = object.y + object.height / 2

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const newX = e.target.x() - object.width / 2
    const newY = e.target.y() - object.height / 2
    onDragEnd(object.id, newX, newY)
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
      draggable={true}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      stroke={isSelected ? '#0EA5E9' : undefined}
      strokeWidth={isSelected ? 2 : undefined}
    />
  )
}
