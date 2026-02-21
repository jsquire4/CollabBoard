import { memo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import type { ShapeProps } from './shapeUtils'
import { handleShapeTransformEnd } from './shapeUtils'
import { mimeTypeLabel, mimeTypeBadgeColor } from '@/lib/agent/mimeClassification'


interface ContextObjectShapeProps extends ShapeProps {}

export const ContextObjectShape = memo(function ContextObjectShape({
  object,
  onDragEnd,
  onDragMove,
  onDragStart,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  editable = true,
  dragBoundFunc,
}: ContextObjectShapeProps) {
  const { id, x, y, width, height, rotation, file_name, mime_type } = object
  const label = mimeTypeLabel(mime_type)
  const badge = mimeTypeBadgeColor(mime_type)
  const displayName = file_name || 'Untitled file'
  const BADGE_SIZE = 32
  const PADDING = 8

  return (
    <Group
      id={id}
      x={x}
      y={y}
      rotation={rotation}
      draggable={editable}
      onClick={() => onSelect(id)}
      onTap={() => onSelect(id)}
      onDragStart={() => onDragStart?.(id)}
      onDragMove={e => onDragMove?.(id, e.target.x(), e.target.y())}
      onDragEnd={e => onDragEnd(id, e.target.x(), e.target.y())}
      onTransformEnd={e => handleShapeTransformEnd(e, object, onTransformEnd)}
      onContextMenu={e => {
        e.evt.preventDefault()
        onContextMenu(id, e.evt.clientX, e.evt.clientY)
      }}
      dragBoundFunc={dragBoundFunc}
      ref={node => shapeRef(id, node)}
    >
      {/* Background */}
      <Rect
        width={width}
        height={height}
        fill="#F1F5F9"
        stroke={isSelected ? '#6366F1' : '#CBD5E1'}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={8}
        shadowBlur={isSelected ? 8 : 2}
        shadowColor="rgba(0,0,0,0.12)"
      />

      {/* File type badge */}
      <Rect
        x={PADDING}
        y={(height - BADGE_SIZE) / 2}
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        fill={badge}
        cornerRadius={6}
      />
      <Text
        x={PADDING}
        y={(height - BADGE_SIZE) / 2}
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        text={label}
        fontSize={9}
        fontStyle="bold"
        fill="white"
        align="center"
        verticalAlign="middle"
      />

      {/* File name */}
      <Text
        x={PADDING + BADGE_SIZE + 8}
        y={PADDING}
        width={width - PADDING * 2 - BADGE_SIZE - 8}
        height={height - PADDING * 2}
        text={displayName}
        fontSize={11}
        fill="#334155"
        verticalAlign="middle"
        wrap="word"
        ellipsis
      />
    </Group>
  )
})
