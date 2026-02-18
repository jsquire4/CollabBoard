import { memo } from 'react'
import { Group, Line, Arrow, Circle } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, getShadowProps } from './shapeUtils'

interface VectorShapeProps extends ShapeProps {
  variant: 'line' | 'arrow'
}

export const VectorShape = memo(function VectorShape({
  object,
  isSelected,
  onSelect,
  shapeRef,
  onContextMenu,
  onDragStart,
  editable = true,
  onEndpointDragMove,
  onEndpointDragEnd,
  variant,
}: VectorShapeProps) {
  const strokeWidth = object.stroke_width ?? 2

  // Parse dash pattern (line only)
  let dash: number[] | undefined
  if (variant === 'line' && object.stroke_dash) {
    try {
      const parsed = JSON.parse(object.stroke_dash)
      dash = Array.isArray(parsed) ? parsed : undefined
    } catch {
      dash = undefined
    }
  }

  // Compute endpoint
  const x2 = object.x2 ?? object.x + object.width
  const y2 = object.y2 ?? object.y + object.height
  const dx = x2 - object.x
  const dy = y2 - object.y

  const handleClick = () => onSelect(object.id)
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

  // Start anchor drag (updates x, y — keeps x2/y2 fixed)
  const handleStartAnchorDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragMove) return
    const node = e.target
    onEndpointDragMove(object.id, { x: object.x + node.x(), y: object.y + node.y() })
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

  // End anchor drag (updates x2, y2 — keeps x/y fixed)
  const handleEndAnchorDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragMove) return
    const node = e.target
    onEndpointDragMove(object.id, { x2: object.x + node.x(), y2: object.y + node.y() })
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

  const strokeColor = object.stroke_color ?? object.color
  const shadowProps = getShadowProps(object)

  // Line-specific: selection stroke boost + custom shadow when selected
  const lineShadow = variant === 'line'
    ? {
        shadowColor: isSelected ? '#0EA5E9' : shadowProps.shadowColor,
        shadowBlur: isSelected ? 8 : shadowProps.shadowBlur,
        shadowOffsetX: isSelected ? 0 : shadowProps.shadowOffsetX,
        shadowOffsetY: isSelected ? 0 : shadowProps.shadowOffsetY,
      }
    : shadowProps

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
      {variant === 'line' ? (
        <Line
          points={[0, 0, dx, dy]}
          stroke={strokeColor}
          strokeWidth={isSelected ? Math.max(strokeWidth + 2, 4) : strokeWidth}
          dash={dash}
          lineCap="round"
          lineJoin="round"
          draggable={editable}
          onDragStart={handleLineDragStart}
          onDragMove={handleLineDragMove}
          onDragEnd={handleLineDragEnd}
          {...lineShadow}
          hitStrokeWidth={40}
        />
      ) : (
        <Arrow
          points={[0, 0, dx, dy]}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={strokeColor}
          pointerLength={12}
          pointerWidth={12}
          lineCap="round"
          lineJoin="round"
          draggable={editable}
          onDragStart={handleLineDragStart}
          onDragMove={handleLineDragMove}
          onDragEnd={handleLineDragEnd}
          {...lineShadow}
          hitStrokeWidth={40}
        />
      )}
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
}, (prev: VectorShapeProps, next: VectorShapeProps) => (
  prev.object === next.object &&
  prev.isSelected === next.isSelected &&
  prev.editable === next.editable &&
  prev.variant === next.variant
))
