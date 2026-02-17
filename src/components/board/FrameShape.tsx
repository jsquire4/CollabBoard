import { Group, Rect, Text } from 'react-konva'
import { BoardObject } from '@/types/board'
import Konva from 'konva'
import { handleShapeTransformEnd } from './shapeUtils'

interface FrameShapeProps {
  object: BoardObject
  onDragEnd: (id: string, x: number, y: number) => void
  isSelected: boolean
  onSelect: (id: string) => void
  onStartEdit: (id: string, node: Konva.Text) => void
  shapeRef: (id: string, node: Konva.Node | null) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
  onContextMenu: (id: string, clientX: number, clientY: number) => void
  editable?: boolean
  isEditing?: boolean
}

export function FrameShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  onStartEdit,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  editable = true,
  isEditing = false,
}: FrameShapeProps) {
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => {
    onSelect(object.id)
  }

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return
    const group = e.target.findAncestor('Group') || e.target
    const textNode = (group as Konva.Group).findOne('Text') as Konva.Text
    if (textNode) {
      onStartEdit(object.id, textNode)
    }
  }

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  const titleHeight = 28

  return (
    <Group
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      draggable={editable}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
    >
      {/* Background fill */}
      <Rect
        width={object.width}
        height={object.height}
        fill={object.color || 'rgba(200,200,200,0.3)'}
        cornerRadius={4}
        stroke={isSelected ? '#0EA5E9' : '#ccc'}
        strokeWidth={isSelected ? 2 : 1}
        dash={isSelected ? undefined : [6, 3]}
      />
      {/* Title bar background */}
      <Rect
        width={object.width}
        height={titleHeight}
        fill="rgba(150,150,150,0.15)"
        cornerRadius={[4, 4, 0, 0]}
      />
      {/* Title text — hidden during editing to avoid duplication with textarea overlay */}
      {!isEditing && (
        <Text
          x={8}
          y={6}
          width={object.width - 16}
          height={titleHeight - 6}
          text={object.text || 'Frame'}
          fontSize={13}
          fontFamily="sans-serif"
          fontStyle="bold"
          fill="#666"
          ellipsis={true}
        />
      )}
    </Group>
  )
}
