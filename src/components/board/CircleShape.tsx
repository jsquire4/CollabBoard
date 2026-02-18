import { Group, Circle, Text } from 'react-konva'
import Konva from 'konva'
import { KonvaEventObject } from 'konva/lib/Node'
import { ShapeProps, getOutlineProps, getShadowProps } from './shapeUtils'

interface CircleShapeProps extends ShapeProps {
  onStartEdit?: (id: string, node: Konva.Text) => void
  isEditing?: boolean
}

export function CircleShape({
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
  onStartEdit,
  isEditing = false,
}: CircleShapeProps) {
  const handleDragStartCb = () => onDragStart?.(object.id)

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

  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)
  const hasText = !!object.text
  const padding = object.text_padding ?? 8

  if (!hasText) {
    return (
      <Circle
        ref={(node) => shapeRef(object.id, node)}
        x={centerX}
        y={centerY}
        rotation={object.rotation}
        radius={radius}
        fill={object.color}
        opacity={object.opacity ?? 1}
        draggable={editable}
        onClick={handleClick}
        onTap={handleClick}
        onDragStart={handleDragStartCb}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onTransformEnd={handleTransformEnd}
        onContextMenu={(e) => {
          e.evt.preventDefault()
          onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
        }}
        {...shadow}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
        onDblClick={() => onDoubleClick?.(object.id)}
        onDblTap={() => onDoubleClick?.(object.id)}
      />
    )
  }

  // When text is present, wrap in Group for text overlay
  // Group-based circle needs different coordinate handling:
  // Group positioned at object.x, object.y; Circle centered within
  const handleGroupDragEnd = (e: KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleGroupDragMove = (e: KonvaEventObject<DragEvent>) => {
    onDragMove?.(object.id, e.target.x(), e.target.y())
  }

  const handleGroupTransformEnd = (e: KonvaEventObject<Event>) => {
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

  const handleDblClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (onStartEdit) {
      const stage = e.target.getStage()
      if (!stage) return
      const group = e.target.findAncestor('Group') || e.target
      const textNode = (group as Konva.Group).findOne('Text') as Konva.Text
      if (textNode) {
        onStartEdit(object.id, textNode)
        return
      }
    }
    onDoubleClick?.(object.id)
  }

  // Inset text bounding box within the circle
  const inset = radius * 0.29 // ~cos(45)*radius approximation for inscribed rect
  const textWidth = object.width - 2 * (inset + padding)
  const textHeight = object.height - 2 * (inset + padding)

  return (
    <Group
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      rotation={object.rotation}
      draggable={editable}
      onClick={handleClick}
      onTap={handleClick}
      onDragStart={handleDragStartCb}
      onDragEnd={handleGroupDragEnd}
      onDragMove={handleGroupDragMove}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onTransformEnd={handleGroupTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      opacity={object.opacity ?? 1}
    >
      <Circle
        x={object.width / 2}
        y={object.height / 2}
        radius={radius}
        fill={object.color}
        {...shadow}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
      />
      {!isEditing && (
        <Text
          x={inset + padding}
          y={inset + padding}
          width={Math.max(0, textWidth)}
          height={Math.max(0, textHeight)}
          text={object.text || ''}
          align={object.text_align ?? 'center'}
          verticalAlign={object.text_vertical_align ?? 'middle'}
          fill={object.text_color ?? '#000000'}
          fontSize={object.font_size ?? 16}
          fontFamily={object.font_family ?? 'sans-serif'}
          fontStyle={object.font_style ?? 'normal'}
          wrap="word"
          listening={false}
        />
      )}
    </Group>
  )
}
