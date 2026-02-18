import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd } from './shapeUtils'

interface FrameShapeProps extends ShapeProps {
  onStartEdit: (id: string, node: Konva.Text) => void
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
  onDragMove,
  onDragStart,
  editable = true,
  isEditing = false,
}: FrameShapeProps) {
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
      rotation={object.rotation}
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
      {/* Background fill */}
      <Rect
        width={object.width}
        height={object.height}
        fill={object.color || 'rgba(241,245,249,0.8)'}
        cornerRadius={8}
        stroke={isSelected ? '#0EA5E9' : 'rgba(148,163,184,0.5)'}
        strokeWidth={isSelected ? 2 : 1}
        dash={isSelected ? undefined : [8, 4]}
      />
      {/* Title bar background */}
      <Rect
        width={object.width}
        height={titleHeight}
        fill="rgba(148,163,184,0.12)"
        cornerRadius={[8, 8, 0, 0]}
      />
      {/* Title text — hidden during editing to avoid duplication with textarea overlay */}
      {!isEditing && (
        <Text
          x={10}
          y={6}
          width={object.width - 20}
          height={titleHeight - 6}
          text={object.text || 'Frame'}
          fontSize={13}
          fontFamily="sans-serif"
          fontStyle="bold"
          fill="#475569"
          ellipsis={true}
        />
      )}
    </Group>
  )
}
