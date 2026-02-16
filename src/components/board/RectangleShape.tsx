import { Rect } from 'react-konva'
import { BoardObject } from '@/types/board'
import Konva from 'konva'

interface RectangleShapeProps {
  object: BoardObject
  onDragEnd: (id: string, x: number, y: number) => void
  isSelected: boolean
  onSelect: (id: string) => void
  shapeRef: (id: string, node: Konva.Node | null) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
}

export function RectangleShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
}: RectangleShapeProps) {
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => {
    onSelect(object.id)
  }

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)
    onTransformEnd(object.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(5, node.width() * scaleX),
      height: Math.max(5, node.height() * scaleY),
      rotation: node.rotation(),
    })
  }

  return (
    <Rect
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      width={object.width}
      height={object.height}
      fill={object.color}
      draggable={true}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      cornerRadius={4}
      stroke={isSelected ? '#0EA5E9' : undefined}
      strokeWidth={isSelected ? 2 : 0}
    />
  )
}
