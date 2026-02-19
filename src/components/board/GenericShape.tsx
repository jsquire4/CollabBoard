import { memo } from 'react'
import { Group, Rect, Circle, Line, Text } from 'react-konva'
import Konva from 'konva'
import { BoardObject } from '@/types/board'
import { ShapeProps, handleShapeTransformEnd, getOutlineProps, getShadowProps, areShapePropsEqual } from './shapeUtils'
import { shapeRegistry } from './shapeRegistry'

interface GenericShapeProps extends ShapeProps {
  onStartEdit?: (id: string, node: Konva.Text) => void
  isEditing?: boolean
}

export const GenericShape = memo(function GenericShape({
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
  onStartEdit,
  isEditing = false,
}: GenericShapeProps) {
  const def = shapeRegistry.get(object.type)
  if (!def) return null

  const handleDragStart = () => onDragStart?.(object.id)
  const handleClick = () => onSelect(object.id)

  const outline = getOutlineProps(object, isSelected)
  const shadow = getShadowProps(object)
  const hasText = !!object.text
  const padding = object.text_padding ?? 8
  const w = object.width
  const h = object.height

  // ── Shared primitive props ──────────────────────────────
  const primitiveVisualProps = {
    fill: object.color,
    ...shadow,
    stroke: outline.stroke,
    strokeWidth: outline.strokeWidth,
    dash: outline.dash,
    ...(def.konvaProps?.(object) ?? {}),
  }

  // ── Build the Konva primitive element ──────────────────
  function renderPrimitive(asChild: boolean) {
    // When asChild=false, this is the top-level node: add position/interaction props
    // When asChild=true, it's inside a Group: position is relative (0,0)
    const interactionProps = asChild ? {} : {
      x: def!.centerOrigin ? object.x + w / 2 : object.x,
      y: def!.centerOrigin ? object.y + h / 2 : object.y,
      rotation: object.rotation,
      opacity: object.opacity ?? 1,
      draggable: editable,
      ...(dragBoundFunc && !def!.centerOrigin ? { dragBoundFunc } : {}),
      ...(dragBoundFunc && def!.centerOrigin ? {
        dragBoundFunc: (pos: { x: number; y: number }) => {
          const snapped = dragBoundFunc({ x: pos.x - w / 2, y: pos.y - h / 2 })
          return { x: snapped.x + w / 2, y: snapped.y + h / 2 }
        },
      } : {}),
      onClick: handleClick,
      onTap: handleClick,
      onDragStart: handleDragStart,
      onDragEnd: asChild ? undefined : (e: Konva.KonvaEventObject<DragEvent>) => {
        if (def!.centerOrigin) {
          onDragEnd(object.id, e.target.x() - w / 2, e.target.y() - h / 2)
        } else {
          onDragEnd(object.id, e.target.x(), e.target.y())
        }
      },
      onDragMove: asChild ? undefined : (e: Konva.KonvaEventObject<DragEvent>) => {
        if (def!.centerOrigin) {
          onDragMove?.(object.id, e.target.x() - w / 2, e.target.y() - h / 2)
        } else {
          onDragMove?.(object.id, e.target.x(), e.target.y())
        }
      },
      onTransformEnd: asChild ? undefined : (e: Konva.KonvaEventObject<Event>) => {
        if (def!.handleTransformEnd) {
          def!.handleTransformEnd(e, object, onTransformEnd)
        } else {
          handleShapeTransformEnd(e, object, onTransformEnd)
        }
      },
      onContextMenu: asChild ? undefined : (e: Konva.KonvaEventObject<PointerEvent>) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      },
      onDblClick: asChild ? undefined : () => onDoubleClick?.(object.id),
      onDblTap: asChild ? undefined : () => onDoubleClick?.(object.id),
    }

    const refProp = asChild ? {} : {
      ref: (node: Konva.Node | null) => shapeRef(object.id, node),
    }

    // If custom_points exist, always render as polygon (vertex-edited shape)
    if (object.custom_points) {
      let points: number[]
      try { points = JSON.parse(object.custom_points) } catch { points = def!.getPoints?.(w, h, object) ?? [] }
      return (
        <Line
          {...refProp}
          {...interactionProps}
          points={points}
          closed
          {...primitiveVisualProps}
        />
      )
    }

    switch (def!.strategy) {
      case 'rect':
        return (
          <Rect
            {...refProp}
            {...interactionProps}
            width={w}
            height={h}
            {...primitiveVisualProps}
          />
        )
      case 'circle': {
        const radius = Math.min(w, h) / 2
        if (asChild) {
          return (
            <Circle
              x={w / 2}
              y={h / 2}
              radius={radius}
              {...primitiveVisualProps}
            />
          )
        }
        return (
          <Circle
            {...refProp}
            {...interactionProps}
            radius={radius}
            {...primitiveVisualProps}
          />
        )
      }
      case 'polygon': {
        const points = def!.getPoints!(w, h, object)
        return (
          <Line
            {...refProp}
            {...interactionProps}
            points={points}
            closed
            {...primitiveVisualProps}
          />
        )
      }
      default:
        return null
    }
  }

  // ── No text: bare primitive as top-level node ──────────
  if (!hasText) {
    return renderPrimitive(false)
  }

  // ── Has text: Group wrapper ────────────────────────────
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(object.id, e.target.x(), e.target.y())
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

  const inset = def.getTextInset(w, h, padding)

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
      onTransformEnd={(e: Konva.KonvaEventObject<Event>) => {
        handleShapeTransformEnd(e, object, onTransformEnd)
      }}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      opacity={object.opacity ?? 1}
    >
      {renderPrimitive(true)}
      {!isEditing && (
        <Text
          x={inset.x}
          y={inset.y}
          width={inset.width}
          height={inset.height}
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
