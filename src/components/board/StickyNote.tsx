import { Group, Rect, Text } from 'react-konva'
import { BoardObject } from '@/types/board'
import Konva from 'konva'

interface StickyNoteProps {
  object: BoardObject
  onDragEnd: (id: string, x: number, y: number) => void
  isSelected: boolean
  onSelect: (id: string) => void
  onStartEdit: (id: string, node: Konva.Text) => void
  shapeRef: (id: string, node: Konva.Node | null) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
}

export function StickyNote({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  onStartEdit,
  shapeRef,
  onTransformEnd,
}: StickyNoteProps) {
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => {
    onSelect(object.id)
  }

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Find the Text node inside this Group
    const stage = e.target.getStage()
    if (!stage) return
    const group = e.target.findAncestor('Group') || e.target
    const textNode = (group as Konva.Group).findOne('Text') as Konva.Text
    if (textNode) {
      onStartEdit(object.id, textNode)
    }
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
      width: Math.max(5, object.width * scaleX),
      height: Math.max(5, object.height * scaleY),
      rotation: node.rotation(),
    })
  }

  const padding = 10

  return (
    <Group
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      draggable={true}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onTransformEnd={handleTransformEnd}
    >
      <Rect
        width={object.width}
        height={object.height}
        fill={object.color}
        cornerRadius={4}
        shadowColor="rgba(0,0,0,0.15)"
        shadowBlur={8}
        shadowOffsetY={2}
        stroke={isSelected ? '#0EA5E9' : undefined}
        strokeWidth={isSelected ? 2 : 0}
      />
      <Text
        x={padding}
        y={padding}
        width={object.width - padding * 2}
        height={object.height - padding * 2}
        text={object.text || ''}
        fontSize={object.font_size}
        fontFamily="sans-serif"
        fill="#333"
        wrap="word"
        ellipsis={true}
      />
    </Group>
  )
}
