import { BoardObject } from '@/types/board'
import { getShapeAnchors } from './anchorPoints'

/**
 * Compute an orthogonal (90-degree turn) route between two connected shapes.
 * Returns intermediate waypoints as absolute canvas coordinates [x1,y1,x2,y2,...].
 * Returns null if auto-routing is not applicable (missing connections, manual waypoints exist).
 */
export function computeAutoRoute(
  connector: BoardObject,
  objects: Map<string, BoardObject>
): number[] | null {
  // Only auto-route when both ends are connected and no manual waypoints
  if (!connector.connect_start_id || !connector.connect_end_id) return null
  if (connector.waypoints) return null

  const startShape = objects.get(connector.connect_start_id)
  const endShape = objects.get(connector.connect_end_id)
  if (!startShape || !endShape) return null

  // Get the anchor positions
  const startAnchor = connector.connect_start_anchor
  const endAnchor = connector.connect_end_anchor
  if (!startAnchor || !endAnchor) return null

  const startAnchors = getShapeAnchors(startShape)
  const endAnchors = getShapeAnchors(endShape)

  const sa = startAnchors.find(a => a.id === startAnchor)
  const ea = endAnchors.find(a => a.id === endAnchor)
  if (!sa || !ea) return null

  // Determine exit direction from start anchor
  const startDir = getExitDirection(sa, startShape)
  const endDir = getExitDirection(ea, endShape)

  // Offset distance from shape edge
  const OFFSET = 20

  // Compute offset points (extending perpendicular from shape)
  const p1 = offsetPoint(sa.x, sa.y, startDir, OFFSET)
  const p2 = offsetPoint(ea.x, ea.y, endDir, OFFSET)

  // Simple L-route or Z-route
  if (isOpposite(startDir, endDir)) {
    // Shapes facing each other — single midpoint (L-route)
    if (startDir === 'right' || startDir === 'left') {
      const midX = (p1.x + p2.x) / 2
      return [midX, p1.y, midX, p2.y]
    } else {
      const midY = (p1.y + p2.y) / 2
      return [p1.x, midY, p2.x, midY]
    }
  }

  // Same direction or perpendicular — Z-route with two bends
  if (startDir === 'right' || startDir === 'left') {
    return [p1.x, p1.y, p1.x, p2.y, p2.x, p2.y]
  } else {
    return [p1.x, p1.y, p2.x, p1.y, p2.x, p2.y]
  }
}

type Direction = 'up' | 'down' | 'left' | 'right'

function getExitDirection(anchor: { x: number; y: number; id: string }, shape: BoardObject): Direction {
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2

  // Use relative position of anchor to shape center
  const dx = anchor.x - cx
  const dy = anchor.y - cy

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left'
  } else {
    return dy > 0 ? 'down' : 'up'
  }
}

function offsetPoint(x: number, y: number, dir: Direction, dist: number): { x: number; y: number } {
  switch (dir) {
    case 'up': return { x, y: y - dist }
    case 'down': return { x, y: y + dist }
    case 'left': return { x: x - dist, y }
    case 'right': return { x: x + dist, y }
  }
}

function isOpposite(a: Direction, b: Direction): boolean {
  return (a === 'left' && b === 'right') || (a === 'right' && b === 'left') ||
         (a === 'up' && b === 'down') || (a === 'down' && b === 'up')
}

/**
 * Snap an angle to the nearest 45-degree increment.
 * Returns the snapped position given a reference point and distance.
 */
export function snapAngle45(
  refX: number, refY: number,
  targetX: number, targetY: number
): { x: number; y: number } {
  const dx = targetX - refX
  const dy = targetY - refY
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return { x: targetX, y: targetY }

  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)

  return {
    x: refX + dist * Math.cos(snapped),
    y: refY + dist * Math.sin(snapped),
  }
}

/**
 * Parse waypoints from JSON string. Returns empty array if invalid/null.
 */
export function parseWaypoints(waypointsStr: string | null | undefined): number[] {
  if (!waypointsStr) return []
  try {
    const parsed = JSON.parse(waypointsStr)
    if (Array.isArray(parsed) && parsed.length >= 2 && parsed.length % 2 === 0) {
      return parsed
    }
  } catch { /* ignore */ }
  return []
}
