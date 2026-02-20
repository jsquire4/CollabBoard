export interface WaypointSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  segIndex: number
}

/**
 * Build the list of segment endpoint pairs for waypoint mid-point buttons.
 *
 * When manual waypoints exist, they are used directly; otherwise the
 * auto-route points are used. Segments are expressed in absolute coordinates.
 *
 * @param startX     Absolute x of the line's start endpoint
 * @param startY     Absolute y of the line's start endpoint
 * @param endX       Absolute x of the line's end endpoint
 * @param endY       Absolute y of the line's end endpoint
 * @param waypoints  Flat [x1, y1, x2, y2, ...] manual waypoint array (absolute)
 * @param hasManualWaypoints  True when `waypoints` was parsed from user-set data
 * @param routePoints  Flat auto-route point array (absolute); used only when !hasManualWaypoints
 */
export function buildWaypointSegments(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  waypoints: number[],
  hasManualWaypoints: boolean,
  routePoints: number[]
): WaypointSegment[] {
  const segments: WaypointSegment[] = []
  const pts = hasManualWaypoints ? waypoints : routePoints
  const numWp = pts.length / 2

  if (numWp > 0) {
    segments.push({ x1: startX, y1: startY, x2: pts[0], y2: pts[1], segIndex: 0 })
    for (let i = 0; i < numWp - 1; i++) {
      segments.push({
        x1: pts[i * 2],
        y1: pts[i * 2 + 1],
        x2: pts[(i + 1) * 2],
        y2: pts[(i + 1) * 2 + 1],
        segIndex: i + 1,
      })
    }
    segments.push({
      x1: pts[(numWp - 1) * 2],
      y1: pts[(numWp - 1) * 2 + 1],
      x2: endX,
      y2: endY,
      segIndex: numWp,
    })
  } else {
    segments.push({ x1: startX, y1: startY, x2: endX, y2: endY, segIndex: 0 })
  }

  return segments
}
