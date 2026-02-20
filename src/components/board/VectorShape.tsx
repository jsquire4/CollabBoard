import { memo } from 'react'
import { Group, Line, Circle } from 'react-konva'
import Konva from 'konva'
import { BoardObject, VectorObject } from '@/types/board'
import { ShapeProps, getShadowProps } from './shapeUtils'
import { parseWaypoints, snapAngle45 } from './autoRoute'
import { renderMarker, computeEndpointAngle, MarkerType } from './lineMarkers'
import { buildWaypointSegments } from '@/lib/geometry/waypoints'

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

  // Shared logic for whole-line drag: compute snapped offset and build updates
  const computeLineDragUpdates = (e: Konva.KonvaEventObject<DragEvent>): Partial<BoardObject> => {
    const node = e.target
    let offsetX = node.x()
    let offsetY = node.y()
    if (dragBoundFunc) {
      const snapped = dragBoundFunc({ x: object.x + offsetX, y: object.y + offsetY })
      offsetX = snapped.x - object.x
      offsetY = snapped.y - object.y
    }
    node.x(0)
    node.y(0)

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
    onEndpointDragMove(object.id, computeLineDragUpdates(e))
  }

  const handleLineDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!onEndpointDragEnd) return
    onEndpointDragEnd(object.id, computeLineDragUpdates(e))
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
        draggable={editable}
        onDragStart={handleLineDragStart}
        onDragMove={handleLineDragMove}
        onDragEnd={handleLineDragEnd}
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
                onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
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
