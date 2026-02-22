import { memo } from 'react'
import { Group, Line, Circle } from 'react-konva'
import Konva from 'konva'
import { BoardObject, VectorObject } from '@/types/board'
import { ShapeProps, getShadowProps } from './shapeUtils'
import { parseWaypoints, snapAngle45 } from './autoRoute'
import { renderMarker, computeEndpointAngle, MarkerType } from './lineMarkers'
import { buildWaypointSegments } from '@/lib/geometry/waypoints'
import { resetConnectorVisual } from './vectorImperative'

interface VectorShapeProps extends Omit<ShapeProps, 'object'> {
  object: VectorObject
  variant: 'line' | 'arrow' | 'data_connector'
  /** Pre-computed auto-route waypoints (absolute coords, only when no manual waypoints) */
  autoRoutePoints?: number[] | null
  onWaypointDragEnd?: (id: string, waypointIndex: number, x: number, y: number) => void
  onWaypointInsert?: (id: string, afterSegmentIndex: number) => void
  onWaypointDelete?: (id: string, waypointIndex: number) => void
}

export const VectorShape = memo(function VectorShape({
  object,
  isSelected,
  onSelect,
  shapeRef,
  onContextMenu,
  onDragStart,
  editable = true,
  dragBoundFunc,
  onEndpointDragMove,
  onEndpointDragEnd,
  variant,
  autoRoutePoints,
  onWaypointDragEnd,
  onWaypointInsert,
  onWaypointDelete,
}: VectorShapeProps) {
  const strokeWidth = object.stroke_width ?? 2

  // Parse dash pattern (all variants)
  let dash: number[] | undefined
  if (object.stroke_dash) {
    try {
      const parsed = JSON.parse(object.stroke_dash)
      dash = Array.isArray(parsed) ? parsed : undefined
    } catch {
      dash = undefined
    }
  }

  // data_connector overrides: force dashed purple style, no default arrow markers
  if (variant === 'data_connector') {
    dash = [8, 6]
  }

  // Resolve marker types — backward compat: arrows default to filled triangle end
  const markerStart: MarkerType = (object.marker_start ?? 'none') as MarkerType
  const markerEnd: MarkerType = (object.marker_end ?? (variant === 'arrow' ? 'arrow' : 'none')) as MarkerType

  // Compute endpoint
  const x2 = object.x2
  const y2 = object.y2
  const dx = x2 - object.x
  const dy = y2 - object.y

  // Parse manual waypoints (absolute coords) or use auto-route
  const manualWaypoints = parseWaypoints(object.waypoints)
  const hasManualWaypoints = manualWaypoints.length > 0
  const routePoints = hasManualWaypoints ? manualWaypoints : (autoRoutePoints ?? [])

  // Build full points array relative to group origin (object.x, object.y)
  // Start at (0,0), through waypoints, end at (dx, dy)
  const allPoints: number[] = [0, 0]
  for (let i = 0; i < routePoints.length; i += 2) {
    // Both manual and auto-route waypoints are absolute — convert to relative
    allPoints.push(routePoints[i] - object.x, routePoints[i + 1] - object.y)
  }
  allPoints.push(dx, dy)

  const handleClick = () => onSelect(object.id)
  const handleLineDragStart = () => onDragStart?.(object.id)

  // Shared logic for whole-line drag: compute snapped offset and build updates.
  // The Group is the draggable node so all children (Line, markers, anchors)
  // move together.  Group starts at (object.x, object.y), so the drag offset
  // is node.pos − object.pos.  resetNode restores the Group to its pre-drag
  // origin on dragEnd so the state update is the sole positional driver.
  const computeLineDragUpdates = (e: Konva.KonvaEventObject<DragEvent>, resetNode: boolean): Partial<BoardObject> => {
    const node = e.target
    let offsetX = node.x() - object.x
    let offsetY = node.y() - object.y
    if (dragBoundFunc) {
      const snapped = dragBoundFunc({ x: object.x + offsetX, y: object.y + offsetY })
      offsetX = snapped.x - object.x
      offsetY = snapped.y - object.y
    }
    if (resetNode) {
      node.x(object.x)
      node.y(object.y)
    }

    const updates: Partial<BoardObject> = {
      x: object.x + offsetX,
      y: object.y + offsetY,
      x2: x2 + offsetX,
      y2: y2 + offsetY,
    }
    if (hasManualWaypoints) {
      const newWaypoints: number[] = []
      for (let i = 0; i < manualWaypoints.length; i += 2) {
        newWaypoints.push(manualWaypoints[i] + offsetX, manualWaypoints[i + 1] + offsetY)
      }
      updates.waypoints = JSON.stringify(newWaypoints)
    }
    return updates
  }

  const handleLineDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragMove) return
    // Group is the draggable — Konva moves the entire Group (Line + markers +
    // anchors) together.  Don't reset; just broadcast the new position.
    onEndpointDragMove(object.id, computeLineDragUpdates(e, false))
  }

  const handleLineDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragEnd) return
    onEndpointDragEnd(object.id, computeLineDragUpdates(e, true))
  }

  // Marker child indices inside the Group (Line is always [0]).
  // False-y React conditionals produce no Konva node, so indices shift.
  const hasStartMarker = markerStart !== 'none' && allPoints.length >= 4
  const hasEndMarker = markerEnd !== 'none' && allPoints.length >= 4
  const startMarkerIdx = hasStartMarker ? 1 : -1
  const endMarkerIdx = hasEndMarker ? (hasStartMarker ? 2 : 1) : -1

  // Imperatively update the Konva Line + both markers so they follow the
  // anchor without a React re-render.  The dragged marker moves + rotates;
  // the fixed marker stays in place but its rotation updates because the
  // line angle at that endpoint changes when the other end moves.
  const syncLineDrag = (
    group: Konva.Group,
    startX: number, startY: number,
    endX: number, endY: number,
    draggedEndpoint: 'start' | 'end',
  ) => {
    const pts: number[] = [startX, startY]
    for (let i = 0; i < routePoints.length; i += 2) {
      pts.push(routePoints[i] - object.x, routePoints[i + 1] - object.y)
    }
    pts.push(endX, endY)

    const lineNode = group.children?.[0]
    if (lineNode && 'points' in lineNode) {
      ;(lineNode as Konva.Line).points(pts)
    }

    if (pts.length >= 4) {
      const dragIdx = draggedEndpoint === 'start' ? startMarkerIdx : endMarkerIdx
      const dragNode = dragIdx > 0 ? group.children?.[dragIdx] : undefined
      if (dragNode) {
        const angle = computeEndpointAngle(pts, draggedEndpoint)
        dragNode.x(draggedEndpoint === 'start' ? startX : endX)
        dragNode.y(draggedEndpoint === 'start' ? startY : endY)
        dragNode.rotation((angle * 180) / Math.PI)
      }

      const fixedEnd: 'start' | 'end' = draggedEndpoint === 'start' ? 'end' : 'start'
      const fixedIdx = fixedEnd === 'start' ? startMarkerIdx : endMarkerIdx
      const fixedNode = fixedIdx > 0 ? group.children?.[fixedIdx] : undefined
      if (fixedNode) {
        fixedNode.rotation((computeEndpointAngle(pts, fixedEnd) * 180) / Math.PI)
      }
    }

    group.getLayer()?.batchDraw()
  }

  // Start anchor drag (updates x, y — keeps x2/y2 fixed)
  const handleStartAnchorDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    if (!onEndpointDragMove) return
    const node = e.target
    syncLineDrag(node.parent as Konva.Group, node.x(), node.y(), dx, dy, 'start')
    onEndpointDragMove(object.id, { x: object.x + node.x(), y: object.y + node.y() })
  }

  const handleStartAnchorDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    if (!onEndpointDragEnd) return
    const node = e.target
    const newX = object.x + node.x()
    const newY = object.y + node.y()
    node.x(0)
    node.y(0)
    resetConnectorVisual(node.parent as Konva.Group, object)
    onEndpointDragEnd(object.id, { x: newX, y: newY })
  }

  // End anchor drag (updates x2, y2 — keeps x/y fixed)
  const handleEndAnchorDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    if (!onEndpointDragMove) return
    const node = e.target
    syncLineDrag(node.parent as Konva.Group, 0, 0, node.x(), node.y(), 'end')
    onEndpointDragMove(object.id, { x2: object.x + node.x(), y2: object.y + node.y() })
  }

  const handleEndAnchorDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    if (!onEndpointDragEnd) return
    const node = e.target
    const newX2 = object.x + node.x()
    const newY2 = object.y + node.y()
    node.x(dx)
    node.y(dy)
    resetConnectorVisual(node.parent as Konva.Group, object)
    onEndpointDragEnd(object.id, { x2: newX2, y2: newY2 })
  }

  const strokeColorBase = object.stroke_color ?? object.color
  const strokeColor = variant === 'data_connector' && !object.stroke_color
    ? '#1E4330'
    : strokeColorBase
  const effectiveStrokeWidth = isSelected ? Math.max(strokeWidth + 2, 4) : strokeWidth
  const shadowProps = getShadowProps(object)

  // Line-specific: selection stroke boost + custom shadow when selected
  const lineShadow = variant === 'line' || variant === 'data_connector'
    ? {
        shadowColor: isSelected ? '#1B3A6B' : shadowProps.shadowColor,
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
      draggable={editable}
      onDragStart={handleLineDragStart}
      onDragMove={handleLineDragMove}
      onDragEnd={handleLineDragEnd}
      onClick={handleClick}
      onTap={handleClick}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      opacity={object.opacity ?? 1}
    >
      <Line
        points={allPoints}
        stroke={strokeColor}
        strokeWidth={effectiveStrokeWidth}
        dash={dash}
        lineCap="round"
        lineJoin="round"
        {...lineShadow}
        hitStrokeWidth={40}
      />
      {/* Start marker */}
      {markerStart !== 'none' && allPoints.length >= 4 && renderMarker({
        type: markerStart,
        x: allPoints[0],
        y: allPoints[1],
        angle: computeEndpointAngle(allPoints, 'start'),
        strokeWidth: effectiveStrokeWidth,
        color: strokeColor,
        markerKey: `marker-start-${object.id}`,
      })}
      {/* End marker */}
      {markerEnd !== 'none' && allPoints.length >= 4 && renderMarker({
        type: markerEnd,
        x: allPoints[allPoints.length - 2],
        y: allPoints[allPoints.length - 1],
        angle: computeEndpointAngle(allPoints, 'end'),
        strokeWidth: effectiveStrokeWidth,
        color: strokeColor,
        markerKey: `marker-end-${object.id}`,
      })}
      {/* Endpoint anchors — only visible when selected and editable */}
      {isSelected && editable && (
        <>
          <Circle
            x={0}
            y={0}
            radius={6}
            fill="white"
            stroke="#1B3A6B"
            strokeWidth={2}
            draggable
            onMouseDown={(e) => { e.cancelBubble = true }}
            onDragMove={handleStartAnchorDragMove}
            onDragEnd={handleStartAnchorDragEnd}
          />
          <Circle
            x={dx}
            y={dy}
            radius={6}
            fill="white"
            stroke="#1B3A6B"
            strokeWidth={2}
            draggable
            onMouseDown={(e) => { e.cancelBubble = true }}
            onDragMove={handleEndAnchorDragMove}
            onDragEnd={handleEndAnchorDragEnd}
          />

          {/* Waypoint anchors — draggable with 45° angle snap */}
          {hasManualWaypoints && manualWaypoints.map((_, i) => {
            if (i % 2 !== 0) return null
            const wpIndex = i / 2
            const wpRelX = manualWaypoints[i] - object.x
            const wpRelY = manualWaypoints[i + 1] - object.y
            return (
              <Circle
                key={`wp-${wpIndex}`}
                x={wpRelX}
                y={wpRelY}
                radius={5}
                fill="#FAF8F4"
                stroke="#1B3A6B"
                strokeWidth={2}
                draggable
                onMouseDown={(e) => { e.cancelBubble = true }}
                onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                  e.cancelBubble = true
                  if (!onWaypointDragEnd) return
                  const node = e.target
                  // Get absolute position
                  let absX = object.x + node.x()
                  let absY = object.y + node.y()
                  // Get previous and next points for angle snapping
                  const prevX = wpIndex === 0 ? object.x : manualWaypoints[(wpIndex - 1) * 2]
                  const prevY = wpIndex === 0 ? object.y : manualWaypoints[(wpIndex - 1) * 2 + 1]
                  const snapped = snapAngle45(prevX, prevY, absX, absY)
                  absX = snapped.x
                  absY = snapped.y
                  // Reset node position (will be updated from state)
                  node.x(wpRelX)
                  node.y(wpRelY)
                  onWaypointDragEnd(object.id, wpIndex, absX, absY)
                }}
                onDblClick={() => onWaypointDelete?.(object.id, wpIndex)}
                onDblTap={() => onWaypointDelete?.(object.id, wpIndex)}
              />
            )
          })}

          {/* Mid-segment add-waypoint buttons */}
          {(() => {
            const segments = buildWaypointSegments(
              object.x, object.y, x2, y2,
              manualWaypoints, hasManualWaypoints, routePoints
            )
            return segments.map((seg) => {
              const midX = (seg.x1 + seg.x2) / 2 - object.x
              const midY = (seg.y1 + seg.y2) / 2 - object.y
              // Only show add button if segment is long enough
              const segLen = Math.sqrt((seg.x2 - seg.x1) ** 2 + (seg.y2 - seg.y1) ** 2)
              if (segLen < 30) return null
              return (
                <Group
                  key={`add-wp-${seg.segIndex}`}
                  x={midX}
                  y={midY}
                  onClick={() => onWaypointInsert?.(object.id, seg.segIndex)}
                  onTap={() => onWaypointInsert?.(object.id, seg.segIndex)}
                >
                  <Circle
                    radius={7}
                    fill="white"
                    stroke="#1B3A6B"
                    strokeWidth={1.5}
                  />
                  <Line
                    points={[-3, 0, 3, 0]}
                    stroke="#1B3A6B"
                    strokeWidth={1.5}
                    lineCap="round"
                  />
                  <Line
                    points={[0, -3, 0, 3]}
                    stroke="#1B3A6B"
                    strokeWidth={1.5}
                    lineCap="round"
                  />
                </Group>
              )
            })
          })()}
        </>
      )}
    </Group>
  )
}, (prev: VectorShapeProps, next: VectorShapeProps) => {
  if (
    prev.object !== next.object ||
    prev.isSelected !== next.isSelected ||
    prev.editable !== next.editable ||
    prev.variant !== next.variant ||
    prev.onWaypointDragEnd !== next.onWaypointDragEnd ||
    prev.onWaypointInsert !== next.onWaypointInsert ||
    prev.onWaypointDelete !== next.onWaypointDelete ||
    prev.onEndpointDragMove !== next.onEndpointDragMove ||
    prev.onEndpointDragEnd !== next.onEndpointDragEnd
  ) return false
  // Shallow array comparison for autoRoutePoints (new array each render)
  const a = prev.autoRoutePoints
  const b = next.autoRoutePoints
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
})
