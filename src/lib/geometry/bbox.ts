import type { BoardObject } from '@/types/board'
import { isVectorType } from '@/components/board/shapeUtils'

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Compute the bounding box for a group, given a function that returns the
 * group's non-group descendants.
 *
 * Returns null when the group has no renderable children.
 * The returned box includes an 8px padding on each side.
 */
export function getGroupBoundingBox(
  groupId: string,
  getDescendants: (id: string) => BoardObject[]
): BoundingBox | null {
  const children = getDescendants(groupId).filter(c => c.type !== 'group')
  if (children.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of children) {
    if (isVectorType(c)) {
      const cx2 = c.x2 ?? c.x + c.width
      const cy2 = c.y2 ?? c.y + c.height
      minX = Math.min(minX, c.x, cx2)
      minY = Math.min(minY, c.y, cy2)
      maxX = Math.max(maxX, c.x, cx2)
      maxY = Math.max(maxY, c.y, cy2)
    } else {
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x + c.width)
      maxY = Math.max(maxY, c.y + c.height)
    }
  }

  return { x: minX - 8, y: minY - 8, width: maxX - minX + 16, height: maxY - minY + 16 }
}

/**
 * Returns true when the object's bounding rectangle intersects the given
 * viewport rectangle (expressed in canvas-space coordinates).
 *
 * Groups and file objects always return false (they render nothing on the canvas).
 * A 200px margin is not applied here — the caller is responsible for expanding
 * the viewport bounds before calling if desired.
 */
export function isObjectInViewport(
  obj: BoardObject,
  viewportLeft: number,
  viewportTop: number,
  viewportRight: number,
  viewportBottom: number
): boolean {
  if (obj.type === 'group' || obj.type === 'file') return false

  if (isVectorType(obj)) {
    const ex2 = obj.x2 ?? obj.x + obj.width
    const ey2 = obj.y2 ?? obj.y + obj.height
    const objLeft = Math.min(obj.x, ex2)
    const objTop = Math.min(obj.y, ey2)
    const objRight = Math.max(obj.x, ex2)
    const objBottom = Math.max(obj.y, ey2)
    return objRight >= viewportLeft && objLeft <= viewportRight &&
           objBottom >= viewportTop && objTop <= viewportBottom
  }

  return (obj.x + obj.width) >= viewportLeft && obj.x <= viewportRight &&
         (obj.y + obj.height) >= viewportTop && obj.y <= viewportBottom
}
