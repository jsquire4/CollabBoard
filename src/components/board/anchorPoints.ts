import { BoardObject } from '@/types/board'
import { shapeRegistry } from './shapeRegistry'
import { isVectorType } from './shapeUtils'

export interface AnchorPoint {
  id: string    // "vertex-0", "midpoint-0", "center"
  x: number     // absolute canvas position
  y: number
}

/**
 * Compute anchor points for a shape in absolute canvas coordinates.
 * Accounts for x, y, width, height, rotation, custom_points, and shape type.
 */
export function getShapeAnchors(obj: BoardObject): AnchorPoint[] {
  if (isVectorType(obj.type)) return []
  if (obj.type === 'group') return []
  if (obj.deleted_at) return []

  const w = obj.width
  const h = obj.height
  const rad = ((obj.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  // Transform a local point (relative to shape origin) to absolute canvas coords
  function toAbsolute(lx: number, ly: number): { x: number; y: number } {
    return {
      x: obj.x + lx * cos - ly * sin,
      y: obj.y + lx * sin + ly * cos,
    }
  }

  const anchors: AnchorPoint[] = []

  // Center anchor (always available)
  const center = toAbsolute(w / 2, h / 2)
  anchors.push({ id: 'center', x: center.x, y: center.y })

  // Get local polygon points
  let localPoints: number[] | null = null

  if (obj.custom_points) {
    try { localPoints = JSON.parse(obj.custom_points) } catch { /* fall through */ }
  }

  if (!localPoints) {
    const def = shapeRegistry.get(obj.type)
    if (def?.strategy === 'polygon' && def.getPoints) {
      localPoints = def.getPoints(w, h, obj)
    } else if (def?.strategy === 'rect') {
      localPoints = [0, 0, w, 0, w, h, 0, h]
    } else if (def?.strategy === 'circle') {
      // 4 cardinal points
      localPoints = [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]
    } else if (obj.type === 'sticky_note' || obj.type === 'frame' || obj.type === 'table' || obj.type === 'agent' || obj.type === 'api_object' || obj.type === 'file') {
      // Edge midpoints
      localPoints = [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]
    }
  }

  if (localPoints && localPoints.length >= 4) {
    const numVerts = localPoints.length / 2
    // Vertex anchors
    for (let i = 0; i < numVerts; i++) {
      const lx = localPoints[i * 2]
      const ly = localPoints[i * 2 + 1]
      const abs = toAbsolute(lx, ly)
      anchors.push({ id: `vertex-${i}`, x: abs.x, y: abs.y })
    }
    // Midpoint anchors (between consecutive vertices)
    for (let i = 0; i < numVerts; i++) {
      const j = (i + 1) % numVerts
      const mx = (localPoints[i * 2] + localPoints[j * 2]) / 2
      const my = (localPoints[i * 2 + 1] + localPoints[j * 2 + 1]) / 2
      const abs = toAbsolute(mx, my)
      anchors.push({ id: `midpoint-${i}`, x: abs.x, y: abs.y })
    }
  }

  return anchors
}

/**
 * Find the nearest anchor point within a snap distance.
 * Returns null if no anchor is within range.
 */
export function findNearestAnchor(
  anchors: AnchorPoint[],
  x: number,
  y: number,
  snapDistance: number
): AnchorPoint | null {
  let best: AnchorPoint | null = null
  let bestDist = snapDistance * snapDistance

  for (const anchor of anchors) {
    const dx = anchor.x - x
    const dy = anchor.y - y
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = anchor
    }
  }

  return best
}
