'use client'

import { memo } from 'react'
import { Group, Rect } from 'react-konva'
import type { ShapeProps } from './shapeUtils'
import { handleShapeTransformEnd, getOutlineProps, areShapePropsEqual } from './shapeUtils'

export const ApiObjectShape = memo(function ApiObjectShape({
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
}: ShapeProps) {
  const { id, x, y, width, height, rotation, color } = object
  const outline = getOutlineProps(object, isSelected)

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
      <Rect
        width={width}
        height={height}
        fill={color || '#F0EBE3'}
        stroke={outline.stroke ?? '#CBD5E1'}
        strokeWidth={outline.strokeWidth ?? 1}
        cornerRadius={8}
        shadowBlur={isSelected ? 8 : 2}
        shadowColor="rgba(0,0,0,0.12)"
        {...(outline.dash ? { dash: outline.dash } : {})}
      />
    </Group>
  )
}, areShapePropsEqual)
