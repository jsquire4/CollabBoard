import { Line } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd } from './shapeUtils'

export function LineShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  editable = true,
}: ShapeProps) {
  const strokeWidth = object.stroke_width ?? 2
  let dash: number[] | undefined
  if (object.stroke_dash) {
    try {
      const parsed = JSON.parse(object.stroke_dash)
      dash = Array.isArray(parsed) ? parsed : undefined
    } catch {
      dash = undefined
    }
  } else {
    dash = undefined
  }

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => onSelect(object.id)

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  // Line from (0,0) to (width, height) - for horizontal: height=0
  const w = Math.max(object.width, 20)
  const h = object.height ?? 0

  return (
    <Line
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      points={[0, 0, w, h]}
      stroke={object.color}
      strokeWidth={isSelected ? Math.max(strokeWidth + 2, 4) : strokeWidth}
      dash={dash}
      lineCap="round"
      lineJoin="round"
      draggable={editable}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      shadowColor={isSelected ? '#0EA5E9' : undefined}
      shadowBlur={isSelected ? 8 : 0}
      hitStrokeWidth={40}
    />
  )
}
