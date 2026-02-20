import { memo } from 'react'
import { Group, Rect, Circle, Text } from 'react-konva'
import Konva from 'konva'
import { AgentObject } from '@/types/boardObject'
import { ShapeProps, getOutlineProps, getShadowProps, areShapePropsEqual } from './shapeUtils'

export const AGENT_STATE_COLORS: Record<string, string> = {
  idle: '#94A3B8',
  thinking: '#3B82F6',
  done: '#22C55E',
  error: '#EF4444',
}

interface AgentShapeProps extends ShapeProps {
  object: AgentObject
  onAgentClick: (id: string) => void
}

export const AgentShape = memo(function AgentShape({
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
  dragBoundFunc,
  onAgentClick,
}: AgentShapeProps) {
  const w = object.width
  const h = object.height

  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)

  const stateColor = AGENT_STATE_COLORS[object.agent_state ?? 'idle']
  const ringRadius = Math.max(0, Math.min(w, h) / 2 - 8)

  const handleClick = () => {
    onSelect(object.id)
    onAgentClick(object.id)
  }

  const handleDragStart = () => onDragStart?.(object.id)

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(object.id, e.target.x(), e.target.y())
  }

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)
    onTransformEnd(object.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(5, w * scaleX),
      height: Math.max(5, h * scaleY),
      rotation: node.rotation(),
    })
  }

  return (
    <Group
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      rotation={object.rotation}
      opacity={object.opacity ?? 1}
      draggable={editable}
      dragBoundFunc={dragBoundFunc}
      onClick={handleClick}
      onTap={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onTransformEnd={handleTransformEnd}
      onDblClick={() => onDoubleClick?.(object.id)}
      onDblTap={() => onDoubleClick?.(object.id)}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
    >
      {/* Background rect */}
      <Rect
        width={w}
        height={h}
        fill={object.color}
        cornerRadius={8}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
        {...shadow}
      />

      {/* State ring centered in the shape */}
      <Circle
        x={w / 2}
        y={h / 2}
        radius={ringRadius}
        fill={undefined}
        stroke={stateColor}
        strokeWidth={4}
        listening={false}
      />

      {/* Text label centered */}
      <Text
        x={0}
        y={0}
        width={w}
        height={h}
        text={object.text || 'Agent'}
        align="center"
        verticalAlign="middle"
        fill={object.text_color ?? '#000000'}
        fontSize={object.font_size ?? 16}
        fontFamily={object.font_family ?? 'sans-serif'}
        fontStyle={object.font_style ?? 'normal'}
        wrap="word"
        listening={false}
      />
    </Group>
  )
}, areShapePropsEqual)
