import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd } from './shapeUtils'

interface StickyNoteProps extends ShapeProps {
  onStartEdit: (id: string, node: Konva.Text) => void
  isEditing?: boolean
}

export function StickyNote({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  onStartEdit,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  onDragMove,
  onDragStart,
  editable = true,
  isEditing = false,
}: StickyNoteProps) {
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
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  const padding = 10

  return (
    <Group
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      draggable={editable}
      onClick={handleClick}
      onTap={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
    >
      <Rect
        width={object.width}
        height={object.height}
        fill={object.color}
        cornerRadius={8}
        shadowColor="rgba(0,0,0,0.2)"
        shadowBlur={10}
        shadowOffsetY={3}
        stroke={isSelected ? '#0EA5E9' : undefined}
        strokeWidth={isSelected ? 2 : 0}
      />
      {!isEditing && (
        <Text
          x={padding}
          y={padding}
          width={object.width - padding * 2}
          height={object.height - padding * 2}
          text={object.text || ''}
          fontSize={object.font_size}
          fontFamily={object.font_family || 'sans-serif'}
          fontStyle={object.font_style || 'normal'}
          fill="#1e293b"
          wrap="word"
          ellipsis={true}
          lineHeight={1.4}
        />
      )}
    </Group>
  )
}
