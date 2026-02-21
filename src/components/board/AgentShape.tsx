import { memo } from 'react'
import { Group, Circle, Text } from 'react-konva'
import Konva from 'konva'
import { AgentObject } from '@/types/boardObject'
import { ShapeProps, getOutlineProps, getShadowProps, areShapePropsEqual } from './shapeUtils'

export const AGENT_STATE_COLORS: Record<string, string> = {
  idle: '#8896A5',
  thinking: '#5B8DEF',
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
  const r = Math.min(w, h) / 2

  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)

  const stateColor = AGENT_STATE_COLORS[object.agent_state ?? 'idle']
  const ringRadius = Math.max(0, r - 8)

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
      onDblClick={() => onDoubleClick?.(object.id)}
      onDblTap={() => onDoubleClick?.(object.id)}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
    >
      {/* Circular background */}
      <Circle
        x={r}
        y={r}
        radius={r}
        fill={object.color}
        stroke={outline.stroke}
        strokeWidth={outline.strokeWidth}
        dash={outline.dash}
        {...shadow}
      />

      {/* State ring centered in the circle */}
      <Circle
        x={r}
        y={r}
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
        fontSize={object.font_size ?? 14}
        fontFamily={object.font_family ?? 'sans-serif'}
        fontStyle={object.font_style ?? 'normal'}
        wrap="word"
        listening={false}
      />
    </Group>
  )
}, areShapePropsEqual)
