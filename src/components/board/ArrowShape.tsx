import { memo } from 'react'
import { Group, Arrow, Circle } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, getShadowProps, areShapePropsEqual } from './shapeUtils'

export const ArrowShape = memo(function ArrowShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  shapeRef,
  onContextMenu,
  onDragMove,
  onDragStart,
  editable = true,
  onEndpointDragMove,
  onEndpointDragEnd,
}: ShapeProps) {
  const strokeWidth = object.stroke_width ?? 2

  // Compute endpoint: use x2/y2 if available, fallback to x+width/y+height
  const x2 = object.x2 ?? object.x + object.width
  const y2 = object.y2 ?? object.y + object.height
  const dx = x2 - object.x
  const dy = y2 - object.y

  const handleClick = () => onSelect(object.id)

  // Whole-arrow drag: compute delta and shift both endpoints
  const handleLineDragStart = () => onDragStart?.(object.id)

  const handleLineDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragMove) return
    const node = e.target
    const offsetX = node.x()
    const offsetY = node.y()
    node.x(0)
    node.y(0)
    onEndpointDragMove(object.id, {
      x: object.x + offsetX,
      y: object.y + offsetY,
      x2: x2 + offsetX,
      y2: y2 + offsetY,
    })
  }

  const handleLineDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragEnd) return
    const node = e.target
    const offsetX = node.x()
    const offsetY = node.y()
    node.x(0)
    node.y(0)
    onEndpointDragEnd(object.id, {
      x: object.x + offsetX,
      y: object.y + offsetY,
      x2: x2 + offsetX,
      y2: y2 + offsetY,
    })
  }

  // Start anchor drag
  const handleStartAnchorDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragMove) return
    const node = e.target
    const newX = object.x + node.x()
    const newY = object.y + node.y()
    onEndpointDragMove(object.id, { x: newX, y: newY })
  }

  const handleStartAnchorDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragEnd) return
    const node = e.target
    const newX = object.x + node.x()
    const newY = object.y + node.y()
    node.x(0)
    node.y(0)
    onEndpointDragEnd(object.id, { x: newX, y: newY })
  }

  // End anchor drag
  const handleEndAnchorDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragMove) return
    const node = e.target
    const newX2 = object.x + node.x()
    const newY2 = object.y + node.y()
    onEndpointDragMove(object.id, { x2: newX2, y2: newY2 })
  }

  const handleEndAnchorDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragEnd) return
    const node = e.target
    const newX2 = object.x + node.x()
    const newY2 = object.y + node.y()
    node.x(dx)
    node.y(dy)
    onEndpointDragEnd(object.id, { x2: newX2, y2: newY2 })
  }

  return (
    <Group
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      onClick={handleClick}
      onTap={handleClick}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      opacity={object.opacity ?? 1}
    >
      <Arrow
        points={[0, 0, dx, dy]}
        stroke={object.stroke_color ?? object.color}
        strokeWidth={strokeWidth}
        fill={object.stroke_color ?? object.color}
        pointerLength={12}
        pointerWidth={12}
        lineCap="round"
        lineJoin="round"
        draggable={editable}
        onDragStart={handleLineDragStart}
        onDragMove={handleLineDragMove}
        onDragEnd={handleLineDragEnd}
        {...getShadowProps(object)}
        hitStrokeWidth={40}
      />
      {/* Endpoint anchors — only visible when selected and editable */}
      {isSelected && editable && (
        <>
          <Circle
            x={0}
            y={0}
            radius={6}
            fill="white"
            stroke="#0EA5E9"
            strokeWidth={2}
            draggable
            onDragMove={handleStartAnchorDragMove}
            onDragEnd={handleStartAnchorDragEnd}
          />
          <Circle
            x={dx}
            y={dy}
            radius={6}
            fill="white"
            stroke="#0EA5E9"
            strokeWidth={2}
            draggable
            onDragMove={handleEndAnchorDragMove}
            onDragEnd={handleEndAnchorDragEnd}
          />
        </>
      )}
    </Group>
  )
}, areShapePropsEqual)
