/**
 * Placement helpers for agent tools — find open areas on the board.
 * Uses spiral search from center so objects propagate outward evenly in all directions.
 */

import type { BoardObject } from '@/types/board'

const PLACEMENT_STEP = 220
const PLACEMENT_MARGIN = 40
const DEFAULT_CENTER = { x: 500, y: 400 }

function rectsOverlapWithMargin(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  margin: number,
): boolean {
  return ax - margin < bx + bw + margin && ax + aw + margin > bx - margin &&
         ay - margin < by + bh + margin && ay + ah + margin > by - margin
}

/** Yields (dx, dy) offsets in spiral order from center (ring 0, then ring 1, etc.) */
function* spiralOffsets(): Generator<[number, number]> {
  yield [0, 0]
  for (let r = 1; r <= 20; r++) {
    // Ring r: walk perimeter clockwise from (r, 0)
    for (let j = 0; j < r; j++) yield [r, j]
    for (let i = r; i > -r; i--) yield [i, r]
    for (let j = r; j > -r; j--) yield [-r, j]
    for (let i = -r; i < r; i++) yield [i, -r]
    for (let j = -r; j < 0; j++) yield [r, j]
  }
}

function getCentroid(objects: Map<string, BoardObject>): { x: number; y: number } {
  let sumX = 0
  let sumY = 0
  let count = 0
  for (const obj of objects.values()) {
    if (obj.deleted_at) continue
    const x = obj.x ?? 0
    const y = obj.y ?? 0
    const w = obj.width ?? 0
    const h = obj.height ?? 0
    sumX += x + w / 2
    sumY += y + h / 2
    count++
  }
  if (count === 0) return DEFAULT_CENTER
  return { x: sumX / count, y: sumY / count }
}

/**
 * Find the next open area that fits a rect of (width, height) without overlapping
 * existing objects. Searches outward in a spiral from the center (centroid of
 * objects, or default origin when empty) so placement propagates evenly in all
 * directions rather than only to the right.
 */
export function findOpenArea(
  objects: Map<string, BoardObject>,
  width: number,
  height: number,
  centerHint?: { x: number; y: number },
): { x: number; y: number } {
  const center = centerHint ?? getCentroid(objects)

  for (const [di, dj] of spiralOffsets()) {
    const x = center.x + di * PLACEMENT_STEP - width / 2
    const y = center.y + dj * PLACEMENT_STEP - height / 2

    let overlaps = false
    for (const obj of objects.values()) {
      if (obj.deleted_at) continue
      const ox = obj.x ?? 0
      const oy = obj.y ?? 0
      const ow = obj.width ?? 0
      const oh = obj.height ?? 0
      if (rectsOverlapWithMargin(x, y, width, height, ox, oy, ow, oh, PLACEMENT_MARGIN)) {
        overlaps = true
        break
      }
    }
    if (!overlaps) {
      return { x: Math.round(x), y: Math.round(y) }
    }
  }

  // Fallback: far to the right (legacy behavior if spiral exhausted)
  let maxRight = -Infinity
  for (const obj of objects.values()) {
    if (obj.deleted_at) continue
    const right = (obj.x ?? 0) + (obj.width ?? 0)
    if (right > maxRight) maxRight = right
  }
  if (maxRight === -Infinity) return { x: 100, y: 100 }
  return { x: maxRight + PLACEMENT_MARGIN, y: 100 }
}
