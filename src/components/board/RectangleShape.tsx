import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd, getOutlineProps, getShadowProps } from './shapeUtils'

interface RectangleShapeProps extends ShapeProps {
  onStartEdit?: (id: string, node: Konva.Text) => void
  isEditing?: boolean
}

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
  onStartEdit,
  isEditing = false,
}: RectangleShapeProps) {
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

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (onStartEdit && object.text) {
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

  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)
  const hasText = !!object.text
  const padding = object.text_padding ?? 8

  if (!hasText) {
    return (
      <Rect
        ref={(node) => shapeRef(object.id, node)}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        width={object.width}
        height={object.height}
        fill={object.color}
        opacity={object.opacity ?? 1}
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
        cornerRadius={object.corner_radius ?? 6}
        {...shadow}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
        onDblClick={() => onDoubleClick?.(object.id)}
        onDblTap={() => onDoubleClick?.(object.id)}
      />
    )
  }

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
      opacity={object.opacity ?? 1}
    >
      <Rect
        width={object.width}
        height={object.height}
        fill={object.color}
        cornerRadius={object.corner_radius ?? 6}
        {...shadow}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
      />
      {!isEditing && (
        <Text
          x={padding}
          y={0}
          width={object.width - 2 * padding}
          height={object.height}
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
