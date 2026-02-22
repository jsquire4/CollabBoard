import type Konva from 'konva'
import type { BoardObject } from '@/types/board'
import type { VectorObject } from '@/types/boardObject'
import { computeEndpointAngle, type MarkerType } from './lineMarkers'
import { parseWaypoints } from './autoRoute'

function getMarkerIndices(obj: BoardObject): { startMarkerIdx: number; endMarkerIdx: number } {
  const markerStart: MarkerType = (obj.marker_start ?? 'none') as MarkerType
  const defaultEnd: MarkerType = obj.type === 'arrow' ? 'arrow' : 'none'
  const markerEnd: MarkerType = (obj.marker_end ?? defaultEnd) as MarkerType
  const hasStart = markerStart !== 'none'
  const hasEnd = markerEnd !== 'none'
  return {
    startMarkerIdx: hasStart ? 1 : -1,
    endMarkerIdx: hasEnd ? (hasStart ? 2 : 1) : -1,
  }
}

function buildRelativePoints(
  x: number, y: number, x2: number, y2: number,
  routePoints: number[],
): number[] {
  const pts: number[] = [0, 0]
  for (let i = 0; i < routePoints.length; i += 2) {
    pts.push(routePoints[i] - x, routePoints[i + 1] - y)
  }
  pts.push(x2 - x, y2 - y)
  return pts
}

/**
 * Imperatively update a connector's Konva Group (Line + markers) to reflect
 * new position data without triggering a React re-render.
 *
 * Used during shape drag to update connected connectors in real time.
 */
export function syncConnectorVisual(
  group: Konva.Group,
  obj: BoardObject,
  updates: Partial<BoardObject>,
): void {
  const newX = (updates.x ?? obj.x) as number
  const newY = (updates.y ?? obj.y) as number
  const newX2 = (updates.x2 ?? (obj as VectorObject).x2 ?? obj.x + obj.width) as number
  const newY2 = (updates.y2 ?? (obj as VectorObject).y2 ?? obj.y + obj.height) as number

  const waypointsStr = updates.waypoints !== undefined ? updates.waypoints : obj.waypoints
  const manualWaypoints = parseWaypoints(waypointsStr as string | null | undefined)

  const routePoints = manualWaypoints.length > 0 ? manualWaypoints : []
  const pts = buildRelativePoints(newX, newY, newX2, newY2, routePoints)

  group.x(newX)
  group.y(newY)

  const lineNode = group.children?.[0]
  if (lineNode && 'points' in lineNode) {
    ;(lineNode as Konva.Line).points(pts)
  }

  if (pts.length >= 4) {
    const { startMarkerIdx, endMarkerIdx } = getMarkerIndices(obj)
    if (startMarkerIdx > 0) {
      const m = group.children?.[startMarkerIdx]
      if (m) {
        m.x(pts[0])
        m.y(pts[1])
        m.rotation((computeEndpointAngle(pts, 'start') * 180) / Math.PI)
      }
    }
    if (endMarkerIdx > 0) {
      const m = group.children?.[endMarkerIdx]
      if (m) {
        m.x(pts[pts.length - 2])
        m.y(pts[pts.length - 1])
        m.rotation((computeEndpointAngle(pts, 'end') * 180) / Math.PI)
      }
    }
  }

  group.getLayer()?.batchDraw()
}

/**
 * Reset a connector's Konva Group nodes to their React-rendered state so
 * react-konva reconciliation sees real diffs on the next render.
 *
 * Must be called on dragEnd before committing state updates.
 */
export function resetConnectorVisual(
  group: Konva.Group,
  obj: BoardObject,
): void {
  const x = obj.x
  const y = obj.y
  const x2 = (obj as VectorObject).x2 ?? obj.x + obj.width
  const y2 = (obj as VectorObject).y2 ?? obj.y + obj.height

  const manualWaypoints = parseWaypoints(obj.waypoints)
  const routePoints = manualWaypoints.length > 0 ? manualWaypoints : []
  const pts = buildRelativePoints(x, y, x2, y2, routePoints)

  group.x(x)
  group.y(y)

  const lineNode = group.children?.[0]
  if (lineNode && 'points' in lineNode) {
    ;(lineNode as Konva.Line).points(pts)
  }

  const { startMarkerIdx, endMarkerIdx } = getMarkerIndices(obj)
  if (startMarkerIdx > 0) {
    const m = group.children?.[startMarkerIdx]
    if (m) {
      m.x(pts[0])
      m.y(pts[1])
      m.rotation((computeEndpointAngle(pts, 'start') * 180) / Math.PI)
    }
  }
  if (endMarkerIdx > 0) {
    const m = group.children?.[endMarkerIdx]
    if (m) {
      m.x(pts[pts.length - 2])
      m.y(pts[pts.length - 1])
      m.rotation((computeEndpointAngle(pts, 'end') * 180) / Math.PI)
    }
  }
}
