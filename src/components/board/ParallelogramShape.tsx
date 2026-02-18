import { memo } from 'react'
import { Group, Line, Text } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd, getOutlineProps, getShadowProps, areShapePropsEqual } from './shapeUtils'

interface ParallelogramShapeProps extends ShapeProps {
  onStartEdit?: (id: string, node: Konva.Text) => void
  isEditing?: boolean
}

export const ParallelogramShape = memo(function ParallelogramShape({
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
}: ParallelogramShapeProps) {
  const handleDragStart = () => onDragStart?.(object.id)

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => onSelect(object.id)

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  const w = object.width
  const h = object.height
  const skew = w * 0.15
  const points = [skew, 0, w, 0, w - skew, h, 0, h]
  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)
  const hasText = !!object.text
  const padding = object.text_padding ?? 8

  if (!hasText) {
    return (
      <Line
        ref={(node) => shapeRef(object.id, node)}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        points={points}
        fill={object.color}
        opacity={object.opacity ?? 1}
        closed={true}
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
        onDblClick={() => onDoubleClick?.(object.id)}
        onDblTap={() => onDoubleClick?.(object.id)}
        {...shadow}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
      />
    )
  }

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
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
      <Line
        points={points}
        fill={object.color}
        closed={true}
        {...shadow}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
      />
      {!isEditing && (
        <Text
          x={skew + padding}
          y={padding}
          width={Math.max(0, w - 2 * skew - 2 * padding)}
          height={h - 2 * padding}
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
}, areShapePropsEqual)
