import { BoardObject } from '@/types/board'
import { isVectorType } from '@/components/board/shapeUtils'

interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Pure function: given sorted objects and a marquee rectangle,
 * returns IDs of objects that intersect the marquee (AABB test).
 *
 * This is the core selection logic extracted from Canvas.tsx's handleStageMouseUp.
 */
export function getObjectsInMarquee(
  sortedObjects: BoardObject[],
  marquee: MarqueeRect,
  activeGroupId: string | null
): string[] {
  if (marquee.width <= 2 || marquee.height <= 2) return []

  const selected: string[] = []
  const marqRight = marquee.x + marquee.width
  const marqBottom = marquee.y + marquee.height

  for (const obj of sortedObjects) {
    if (obj.type === 'group') continue
    if (activeGroupId && obj.parent_id !== activeGroupId) continue

    let objLeft: number, objTop: number, objRight: number, objBottom: number

    if (isVectorType(obj.type)) {
      const ex2 = obj.x2 ?? obj.x + obj.width
      const ey2 = obj.y2 ?? obj.y + obj.height
      objLeft = Math.min(obj.x, ex2)
      objTop = Math.min(obj.y, ey2)
      objRight = Math.max(obj.x, ex2)
      objBottom = Math.max(obj.y, ey2)
    } else {
      objLeft = obj.x
      objTop = obj.y
      objRight = obj.x + obj.width
      objBottom = obj.y + obj.height
    }

    const intersects =
      objLeft < marqRight &&
      objRight > marquee.x &&
      objTop < marqBottom &&
      objBottom > marquee.y

    if (intersects) {
      selected.push(obj.id)
    }
  }

  return selected
}
