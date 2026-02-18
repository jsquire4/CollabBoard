import { Group, Rect, Text, Line } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd, getOutlineProps, getShadowProps } from './shapeUtils'

interface StickyNoteProps extends ShapeProps {
  onStartEdit: (id: string, node: Konva.Text, field?: 'text' | 'title') => void
  isEditing?: boolean
  editingField?: 'text' | 'title'
}

const TITLE_PAD_X = 10
const TITLE_PAD_Y = 8
const TITLE_FONT_SIZE = 14
const TITLE_LINE_HEIGHT = 1.3
const DIVIDER_PAD = 6

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
  editingField,
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
    const stage = e.target.getStage()
    if (!stage) return
    // Determine which Text node was clicked — title or body
    const target = e.target
    if (target instanceof Konva.Text) {
      const field = target.name() === 'title' ? 'title' : 'text'
      onStartEdit(object.id, target, field)
    } else {
      // Clicked on background — find body text node
      const group = target.findAncestor('Group') || target
      const textNodes = (group as Konva.Group).find('Text')
      const bodyNode = textNodes.find((n: Konva.Node) => n.name() === 'body') as Konva.Text | undefined
      if (bodyNode) {
        onStartEdit(object.id, bodyNode, 'text')
      }
    }
  }

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  const bodyPadding = object.text_padding ?? 10
  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)

  const titleText = object.title ?? 'Note'
  const titleAvailW = Math.max(1, object.width - TITLE_PAD_X * 2)
  // Title area height: single line + padding
  const titleHeight = TITLE_PAD_Y + TITLE_FONT_SIZE * TITLE_LINE_HEIGHT + TITLE_PAD_Y
  const dividerY = titleHeight
  const bodyY = dividerY + DIVIDER_PAD
  const bodyHeight = Math.max(0, object.height - bodyY - bodyPadding)

  // Determine text color: slightly muted for title relative to body
  const bodyColor = object.text_color ?? '#000000'
  const titleColor = object.text_color ?? '#374151'

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
        cornerRadius={8}
        {...shadow}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
      />
      {/* Title text */}
      {!(isEditing && editingField === 'title') && (
        <Text
          name="title"
          x={TITLE_PAD_X}
          y={TITLE_PAD_Y}
          width={titleAvailW}
          height={TITLE_FONT_SIZE * TITLE_LINE_HEIGHT}
          text={titleText}
          fontSize={TITLE_FONT_SIZE}
          fontFamily={object.font_family || 'sans-serif'}
          fontStyle="bold"
          fill={titleColor}
          align={object.text_align ?? 'left'}
          verticalAlign="top"
          wrap="none"
          ellipsis={true}
          lineHeight={TITLE_LINE_HEIGHT}
        />
      )}
      {/* Divider line */}
      <Line
        points={[TITLE_PAD_X, dividerY, object.width - TITLE_PAD_X, dividerY]}
        stroke="rgba(0,0,0,0.1)"
        strokeWidth={1}
      />
      {/* Body text */}
      {!(isEditing && editingField === 'text') && (
        <Text
          name="body"
          x={bodyPadding}
          y={bodyY}
          width={Math.max(1, object.width - bodyPadding * 2)}
          height={bodyHeight}
          text={object.text || ''}
          fontSize={object.font_size}
          fontFamily={object.font_family || 'sans-serif'}
          fontStyle={object.font_style || 'normal'}
          fill={bodyColor}
          align={object.text_align ?? 'left'}
          verticalAlign={object.text_vertical_align ?? 'top'}
          wrap="word"
          ellipsis={true}
          lineHeight={1.4}
        />
      )}
    </Group>
  )
}
