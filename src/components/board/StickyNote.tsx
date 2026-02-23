import { memo } from 'react'
import { Group, Rect, Line } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd, getOutlineProps, getShadowProps, areShapePropsEqual } from './shapeUtils'
import { RichTextBlocks } from './RichTextBlocks'
import type { Block } from '@/lib/richText/tipTapToBlocks'

const TITLE_EXCLUDE_TYPES: Block['type'][] = ['bulletItem', 'orderedItem', 'taskItem']

interface StickyNoteProps extends ShapeProps {
  onStartEdit: (id: string, node: Konva.Text | null, field?: 'text' | 'title') => void
  isEditing?: boolean
  editingField?: 'text' | 'title'
  onToggleTask?: (blockIndex: number, checked: boolean) => void
}

const TITLE_PAD_X = 10
const TITLE_PAD_Y = 8
const TITLE_FONT_SIZE = 14
const TITLE_LINE_HEIGHT = 1.3
const DIVIDER_PAD = 6

export const StickyNote = memo(function StickyNote({
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
  dragBoundFunc,
  isEditing = false,
  editingField,
  onToggleTask,
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
    const target = e.target
    const name = target.name?.() || ''
    if (name === 'title') {
      // Title hit area clicked — start title editing
      onStartEdit(object.id, null, 'title')
    } else {
      // Body area — start text editing
      onStartEdit(object.id, null, 'text')
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
      dragBoundFunc={dragBoundFunc}
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
        <RichTextBlocks
          richText={object.title_rich_text ?? null}
          plainText={titleText}
          x={TITLE_PAD_X}
          y={TITLE_PAD_Y}
          width={titleAvailW}
          height={TITLE_FONT_SIZE * TITLE_LINE_HEIGHT}
          baseFontSize={TITLE_FONT_SIZE}
          baseFontFamily={object.font_family || 'sans-serif'}
          baseColor={titleColor}
          align={object.text_align as 'left' | 'center' | 'right' | undefined ?? 'left'}
          verticalAlign="middle"
          excludeBlockTypes={TITLE_EXCLUDE_TYPES}
        />
      )}
      {/* Invisible hit area for title double-click (replaces old Text node) */}
      <Rect
        name="title"
        x={TITLE_PAD_X}
        y={TITLE_PAD_Y}
        width={titleAvailW}
        height={TITLE_FONT_SIZE * TITLE_LINE_HEIGHT}
        fill="transparent"
        listening={true}
      />
      {/* Divider line */}
      <Line
        points={[TITLE_PAD_X, dividerY, object.width - TITLE_PAD_X, dividerY]}
        stroke="rgba(0,0,0,0.1)"
        strokeWidth={1}
      />
      {/* Body text */}
      {!(isEditing && editingField === 'text') && (
        <RichTextBlocks
          richText={object.rich_text ?? null}
          plainText={object.text || ''}
          x={bodyPadding}
          y={bodyY}
          width={Math.max(1, object.width - bodyPadding * 2)}
          height={bodyHeight}
          baseFontSize={object.font_size}
          baseFontFamily={object.font_family || 'sans-serif'}
          baseColor={bodyColor}
          align={object.text_align as 'left' | 'center' | 'right' | undefined}
          lineHeight={1.4}
          onToggleTask={onToggleTask}
        />
      )}
    </Group>
  )
}, areShapePropsEqual)
